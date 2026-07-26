"""One-time copy of data from the local SQLite file into a Postgres database.

Run from the backend/ folder, with the venv active:

    python -m scripts.migrate_sqlite_to_postgres --postgres-url "postgresql://user:pass@host/db?sslmode=require"

By default reads from ./expenses.db; pass --sqlite-url to point elsewhere.
Safe to re-run: existing rows (matched by id) are updated in place rather
than duplicated.
"""
import argparse

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models

TABLES_IN_ORDER = [models.User, models.Category, models.Expense, models.CategoryBudget]


def migrate(sqlite_url: str, postgres_url: str) -> None:
    sqlite_engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})
    postgres_engine = create_engine(postgres_url)

    models.Base.metadata.create_all(bind=postgres_engine)

    src = sessionmaker(bind=sqlite_engine)()
    dst = sessionmaker(bind=postgres_engine)()

    try:
        for model in TABLES_IN_ORDER:
            rows = src.query(model).all()
            for row in rows:
                data = {c.name: getattr(row, c.name) for c in model.__table__.columns}
                dst.merge(model(**data))
            dst.commit()
            print(f"Copied {len(rows)} rows into {model.__tablename__}")

        # Explicit ids were inserted above, so Postgres's auto-increment
        # sequences need to be moved past the highest copied id.
        with postgres_engine.connect() as conn:
            for model in TABLES_IN_ORDER:
                table = model.__tablename__
                conn.exec_driver_sql(
                    f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                    f"COALESCE((SELECT MAX(id) FROM {table}), 1), "
                    f"(SELECT MAX(id) FROM {table}) IS NOT NULL)"
                )
            conn.commit()
    finally:
        src.close()
        dst.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite-url", default="sqlite:///./expenses.db")
    parser.add_argument("--postgres-url", required=True)
    args = parser.parse_args()
    migrate(args.sqlite_url, args.postgres_url)
