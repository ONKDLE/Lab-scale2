"""
거래(Transaction) API.
5주차 스프린트2 범위:
 - category(카테고리)와 FK로 연결되는 두 번째 테이블
 - '조건 처리 API' 1개: 같은 거래(날짜+금액+가맹점+은행)를 중복 등록하면 400으로 거절

NOTE: 인증(FR-06) 아직 없어서 category.py와 동일하게 DEFAULT_USER_ID 사용.
"""
import hashlib
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/transactions", tags=["transactions"])

DEFAULT_USER_ID = 1  # TODO: 인증 붙으면 제거


def _make_row_hash(user_id: int, payload: schemas.TransactionCreate) -> str:
    """
    같은 거래인지 판별하는 기준값.
    날짜+금액+가맹점명+은행(+사용자)이 전부 같으면 '같은 거래'로 간주한다.
    """
    raw = f"{user_id}|{payload.transaction_date}|{payload.amount}|{payload.merchant_name}|{payload.source_bank}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@router.post("", response_model=schemas.TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(payload: schemas.TransactionCreate, db: Session = Depends(get_db)):
    # category_id를 지정했으면, 그 카테고리가 실제로 존재하고 내 소유인지 확인
    if payload.category_id is not None:
        category = db.query(models.Category).filter(
            models.Category.id == payload.category_id,
            models.Category.user_id == DEFAULT_USER_ID,
        ).first()
        if category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="카테고리를 찾을 수 없습니다.")

    # ▼ 이번 주 핵심: 조건 검사 (중복 거래면 거절)
    row_hash = _make_row_hash(DEFAULT_USER_ID, payload)
    duplicate = db.query(models.Transaction).filter(
        models.Transaction.raw_row_hash == row_hash
    ).first()
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 등록된 거래입니다 (같은 날짜·금액·가맹점·은행).",
        )

    transaction = models.Transaction(
        user_id=DEFAULT_USER_ID,
        raw_row_hash=row_hash,
        **payload.model_dump(),
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


@router.get("", response_model=List[schemas.TransactionOut])
def list_transactions(db: Session = Depends(get_db)):
    return db.query(models.Transaction).filter(models.Transaction.user_id == DEFAULT_USER_ID).all()


@router.get("/{transaction_id}", response_model=schemas.TransactionOut)
def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    transaction = db.query(models.Transaction).filter(
        models.Transaction.id == transaction_id,
        models.Transaction.user_id == DEFAULT_USER_ID,
    ).first()
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래를 찾을 수 없습니다.")
    return transaction
