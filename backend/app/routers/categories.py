from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[schemas.CategoryOut])
def list_categories(
    db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)
):
    return (
        db.query(models.Category)
        .filter(models.Category.owner_id == current_user.id)
        .order_by(models.Category.name)
        .all()
    )


@router.post("", response_model=schemas.CategoryOut, status_code=201)
def create_category(
    payload: schemas.CategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    existing = (
        db.query(models.Category)
        .filter(models.Category.owner_id == current_user.id, models.Category.name == payload.name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="A category with this name already exists.")
    category = models.Category(**payload.model_dump(), owner_id=current_user.id)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.patch("/{category_id}", response_model=schemas.CategoryOut)
def update_category(
    category_id: int,
    payload: schemas.CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    category = (
        db.query(models.Category)
        .filter(models.Category.id == category_id, models.Category.owner_id == current_user.id)
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="Category not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=204)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    category = (
        db.query(models.Category)
        .filter(models.Category.id == category_id, models.Category.owner_id == current_user.id)
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="Category not found.")
    db.delete(category)
    db.commit()
