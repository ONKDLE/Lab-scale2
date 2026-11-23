"""
API 입출력 검증용 Pydantic 스키마.
스프린트1: Category(카테고리)
스프린트2: Transaction(거래내역) - category를 참조(FK)하는 두 번째 테이블
스프린트3: 상태(status) 필드 + 카테고리 상세 조회 시 거래 목록을 함께 묶어서 반환(JOIN)
"""
from datetime import date
from decimal import Decimal
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, ConfigDict


# ---- Category ----

class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50, description="카테고리명")
    icon: Optional[str] = Field(None, max_length=20)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$", description="HEX 색상, 예: #4472C4")
    parent_category_id: Optional[int] = Field(None, description="상위 카테고리 id (없으면 최상위)")


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    """PATCH용: 모든 필드가 선택적(부분 수정)."""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    icon: Optional[str] = Field(None, max_length=20)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    parent_category_id: Optional[int] = None


class CategoryOut(CategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    status: str  # ACTIVE | ARCHIVED


# ---- Transaction (스프린트2: 두 번째 테이블) ----

class TransactionCreate(BaseModel):
    transaction_type: Literal["EXPENSE", "INCOME"] = Field("EXPENSE", description="거래 유형: 지출 또는 수입")
    category_id: Optional[int] = Field(None, description="분류할 카테고리 id (없으면 미분류)")
    merchant_name: str = Field(..., min_length=1, max_length=100, description="가맹점명")
    amount: Decimal = Field(..., gt=0, description="거래 금액")
    transaction_date: date = Field(..., description="거래 일자 (YYYY-MM-DD)")
    source_bank: str = Field(..., min_length=1, max_length=30, description="거래 출처 은행")


class TransactionCategoryUpdate(BaseModel):
    """거래의 카테고리를 변경한다. None이면 미분류로 변경."""
    category_id: Optional[int] = None


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
    transaction_type: Literal["EXPENSE", "INCOME"]


# ---- 스프린트3: 카테고리 + 연결된 거래 묶음 조회 ----

class CategorySummaryOut(CategoryOut):
    """카테고리 + 거래 요약. 건수와 합계는 '정상(ACTIVE)' 거래만 센다 (취소된 거래는 제외)."""
    transaction_count: int = 0
    total_amount: Decimal = Decimal("0.00")


class CategoryDetailOut(CategorySummaryOut):
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
    auto_classified: int = 0
    unclassified: int = 0


# ---- 예산 ----

class BudgetUpdate(BaseModel):
    month: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    limit_amount: Decimal = Field(..., ge=0, max_digits=12, decimal_places=2)


class BudgetOut(BaseModel):
    month: str
    limit_amount: Decimal
    total_expense: Decimal
    usage_rate: float
    remaining_amount: Decimal
    status: Literal["NO_BUDGET", "NORMAL", "WARNING", "OVER"]


# ---- 로그인 / 회원가입 ----

class RegisterRequest(BaseModel):
    # 길이/형식 규칙은 가입 API에서 한글 안내(400)로 검사한다. 여기 한도는 터무니없이 큰 입력만 막는 용도.
    email: str = Field(..., max_length=1000)
    password: str = Field(..., max_length=1000)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---- 월별 통계 / 대시보드 ----

class StatsCategoryOut(BaseModel):
    category_id: Optional[int] = None
    category_name: str
    color: Optional[str] = None
    amount: Decimal
    ratio: float
    transaction_count: int


class StatsMonthOut(BaseModel):
    month: str  # YYYY-MM
    total_expense: Decimal
    total_income: Decimal
    net_amount: Decimal
    transaction_count: int
    categories: List[StatsCategoryOut]
    top_category_name: Optional[str] = None


class MonthlyStatsOut(BaseModel):
    month: str
    previous_month: str
    current: StatsMonthOut
    previous: StatsMonthOut
    trend: List[dict]
    income_supported: bool = True
