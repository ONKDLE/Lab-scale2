import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import models
from app.database import Base, engine, SessionLocal
from app.routers import category, importer, transaction

app = FastAPI(
    title="MyFin API",
    description="마이핀(MyFin): 커스텀 카테고리 및 은행 CSV 연동 기반 스마트 가계부",
    version="0.6.0 (Import)",
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

app.include_router(category.router)
app.include_router(importer.router)  # /transactions/import 를 /{id} 보다 먼저 등록
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
