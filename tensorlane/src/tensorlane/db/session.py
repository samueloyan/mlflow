from __future__ import annotations

from collections.abc import Generator, Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from tensorlane.config import Settings
from tensorlane.db.models import Base

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def sqlalchemy_database_url(url: str) -> str:
    """Use psycopg3 when ``DATABASE_URL`` is a plain Postgres URL (Neon, Render)."""
    if url.startswith("postgresql+"):
        return url
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def create_engine_from_settings(settings: Settings) -> Engine:
    connect_args: dict[str, bool] = {}
    kwargs: dict[str, object] = {"future": True}
    if settings.is_sqlite:
        connect_args["check_same_thread"] = False
        if settings.database_url in {"sqlite://", "sqlite:///:memory:"}:
            kwargs["poolclass"] = StaticPool
    else:
        kwargs["pool_pre_ping"] = True
        kwargs["pool_recycle"] = 300
        kwargs["pool_timeout"] = 10
        kwargs["pool_size"] = 5
        kwargs["max_overflow"] = 10
        connect_args["connect_timeout"] = 5
    kwargs["connect_args"] = connect_args
    return create_engine(sqlalchemy_database_url(settings.database_url), **kwargs)


def configure_session(settings: Settings) -> sessionmaker[Session]:
    global _engine, _SessionLocal
    _engine = create_engine_from_settings(settings)
    _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False, future=True)
    return _SessionLocal


def session_factory() -> sessionmaker[Session]:
    if _SessionLocal is None:
        raise RuntimeError("Database session factory is not configured")
    return _SessionLocal


def create_schema(engine: Engine | None = None) -> None:
    target = engine or _engine
    if target is None:
        raise RuntimeError("Database engine is not configured")
    Base.metadata.create_all(bind=target)
    _ensure_columns(target)


def _ensure_columns(engine: Engine) -> None:
    """Add columns introduced after the first create_all (Neon already has tables)."""
    statements = {
        "postgresql": (
            "ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS delivery_url VARCHAR(1024)",
        ),
        "sqlite": (),
    }
    dialect = engine.dialect.name
    if dialect == "sqlite":
        with engine.begin() as conn:
            rows = conn.execute(text("PRAGMA table_info(alert_rules)")).fetchall()
            names = {row[1] for row in rows}
            if "delivery_url" not in names:
                conn.execute(text("ALTER TABLE alert_rules ADD COLUMN delivery_url VARCHAR(1024)"))
        return
    for statement in statements.get(dialect, ()):
        with engine.begin() as conn:
            conn.execute(text(statement))


@contextmanager
def session_scope() -> Iterator[Session]:
    if _SessionLocal is None:
        raise RuntimeError("Database session factory is not configured")
    session = _SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_session() -> Generator[Session, None, None]:
    if _SessionLocal is None:
        raise RuntimeError("Database session factory is not configured")
    session = _SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
