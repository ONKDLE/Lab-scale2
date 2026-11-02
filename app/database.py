"""
DB 연결 설정.
개발 초기에는 SQLite를 사용하고(기술명세서 1. 기술 스택 참고),
나중에 배포 시 DATABASE_URL 환경변수만 바꿔서 PostgreSQL로 교체합니다.

예) PostgreSQL로 바꿀 때:
    DATABASE_URL=postgresql://user:password@localhost:5432/mypin
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./mypin.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI 의존성 주입용: 요청마다 세션을 열고 끝나면 닫는다."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
