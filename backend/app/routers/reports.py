import calendar
import datetime as dt

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _month_bounds(year: int, month: int):
    start = dt.date(year, month, 1)
    end = dt.date(year, month, calendar.monthrange(year, month)[1])
    return start, end


def _sum_between(db, user_id, start, end) -> float:
    total = (
        db.query(func.coalesce(func.sum(models.Expense.amount), 0.0))
        .filter(
            models.Expense.owner_id == user_id,
            models.Expense.date >= start,
            models.Expense.date <= end,
        )
        .scalar()
    )
    return float(total or 0)


@router.get("/summary", response_model=schemas.SummaryOut)
def summary(
    db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)
):
    today = dt.date.today()
    week_start = today - dt.timedelta(days=today.weekday())
    month_start, month_end = _month_bounds(today.year, today.month)

    prev_month_date = (month_start - dt.timedelta(days=1))
    prev_start, prev_end = _month_bounds(prev_month_date.year, prev_month_date.month)

    today_total = _sum_between(db, current_user.id, today, today)
    week_total = _sum_between(db, current_user.id, week_start, today)
    month_total = _sum_between(db, current_user.id, month_start, today)
    last_month_total = _sum_between(db, current_user.id, prev_start, prev_end)

    mom_change = None
    if last_month_total > 0:
        mom_change = round(((month_total - last_month_total) / last_month_total) * 100, 1)

    days_elapsed = (today - month_start).days + 1
    avg_daily = round(month_total / days_elapsed, 2) if days_elapsed else 0.0

    budget_remaining = None
    if current_user.monthly_budget and current_user.monthly_budget > 0:
        budget_remaining = round(current_user.monthly_budget - month_total, 2)

    top_category_row = (
        db.query(models.Category.name, func.sum(models.Expense.amount).label("total"))
        .join(models.Expense, models.Expense.category_id == models.Category.id)
        .filter(
            models.Expense.owner_id == current_user.id,
            models.Expense.date >= month_start,
            models.Expense.date <= today,
        )
        .group_by(models.Category.name)
        .order_by(func.sum(models.Expense.amount).desc())
        .first()
    )

    return schemas.SummaryOut(
        today_total=today_total,
        this_week_total=week_total,
        this_month_total=month_total,
        last_month_total=last_month_total,
        month_over_month_change_pct=mom_change,
        monthly_budget=current_user.monthly_budget or 0,
        monthly_budget_remaining=budget_remaining,
        average_daily_this_month=avg_daily,
        top_category=top_category_row[0] if top_category_row else None,
    )


@router.get("/daily", response_model=list[schemas.DailyTotal])
def daily_totals(
    date_from: dt.date = Query(...),
    date_to: dt.date = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rows = (
        db.query(models.Expense.date, func.sum(models.Expense.amount))
        .filter(
            models.Expense.owner_id == current_user.id,
            models.Expense.date >= date_from,
            models.Expense.date <= date_to,
        )
        .group_by(models.Expense.date)
        .order_by(models.Expense.date)
        .all()
    )
    totals_by_date = {row[0]: float(row[1]) for row in rows}

    result = []
    current = date_from
    while current <= date_to:
        result.append(schemas.DailyTotal(date=current, total=totals_by_date.get(current, 0.0)))
        current += dt.timedelta(days=1)
    return result


@router.get("/monthly", response_model=list[schemas.MonthlyTotal])
def monthly_totals(
    months: int = Query(6, ge=1, le=36),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    today = dt.date.today()
    buckets = []
    y, m = today.year, today.month
    for _ in range(months):
        buckets.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    buckets.reverse()

    results = []
    for (yr, mo) in buckets:
        start, end = _month_bounds(yr, mo)
        total = _sum_between(db, current_user.id, start, end)
        results.append(schemas.MonthlyTotal(month=f"{yr:04d}-{mo:02d}", total=total))
    return results


@router.get("/by-category", response_model=list[schemas.CategoryTotal])
def by_category(
    date_from: dt.date = Query(...),
    date_to: dt.date = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rows = (
        db.query(
            models.Category.id,
            models.Category.name,
            models.Category.color,
            func.sum(models.Expense.amount).label("total"),
        )
        .join(models.Expense, models.Expense.category_id == models.Category.id)
        .filter(
            models.Expense.owner_id == current_user.id,
            models.Expense.date >= date_from,
            models.Expense.date <= date_to,
        )
        .group_by(models.Category.id, models.Category.name, models.Category.color)
        .order_by(func.sum(models.Expense.amount).desc())
        .all()
    )

    uncategorized_total = (
        db.query(func.coalesce(func.sum(models.Expense.amount), 0.0))
        .filter(
            models.Expense.owner_id == current_user.id,
            models.Expense.date >= date_from,
            models.Expense.date <= date_to,
            models.Expense.category_id.is_(None),
        )
        .scalar()
    ) or 0.0

    grand_total = sum(float(r.total) for r in rows) + float(uncategorized_total)

    result = [
        schemas.CategoryTotal(
            category_id=r.id,
            category_name=r.name,
            color=r.color,
            total=float(r.total),
            percentage=round((float(r.total) / grand_total) * 100, 1) if grand_total else 0.0,
        )
        for r in rows
    ]
    if uncategorized_total:
        result.append(
            schemas.CategoryTotal(
                category_id=None,
                category_name="Uncategorized",
                color="#6B7280",
                total=float(uncategorized_total),
                percentage=round((float(uncategorized_total) / grand_total) * 100, 1)
                if grand_total
                else 0.0,
            )
        )
    return result


@router.get("/budgets", response_model=list[schemas.CategoryBudgetOut])
def list_budgets(
    db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)
):
    return (
        db.query(models.CategoryBudget)
        .filter(models.CategoryBudget.owner_id == current_user.id)
        .all()
    )


@router.post("/budgets", response_model=schemas.CategoryBudgetOut, status_code=201)
def upsert_budget(
    payload: schemas.CategoryBudgetCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    existing = (
        db.query(models.CategoryBudget)
        .filter(
            models.CategoryBudget.owner_id == current_user.id,
            models.CategoryBudget.category_id == payload.category_id,
        )
        .first()
    )
    if existing:
        existing.limit_amount = payload.limit_amount
        db.commit()
        db.refresh(existing)
        return existing

    budget = models.CategoryBudget(**payload.model_dump(), owner_id=current_user.id)
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return budget


@router.delete("/budgets/{budget_id}", status_code=204)
def delete_budget(
    budget_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    budget = (
        db.query(models.CategoryBudget)
        .filter(models.CategoryBudget.id == budget_id, models.CategoryBudget.owner_id == current_user.id)
        .first()
    )
    if budget:
        db.delete(budget)
        db.commit()
