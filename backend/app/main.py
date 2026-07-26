from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models
from .config import settings
from .database import engine
from .routers import auth, categories, expenses, reports

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Ledger — Personal Expense Tracker API",
    description="Backend API for tracking daily and monthly expenses.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(categories.router)
app.include_router(expenses.router)
app.include_router(reports.router)


@app.get("/api/health", tags=["health"])
def health_check():
    return {"status": "ok"}
