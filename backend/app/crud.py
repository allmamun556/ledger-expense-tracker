from sqlalchemy.orm import Session

from . import models

DEFAULT_CATEGORIES = [
    ("Groceries", "shopping-cart", "#5B7B5B"),
    ("Rent & Housing", "home", "#6B4C3B"),
    ("Transport", "bus", "#3E6B8A"),
    ("Utilities", "zap", "#B08900"),
    ("Dining Out", "coffee", "#A63D40"),
    ("Health", "heart", "#7A4B8A"),
    ("Education", "book", "#2E5E4E"),
    ("Entertainment", "film", "#B5652B"),
    ("Travel", "map", "#3B7A78"),
    ("Other", "tag", "#6B7280"),
]


def seed_default_categories(db: Session, user: models.User) -> None:
    for name, icon, color in DEFAULT_CATEGORIES:
        exists = (
            db.query(models.Category)
            .filter(models.Category.owner_id == user.id, models.Category.name == name)
            .first()
        )
        if not exists:
            db.add(
                models.Category(
                    name=name, icon=icon, color=color, is_default=True, owner_id=user.id
                )
            )
    db.commit()
