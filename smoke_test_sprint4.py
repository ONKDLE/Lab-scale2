"""
스프린트4 동작 확인: 거래 목록의 페이지 나누기 / 정렬 / 상태 필터 / 키워드 검색 / 잘못된 값 400 처리.

실행: ..\\venv\\Scripts\\python.exe smoke_test_sprint4.py  (또는 venv 활성화 후 python smoke_test_sprint4.py)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

db_path = os.path.join(os.path.dirname(__file__), "mypin.db")
if os.path.exists(db_path):
    os.remove(db_path)

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
client.__enter__()


def check(desc, condition):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {desc}")
    if not condition:
        global all_passed
        all_passed = False


all_passed = True

# ---- 사전 준비: 거래 25건 (스타벅스 계열 8건 / 그 외 17건), 그중 4건은 취소 ----
res = client.post("/categories", json={"name": "카페"})
category_id = res.json()["id"]

merchants = (
    ["스타벅스 양산점", "스타벅스 강남점"] * 4          # 스타벅스 8건
    + ["GS25 양산점", "CU 편의점", "김밥천국", "맘스터치", "롯데리아", "본죽",
       "카카오택시", "티머니 충전", "이디야커피", "메가커피", "투썸플레이스",
       "파리바게뜨", "올리브영", "다이소", "쿠팡", "배달의민족", "교보문고"]  # 17건
)
created = []
for i, merchant in enumerate(merchants):
    r = client.post("/transactions", json={
        "category_id": category_id,
        "merchant_name": merchant,
        "amount": 1000 + i * 700,                       # 금액이 전부 다르게
        "transaction_date": f"2026-09-{(i % 28) + 1:02d}",
        "source_bank": "국민은행",
    })
    created.append(r.json())
check("사전 준비: 거래 25건 등록", len(created) == 25 and all("id" in c for c in created))

for t in created[:4]:                                    # 앞의 4건(스타벅스) 취소
    client.patch(f"/transactions/{t['id']}/cancel")

starbucks_total = 8
starbucks_cancelled = 4
starbucks_active = starbucks_total - starbucks_cancelled

# ---- 1) 기본값 + 페이지 정보 ----
res = client.get("/transactions")
body = res.json()
check("파라미터 없이 호출 → 200 OK", res.status_code == 200)
check("기본값 적용: page=1, size=10", body["page"] == 1 and body["size"] == 10)
check("한 번에 10건만 반환", len(body["items"]) == 10)
check("total_elements=25, total_pages=3", body["total_elements"] == 25 and body["total_pages"] == 3)
check("1페이지는 has_next=True", body["has_next"] is True)

# ---- 2) 마지막 페이지 / 범위를 벗어난 페이지 ----
body = client.get("/transactions?page=3&size=10").json()
check("마지막 페이지는 5건, has_next=False", len(body["items"]) == 5 and body["has_next"] is False)

res = client.get("/transactions?page=99")
body = res.json()
check("데이터가 없는 페이지 → 200 OK + 빈 목록, has_next=False",
      res.status_code == 200 and body["items"] == [] and body["has_next"] is False)

# 페이지끼리 겹치지 않는지 (같은 거래가 두 페이지에 나오지 않음)
ids = []
for p in (1, 2, 3):
    ids += [t["id"] for t in client.get(f"/transactions?page={p}&size=10").json()["items"]]
check("3페이지를 이어 붙이면 25건, 중복 없음", len(ids) == 25 and len(set(ids)) == 25)

# ---- 3) 정렬 ----
amounts = [float(t["amount"]) for t in client.get("/transactions?sort=amount,asc&size=25").json()["items"]]
check("sort=amount,asc → 금액 오름차순", amounts == sorted(amounts))
amounts = [float(t["amount"]) for t in client.get("/transactions?sort=amount,desc&size=25").json()["items"]]
check("sort=amount,desc → 금액 내림차순", amounts == sorted(amounts, reverse=True))
dates = [t["transaction_date"] for t in client.get("/transactions?size=25").json()["items"]]
check("기본 정렬은 거래일 최신순", dates == sorted(dates, reverse=True))

# ---- 4) 상태 필터 / 키워드 검색 / AND 조건 ----
body = client.get("/transactions?status=CANCELLED&size=25").json()
check("status=CANCELLED → 취소된 4건만", body["total_elements"] == 4
      and all(t["status"] == "CANCELLED" for t in body["items"]))

body = client.get("/transactions?keyword=스타벅스&size=25").json()
check("keyword=스타벅스 → 8건 모두 스타벅스",
      body["total_elements"] == starbucks_total and all("스타벅스" in t["merchant_name"] for t in body["items"]))

body = client.get("/transactions?status=ACTIVE&keyword=스타벅스&size=25").json()
check("status=ACTIVE AND keyword=스타벅스 → 정확히 AND 조건 (4건)",
      body["total_elements"] == starbucks_active
      and all(t["status"] == "ACTIVE" and "스타벅스" in t["merchant_name"] for t in body["items"]))

body = client.get("/transactions?keyword=%25").json()   # keyword="%" 를 그대로 검색
check("keyword=% 는 특수문자가 아니라 글자로 검색 → 0건", body["total_elements"] == 0)

res = client.get("/transactions?keyword=")
check("keyword가 빈 값이면 검색 조건 없이 전체 조회", res.status_code == 200 and res.json()["total_elements"] == 25)

body = client.get("/transactions?keyword=없는가맹점").json()
check("검색 결과가 없으면 200 OK + 빈 목록, total_pages=0",
      body["items"] == [] and body["total_elements"] == 0 and body["total_pages"] == 0)

# ---- 5) 잘못된 파라미터는 500이 아니라 400 ----
bad_requests = {
    "page=0": "page=0",
    "page=-1": "page=-1",
    "page=abc": "page=abc",
    "size=0": "size=0",
    "size=101 (최대 100 초과)": "size=101",
    "sort=foo,asc (없는 정렬 필드)": "sort=foo,asc",
    "sort=amount,sideways (없는 정렬 방향)": "sort=amount,sideways",
    "status=DONE (없는 상태값)": "status=DONE",
}
for label, qs in bad_requests.items():
    res = client.get(f"/transactions?{qs}")
    check(f"{label} → 400 Bad Request", res.status_code == 400)

# ---- 6) 다른 사용자의 거래는 보이지 않음 ----
body = client.get("/transactions", headers={"X-User-Id": "2"}).json()
check("다른 사용자(id=2)는 내 거래가 0건으로 보임", body["total_elements"] == 0)

print()
print("전체 통과" if all_passed else "일부 실패 — 위 로그 확인 필요")
sys.exit(0 if all_passed else 1)
