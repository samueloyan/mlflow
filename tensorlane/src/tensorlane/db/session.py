from __future__ import annotations

from collections.abc import Generator, Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from tensorlane.config import Settings
from tensorlane.db.models import Base

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def create_engine_from_settings(settings: Settings) -> Engine:
    connect_args: dict[str, bool] = {}
    kwargs: dict[str, object] = {"future": True}
    if settings.is_sqlite:
        connect_args["check_same_thread"] = False
        if settings.database_url in {"sqlite://", "sqlite:///:memory:"}:
            kwargs["poolclass"] = StaticPool
    kwargs["connect_args"] = connect_args
    return create_engine(settings.database_url, **kwargs)


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
