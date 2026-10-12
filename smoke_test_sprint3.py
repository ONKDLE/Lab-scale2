"""
스프린트3 동작 확인:
 1) 카테고리 상세 조회 시 연결된 거래가 함께 묶여서 나오는지 (관계형 조회)
 2) 거래 취소(cancel) - 본인 소유면 200, 남의 것이면 403
 3) 카테고리 보관(archive) - 본인 소유면 200, 남의 것이면 403

실행: ./venv/bin/python smoke_test_sprint3.py
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

# 0) 사전 준비: user1(기본)이 카테고리 + 거래 1건 생성
res = client.post("/categories", json={"name": "카페"})
category_id = res.json().get("id")
check("사전 준비: user1이 카테고리 생성", res.status_code == 201)

res = client.post("/transactions", json={
    "category_id": category_id,
    "merchant_name": "스타벅스",
    "amount": "4500",
    "transaction_date": "2026-09-01",
    "source_bank": "국민은행",
})
transaction_id = res.json().get("id")
check("사전 준비: user1이 거래 생성", res.status_code == 201)

# 1) ★관계형 조회★ 카테고리 상세에 거래 목록이 함께 나오는지
res = client.get(f"/categories/{category_id}")
check("GET /categories/{id} → 200 OK", res.status_code == 200)
body = res.json()
check("응답에 transactions 필드 포함", "transactions" in body)
check("transactions 안에 방금 만든 거래 포함", any(t["id"] == transaction_id for t in body.get("transactions", [])))

# 2) 거래 취소 - 본인(user1)이 취소 → 200, status가 CANCELLED로 바뀜
res = client.patch(f"/transactions/{transaction_id}/cancel")
check("본인 거래 취소 → 200 OK", res.status_code == 200)
check("status가 CANCELLED로 변경됨", res.json().get("status") == "CANCELLED")

# 3) 거래 취소 - 다른 사용자(user2)가 user1 거래를 취소 시도 → 403
res2 = client.post("/transactions", json={
    "merchant_name": "교통카드",
    "amount": "1500",
    "transaction_date": "2026-09-02",
    "source_bank": "국민은행",
})
transaction_id2 = res2.json().get("id")

res = client.patch(f"/transactions/{transaction_id2}/cancel", headers={"X-User-Id": "2"})
check("남의 거래를 다른 사용자가 취소 시도 → 403 Forbidden", res.status_code == 403)

# 4) 존재하지 않는 거래 취소 시도 → 404
res = client.patch("/transactions/9999/cancel")
check("존재하지 않는 거래 취소 시도 → 404 Not Found", res.status_code == 404)

# 5) 카테고리 보관 - 본인(user1)이 보관 → 200, status ARCHIVED
res = client.patch(f"/categories/{category_id}/archive")
check("본인 카테고리 보관 → 200 OK", res.status_code == 200)
check("status가 ARCHIVED로 변경됨", res.json().get("status") == "ARCHIVED")

# 6) 카테고리 보관 - 다른 사용자(user2)가 user1 카테고리 보관 시도 → 403
res = client.post("/categories", json={"name": "교통"})
other_category_id = res.json().get("id")

res = client.patch(f"/categories/{other_category_id}/archive", headers={"X-User-Id": "2"})
check("남의 카테고리를 다른 사용자가 보관 시도 → 403 Forbidden", res.status_code == 403)

print()
print("전체 통과" if all_passed else "일부 실패 — 위 로그 확인 필요")
sys.exit(0 if all_passed else 1)
