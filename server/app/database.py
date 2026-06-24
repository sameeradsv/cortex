from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

_db_url = os.getenv("DATABASE_URL")
if not _db_url:
    Path("data").mkdir(exist_ok=True)
    _db_url = "sqlite:///data/cortex.db"

_connect_args = {"check_same_thread": False} if _db_url.startswith("sqlite") else {}
_pool_kwargs = {} if _db_url.startswith("sqlite") else {"pool_size": 2, "max_overflow": 3}

engine = create_engine(_db_url, connect_args=_connect_args, pool_pre_ping=True, **_pool_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db():
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


if __name__ == "__main__":
    init_db()
