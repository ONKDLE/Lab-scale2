"""
스프린트2 동작 확인: transaction 생성/조회 + 중복 거래 거절(조건 처리 API) 테스트.

실행: ./venv/bin/python smoke_test_sprint2.py
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

res = client.post("/categories", json={"name": "카페"})
category_id = res.json().get("id")
check("사전 준비: 카테고리 생성", res.status_code == 201)

res = client.post("/transactions", json={
    "category_id": category_id,
    "merchant_name": "스타벅스 강남점",
    "amount": "4500",
    "transaction_date": "2026-09-01",
    "source_bank": "국민은행",
})
check("POST /transactions → 201 Created", res.status_code == 201)
transaction_id = res.json().get("id")
check("카테고리 연결(FK) 확인", res.json().get("category_id") == category_id)

res = client.get("/transactions")
check("GET /transactions → 200 OK", res.status_code == 200)
check("목록에 방금 만든 거래 포함", any(t["id"] == transaction_id for t in res.json()))

res = client.get(f"/transactions/{transaction_id}")
check("GET /transactions/{id} → 200 OK", res.status_code == 200)

res = client.get("/transactions/9999")
check("GET /transactions/9999 → 404 Not Found", res.status_code == 404)

res = client.post("/transactions", json={
    "category_id": category_id,
    "merchant_name": "스타벅스 강남점",
    "amount": "4500",
    "transaction_date": "2026-09-01",
    "source_bank": "국민은행",
})
check("중복 거래 등록 → 400 Bad Request (조건 처리 성공)", res.status_code == 400)

res = client.post("/transactions", json={
    "category_id": category_id,
    "merchant_name": "스타벅스 강남점",
    "amount": "4500",
    "transaction_date": "2026-09-02",
    "source_bank": "국민은행",
})
check("날짜가 다른 거래는 중복 아님 → 201 Created", res.status_code == 201)

res = client.post("/transactions", json={
    "category_id": 9999,
    "merchant_name": "테스트 가맹점",
    "amount": "1000",
    "transaction_date": "2026-09-03",
    "source_bank": "국민은행",
})
check("존재하지 않는 카테고리로 거래 생성 → 404 Not Found", res.status_code == 404)

print()
print("전체 통과" if all_passed else "일부 실패 — 위 로그 확인 필요")
sys.exit(0 if all_passed else 1)
