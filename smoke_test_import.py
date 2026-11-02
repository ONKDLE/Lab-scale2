"""
카드 이용내역 업로드 동작 확인.

1) 엑셀 읽기(파서) 단위 테스트: 머리글 찾기, 날짜/금액/상태 해석, 이상한 줄 처리
2) 업로드 API 테스트: 저장, 중복 방지, 잘못된 파일 거절, 사용자별 분리

실제 카드 내역은 개인 정보라서 쓰지 않고, 실제 파일과 같은 모양의 가짜 엑셀을 만들어서 검사한다.
(가짜 엑셀을 만들 때만 xlwt가 필요하다: pip install -r requirements-dev.txt)

실행: ..\\venv\\Scripts\\python.exe smoke_test_import.py
"""
import io
import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.dirname(__file__))

db_path = os.path.join(os.path.dirname(__file__), "mypin.db")
if os.path.exists(db_path):
    os.remove(db_path)

from fastapi.testclient import TestClient

from app.importers.card_statement import StatementFormatError, parse_rows
from app.main import app

try:
    import xlwt
except ImportError:  # 가짜 엑셀을 못 만들면 파일 단위 테스트만 건너뛴다
    xlwt = None

client = TestClient(app)
client.__enter__()

all_passed = True


def check(desc, condition):
    global all_passed
    print(f"[{'PASS' if condition else 'FAIL'}] {desc}")
    if not condition:
        all_passed = False


# 실제 카드 이용내역과 같은 모양의 머리글 (칸이 합쳐져서 중간이 비어 있고, 줄바꿈이 섞여 있음)
HEADER = [""] * 16
for column, text in {0: "이용일시", 1: " 이용\n카드명", 4: "이용하신곳", 5: "이용금액", 6: "결제\n방법",
                     7: "가맹점\n정보", 9: "환급\n할인", 11: "환급예정일", 12: "적립예상\n포인트리",
                     14: "상태", 15: "결제예정일"}.items():
    HEADER[column] = text


def data_row(when, merchant, amount, status="전표매입"):
    row = [""] * 16
    row[0], row[1], row[4], row[5], row[6], row[12], row[14] = when, "T000", merchant, amount, "일시불", "0 P", status
    return row


SAMPLE_ROWS = [
    data_row("2026-10-30\n08:20", "가짜카페 양산점", 4400.0),
    data_row("2026-10-29\n21:29", "가짜피시방 본점", 10000.0),
    data_row("2026-10-28\n17:23", "가짜편의점", 2500.0),
    data_row("2026-10-22\n20:04", "가짜피시방 본점", 10000.0),
]


def make_xls(rows, title_rows=None):
    """맨 위 줄(title_rows, 보통 머리글) 아래에 rows를 쓴 .xls 파일 내용(bytes)을 만든다."""
    book = xlwt.Workbook(encoding="utf-8")
    sheet = book.add_sheet("시트1")
    for r, row in enumerate((title_rows or []) + rows):
        for c, value in enumerate(row):
            if value != "":
                sheet.write(r, c, value)
    stream = io.BytesIO()
    book.save(stream)
    return stream.getvalue()


def upload(content, filename="내역.xls", source=None, user=None):
    data = {"source_bank": source} if source is not None else {}
    headers = {"X-User-Id": str(user)} if user else {}
    return client.post("/transactions/import", files={"file": (filename, content, "application/vnd.ms-excel")},
                       data=data, headers=headers)


# ---------------------------------------------------------------- 1) 파서 단위 테스트
print("== 엑셀 읽기(파서)")

result = parse_rows([HEADER] + SAMPLE_ROWS)
check("실제 파일 모양(합쳐진 머리글)에서 거래 4건을 읽는다", len(result.rows) == 4 and not result.errors)
first = result.rows[0]
check("날짜와 시간을 분리한다 ('2026-10-30\\n08:20')", (str(first.transaction_date), first.transaction_time) == ("2026-10-30", "08:20"))
check("가맹점명 / 금액을 읽는다", first.merchant_name == "가짜카페 양산점" and first.amount == Decimal("4400.00"))
check("'전표매입'은 정상(ACTIVE) 거래", first.status == "ACTIVE" and first.raw_status == "전표매입")
check("줄바꿈이 섞인 머리글('결제\\n방법', ' 이용\\n카드명')의 열도 찾는다", first.payment_method == "일시불" and first.card_name == "T000")
check("줄 번호는 엑셀 기준이다 (머리글이 1행이면 첫 거래는 2행)", first.row_number == 2)

