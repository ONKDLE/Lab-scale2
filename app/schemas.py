"""
API 입출력 검증용 Pydantic 스키마.
스프린트1 범위: Category(카테고리)만 우선 구현.
"""
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50, description="카테고리명")
    icon: Optional[str] = Field(None, max_length=20)
    color: Optional[str] = Field(None, max_length=7, description="HEX 색상, 예: #4472C4")
    parent_category_id: Optional[int] = Field(None, description="상위 카테고리 id (없으면 최상위)")


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    """PATCH용: 모든 필드가 선택적(부분 수정)."""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    icon: Optional[str] = Field(None, max_length=20)
    color: Optional[str] = Field(None, max_length=7)
    parent_category_id: Optional[int] = None


class CategoryOut(CategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
