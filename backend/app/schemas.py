import datetime as dt
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, ConfigDict


# ---------- Auth ----------

class UserSignup(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class GoogleLogin(BaseModel):
    credential: str  # ID token from Google Identity Services


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    currency: str
    monthly_budget: float


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    currency: Optional[str] = None
    monthly_budget: Optional[float] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


# ---------- Category ----------

class CategoryBase(BaseModel):
    name: str
    icon: str = "tag"
    color: str = "#B5652B"


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None


class CategoryOut(CategoryBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_default: bool


# ---------- Expense ----------

class ExpenseBase(BaseModel):
    amount: float = Field(gt=0)
    description: Optional[str] = None
    notes: Optional[str] = None
    date: dt.date
    payment_method: str = "cash"
    is_recurring: bool = False
    category_id: Optional[int] = None


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    amount: Optional[float] = Field(default=None, gt=0)
    description: Optional[str] = None
    notes: Optional[str] = None
    date: Optional[dt.date] = None
    payment_method: Optional[str] = None
    is_recurring: Optional[bool] = None
    category_id: Optional[int] = None


class ExpenseOut(ExpenseBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: dt.datetime
    category: Optional[CategoryOut] = None


class PaginatedExpenses(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[ExpenseOut]


# ---------- Budgets ----------

class CategoryBudgetCreate(BaseModel):
    category_id: int
    limit_amount: float = Field(gt=0)


class CategoryBudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category_id: int
    limit_amount: float
    category: Optional[CategoryOut] = None


# ---------- Reports ----------

class DailyTotal(BaseModel):
    date: dt.date
    total: float


class MonthlyTotal(BaseModel):
    month: str  # YYYY-MM
    total: float


class CategoryTotal(BaseModel):
    category_id: Optional[int]
    category_name: str
    color: str
    total: float
    percentage: float


class SummaryOut(BaseModel):
    today_total: float
    this_week_total: float
    this_month_total: float
    last_month_total: float
    month_over_month_change_pct: Optional[float]
    monthly_budget: float
    monthly_budget_remaining: Optional[float]
    average_daily_this_month: float
    top_category: Optional[str]
