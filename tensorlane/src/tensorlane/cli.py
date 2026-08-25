from __future__ import annotations

import argparse
import json
import os

import uvicorn

from tensorlane.api.app import create_app
from tensorlane.config import Settings
from tensorlane.db.session import configure_session, create_schema, session_factory
from tensorlane.mlflow_admin import HttpMlflowAdmin, NullMlflowAdmin
from tensorlane.seed import seed_demo


def _serve(args: argparse.Namespace) -> None:
    settings = Settings()
    uvicorn.run(create_app(settings), host=args.host, port=args.port, factory=False)


def _seed(_: argparse.Namespace) -> None:
    settings = Settings()
    configure_session(settings)
    create_schema()
    session = session_factory()()
    try:
        mlflow: HttpMlflowAdmin | NullMlflowAdmin
        if settings.mlflow_internal_uri.startswith("null://"):
            mlflow = NullMlflowAdmin()
        else:
            mlflow = HttpMlflowAdmin(settings.mlflow_internal_uri)
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


def main() -> None:
    parser = argparse.ArgumentParser(prog="tensorlane")
    sub = parser.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve", help="Run the Tensorlane control plane and gateway")
    serve.add_argument("--host", default="0.0.0.0")
    serve.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))
    serve.set_defaults(func=_serve)
    seed = sub.add_parser("seed", help="Create Acme and Othercorp demo tenants")
    seed.set_defaults(func=_seed)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
