"""
로그인 / 회원가입 동작 확인.

이 테스트는 개발용 모드(ALLOW_DEV_USER_HEADER)를 **끈 상태**로 돌린다.
실제 서버를 켰을 때와 같은 조건에서, 로그인 없이는 아무 데이터도 못 보는지 확인하기 위해서다.

실행: ..\\venv\\Scripts\\python.exe smoke_test_auth.py
"""
import os
import sys
from datetime import timedelta

sys.path.insert(0, os.path.dirname(__file__))

os.environ.pop("ALLOW_DEV_USER_HEADER", None)  # 실제 실행과 같은 조건
os.environ["BCRYPT_ROUNDS"] = "4"              # 테스트가 느려지지 않게 (실제 기본값은 12)
os.environ["SECRET_KEY"] = "test-secret-key"

db_path = os.path.join(os.path.dirname(__file__), "mypin.db")
if os.path.exists(db_path):
    os.remove(db_path)

import jwt
from fastapi.testclient import TestClient

from app import models, security
from app.database import SessionLocal
from app.main import app

client = TestClient(app)
client.__enter__()

all_passed = True


def check(desc, condition):
    global all_passed
    print(f"[{'PASS' if condition else 'FAIL'}] {desc}")
    if not condition:
        all_passed = False


def register(email, password):
    return client.post("/auth/register", json={"email": email, "password": password})


def login(email, password):
    return client.post("/auth/login", data={"username": email, "password": password})


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


GOOD_PASSWORD = "mypass1234"

# ------------------------------------------------------------------ 회원가입
print("== 회원가입")
res = register("  New@Example.COM ", GOOD_PASSWORD)
body = res.json()
check("가입 → 201 Created", res.status_code == 201)
check("이메일은 공백을 지우고 소문자로 저장된다", body.get("email") == "new@example.com")
check("응답에 비밀번호/해시가 들어 있지 않다", set(body) == {"id", "email"})
new_user_id = body["id"]

with SessionLocal() as db:
    stored = db.get(models.User, new_user_id).password_hash
check("DB에는 원문이 아니라 bcrypt 해시($2b$)가 저장된다", stored.startswith("$2b$") and GOOD_PASSWORD not in stored)
check("암호화 강도 기본값은 10 이상 (PRD)", security.DEFAULT_BCRYPT_ROUNDS >= 10)

check("같은 이메일(대소문자만 다름)로 다시 가입 → 409", register("NEW@example.com", GOOD_PASSWORD).status_code == 409)
check("이미 가입된 이메일 안내 문구", "이미 가입된" in register("new@example.com", GOOD_PASSWORD).json()["detail"])

for label, email in {"@ 없음": "abc", "점 없는 도메인": "a@b", "공백 포함": "a b@c.com", "너무 긴 이메일": "a" * 250 + "@b.com"}.items():
    check(f"잘못된 이메일 형식({label}) → 400", register(email, GOOD_PASSWORD).status_code == 400)

for label, password in {
    "8자 미만": "abc123",
    "영문만": "abcdefgh",
    "숫자만": "12345678",
    "72바이트 초과(영문)": "a1" * 37,
    "72바이트 초과(한글)": "가" * 25 + "a1",
    "아주 긴 비밀번호(300자)": "a1" * 150,
}.items():
    res = register("rule@example.com", password)
    check(f"비밀번호 규칙 위반({label}) → 400, 가입 안 됨", res.status_code == 400 and "비밀번호" in res.json()["detail"])
with SessionLocal() as db:
    check("규칙을 어긴 가입은 DB에 남지 않는다", db.query(models.User).filter(models.User.email == "rule@example.com").first() is None)
check("비밀번호 필드가 없으면 → 422", client.post("/auth/register", json={"email": "x@y.com"}).status_code == 422)

# ------------------------------------------------------------------ 로그인
print("\n== 로그인")
res = login("new@example.com", GOOD_PASSWORD)
check("로그인 → 200, bearer 토큰 발급", res.status_code == 200 and res.json()["token_type"] == "bearer")
token = res.json()["access_token"]
check("토큰에서 사용자 id를 꺼낼 수 있다", security.decode_access_token(token) == new_user_id)
check("이메일 대소문자가 달라도 로그인된다", login("NEW@Example.com", GOOD_PASSWORD).status_code == 200)

wrong = login("new@example.com", "wrongpass1")
unknown = login("nobody@example.com", GOOD_PASSWORD)
check("틀린 비밀번호 → 401", wrong.status_code == 401)
check("없는 이메일 → 401", unknown.status_code == 401)
check("두 경우 메시지가 같다 (가입 여부를 알려주지 않음)", wrong.json()["detail"] == unknown.json()["detail"])
check("401 응답에 WWW-Authenticate: Bearer 헤더", wrong.headers.get("www-authenticate") == "Bearer")
check("시연 계정(test@mypin.dev)으로 로그인된다", login("test@mypin.dev", "mypin1234").status_code == 200)
check("시연 계정(other@mypin.dev)으로 로그인된다", login("other@mypin.dev", "mypin1234").status_code == 200)

# ------------------------------------------------------------------ 토큰 검증
print("\n== 토큰 검증")
res = client.get("/auth/me", headers=bearer(token))
check("토큰으로 /auth/me → 내 정보", res.status_code == 200 and res.json()["email"] == "new@example.com")

