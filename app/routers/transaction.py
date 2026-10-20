"""
거래(Transaction) API.
스프린트2: POST(중복 거래 거절) / GET 목록 / GET 상세
스프린트3: PATCH /{id}/cancel - 거래를 삭제 대신 '취소(CANCELLED)' 상태로 전환 (본인 거래만 가능)
스프린트4: GET 목록에 페이지 나누기 + 정렬 + 상태 필터 + 키워드 검색 + 잘못된 값 400 처리
"""
import hashlib
import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user_id

router = APIRouter(prefix="/transactions", tags=["transactions"])

# ---- 목록 조회 규칙 (스프린트4) ----
DEFAULT_PAGE = 1
DEFAULT_SIZE = 10
MAX_SIZE = 100
DEFAULT_SORT = "transaction_date,desc"
ALLOWED_STATUS = ("ACTIVE", "CANCELLED")
# 정렬에 쓸 수 있는 필드만 허용한다 (그 외 값은 400)
SORT_COLUMNS = {
    "id": models.Transaction.id,
    "transaction_date": models.Transaction.transaction_date,
    "amount": models.Transaction.amount,
    "merchant_name": models.Transaction.merchant_name,
}


def _bad_request(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)


def _parse_positive_int(raw: Optional[str], name: str, default: int) -> int:
    """page, size 같은 숫자 파라미터 검사. 안 보내면 기본값, 숫자가 아니거나 1 미만이면 400."""
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise _bad_request(f"{name}는 정수여야 합니다. (입력값: {raw})")
    if value < 1:
        raise _bad_request(f"{name}는 1 이상이어야 합니다. (입력값: {value})")
    return value


def _parse_sort(raw: Optional[str]):
    """sort=필드,방향 (예: amount,asc). 허용되지 않은 필드/방향이면 400."""
    raw = raw if raw and raw.strip() else DEFAULT_SORT
    parts = [p.strip() for p in raw.split(",")]
    field = parts[0]
    direction = parts[1].lower() if len(parts) > 1 and parts[1] else "desc"
    if len(parts) > 2 or field not in SORT_COLUMNS:
        raise _bad_request(f"sort 필드는 {', '.join(SORT_COLUMNS)} 중 하나여야 합니다. (입력값: {raw})")
    if direction not in ("asc", "desc"):
        raise _bad_request(f"sort 방향은 asc 또는 desc여야 합니다. (입력값: {parts[1]})")
    return field, direction


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


@router.get("", response_model=schemas.TransactionPage)
def list_transactions(
    page: Optional[str] = Query(None, description="페이지 번호 (1부터, 기본 1)"),
    size: Optional[str] = Query(None, description="페이지당 개수 (1~100, 기본 10)"),
    sort: Optional[str] = Query(None, description="정렬 '필드,방향' 예: amount,asc (기본 transaction_date,desc)"),
    status_filter: Optional[str] = Query(None, alias="status", description="상태 필터: ACTIVE 또는 CANCELLED"),
    keyword: Optional[str] = Query(None, description="가맹점명 검색어"),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    # 1) 파라미터 검사 (잘못된 값은 500이 아니라 400으로 안전하게 거절)
    page_no = _parse_positive_int(page, "page", DEFAULT_PAGE)
    page_size = _parse_positive_int(size, "size", DEFAULT_SIZE)
    if page_size > MAX_SIZE:
        raise _bad_request(f"size는 {MAX_SIZE} 이하여야 합니다. (입력값: {page_size})")
    sort_field, sort_direction = _parse_sort(sort)

    status_value = status_filter.strip().upper() if status_filter and status_filter.strip() else None
    if status_value is not None and status_value not in ALLOWED_STATUS:
        raise _bad_request(f"status는 {' 또는 '.join(ALLOWED_STATUS)}여야 합니다. (입력값: {status_filter})")

    keyword_value = keyword.strip() if keyword and keyword.strip() else None
    if keyword_value is not None and len(keyword_value) > 100:
        raise _bad_request("keyword는 100자 이하여야 합니다.")

    # 2) 조건 조립: 내 거래 AND (상태) AND (키워드)
    query = db.query(models.Transaction).filter(models.Transaction.user_id == current_user_id)
    if status_value is not None:
        query = query.filter(models.Transaction.status == status_value)
    if keyword_value is not None:
        # %, _ 같은 특수문자도 검색어 그대로 찾도록 이스케이프
        escaped = keyword_value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(models.Transaction.merchant_name.ilike(f"%{escaped}%", escape="\\"))

    # 3) 전체 개수 조회(COUNT)와 목록 조회(LIMIT/OFFSET)를 분리해서 실행
    total_elements = query.with_entities(func.count(models.Transaction.id)).scalar()

    column = SORT_COLUMNS[sort_field]
    order_by = [column.asc() if sort_direction == "asc" else column.desc()]
    if sort_field != "id":
        order_by.append(models.Transaction.id.desc())  # 값이 같아도 페이지 순서가 흔들리지 않게

    items = (
        query.order_by(*order_by)
        .offset((page_no - 1) * page_size)
        .limit(page_size)
        .all()
    )

    total_pages = math.ceil(total_elements / page_size)
    return {
        "items": items,
        "page": page_no,
        "size": page_size,
        "total_elements": total_elements,
        "total_pages": total_pages,
        "has_next": page_no < total_pages,
    }


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
