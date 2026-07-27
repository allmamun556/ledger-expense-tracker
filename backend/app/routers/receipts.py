import datetime as dt
from functools import lru_cache
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from google import genai
from google.genai import types
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..config import settings
from ..database import get_db

router = APIRouter(prefix="/api/receipts", tags=["receipts"])

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf",
}
MAX_FILE_SIZE = 8 * 1024 * 1024  # 8MB — comfortably under Gemini's inline-data limit
GEMINI_MODEL = "gemini-flash-latest"
VALID_PAYMENT_METHODS = {"cash", "card", "bank_transfer", "mobile_wallet", "other"}


@lru_cache
def _client() -> genai.Client:
    return genai.Client(api_key=settings.GEMINI_API_KEY)


class _ReceiptExtraction(BaseModel):
    amount: Optional[float] = None
    currency: Optional[str] = None
    date: Optional[str] = None
    merchant: Optional[str] = None
    description: Optional[str] = None
    payment_method: Optional[str] = None
    category_guess: Optional[str] = None
    notes: Optional[str] = None


def _build_prompt(category_names: list[str]) -> str:
    categories_list = ", ".join(category_names) if category_names else "(no categories defined)"
    return f"""You are an expert at reading receipts and invoices in any language (including German).
Analyze the attached receipt image or PDF and extract the purchase information.

Rules:
- amount: the FINAL TOTAL amount actually paid (look for "SUMME", "Total", "Gesamtbetrag", "Betrag", "Amount Due" — never a subtotal or a single tax-breakdown row). Plain number, no currency symbol. If unreadable, use null — never invent a number.
- currency: ISO 4217 code (e.g. EUR, USD, GBP), inferred from symbols, store address, or language if not explicit.
- date: the purchase/transaction date as ISO 8601 "YYYY-MM-DD". Watch out for DD.MM.YYYY (common in Germany/Europe) vs MM/DD/YYYY (US) — use context like the store's country/language to disambiguate.
- merchant: the store or business name.
- description: a short 3-6 word human-friendly summary, e.g. "Groceries at Rewe Markt".
- payment_method: exactly one of: cash, card, bank_transfer, mobile_wallet, other. Map contactless/Mastercard/Visa/EC-Karte/credit/debit -> card; Bar/cash -> cash; SEPA/wire/invoice -> bank_transfer; PayPal/Apple Pay/Google Pay -> mobile_wallet; unclear -> other.
- category_guess: the single best-matching category name copied EXACTLY from this list, or null if none fit well: [{categories_list}]
- notes: optional one-line summary of notable line items, only if there are more than 2-3 items worth mentioning.

Return null for any field you can't determine confidently."""


@router.post("/parse", response_model=schemas.ReceiptParseOut)
async def parse_receipt(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not settings.GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Receipt scanning isn't configured. Set GEMINI_API_KEY in backend/.env.",
        )

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type ({file.content_type or 'unknown'}). "
            "Upload a JPEG/PNG/WEBP photo or a PDF.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File is too large (max 8MB).")

    categories = (
        db.query(models.Category).filter(models.Category.owner_id == current_user.id).all()
    )

    try:
        response = _client().models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                types.Part.from_bytes(data=data, mime_type=file.content_type),
                _build_prompt([c.name for c in categories]),
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=_ReceiptExtraction,
                temperature=0.1,
            ),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail="Couldn't reach the receipt-reading service. Try again."
        ) from exc

    extraction = response.parsed
    if extraction is None:
        try:
            extraction = _ReceiptExtraction.model_validate_json(response.text)
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail="Couldn't read that receipt clearly. Try a sharper photo or a different file.",
            ) from exc

    parsed_date = None
    if extraction.date:
        try:
            parsed_date = dt.date.fromisoformat(extraction.date)
        except ValueError:
            parsed_date = None

    matched_category = None
    if extraction.category_guess:
        guess = extraction.category_guess.strip().lower()
        matched_category = next((c for c in categories if c.name.lower() == guess), None)

    payment_method = (
        extraction.payment_method if extraction.payment_method in VALID_PAYMENT_METHODS else None
    )

    return schemas.ReceiptParseOut(
        amount=extraction.amount,
        date=parsed_date,
        description=extraction.description or extraction.merchant,
        merchant=extraction.merchant,
        currency=extraction.currency,
        payment_method=payment_method,
        notes=extraction.notes,
        category_id=matched_category.id if matched_category else None,
        category_name=matched_category.name if matched_category else extraction.category_guess,
    )
