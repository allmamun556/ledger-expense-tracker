import datetime as dt

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Date,
    DateTime,
    ForeignKey,
    Boolean,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=True)  # null for google-only accounts
    google_sub = Column(String, unique=True, nullable=True, index=True)
    avatar_url = Column(String, nullable=True)
    currency = Column(String, default="EUR")
    monthly_budget = Column(Float, default=0)
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    categories = relationship("Category", back_populates="owner", cascade="all, delete-orphan")
    expenses = relationship("Expense", back_populates="owner", cascade="all, delete-orphan")
    budgets = relationship("CategoryBudget", back_populates="owner", cascade="all, delete-orphan")


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("owner_id", "name", name="uq_category_owner_name"),)

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    icon = Column(String, default="tag")
    color = Column(String, default="#B5652B")
    is_default = Column(Boolean, default=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    owner = relationship("User", back_populates="categories")
    expenses = relationship("Expense", back_populates="category")


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Float, nullable=False)
    description = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    date = Column(Date, nullable=False, default=dt.date.today)
    payment_method = Column(String, default="cash")
    is_recurring = Column(Boolean, default=False)
    created_at = Column(DateTime, default=dt.datetime.utcnow)
    updated_at = Column(DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)

    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    category = relationship("Category", back_populates="expenses")
    owner = relationship("User", back_populates="expenses")


class CategoryBudget(Base):
    """Optional per-category monthly budget limit, e.g. 'Groceries: 300/month'."""

    __tablename__ = "category_budgets"
    __table_args__ = (UniqueConstraint("owner_id", "category_id", name="uq_budget_owner_category"),)

    id = Column(Integer, primary_key=True, index=True)
    limit_amount = Column(Float, nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    owner = relationship("User", back_populates="budgets")
    category = relationship("Category")
