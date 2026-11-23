"""
카테고리(Category) API.
스프린트1: POST / GET 목록 / GET 상세 / PATCH / DELETE
스프린트3:
 - GET 상세 조회 시 연결된 거래(transaction) 목록을 함께 묶어서 반환 (관계형 조회)
 - PATCH /{id}/archive : 카테고리를 삭제 대신 '보관(ARCHIVED)' 상태로 전환 (작성자 본인만 가능)
스프린트6:
 - PATCH /{id}/unarchive : 보관을 해제(ACTIVE)해서 되돌림 (작성자 본인만 가능)
 - 목록과 상세에 거래 건수·합계 요약 추가 (정상 거래만 계산)
"""
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user_id

router = APIRouter(prefix="/categories", tags=["categories"])


def _get_category_or_404(db: Session, category_id: int, user_id: int) -> models.Category:
    """내 소유 카테고리만 찾는다 (목록/수정/삭제처럼 '내 것 중에서' 조회할 때 사용)."""
    category = db.query(models.Category).filter(
        models.Category.id == category_id,
        models.Category.user_id == user_id,
    ).first()
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="카테고리를 찾을 수 없습니다.")
    return category


def _get_category_any_owner_or_404(db: Session, category_id: int) -> models.Category:
    """소유자와 상관없이 존재 여부만 찾는다 (권한 체크가 필요한 archive에서 사용)."""
    category = db.query(models.Category).filter(models.Category.id == category_id).first()
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="카테고리를 찾을 수 없습니다.")
    return category


@router.post("", response_model=schemas.CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: schemas.CategoryCreate,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    duplicate = db.query(models.Category).filter(
        models.Category.user_id == current_user_id,
        models.Category.name == payload.name,
    ).first()
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 존재하는 카테고리명입니다.")

    if payload.parent_category_id is not None:
        _get_category_or_404(db, payload.parent_category_id, current_user_id)

    category = models.Category(user_id=current_user_id, **payload.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("", response_model=List[schemas.CategorySummaryOut])
def list_categories(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    categories = db.query(models.Category).filter(models.Category.user_id == current_user_id).all()

    # 카테고리마다 따로 조회하지 않고, 쿼리 한 번으로 전체의 건수와 합계를 구한다 (N+1 방지)
    totals = {
        category_id: (count, total)
        for category_id, count, total in db.query(
            models.Transaction.category_id,
            func.count(models.Transaction.id),
            func.coalesce(func.sum(models.Transaction.amount), 0),
        )
        .filter(
            models.Transaction.user_id == current_user_id,
            models.Transaction.status == "ACTIVE",
            models.Transaction.category_id.isnot(None),
        )
        .group_by(models.Transaction.category_id)
    }

    result = []
    for category in categories:
        count, total = totals.get(category.id, (0, 0))
        result.append(
            schemas.CategorySummaryOut(
                **schemas.CategoryOut.model_validate(category).model_dump(),
                transaction_count=count,
                total_amount=Decimal(total).quantize(Decimal("0.01")),
            )
        )
    return result


@router.get("/{category_id}", response_model=schemas.CategoryDetailOut)
def get_category(
    category_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """카테고리 상세 + 그 카테고리에 속한 거래 목록을 함께 묶어서 반환 (관계형 조회)."""
    category = _get_category_or_404(db, category_id, current_user_id)

    # 카테고리 1건당 쿼리 1번으로 연결된 거래를 전부 가져온다 (N+1 방지)
    transactions = (
        db.query(models.Transaction)
        .filter(models.Transaction.category_id == category_id)
        .order_by(models.Transaction.transaction_date.desc(), models.Transaction.id.desc())
        .all()
    )
    active = [t for t in transactions if t.status == "ACTIVE"]

    return schemas.CategoryDetailOut(
        id=category.id,
        user_id=category.user_id,
        name=category.name,
        icon=category.icon,
        color=category.color,
        parent_category_id=category.parent_category_id,
        status=category.status,
        transaction_count=len(active),
        total_amount=sum((Decimal(t.amount) for t in active), Decimal("0")).quantize(Decimal("0.01")),
        transactions=[schemas.TransactionOut.model_validate(t) for t in transactions],
    )


@router.patch("/{category_id}", response_model=schemas.CategoryOut)
def update_category(
    category_id: int,
    payload: schemas.CategoryUpdate,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    category = _get_category_or_404(db, category_id, current_user_id)

    update_data = payload.model_dump(exclude_unset=True)

    if "name" in update_data:
        duplicate = db.query(models.Category).filter(
            models.Category.user_id == current_user_id,
            models.Category.name == update_data["name"],
            models.Category.id != category_id,
        ).first()
        if duplicate is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 존재하는 카테고리명입니다.")

    if "parent_category_id" in update_data and update_data["parent_category_id"] is not None:
        if update_data["parent_category_id"] == category_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="자기 자신을 상위 카테고리로 지정할 수 없습니다.")
        _get_category_or_404(db, update_data["parent_category_id"], current_user_id)

    for field, value in update_data.items():
        setattr(category, field, value)

    db.commit()
    db.refresh(category)
    return category


def _change_category_status(
    db: Session, category_id: int, current_user_id: int, new_status: str, forbidden_message: str
) -> models.Category:
    category = _get_category_any_owner_or_404(db, category_id)
    if category.user_id != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=forbidden_message)
    category.status = new_status
    db.commit()
    db.refresh(category)
    return category


@router.patch("/{category_id}/archive", response_model=schemas.CategoryOut)
def archive_category(
    category_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """카테고리를 '보관(ARCHIVED)' 상태로 전환. 작성자 본인만 가능 (아니면 403)."""
    return _change_category_status(
        db, category_id, current_user_id, "ARCHIVED", "본인이 만든 카테고리만 보관 처리할 수 있습니다."
    )


@router.patch("/{category_id}/unarchive", response_model=schemas.CategoryOut)
def unarchive_category(
    category_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """보관을 해제해서 '사용 중(ACTIVE)'으로 되돌림. 작성자 본인만 가능 (아니면 403)."""
    return _change_category_status(
        db, category_id, current_user_id, "ACTIVE", "본인이 만든 카테고리만 보관을 해제할 수 있습니다."
    )


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    category = _get_category_or_404(db, category_id, current_user_id)

    has_subcategories = db.query(models.Category).filter(
        models.Category.parent_category_id == category_id
    ).first()
    if has_subcategories is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="하위 카테고리가 존재해 삭제할 수 없습니다. 먼저 하위 카테고리를 삭제하거나 이동하세요.",
        )

    has_transactions = db.query(models.Transaction).filter(
        models.Transaction.category_id == category_id
    ).first()
    if has_transactions is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="거래가 연결된 카테고리는 삭제할 수 없습니다. 먼저 거래를 다른 카테고리로 이동하거나 미분류로 변경하세요.",
        )

    db.delete(category)
    db.commit()
    return None
