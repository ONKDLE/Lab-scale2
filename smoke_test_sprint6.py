"""
스프린트6 동작 확인 (상세 화면 + 신청/취소 토글 + 작성자 전용 마감 토글에 필요한 API):
 - 거래 취소 <-> 복구
 - 카테고리 보관 <-> 보관 해제
 - 보관된 카테고리의 거래는 변경할 수 없다(409)
 - 카테고리 목록/상세의 거래 건수·합계 요약 (정상 거래만 계산)

실행: ..\\venv\\Scripts\\python.exe smoke_test_sprint6.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

# 테스트 전용: 로그인 없이 X-User-Id 헤더로 사용자를 흉내 내는 개발 모드를 켠다. (실제 실행에서는 꺼져 있음)
os.environ["ALLOW_DEV_USER_HEADER"] = "1"
# 테스트가 느려지지 않게 비밀번호 암호화 강도를 낮춘다. (실제 실행의 기본값은 12)
os.environ["BCRYPT_ROUNDS"] = "4"

db_path = os.path.join(os.path.dirname(__file__), "mypin.db")
if os.path.exists(db_path):
    os.remove(db_path)

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
client.__enter__()

all_passed = True


def check(desc, condition):
    global all_passed
    print(f"[{'PASS' if condition else 'FAIL'}] {desc}")
    if not condition:
        all_passed = False


OTHER = {"X-User-Id": "2"}


def make_category(name, headers=None):
    return client.post("/categories", json={"name": name}, headers=headers or {}).json()["id"]


def make_tx(category_id, merchant, amount, date="2026-11-01", headers=None):
    body = {"merchant_name": merchant, "amount": amount, "transaction_date": date, "source_bank": "체크카드"}
    if category_id is not None:
        body["category_id"] = category_id
    return client.post("/transactions", json=body, headers=headers or {}).json()["id"]


def summary_of(category_id, headers=None):
    row = next(c for c in client.get("/categories", headers=headers or {}).json() if c["id"] == category_id)
    return row["transaction_count"], row["total_amount"]


# ---- 사전 준비: 카페(3건, 합계 15634.56), 빈 카테고리, 미분류 거래 1건
cafe = make_category("카페")
empty = make_category("비어있음")
t1 = make_tx(cafe, "가짜카페 A", 4400, "2026-11-03")
t2 = make_tx(cafe, "가짜카페 B", 10000, "2026-11-01")
t3 = make_tx(cafe, "가짜카페 C", 1234.56, "2026-11-02")
loose = make_tx(None, "미분류 가게", 9999)

# ------------------------------------------------------------------ 요약 (목록)
print("== 카테고리 요약")
check("목록: 건수와 합계가 계산된다 (3건 / 15634.56)", summary_of(cafe) == (3, "15634.56"))
check("목록: 거래가 없는 카테고리는 0건 / 0.00", summary_of(empty) == (0, "0.00"))
check("미분류 거래는 어느 카테고리 합계에도 들어가지 않는다", summary_of(cafe)[0] == 3 and summary_of(empty)[0] == 0)

a, b = make_category("소수점"), None
make_tx(a, "십원", 0.1)
make_tx(a, "이십원", 0.2)
check("소수 합계도 정확하다 (0.10 + 0.20 = 0.30)", summary_of(a) == (2, "0.30"))

check("다른 사용자의 거래는 합계에 섞이지 않는다", summary_of(make_category("카페", OTHER), OTHER) == (0, "0.00"))

# ------------------------------------------------------------------ 거래 취소 <-> 복구
print("\n== 거래 취소 / 복구")
res = client.patch(f"/transactions/{t2}/cancel")
check("취소 → 200, CANCELLED", res.status_code == 200 and res.json()["status"] == "CANCELLED")
check("취소하면 합계에서 빠진다 (2건 / 5634.56)", summary_of(cafe) == (2, "5634.56"))

res = client.get(f"/categories/{cafe}")
detail = res.json()
check("상세: 요약이 목록과 같다 (2건 / 5634.56)", (detail["transaction_count"], detail["total_amount"]) == (2, "5634.56"))
check("상세: 취소된 거래도 목록에는 보인다 (3건)", len(detail["transactions"]) == 3)
dates = [t["transaction_date"] for t in detail["transactions"]]
check("상세: 거래일 최신순으로 정렬된다", dates == sorted(dates, reverse=True))

res = client.patch(f"/transactions/{t2}/restore")
check("복구 → 200, ACTIVE", res.status_code == 200 and res.json()["status"] == "ACTIVE")
check("복구하면 합계에 다시 들어간다 (3건 / 15634.56)", summary_of(cafe) == (3, "15634.56"))
check("이미 정상인 거래를 복구해도 → 200 (같은 결과)", client.patch(f"/transactions/{t2}/restore").json()["status"] == "ACTIVE")
check("이미 취소된 거래를 또 취소해도 → 200 (같은 결과)",
      client.patch(f"/transactions/{t1}/cancel").status_code == 200 and client.patch(f"/transactions/{t1}/cancel").json()["status"] == "CANCELLED")
client.patch(f"/transactions/{t1}/restore")

check("남의 거래를 복구하려 하면 → 403", client.patch(f"/transactions/{t1}/restore", headers=OTHER).status_code == 403)
check("403 안내 문구는 '복구'를 말한다", "복구" in client.patch(f"/transactions/{t1}/restore", headers=OTHER).json()["detail"])
check("없는 거래를 복구하려 하면 → 404", client.patch("/transactions/9999/restore").status_code == 404)
check("403이 났으면 상태는 바뀌지 않는다", client.get(f"/transactions/{t1}").json()["status"] == "ACTIVE")

# ------------------------------------------------------------------ 카테고리 보관 <-> 보관 해제
print("\n== 카테고리 보관 / 보관 해제")
res = client.patch(f"/categories/{cafe}/archive")
check("보관 → 200, ARCHIVED", res.status_code == 200 and res.json()["status"] == "ARCHIVED")
listed = next(c for c in client.get("/categories").json() if c["id"] == cafe)
check("보관된 카테고리도 목록에 나오고 상태가 보인다", listed["status"] == "ARCHIVED")
check("이미 보관된 카테고리를 또 보관해도 → 200", client.patch(f"/categories/{cafe}/archive").status_code == 200)

res = client.patch(f"/transactions/{t1}/cancel")
check("보관된 카테고리의 거래를 취소하려 하면 → 409", res.status_code == 409)
check("409 안내 문구가 보관 해제를 알려준다", "보관을 해제" in res.json()["detail"])
check("보관된 카테고리의 거래를 복구하려 해도 → 409", client.patch(f"/transactions/{t2}/restore").status_code == 409)
check("409가 났으면 거래 상태는 그대로다", client.get(f"/transactions/{t1}").json()["status"] == "ACTIVE")
check("보관되지 않은 카테고리의 거래는 영향 없다", client.patch(f"/transactions/{make_tx(empty, '다른 카테고리', 500)}/cancel").status_code == 200)
check("카테고리가 없는 거래도 영향 없다", client.patch(f"/transactions/{loose}/cancel").status_code == 200)
check("남의 거래는 보관 여부보다 403이 먼저다", client.patch(f"/transactions/{t1}/cancel", headers=OTHER).status_code == 403)

check("남이 내 카테고리 보관을 해제하려 하면 → 403", client.patch(f"/categories/{cafe}/unarchive", headers=OTHER).status_code == 403)
check("403 안내 문구는 '보관을 해제'를 말한다", "보관을 해제" in client.patch(f"/categories/{cafe}/unarchive", headers=OTHER).json()["detail"])
check("없는 카테고리 보관 해제 → 404", client.patch("/categories/9999/unarchive").status_code == 404)
check("403이 났으면 보관 상태는 그대로다", client.get(f"/categories/{cafe}").json()["status"] == "ARCHIVED")

res = client.patch(f"/categories/{cafe}/unarchive")
check("보관 해제 → 200, ACTIVE", res.status_code == 200 and res.json()["status"] == "ACTIVE")
check("이미 사용 중인 카테고리를 또 해제해도 → 200", client.patch(f"/categories/{cafe}/unarchive").status_code == 200)
check("보관을 해제하면 거래를 다시 취소할 수 있다", client.patch(f"/transactions/{t1}/cancel").status_code == 200)
check("취소한 거래를 복구할 수도 있다", client.patch(f"/transactions/{t1}/restore").status_code == 200)

print()
print("전체 통과" if all_passed else "일부 실패 — 위 로그 확인 필요")
sys.exit(0 if all_passed else 1)
