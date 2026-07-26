import csv
import datetime as dt
import io

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


def _apply_filters(query, current_user, date_from, date_to, category_id, search):
    query = query.filter(models.Expense.owner_id == current_user.id)
    if date_from:
        query = query.filter(models.Expense.date >= date_from)
    if date_to:
        query = query.filter(models.Expense.date <= date_to)
    if category_id:
        query = query.filter(models.Expense.category_id == category_id)
    if search:
        like = f"%{search}%"
        query = query.filter(
            (models.Expense.description.ilike(like)) | (models.Expense.notes.ilike(like))
        )
    return query


@router.get("", response_model=schemas.PaginatedExpenses)
def list_expenses(
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    category_id: int | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    sort_by: str = Query("date", pattern="^(date|amount|created_at)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = _apply_filters(
        db.query(models.Expense), current_user, date_from, date_to, category_id, search
    )
    total = query.count()

    sort_col = getattr(models.Expense, sort_by)
    sort_col = sort_col.desc() if sort_dir == "desc" else sort_col.asc()
    items = (
        query.order_by(sort_col, models.Expense.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return schemas.PaginatedExpenses(total=total, page=page, page_size=page_size, items=items)


@router.get("/export.csv")
def export_expenses_csv(
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    category_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = _apply_filters(
        db.query(models.Expense), current_user, date_from, date_to, category_id, None
    ).order_by(models.Expense.date.desc())

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Date", "Amount", "Currency", "Category", "Description", "Payment Method", "Notes"])
    for e in query.all():
        writer.writerow(
            [
                e.date.isoformat(),
                e.amount,
                current_user.currency,
                e.category.name if e.category else "",
                e.description or "",
                e.payment_method,
                e.notes or "",
            ]
        )
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=expenses_export.csv"},
    )


@router.post("", response_model=schemas.ExpenseOut, status_code=201)
def create_expense(
    payload: schemas.ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if payload.category_id:
        category = (
            db.query(models.Category)
            .filter(
                models.Category.id == payload.category_id,
                models.Category.owner_id == current_user.id,
            )
            .first()
        )
        if not category:
            raise HTTPException(status_code=400, detail="Invalid category.")

    expense = models.Expense(**payload.model_dump(), owner_id=current_user.id)
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.get("/{expense_id}", response_model=schemas.ExpenseOut)
def get_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    expense = (
        db.query(models.Expense)
        .filter(models.Expense.id == expense_id, models.Expense.owner_id == current_user.id)
        .first()
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found.")
    return expense


@router.patch("/{expense_id}", response_model=schemas.ExpenseOut)
def update_expense(
    expense_id: int,
    payload: schemas.ExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    expense = (
        db.query(models.Expense)
        .filter(models.Expense.id == expense_id, models.Expense.owner_id == current_user.id)
        .first()
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found.")

    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data and data["category_id"]:
        category = (
            db.query(models.Category)
            .filter(
                models.Category.id == data["category_id"],
                models.Category.owner_id == current_user.id,
            )
            .first()
        )
        if not category:
            raise HTTPException(status_code=400, detail="Invalid category.")

    for field, value in data.items():
        setattr(expense, field, value)
    db.commit()
    db.refresh(expense)
    return expense


@router.delete("/{expense_id}", status_code=204)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    expense = (
        db.query(models.Expense)
        .filter(models.Expense.id == expense_id, models.Expense.owner_id == current_user.id)
        .first()
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found.")
    db.delete(expense)
    db.commit()
