"""월별 수입/지출 통계 API."""

from calendar import monthrange
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user_id

router = APIRouter(prefix="/stats", tags=["stats"])


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


def _month_bounds(month: str) -> tuple[date, date]:
    try:
        year, month_no = (int(v) for v in month.split("-"))
        if len(month) != 7 or month[4] != "-" or not 1 <= month_no <= 12:
            raise ValueError
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="month는 YYYY-MM 형식이어야 합니다.")
    return date(year, month_no, 1), date(year, month_no, monthrange(year, month_no)[1])


def _month_string(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def _build_month(db: Session, user_id: int, month: str, category_names: dict[int, tuple[str, Optional[str]]]) -> schemas.StatsMonthOut:
    start, end = _month_bounds(month)
    rows = (db.query(models.Transaction).filter(
        models.Transaction.user_id == user_id,
        models.Transaction.status == "ACTIVE",
        models.Transaction.transaction_date >= start,
        models.Transaction.transaction_date <= end,
    ).all())

    total_expense = sum((Decimal(str(r.amount)) for r in rows if r.transaction_type == "EXPENSE"), Decimal("0"))
    total_income = sum((Decimal(str(r.amount)) for r in rows if r.transaction_type == "INCOME"), Decimal("0"))
    grouped: dict[Optional[int], list[Decimal | int]] = {}
    expense_rows = [r for r in rows if r.transaction_type == "EXPENSE"]
    for row in expense_rows:
        item = grouped.setdefault(row.category_id, [Decimal("0"), 0])
        item[0] += Decimal(str(row.amount))
        item[1] += 1

    categories = []
    for category_id, (amount, count) in grouped.items():
        if category_id is None:
            name, color = "미분류", None
        else:
            name, color = category_names.get(category_id, ("삭제된 카테고리", None))
        ratio = float((amount / total_expense * Decimal("100")) if total_expense else Decimal("0"))
        categories.append(schemas.StatsCategoryOut(
            category_id=category_id, category_name=name, color=color,
            amount=amount.quantize(Decimal("0.01")), ratio=round(ratio, 1), transaction_count=count
        ))
    categories.sort(key=lambda item: item.amount, reverse=True)
    return schemas.StatsMonthOut(
        month=month, total_expense=total_expense.quantize(Decimal("0.01")),
        total_income=total_income.quantize(Decimal("0.01")),
        net_amount=(total_income - total_expense).quantize(Decimal("0.01")),
        transaction_count=len(rows), categories=categories,
        top_category_name=categories[0].category_name if categories else None,
    )


@router.get("/monthly", response_model=schemas.MonthlyStatsOut)
def monthly_stats(
    month: Optional[str] = Query(None, description="조회 월 YYYY-MM, 생략하면 현재 월"),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    today = date.today()
    if month is None:
        month = _month_string(today.year, today.month)
    start, _ = _month_bounds(month)
    previous_year, previous_month_no = _shift_month(start.year, start.month, -1)
    previous_month = _month_string(previous_year, previous_month_no)

    trend = []
    for offset in range(-5, 1):
        y, m = _shift_month(start.year, start.month, offset)
        target = _month_string(y, m)
        month_start, month_end = _month_bounds(target)
        rows = db.query(models.Transaction).filter(
            models.Transaction.user_id == current_user_id,
            models.Transaction.status == "ACTIVE",
            models.Transaction.transaction_date >= month_start,
            models.Transaction.transaction_date <= month_end,
        ).all()
        income = sum((Decimal(str(r.amount)) for r in rows if r.transaction_type == "INCOME"), Decimal("0"))
        expense = sum((Decimal(str(r.amount)) for r in rows if r.transaction_type == "EXPENSE"), Decimal("0"))
        trend.append({"month": target, "total_income": income.quantize(Decimal("0.01")), "total_expense": expense.quantize(Decimal("0.01"))})

    owned_categories = db.query(models.Category).filter(models.Category.user_id == current_user_id).all()
    category_names = {c.id: (c.name, c.color) for c in owned_categories}
    current = _build_month(db, current_user_id, month, category_names)
    previous = _build_month(db, current_user_id, previous_month, category_names)
    return schemas.MonthlyStatsOut(
        month=month, previous_month=previous_month, current=current, previous=previous,
        trend=trend, income_supported=True,
    )