res = client.get("/auth/me")
check("토큰 없이 → 401 '로그인이 필요합니다.'", res.status_code == 401 and res.json()["detail"] == "로그인이 필요합니다.")
check("토큰 없을 때도 WWW-Authenticate 헤더", res.headers.get("www-authenticate") == "Bearer")

bad_tokens = {
    "엉터리 문자열": "garbage",
    "마지막 글자를 바꾼(변조) 토큰": token[:-2] + ("A" if token[-2] != "A" else "B") + token[-1],
    "다른 비밀키로 서명한 토큰": jwt.encode({"sub": str(new_user_id), "exp": 9999999999}, "other-secret", algorithm="HS256"),
    "만료된 토큰": security.create_access_token(new_user_id, timedelta(seconds=-5)),
    "만료 시간이 없는 토큰": jwt.encode({"sub": str(new_user_id)}, "test-secret-key", algorithm="HS256"),
    "사용자 id가 숫자가 아닌 토큰": jwt.encode({"sub": "abc", "exp": 9999999999}, "test-secret-key", algorithm="HS256"),
}
for label, bad in bad_tokens.items():
    check(f"{label} → 401", client.get("/auth/me", headers=bearer(bad)).status_code == 401)

with SessionLocal() as db:
    ghost = models.User(email="ghost@example.com", password_hash=security.hash_password(GOOD_PASSWORD))
    db.add(ghost)
    db.commit()
    ghost_id = ghost.id
ghost_token = login("ghost@example.com", GOOD_PASSWORD).json()["access_token"]
check("가입 직후 토큰은 정상", client.get("/auth/me", headers=bearer(ghost_token)).status_code == 200)
with SessionLocal() as db:
    db.delete(db.get(models.User, ghost_id))
    db.commit()
check("계정이 삭제되면 그 토큰은 더 이상 통하지 않는다 → 401", client.get("/auth/me", headers=bearer(ghost_token)).status_code == 401)

# ------------------------------------------------------------------ 보호된 API
print("\n== 로그인 없이는 접근 불가")
protected = [
    ("get", "/transactions"), ("post", "/transactions"), ("get", "/transactions/1"),
    ("patch", "/transactions/1/cancel"), ("patch", "/transactions/1/restore"), ("post", "/transactions/import"),
    ("get", "/categories"), ("post", "/categories"), ("get", "/categories/1"), ("patch", "/categories/1"),
    ("patch", "/categories/1/archive"), ("patch", "/categories/1/unarchive"), ("delete", "/categories/1"),
]
statuses = {f"{m.upper()} {p}": getattr(client, m)(p).status_code for m, p in protected}
check(f"보호된 API {len(protected)}개 모두 토큰 없이 → 401", all(code == 401 for code in statuses.values()))
if not all(code == 401 for code in statuses.values()):
    print("   401이 아닌 것:", {k: v for k, v in statuses.items() if v != 401})

res = client.get("/transactions", headers={"X-User-Id": "1"})
check("개발용 X-User-Id 헤더만으로는 통과할 수 없다 → 401 (기본 설정)", res.status_code == 401)

for path in ("/", "/docs", "/openapi.json"):
    check(f"공개 주소 {path} 는 로그인 없이 → 200", client.get(path).status_code == 200)
schemes = client.get("/openapi.json").json()["components"]["securitySchemes"]
check("Swagger에 Authorize 버튼이 생기는 보안 설정이 있다", any(s.get("type") == "oauth2" for s in schemes.values()))

# ------------------------------------------------------------------ 사용자 분리
print("\n== 사용자별 데이터 분리")
token_a = token
register("second@example.com", GOOD_PASSWORD)
token_b = login("second@example.com", GOOD_PASSWORD).json()["access_token"]

cat = client.post("/categories", json={"name": "내 카테고리"}, headers=bearer(token_a))
check("로그인한 사용자 A가 카테고리 생성 → 201", cat.status_code == 201)
cat_id = cat.json()["id"]
check("그 카테고리의 주인은 A", cat.json()["user_id"] == new_user_id)
tx = client.post("/transactions", json={"category_id": cat_id, "merchant_name": "A의 가게", "amount": 1000,
                                         "transaction_date": "2026-11-01", "source_bank": "체크카드"}, headers=bearer(token_a))
check("A가 거래 등록 → 201", tx.status_code == 201)
tx_id = tx.json()["id"]

check("B의 카테고리 목록에는 A의 것이 없다", client.get("/categories", headers=bearer(token_b)).json() == [])
check("B의 거래 목록은 0건", client.get("/transactions", headers=bearer(token_b)).json()["total_elements"] == 0)
check("B가 A의 카테고리를 열면 → 404", client.get(f"/categories/{cat_id}", headers=bearer(token_b)).status_code == 404)
check("B가 A의 거래를 취소하려 하면 → 403", client.patch(f"/transactions/{tx_id}/cancel", headers=bearer(token_b)).status_code == 403)
check("B가 A의 카테고리를 보관하려 하면 → 403", client.patch(f"/categories/{cat_id}/archive", headers=bearer(token_b)).status_code == 403)
res = client.get("/categories", headers={**bearer(token_b), "X-User-Id": str(new_user_id)})
check("토큰이 있으면 X-User-Id 헤더로 다른 사람인 척할 수 없다", res.json() == [])
check("A의 데이터는 그대로다", client.get(f"/transactions/{tx_id}", headers=bearer(token_a)).json()["status"] == "ACTIVE")

print()
print("전체 통과" if all_passed else "일부 실패 — 위 로그 확인 필요")
sys.exit(0 if all_passed else 1)
