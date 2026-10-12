"""
카테고리(Category) API.
스프린트1: POST / GET 목록 / GET 상세 / PATCH / DELETE
스프린트3:
 - GET 상세 조회 시 연결된 거래(transaction) 목록을 함께 묶어서 반환 (관계형 조회)
 - PATCH /{id}/archive : 카테고리를 삭제 대신 '보관(ARCHIVED)' 상태로 전환 (작성자 본인만 가능)
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
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


@router.get("", response_model=List[schemas.CategoryOut])
def list_categories(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    return db.query(models.Category).filter(models.Category.user_id == current_user_id).all()


@router.get("/{category_id}", response_model=schemas.CategoryDetailOut)
def get_category(
    category_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """카테고리 상세 + 그 카테고리에 속한 거래 목록을 함께 묶어서 반환 (관계형 조회)."""
    category = _get_category_or_404(db, category_id, current_user_id)

    # 카테고리 1건당 쿼리 1번으로 연결된 거래를 전부 가져온다 (N+1 방지)
    transactions = db.query(models.Transaction).filter(
        models.Transaction.category_id == category_id
    ).all()

    return schemas.CategoryDetailOut(
        id=category.id,
        user_id=category.user_id,
        name=category.name,
        icon=category.icon,
        color=category.color,
        parent_category_id=category.parent_category_id,
        status=category.status,
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


@router.patch("/{category_id}/archive", response_model=schemas.CategoryOut)
def archive_category(
    category_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """카테고리를 '보관(ARCHIVED)' 상태로 전환. 작성자 본인만 가능 (아니면 403)."""
    category = _get_category_any_owner_or_404(db, category_id)

    if category.user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="본인이 만든 카테고리만 보관 처리할 수 있습니다.",
        )

    category.status = "ARCHIVED"
    db.commit()
    db.refresh(category)
    return category


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

    db.delete(category)
    db.commit()
    return None
