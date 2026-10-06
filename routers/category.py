"""
카테고리(Category) CRUD API.
4주차 스프린트1 범위: POST / GET 목록 / GET 상세 / PATCH / DELETE 5개 엔드포인트.

NOTE: 인증(FR-06)은 아직 구현 전이라, 임시로 DEFAULT_USER_ID를 사용합니다.
      로그인 기능이 붙으면 Depends(get_current_user)로 교체할 예정입니다.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/categories", tags=["categories"])

DEFAULT_USER_ID = 1  # TODO: 인증 붙으면 제거


def _get_category_or_404(db: Session, category_id: int) -> models.Category:
    category = db.query(models.Category).filter(
        models.Category.id == category_id,
        models.Category.user_id == DEFAULT_USER_ID,
    ).first()
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="카테고리를 찾을 수 없습니다.")
    return category


@router.post("", response_model=schemas.CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(payload: schemas.CategoryCreate, db: Session = Depends(get_db)):
    # 엣지케이스(PRD 5.1 FR-02): 동일 사용자 내 카테고리명 중복 생성 방지
    duplicate = db.query(models.Category).filter(
        models.Category.user_id == DEFAULT_USER_ID,
        models.Category.name == payload.name,
    ).first()
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 존재하는 카테고리명입니다.")

    if payload.parent_category_id is not None:
        _get_category_or_404(db, payload.parent_category_id)

    category = models.Category(user_id=DEFAULT_USER_ID, **payload.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("", response_model=List[schemas.CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.query(models.Category).filter(models.Category.user_id == DEFAULT_USER_ID).all()


@router.get("/{category_id}", response_model=schemas.CategoryOut)
def get_category(category_id: int, db: Session = Depends(get_db)):
    return _get_category_or_404(db, category_id)


@router.patch("/{category_id}", response_model=schemas.CategoryOut)
def update_category(category_id: int, payload: schemas.CategoryUpdate, db: Session = Depends(get_db)):
    category = _get_category_or_404(db, category_id)

    update_data = payload.model_dump(exclude_unset=True)

    if "name" in update_data:
        duplicate = db.query(models.Category).filter(
            models.Category.user_id == DEFAULT_USER_ID,
            models.Category.name == update_data["name"],
            models.Category.id != category_id,
        ).first()
        if duplicate is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 존재하는 카테고리명입니다.")

    if "parent_category_id" in update_data and update_data["parent_category_id"] is not None:
        if update_data["parent_category_id"] == category_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="자기 자신을 상위 카테고리로 지정할 수 없습니다.")
        _get_category_or_404(db, update_data["parent_category_id"])

    for field, value in update_data.items():
        setattr(category, field, value)

    db.commit()
    db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    category = _get_category_or_404(db, category_id)

    # 엣지케이스(PRD 5.1 FR-02): 하위 카테고리가 있으면 삭제 차단
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