shifted = parse_rows([["카드 이용내역 (조회기간 2026-10)"], [], HEADER] + SAMPLE_ROWS)
check("머리글 위에 제목 줄이 있어도 머리글을 찾는다 (첫 거래는 4행)", len(shifted.rows) == 4 and shifted.rows[0].row_number == 4)

reordered_header = ["이용금액", "이용하신곳", "이용일시"]
reordered = parse_rows([reordered_header, [4400.0, "가짜카페", "2026.10.30"]])
check("열 순서가 달라도 머리글 이름으로 찾는다 (날짜만 있는 '2026.10.30'도 읽음)",
      len(reordered.rows) == 1 and str(reordered.rows[0].transaction_date) == "2026-10-30" and reordered.rows[0].transaction_time == "")

check("쉼표가 있는 글자 금액('10,000원')도 읽는다",
      parse_rows([HEADER, data_row("2026-10-30\n08:20", "가게", "10,000원")]).rows[0].amount == Decimal("10000.00"))
check("상태에 '취소'가 들어 있으면 CANCELLED",
      parse_rows([HEADER, data_row("2026-10-30\n08:20", "가게", 1000.0, "승인취소")]).rows[0].status == "CANCELLED")

with_blank = parse_rows([HEADER, SAMPLE_ROWS[0], [""] * 16, SAMPLE_ROWS[1]])
check("빈 줄은 거래로 세지 않고 조용히 넘어간다", len(with_blank.rows) == 2 and not with_blank.errors)

messy = parse_rows([
    HEADER,
    data_row("2026-10-30\n08:20", "정상 가게", 1000.0),
    data_row("날짜아님", "가게", 1000.0),
    data_row("2026-10-30\n08:20", "금액0 가게", 0.0),
    data_row("2026-10-30\n08:20", "금액음수 가게", -500.0),
    data_row("2026-10-30\n08:20", "금액글자 가게", "공짜"),
    data_row("2026-13-45\n08:20", "없는날짜 가게", 1000.0),
    data_row("2026-10-30\n08:20", "", 1000.0),
])
check("이상한 줄은 건너뛰고 정상 줄만 읽는다", len(messy.rows) == 1 and len(messy.errors) == 6)
check("건너뛴 줄마다 줄 번호와 이유가 있다", [e.row_number for e in messy.errors] == [3, 4, 5, 6, 7, 8] and all(e.reason for e in messy.errors))
check("음수 금액(취소 형식 미확인)은 몰래 바꾸지 않고 이유를 알려준다", "0 이하" in messy.errors[3 - 1].reason)

for label, rows in {"머리글 없음": [["아무", "표"], [1, 2]], "필수 열 하나 빠짐": [["이용일시", "이용금액"], ["2026-10-30", 1000.0]], "완전히 빈 표": []}.items():
    try:
        parse_rows(rows)
        check(f"{label} → StatementFormatError", False)
    except StatementFormatError:
        check(f"{label} → StatementFormatError", True)

# ---------------------------------------------------------------- 2) 업로드 API 테스트
print("\n== 업로드 API")
if xlwt is None:
    print("[건너뜀] xlwt가 없어서 파일 단위 테스트를 건너뜁니다. (pip install -r requirements-dev.txt)")
