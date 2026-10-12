"""
거래(Transaction) API.
스프린트2: POST(중복 거래 거절) / GET 목록 / GET 상세
스프린트3: PATCH /{id}/cancel - 거래를 삭제 대신 '취소(CANCELLED)' 상태로 전환 (본인 거래만 가능)
"""
import hashlib
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user_id

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _make_row_hash(user_id: int, payload: schemas.TransactionCreate) -> str:
    """같은 거래인지 판별하는 기준값 (날짜+금액+가맹점명+은행+사용자)."""
    raw = f"{user_id}|{payload.transaction_date}|{payload.amount}|{payload.merchant_name}|{payload.source_bank}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _get_transaction_any_owner_or_404(db: Session, transaction_id: int) -> models.Transaction:
    """소유자와 상관없이 존재 여부만 찾는다 (권한 체크가 필요한 cancel에서 사용)."""
    transaction = db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래를 찾을 수 없습니다.")
    return transaction


@router.post("", response_model=schemas.TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: schemas.TransactionCreate,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    if payload.category_id is not None:
        category = db.query(models.Category).filter(
            models.Category.id == payload.category_id,
            models.Category.user_id == current_user_id,
        ).first()
        if category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="카테고리를 찾을 수 없습니다.")

    row_hash = _make_row_hash(current_user_id, payload)
    duplicate = db.query(models.Transaction).filter(
        models.Transaction.raw_row_hash == row_hash
    ).first()
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 등록된 거래입니다 (같은 날짜·금액·가맹점·은행).",
        )

    transaction = models.Transaction(
        user_id=current_user_id,
        raw_row_hash=row_hash,
        **payload.model_dump(),
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


@router.get("", response_model=List[schemas.TransactionOut])
def list_transactions(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    return db.query(models.Transaction).filter(models.Transaction.user_id == current_user_id).all()


@router.get("/{transaction_id}", response_model=schemas.TransactionOut)
def get_transaction(
    transaction_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    transaction = db.query(models.Transaction).filter(
        models.Transaction.id == transaction_id,
        models.Transaction.user_id == current_user_id,
    ).first()
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래를 찾을 수 없습니다.")
    return transaction


@router.patch("/{transaction_id}/cancel", response_model=schemas.TransactionOut)
def cancel_transaction(
    transaction_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """거래를 '취소(CANCELLED)' 상태로 전환. 본인이 등록한 거래만 가능 (아니면 403)."""
    transaction = _get_transaction_any_owner_or_404(db, transaction_id)

    if transaction.user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="본인이 등록한 거래만 취소할 수 있습니다.",
        )

    transaction.status = "CANCELLED"
    db.commit()
    db.refresh(transaction)
    return transaction
