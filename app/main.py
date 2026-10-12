from fastapi import FastAPI
from sqlalchemy.orm import Session

from app import models
from app.database import Base, engine, SessionLocal
from app.routers import category, transaction

app = FastAPI(
    title="MyFin API",
    description="마이핀(MyFin): 커스텀 카테고리 및 은행 CSV 연동 기반 스마트 가계부",
    version="0.3.0 (Sprint 3)",
)

app.include_router(category.router)
app.include_router(transaction.router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    _seed_test_users()


def _seed_test_users():
    """
    인증(FR-06) 구현 전까지 쓸 임시 테스트 유저 2명을 생성.
    id=1: 기본 사용자 (헤더 없이 요청하면 이 사람으로 간주)
    id=2: 권한(인가) 테스트용 '다른 사용자' — X-User-Id: 2 헤더로 흉내낼 때 사용
    """
    db: Session = SessionLocal()
    try:
        if db.query(models.User).filter(models.User.id == 1).first() is None:
            db.add(models.User(id=1, email="test@mypin.dev", password_hash="temp-not-a-real-hash"))
        if db.query(models.User).filter(models.User.id == 2).first() is None:
            db.add(models.User(id=2, email="other@mypin.dev", password_hash="temp-not-a-real-hash"))
        db.commit()
    finally:
        db.close()


@app.get("/")
def root():
    return {"service": "MyFin API", "status": "ok"}
