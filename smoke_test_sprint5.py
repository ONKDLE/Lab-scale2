"""
스프린트5 백엔드 동작 확인: React 화면(브라우저)이 API를 호출할 수 있는지(CORS) 검사.

브라우저는 화면 주소(localhost:5173)와 API 주소(127.0.0.1:8000)가 다르면
서버가 "이 주소에서 온 요청은 허용한다"고 알려주지 않는 한 응답을 막아 버린다.
화면 쪽 테스트는 frontend 폴더에서 `npm test`로 따로 실행한다.

실행: ..\\venv\\Scripts\\python.exe smoke_test_sprint5.py
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

REACT_ORIGIN = "http://localhost:5173"
REACT_ORIGIN_IP = "http://127.0.0.1:5173"
OTHER_ORIGIN = "http://evil.example"

res = client.get("/transactions", headers={"Origin": REACT_ORIGIN})
check("localhost:5173 에서 온 GET → 200 OK", res.status_code == 200)
check("응답에 허용 헤더 포함 (access-control-allow-origin = 요청 주소)",
      res.headers.get("access-control-allow-origin") == REACT_ORIGIN)

res = client.get("/transactions", headers={"Origin": REACT_ORIGIN_IP})
check("127.0.0.1:5173 에서 온 GET도 허용",
      res.headers.get("access-control-allow-origin") == REACT_ORIGIN_IP)

res = client.options("/transactions", headers={
    "Origin": REACT_ORIGIN,
    "Access-Control-Request-Method": "GET",
    "Access-Control-Request-Headers": "x-user-id",
})
check("사전 확인 요청(preflight, X-User-Id 헤더 포함) → 200 OK", res.status_code == 200)
check("preflight 응답이 요청 주소를 허용",
      res.headers.get("access-control-allow-origin") == REACT_ORIGIN)

res = client.get("/transactions", headers={"Origin": OTHER_ORIGIN})
check("허용하지 않은 주소에는 허용 헤더를 주지 않음",
      "access-control-allow-origin" not in res.headers)

res = client.get("/transactions")
check("Origin 헤더가 없는 요청(Swagger, 테스트)은 기존처럼 정상 동작", res.status_code == 200)

print()
print("전체 통과" if all_passed else "일부 실패 — 위 로그 확인 필요")
sys.exit(0 if all_passed else 1)
