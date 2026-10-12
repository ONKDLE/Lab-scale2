"""
간단 동작 확인 스크립트. 서버를 띄우지 않고 FastAPI TestClient로
5개 엔드포인트 + 엣지케이스(중복 이름, 존재하지 않는 리소스)를 검증합니다.

실행: ./venv/bin/python smoke_test.py
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

res = client.post("/categories", json={"name": "카페", "icon": "coffee", "color": "#4472C4"})
check("POST /categories → 201 Created", res.status_code == 201)
category_id = res.json().get("id")
check("생성된 카테고리 name 일치", res.json().get("name") == "카페")

res = client.get("/categories")
check("GET /categories → 200 OK", res.status_code == 200)
check("목록에 방금 만든 카테고리 포함", any(c["id"] == category_id for c in res.json()))

res = client.get(f"/categories/{category_id}")
check("GET /categories/{id} → 200 OK", res.status_code == 200)

res = client.get("/categories/9999")
check("GET /categories/9999 → 404 Not Found", res.status_code == 404)

res = client.patch(f"/categories/{category_id}", json={"color": "#ED7D31"})
check("PATCH /categories/{id} → 200 OK", res.status_code == 200)
check("색상이 실제로 수정됨", res.json().get("color") == "#ED7D31")

res = client.post("/categories", json={"name": "카페"})
check("중복 이름 생성 → 400 Bad Request", res.status_code == 400)

res = client.post("/categories", json={"name": "스타벅스", "parent_category_id": category_id})
sub_id = res.json().get("id")
check("서브카테고리 생성 → 201 Created", res.status_code == 201)

res = client.delete(f"/categories/{category_id}")
check("하위 카테고리가 있는 상위 삭제 시도 → 400 Bad Request", res.status_code == 400)

res = client.delete(f"/categories/{sub_id}")
check("서브카테고리 삭제 → 204 No Content", res.status_code == 204)
res = client.delete(f"/categories/{category_id}")
check("상위 카테고리 삭제 → 204 No Content", res.status_code == 204)

print()
print("전체 통과" if all_passed else "일부 실패 — 위 로그 확인 필요")
sys.exit(0 if all_passed else 1)