else:
    sample_file = make_xls(SAMPLE_ROWS, title_rows=[HEADER])

    res = upload(sample_file)
    body = res.json()
    check("업로드 → 200 OK", res.status_code == 200)
    check("4건 저장 / 중복 0 / 건너뜀 0", (body["imported"], body["duplicates"], body["skipped"], body["total_rows"]) == (4, 0, 0, 4))
    check("출처 이름 기본값은 '체크카드'", body["source_bank"] == "체크카드")

    listing = client.get("/transactions?size=50").json()
    check("목록에 4건이 조회된다", listing["total_elements"] == 4)
    item = next(t for t in listing["items"] if t["merchant_name"] == "가짜카페 양산점")
    check("저장된 값: 날짜, 금액, 출처, 상태", (item["transaction_date"], item["amount"], item["source_bank"], item["status"]) == ("2026-10-30", "4400.00", "체크카드", "ACTIVE"))
    check("카테고리는 비어 있다(미분류)", item["category_id"] is None)
    check("7주차 검색 기능과 이어진다 (keyword=피시방 → 2건)", client.get("/transactions?keyword=피시방").json()["total_elements"] == 2)

    again = upload(sample_file).json()
    check("같은 파일을 다시 올리면 0건 저장 / 4건 중복", (again["imported"], again["duplicates"]) == (0, 4))
    check("다시 올려도 거래는 4건 그대로", client.get("/transactions").json()["total_elements"] == 4)

    other_source = upload(sample_file, source="다른카드").json()
    check("출처 이름을 다르게 주면 다른 내역으로 저장된다 (4건)", other_source["imported"] == 4 and other_source["source_bank"] == "다른카드")

    other_user = upload(sample_file, user=2).json()
    check("다른 사용자(id=2)가 같은 파일을 올리면 그 사용자 몫으로 4건 저장", other_user["imported"] == 4)
    check("사용자 1의 목록은 그대로 8건 (4+4)", client.get("/transactions").json()["total_elements"] == 8)
    check("사용자 2의 목록은 4건", client.get("/transactions", headers={"X-User-Id": "2"}).json()["total_elements"] == 4)

    twice = make_xls([data_row("2026-11-01\n10:00", "가짜카페", 3000.0), data_row("2026-11-01\n10:00", "가짜카페", 3000.0)], title_rows=[HEADER])
    twice_result = upload(twice, source="같은분").json()
    check("같은 분, 같은 가게, 같은 금액이 한 파일에 두 줄이면 1건만 저장 (알려진 한계)", (twice_result["imported"], twice_result["duplicates"]) == (1, 1))

    different_minute = make_xls([data_row("2026-11-02\n10:00", "가짜카페", 3000.0), data_row("2026-11-02\n10:01", "가짜카페", 3000.0)], title_rows=[HEADER])
    check("분이 다르면 같은 날 같은 금액도 각각 저장", upload(different_minute, source="분다름").json()["imported"] == 2)

    partly_bad = make_xls([data_row("2026-12-01\n09:00", "정상 가게", 1000.0), data_row("날짜아님", "나쁜 줄", 1000.0)], title_rows=[HEADER])
    res = upload(partly_bad, source="일부오류")
    body = res.json()
    check("일부 줄이 이상해도 → 200, 정상 줄은 저장", res.status_code == 200 and (body["imported"], body["skipped"], body["total_rows"]) == (1, 1, 2))
    check("건너뛴 줄 번호와 이유를 알려준다 (3행)", body["errors"][0]["row_number"] == 3 and "날짜" in body["errors"][0]["reason"])

    # ---- 거절되는 파일들
    res = upload(b"hello", filename="메모.txt")
    check("확장자가 .xls가 아니면 → 400", res.status_code == 400 and ".xls" in res.json()["detail"])
    check(".xlsx도 아직 지원하지 않는다 → 400", upload(sample_file, filename="내역.xlsx").status_code == 400)
    res = upload("이건 엑셀이 아닙니다".encode("utf-8"), filename="가짜.xls")
    check("이름만 .xls인 가짜 파일 → 400 (읽을 수 없음)", res.status_code == 400 and "읽을 수 없" in res.json()["detail"])
    check("빈 파일 → 400", upload(b"", filename="빈파일.xls").status_code == 400)
    res = upload(make_xls([["아무", "표"], [1, 2]]), filename="다른표.xls")
    check("이용내역 머리글이 없는 엑셀 → 400", res.status_code == 400 and "이용일시" in res.json()["detail"])
    res = upload(b"0" * (5 * 1024 * 1024 + 1), filename="큰파일.xls")
    check("5MB를 넘는 파일 → 413", res.status_code == 413)
    check("출처 이름이 31자 이상이면 → 400", upload(sample_file, source="가" * 31).status_code == 400)
    check("파일 없이 호출하면 → 422", client.post("/transactions/import").status_code == 422)

print()
print("전체 통과" if all_passed else "일부 실패 — 위 로그 확인 필요")
sys.exit(0 if all_passed else 1)
