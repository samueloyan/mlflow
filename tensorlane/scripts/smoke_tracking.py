#!/usr/bin/env python3
"""Log a demo experiment and run through the Tensorlane gateway.

Public paths stay the MLflow protocol (unprefixed /api/2.0). Auth is a
Tensorlane API key (MLFLOW_TRACKING_TOKEN) or a dashboard login that mints one.

Examples:

    python tensorlane/scripts/smoke_tracking.py \\
        --gateway http://127.0.0.1:8080 \\
        --token tl_live_...

    python tensorlane/scripts/smoke_tracking.py \\
        --gateway http://127.0.0.1:8080 \\
        --web http://127.0.0.1:3000 \\
        --email you@example.com --password '...'
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Any

import httpx

EXPERIMENT_NAME = "tensorlane-local-smoke"


def _fail(message: str, response: httpx.Response | None = None) -> None:
    detail = ""
    if response is not None:
        detail = f" {response.status_code} {response.text[:500]}"
    raise SystemExit(f"{message}{detail}")


def _json(response: httpx.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError:
        _fail("Expected JSON from the gateway", response)
    if not isinstance(payload, dict):
        _fail("Expected a JSON object from the gateway", response)
    return payload


def sign_in(web: str, email: str, password: str) -> httpx.Client:
    client = httpx.Client(base_url=web.rstrip("/"), timeout=30.0, follow_redirects=True)
    response = client.post(
        "/api/auth/sign-in/email",
        json={"email": email, "password": password},
        headers={"Origin": web.rstrip("/"), "Content-Type": "application/json"},
    )
    if response.status_code >= 400:
        client.close()
        _fail("Dashboard sign-in failed", response)
    return client


def create_key(client: httpx.Client, organization_id: str, workspace_id: str) -> str:
    created = client.post(
        "/api/v1/api-keys",
        json={
            "name": "local-smoke",
            "organization_id": organization_id,
            "workspace_id": workspace_id,
            "live": True,
        },
    )
    if created.status_code >= 400:
        _fail("Could not create a workspace-scoped API key", created)
    secret = _json(created).get("secret")
    if not isinstance(secret, str) or not secret.startswith("tl_"):
        _fail("API key response did not include a Tensorlane secret", created)
    return secret


def resolve_token(args: argparse.Namespace) -> str:
    if args.token:
        return args.token
    env_token = os.environ.get("MLFLOW_TRACKING_TOKEN")
    if env_token:
        return env_token
    if not args.email or not args.password:
        raise SystemExit("Pass --token / MLFLOW_TRACKING_TOKEN, or --email and --password")
    web = sign_in(args.web, args.email, args.password)
    try:
        session_cookies = [
            (name, value)
            for name, value in web.cookies.items()
            if name.endswith("better-auth.session_token")
        ]
        if not session_cookies:
            _fail("Sign-in did not set a better-auth session cookie")
        with httpx.Client(
            base_url=args.gateway.rstrip("/"),
            headers={"Cookie": "; ".join(f"{name}={value}" for name, value in session_cookies)},
            timeout=30.0,
        ) as gateway:
            me = gateway.get("/api/v1/me")
            if me.status_code >= 400:
                _fail("Could not load /api/v1/me after sign-in", me)
            orgs = _json(me).get("organizations") or []
            if not orgs:
                _fail("This user has no organization. Finish onboarding in the dashboard first.")
            organization_id = str(orgs[0]["id"])
            listed = gateway.get("/api/v1/workspaces", params={"organization_id": organization_id})
            if listed.status_code >= 400:
                _fail("Could not list workspaces", listed)
            workspaces = listed.json()
            if not isinstance(workspaces, list) or not workspaces:
                _fail("Organization has no workspace")
            workspace_id = str(workspaces[0]["id"])
            return create_key(gateway, organization_id, workspace_id)
    finally:
        web.close()


def ensure_experiment(gateway: httpx.Client) -> str:
    created = gateway.post("/api/2.0/mlflow/experiments/create", json={"name": EXPERIMENT_NAME})
    if created.status_code < 400:
        experiment_id = _json(created).get("experiment_id")
        if experiment_id:
            return str(experiment_id)
    searched = gateway.post(
        "/ajax-api/2.0/mlflow/experiments/search",
        json={"max_results": 1000},
    )
    if searched.status_code >= 400:
        _fail(
            "Could not create or search experiments",
            created if created.status_code >= 400 else searched,
        )
    for row in _json(searched).get("experiments") or []:
        if row.get("name") == EXPERIMENT_NAME:
            return str(row["experiment_id"])
    _fail("Experiment was not created on the tracking server", created)


def log_run(gateway: httpx.Client, experiment_id: str) -> str:
    started = gateway.post(
        "/api/2.0/mlflow/runs/create",
        json={
            "experiment_id": experiment_id,
            "start_time": int(time.time() * 1000),
            "tags": [
                {"key": "mlflow.runName", "value": "local-smoke"},
                {"key": "tensorlane.smoke", "value": "1"},
            ],
        },
    )
    if started.status_code >= 400:
        _fail("Could not create a run", started)
    info = _json(started).get("run", {}).get("info", {})
    run_id = info.get("run_id") or info.get("run_uuid")
    if not run_id:
        _fail("Run create did not return a run_id", started)
    metric = gateway.post(
        "/api/2.0/mlflow/runs/log-metric",
        json={
            "run_id": run_id,
            "key": "accuracy",
            "value": 0.94,
            "timestamp": int(time.time() * 1000),
            "step": 0,
        },
    )
    if metric.status_code >= 400:
        _fail("Could not log accuracy", metric)
    param = gateway.post(
        "/api/2.0/mlflow/runs/log-parameter",
        json={"run_id": run_id, "key": "model", "value": "xgboost"},
    )
    if param.status_code >= 400:
        _fail("Could not log model param", param)
    return str(run_id)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--gateway", default=os.environ.get("TENSORLANE_TRACKING_URI", "http://127.0.0.1:8080")
    )
    parser.add_argument(
        "--web", default=os.environ.get("TENSORLANE_WEB_URL", "http://127.0.0.1:3000")
    )
    parser.add_argument("--token", default="")
    parser.add_argument("--email", default=os.environ.get("TENSORLANE_EMAIL", ""))
    parser.add_argument("--password", default=os.environ.get("TENSORLANE_PASSWORD", ""))
    args = parser.parse_args()

    token = resolve_token(args)
    with httpx.Client(
        base_url=args.gateway.rstrip("/"),
        headers={"Authorization": f"Bearer {token}"},
        timeout=30.0,
    ) as gateway:
        health = gateway.get("/health")
        if health.status_code >= 400:
            _fail("Gateway is not healthy", health)
        experiment_id = ensure_experiment(gateway)
        run_id = log_run(gateway, experiment_id)
        listed = gateway.post(
            "/ajax-api/2.0/mlflow/experiments/search",
            json={"max_results": 1000},
        )
        if listed.status_code >= 400:
            _fail("Dashboard search path failed after logging a run", listed)
        names = [row.get("name") for row in _json(listed).get("experiments") or []]
        if EXPERIMENT_NAME not in names:
            _fail(f"Search did not include {EXPERIMENT_NAME}", listed)

    snippet = {
        "experiment": EXPERIMENT_NAME,
        "experiment_id": experiment_id,
        "run_id": run_id,
        "tracking_uri": args.gateway.rstrip("/"),
        "sdk": (
            "import os, mlflow\n"
            'os.environ["MLFLOW_TRACKING_TOKEN"] = "<API key from Tensorlane /api-keys>"\n'
            f'mlflow.set_tracking_uri("{args.gateway.rstrip("/")}")\n'
            f'mlflow.set_experiment("{EXPERIMENT_NAME}")\n'
        ),
    }
    json.dump(snippet, sys.stdout, indent=2)
    sys.stdout.write("\n")
    print(
        "Logged a smoke run. Open Overview, Experiments, and Runs in the dashboard "
        f"for this workspace. Experiment {EXPERIMENT_NAME} should be listed.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
