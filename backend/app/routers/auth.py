from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas, crud
from ..auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)
from ..config import settings
from ..database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=schemas.Token, status_code=status.HTTP_201_CREATED)
def signup(payload: schemas.UserSignup, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    user = models.User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    crud.seed_default_categories(db, user)

    token = create_access_token(str(user.id))
    return schemas.Token(access_token=token, user=schemas.UserOut.model_validate(user))


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email.lower()).first()
    if not user or not user.hashed_password or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    token = create_access_token(str(user.id))
    return schemas.Token(access_token=token, user=schemas.UserOut.model_validate(user))


@router.post("/google", response_model=schemas.Token)
def google_login(payload: schemas.GoogleLogin, db: Session = Depends(get_db)):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID in backend/.env.",
        )

    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests

        idinfo = google_id_token.verify_oauth2_token(
            payload.credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google credential.")

    google_sub = idinfo["sub"]
    email = idinfo.get("email", "").lower()
    name = idinfo.get("name")
    picture = idinfo.get("picture")

    user = db.query(models.User).filter(models.User.google_sub == google_sub).first()
    if not user:
        # link to an existing email/password account if one matches, else create new
        user = db.query(models.User).filter(models.User.email == email).first()
        if user:
            user.google_sub = google_sub
            user.avatar_url = user.avatar_url or picture
        else:
            user = models.User(
                email=email, full_name=name, google_sub=google_sub, avatar_url=picture
            )
            db.add(user)
        db.commit()
        db.refresh(user)
        crud.seed_default_categories(db, user)

    token = create_access_token(str(user.id))
    return schemas.Token(access_token=token, user=schemas.UserOut.model_validate(user))


@router.get("/me", response_model=schemas.UserOut)
def read_me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=schemas.UserOut)
def update_me(
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(current_user, field, value)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/change-password", status_code=204)
def change_password(
    payload: schemas.PasswordChange,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not current_user.hashed_password or not verify_password(
        payload.current_password, current_user.hashed_password
    ):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
