"""
API 입출력 검증용 Pydantic 스키마.
스프린트1: Category(카테고리)
스프린트2: Transaction(거래내역) - category를 참조(FK)하는 두 번째 테이블
스프린트3: 상태(status) 필드 + 카테고리 상세 조회 시 거래 목록을 함께 묶어서 반환(JOIN)
"""
from datetime import date
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


# ---- Category ----

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
    status: str  # ACTIVE | ARCHIVED


# ---- Transaction (스프린트2: 두 번째 테이블) ----

class TransactionCreate(BaseModel):
    category_id: Optional[int] = Field(None, description="분류할 카테고리 id (없으면 미분류)")
    merchant_name: str = Field(..., min_length=1, max_length=100, description="가맹점명")
    amount: Decimal = Field(..., gt=0, description="거래 금액")
    transaction_date: date = Field(..., description="거래 일자 (YYYY-MM-DD)")
    source_bank: str = Field(..., min_length=1, max_length=30, description="거래 출처 은행")


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    category_id: Optional[int]
    merchant_name: str
    amount: Decimal
    transaction_date: date
    source_bank: str
    status: str  # ACTIVE | CANCELLED


# ---- 스프린트3: 카테고리 + 연결된 거래 묶음 조회 ----

class CategoryDetailOut(CategoryOut):
    transactions: List[TransactionOut] = []


# ---- 스프린트4: 페이지 나누기(Pagination) 공통 응답 ----

class TransactionPage(BaseModel):
    """거래 목록 + 페이지 정보. 한 번에 일부(size개)만 담아서 응답한다."""
    items: List[TransactionOut]
    page: int            # 현재 페이지 번호 (1부터 시작)
    size: int            # 페이지당 개수
    total_elements: int  # 조건에 맞는 전체 거래 수
    total_pages: int     # 전체 페이지 수
    has_next: bool       # 다음 페이지가 있는지


# ---- 카드 이용내역 파일 업로드 결과 ----

class ImportRowError(BaseModel):
    row_number: int  # 엑셀에서 보이는 줄 번호
    reason: str


class ImportSummary(BaseModel):
    """업로드 결과 요약. 이상한 줄이 있어도 나머지는 저장하고, 건너뛴 줄과 이유를 알려준다."""
    source_bank: str
    total_rows: int   # 파일에서 읽은 거래 줄 수 (빈 줄 제외)
    imported: int     # 새로 저장한 거래 수
    duplicates: int   # 이미 저장돼 있어서 건너뛴 거래 수
    skipped: int      # 형식이 이상해서 건너뛴 줄 수
    errors: List[ImportRowError]
