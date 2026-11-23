import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text

from app import models
from app.database import Base, engine, SessionLocal
from app.security import hash_password
from app.routers import auth, category, importer, transaction, stats, budget

app = FastAPI(
    title="MyFin API",
    description="마이핀(MyFin): 커스텀 카테고리 및 은행 CSV 연동 기반 스마트 가계부",
    version="0.7.0 (Sprint 6, Auth)",
)

# 프론트엔드(React 개발 서버, 기본 5173 포트)가 이 API를 브라우저에서 호출할 수 있게 허용한다.
# 배포할 때는 환경변수 CORS_ORIGINS="https://내도메인" 으로 바꾸면 된다 (쉼표로 여러 개 가능).
_cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(category.router)
app.include_router(importer.router)  # /transactions/import 를 /{id} 보다 먼저 등록
app.include_router(transaction.router)
app.include_router(stats.router)
app.include_router(budget.router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    _migrate_transaction_type()
    _seed_test_users()


def _migrate_transaction_type():
    """기존 SQLite DB에도 수입/지출 구분 컬럼을 안전하게 추가한다. 기존 거래는 지출로 유지한다."""
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("transaction")}
    if "transaction_type" in columns:
        return
    with engine.begin() as connection:
        connection.execute(
            text('ALTER TABLE "transaction" ADD COLUMN transaction_type VARCHAR(10) NOT NULL DEFAULT "EXPENSE"')
        )


DEMO_PASSWORD = "mypin1234"
_PLACEHOLDER_HASH = "temp-not-a-real-hash"  # 로그인이 없던 시절에 넣어 둔 임시 값


def _seed_test_users():
    """
    시연용 계정 2개를 준비한다. (둘 다 비밀번호: mypin1234)
      id=1  test@mypin.dev   기본 시연 계정 (샘플 거래와 업로드한 내역이 들어 있음)
      id=2  other@mypin.dev  '다른 사용자' 권한 확인용
    예전 DB에 임시 값으로 들어 있던 계정은 로그인할 수 있게 비밀번호를 채운다.
    끄려면 환경변수 SEED_DEMO_USERS=0 으로 실행한다.
    """
    if os.getenv("SEED_DEMO_USERS", "1") != "1":
        return
    db: Session = SessionLocal()
    try:
        for user_id, email in ((1, "test@mypin.dev"), (2, "other@mypin.dev")):
            user = db.get(models.User, user_id)
            if user is None:
                db.add(models.User(id=user_id, email=email, password_hash=hash_password(DEMO_PASSWORD)))
            elif user.password_hash == _PLACEHOLDER_HASH:
                user.password_hash = hash_password(DEMO_PASSWORD)
        db.commit()
    finally:
        db.close()


@app.get("/")
def root():
    return {"service": "MyFin API", "status": "ok"}
