from fastapi import FastAPI
from sqlalchemy.orm import Session

from app import models
from app.database import Base, engine, SessionLocal
from app.routers import category

app = FastAPI(
    title="MyFin API",
    description="마이핀(MyFin): 커스텀 카테고리 및 은행 CSV 연동 기반 스마트 가계부",
    version="0.1.0 (Sprint 1)",
)

app.include_router(category.router)


@app.on_event("startup")
def on_startup():
    # 기술명세서 3-3 SQL DDL과 동일한 스키마를 생성
    Base.metadata.create_all(bind=engine)
    _seed_default_user()


def _seed_default_user():
    """인증(FR-06) 구현 전까지 사용할 임시 테스트 유저(id=1)를 생성."""
    db: Session = SessionLocal()
    try:
        existing = db.query(models.User).filter(models.User.id == 1).first()
        if existing is None:
            db.add(models.User(email="test@mypin.dev", password_hash="temp-not-a-real-hash"))
            db.commit()
    finally:
        db.close()


@app.get("/")
def root():
    return {"service": "MyFin API", "status": "ok"}
