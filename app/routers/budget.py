"""월 전체 예산 API."""

from calendar import monthrange
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user_id

router = APIRouter(prefix="/budget", tags=["budget"])


def _validate_month(month: str) -> tuple[date, date]:
    try:
        year, month_no = (int(v) for v in month.split("-"))
        if len(month) != 7 or month[4] != "-" or not 1 <= month_no <= 12:
            raise ValueError
        start = date(year, month_no, 1)
        end = date(year, month_no, monthrange(year, month_no)[1])
        return start, end
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="month는 YYYY-MM 형식이어야 합니다.")


def _make_out(db: Session, user_id: int, month: str) -> schemas.BudgetOut:
    start, end = _validate_month(month)
    budget = db.query(models.MonthlyBudget).filter(
        models.MonthlyBudget.user_id == user_id,
        models.MonthlyBudget.month == month,
    ).first()
    limit_amount = Decimal(str(budget.limit_amount)) if budget is not None else Decimal("0")
    rows = db.query(models.Transaction).filter(
        models.Transaction.user_id == user_id,
        models.Transaction.status == "ACTIVE",
        models.Transaction.transaction_type == "EXPENSE",
        models.Transaction.transaction_date >= start,
        models.Transaction.transaction_date <= end,
    ).all()
    total_expense = sum((Decimal(str(row.amount)) for row in rows), Decimal("0"))
    if limit_amount <= 0:
        usage_rate = 0.0
        budget_status = "NO_BUDGET"
    else:
        usage_rate = float((total_expense / limit_amount) * Decimal("100"))
        budget_status = "OVER" if usage_rate >= 100 else "WARNING" if usage_rate >= 80 else "NORMAL"
    return schemas.BudgetOut(
        month=month,
        limit_amount=limit_amount.quantize(Decimal("0.01")),
        total_expense=total_expense.quantize(Decimal("0.01")),
        usage_rate=round(usage_rate, 1),
        remaining_amount=(limit_amount - total_expense).quantize(Decimal("0.01")),
        status=budget_status,
    )


@router.get("/monthly", response_model=schemas.BudgetOut)
def get_monthly_budget(
    month: Optional[str] = Query(None),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    if month is None:
        today = date.today()
        month = f"{today.year:04d}-{today.month:02d}"
    return _make_out(db, current_user_id, month)


@router.put("/monthly", response_model=schemas.BudgetOut)
def set_monthly_budget(
    payload: schemas.BudgetUpdate,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    _validate_month(payload.month)
    budget = db.query(models.MonthlyBudget).filter(
        models.MonthlyBudget.user_id == current_user_id,
        models.MonthlyBudget.month == payload.month,
    ).first()
    if budget is None:
        budget = models.MonthlyBudget(
            user_id=current_user_id,
            month=payload.month,
            limit_amount=payload.limit_amount,
        )
        db.add(budget)
    else:
        budget.limit_amount = payload.limit_amount
    db.commit()
    return _make_out(db, current_user_id, payload.month)
