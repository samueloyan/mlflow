from __future__ import annotations

import argparse
import json
import logging
import os
import time

import uvicorn

from tensorlane.api.app import create_app
from tensorlane.config import Settings
from tensorlane.db.session import configure_session, create_schema, session_factory
from tensorlane.jobs import run_once, schedule_maintenance
from tensorlane.mlflow_admin import HttpMlflowAdmin, NullMlflowAdmin, admin_from_settings
from tensorlane.seed import seed_demo, sync_workspaces

log = logging.getLogger("tensorlane.cli")


def _serve(args: argparse.Namespace) -> None:
    settings = Settings()
    uvicorn.run(create_app(settings), host=args.host, port=args.port, factory=False)


def _mlflow_admin(settings: Settings) -> HttpMlflowAdmin | NullMlflowAdmin:
    return admin_from_settings(settings)


def _seed(_: argparse.Namespace) -> None:
    settings = Settings()
    configure_session(settings)
    create_schema()
    session = session_factory()()
    try:
        mlflow = _mlflow_admin(settings)
        result = seed_demo(session, artifact_root=settings.artifact_root, mlflow=mlflow)
        session.commit()
        print(json.dumps(result, indent=2))
        print(
            "Demo users alice@acme.test and bob@other.test exist. "
            "Sign up with those emails in the web app to attach a password, "
            "or call the API with Bearer alice-session / bob-session in development."
        )
    finally:
        session.close()


def _sync_workspaces(_: argparse.Namespace) -> None:
    settings = Settings()
    configure_session(settings)
    create_schema()
    session = session_factory()()
    try:
        names = sync_workspaces(
            session, _mlflow_admin(settings), artifact_root=settings.artifact_root
        )
        session.commit()
        print(json.dumps({"workspaces": names}, indent=2))
    finally:
        session.close()


def _worker(args: argparse.Namespace) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = Settings()
    configure_session(settings)
    create_schema()
    log.info("worker_started poll=%.1fs", args.interval)
    delay = args.interval
    while True:
        session = session_factory()()
        job = None
        try:
            job = run_once(session)
            if job is None:
                schedule_maintenance(session)
            session.commit()
            delay = args.interval
        except Exception:
            session.rollback()
            log.exception("worker_loop_failed")
            delay = min(60.0, max(delay, args.interval) * 2)
        finally:
            session.close()
        if job is None:
            time.sleep(delay)


def _orgs(_: argparse.Namespace) -> None:
    from tensorlane.client import Tensorlane

    key = os.environ.get("TENSORLANE_API_KEY")
    if not key:
        raise SystemExit("Set TENSORLANE_API_KEY")
    host = os.environ.get("TENSORLANE_HOST", os.environ.get("PUBLIC_URL", "http://127.0.0.1:8080"))
    with Tensorlane(key, host) as client:
        print(json.dumps(client.organizations(), indent=2))


def _usage(args: argparse.Namespace) -> None:
    from tensorlane.client import Tensorlane

    key = os.environ.get("TENSORLANE_API_KEY")
    if not key:
        raise SystemExit("Set TENSORLANE_API_KEY")
    host = os.environ.get("TENSORLANE_HOST", os.environ.get("PUBLIC_URL", "http://127.0.0.1:8080"))
    with Tensorlane(key, host) as client:
        print(json.dumps(client.usage(args.organization_id), indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(prog="tensorlane")
    sub = parser.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve", help="Run the Tensorlane control plane and gateway")
    serve.add_argument("--host", default="0.0.0.0")
    serve.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))
    serve.set_defaults(func=_serve)
    seed = sub.add_parser("seed", help="Create Acme and Othercorp demo tenants")
    seed.set_defaults(func=_seed)
    sync_ws = sub.add_parser(
        "sync-workspaces",
        help="Create MLflow workspaces for existing Tensorlane workspaces",
    )
    sync_ws.set_defaults(func=_sync_workspaces)
    worker = sub.add_parser("worker", help="Run control-plane jobs (alerts, retention, inventory)")
    worker.add_argument("--interval", type=float, default=2.0)
    worker.set_defaults(func=_worker)
    orgs = sub.add_parser("orgs", help="List organizations for TENSORLANE_API_KEY")
    orgs.set_defaults(func=_orgs)
    usage = sub.add_parser("usage", help="Show usage for an organization")
    usage.add_argument("--organization-id", required=True)
    usage.set_defaults(func=_usage)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
