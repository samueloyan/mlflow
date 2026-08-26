from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select, text
from starlette.middleware.base import BaseHTTPMiddleware

from tensorlane.api.common import workspace_visible
from tensorlane.api.deps import Principal, get_principal
from tensorlane.api.enterprise import (
    public_router,
    scim_router,
    webhook_router,
)
from tensorlane.api.enterprise import (
    router as enterprise_router,
)
from tensorlane.api.routes import _record_usage, router
from tensorlane.authz import authorize
from tensorlane.config import Settings
from tensorlane.db.models import Organization, OrganizationMembership, Workspace
from tensorlane.db.session import configure_session, create_schema, session_scope
from tensorlane.entitlements import EntitlementService
from tensorlane.errors import (
    AuthorizationError,
    NotFoundError,
    RateLimitedError,
    TensorlaneError,
    error_body,
)
from tensorlane.ids import new_request_id
from tensorlane.ratelimit import allow
from tensorlane.services import api_key_role, get_membership, usage_sum, workspace_by_mlflow_name

HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
}

# Paths the unmodified MLflow SDK and UI use. The gateway overwrites tenant bind
# after authz; MLflow is never reachable from the public internet.
MLFLOW_PREFIXES = (
    "/api/2.0/",
    "/api/3.0/",
    "/ajax-api/",
    "/mlflow-artifacts/",
    "/graphql",
    "/get-artifact",
    "/mlflow",
    "/static-files",
    "/version",
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
        )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        settings: Settings = request.app.state.settings
        path = request.url.path
        if path == "/api/v1/billing/webhook" or path.startswith("/scim/"):
            return await call_next(request)
        ip = request.client.host if request.client else "unknown"
        try:
            if path.startswith("/api/v1"):
                allow(f"cp:{ip}", settings.control_plane_rpm)
            elif path.startswith("/v1/traces") and request.method == "POST":
                allow(f"trace:{ip}", settings.trace_ingest_rpm)
            elif _is_mlflow_path(path) and request.method not in {"GET", "HEAD", "OPTIONS"}:
                allow(f"mlflow:{ip}", settings.mlflow_write_rpm)
        except RateLimitedError as exc:
            request_id = getattr(request.state, "request_id", new_request_id())
            return JSONResponse(
                status_code=429,
                content=error_body(exc, request_id),
                headers={"Retry-After": "60"},
            )
        return await call_next(request)


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or new_request_id()
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response


def _mlflow_unavailable() -> Response:
    return Response(
        content=(
            "<!doctype html><html><head><meta charset='utf-8'><title>Workbench</title>"
            "<style>body{font-family:Georgia,serif;background:#f3efe6;color:#161410;"
            "margin:0;padding:48px;line-height:1.5} h1{font-weight:500} p{color:#6d675c}"
            "</style></head><body><p style='letter-spacing:.16em;text-transform:uppercase;"
            "color:#b85a28;font-size:11px'>Data plane</p><h1>MLflow is not running in this "
            "environment.</h1><p>Start the Tensorlane compose stack (or <code>mlflow server "
            "--enable-workspaces --static-prefix /mlflow</code>) and point "
            "<code>MLFLOW_INTERNAL_URI</code> at it. The workbench will load here, same origin, "
            "with Tensorlane chrome around it.</p></body></html>"
        ),
        media_type="text/html",
        status_code=200,
    )


def _is_mlflow_path(path: str) -> bool:
    if path.startswith("/v1/traces"):
        return True
    return any(path == prefix.rstrip("/") or path.startswith(prefix) for prefix in MLFLOW_PREFIXES)


def _filter_request_headers(request: Request, *, strip_credentials: bool) -> dict[str, str]:
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP}
    if strip_credentials:
        headers.pop("authorization", None)
        headers.pop("cookie", None)
    return headers


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    configure_session(settings)
    create_schema()
    app.state.http = httpx.AsyncClient(timeout=60.0)
    yield
    await app.state.http.aclose()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    app = FastAPI(title="Tensorlane", version="0.1.0", lifespan=lifespan, docs_url="/api/v1/docs")
    app.state.settings = settings
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.web_origin, settings.public_url],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    app.include_router(enterprise_router)
    app.include_router(public_router)
    app.include_router(webhook_router)
    app.include_router(scim_router)

    @app.exception_handler(TensorlaneError)
    async def handle_tensorlane_error(request: Request, exc: TensorlaneError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", new_request_id())
        headers = {}
        if exc.status_code == 429:
            headers["Retry-After"] = "60"
        return JSONResponse(
            status_code=exc.status_code, content=error_body(exc, request_id), headers=headers
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        request_id = getattr(request.state, "request_id", new_request_id())
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Request failed validation.",
                    "request_id": request_id,
                }
            },
        )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "tensorlane"}

    @app.get("/ready")
    def ready() -> dict[str, str]:
        with session_scope() as session:
            session.execute(text("SELECT 1"))
        return {"status": "ok", "service": "tensorlane"}

    @app.api_route(
        "/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
    )
    async def gateway(path: str, request: Request) -> Response:
        full = "/" + path
        if full.startswith("/api/v1") or full.startswith("/scim/") or full in {"/health", "/ready"}:
            return JSONResponse(
                {"error": {"code": "NOT_FOUND", "message": "Not found."}}, status_code=404
            )
        if _is_mlflow_path(full):
            return await _proxy_mlflow(app, request, full)
        if settings.web_internal_uri:
            return await _proxy_web(app, request, full)
        return JSONResponse(
            {
                "error": {
                    "code": "NOT_FOUND",
                    "message": "Use the Tensorlane web app for this path.",
                }
            },
            status_code=404,
        )

    return app


def _bind_workspace(
    session, principal: Principal, request: Request
) -> tuple[Organization, Workspace, str]:
    org_id = request.headers.get("x-tensorlane-organization-id")
    workspace_id = request.headers.get("x-tensorlane-workspace-id")
    if principal.api_key is not None:
        org_id = principal.api_key.organization_id
        if principal.api_key.workspace_id:
            workspace_id = principal.api_key.workspace_id

    if not org_id and principal.user_id:
        membership = session.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id == principal.user_id
            )
        )
        if membership:
            org_id = membership.organization_id
    if not org_id:
        raise NotFoundError("Organization is required.")

    organization = session.get(Organization, org_id)
    if organization is None or organization.deleted_at is not None:
        raise NotFoundError("Organization not found.")

    if principal.api_key is not None:
        if principal.api_key.organization_id != organization.id:
            raise AuthorizationError(
                "ORGANIZATION_ACCESS_DENIED",
                "You do not have permission to access this organization.",
            )
        role = api_key_role(principal.api_key)
    else:
        assert principal.user_id is not None
        membership = get_membership(session, principal.user_id, organization.id)
        role = membership.role

    workspace_row: Workspace | None = None
    if workspace_id:
        workspace_row = session.get(Workspace, workspace_id)

    client_ws_header = request.headers.get("x-mlflow-workspace")
    if client_ws_header:
        mapped = workspace_by_mlflow_name(session, client_ws_header)
        if mapped is None or mapped.organization_id != organization.id:
            raise AuthorizationError(
                "WORKSPACE_ACCESS_DENIED",
                "You do not have permission to access this workspace.",
            )
        if (
            principal.api_key
            and principal.api_key.workspace_id
            and principal.api_key.workspace_id != mapped.id
        ):
            raise AuthorizationError(
                "WORKSPACE_ACCESS_DENIED",
                "You do not have permission to access this workspace.",
            )
        workspace_row = mapped

    if workspace_row is None:
        workspaces = session.scalars(
            select(Workspace).where(
                Workspace.organization_id == organization.id,
                Workspace.deleted_at.is_(None),
            )
        ).all()
        if len(workspaces) == 1:
            workspace_row = workspaces[0]
        else:
            raise TensorlaneError(
                "WORKSPACE_REQUIRED",
                "Specify a workspace-scoped API key or X-Tensorlane-Workspace-Id.",
                400,
            )

    if workspace_row.organization_id != organization.id:
        raise AuthorizationError(
            "WORKSPACE_ACCESS_DENIED",
            "You do not have permission to access this workspace.",
        )
    if workspace_row.deleted_at is not None:
        raise NotFoundError("Workspace not found.")

    if organization.workspace_acl == "restricted" and principal.api_key is None:
        if not workspace_visible(
            session,
            organization_id=organization.id,
            workspace_id=workspace_row.id,
            user_id=principal.user_id,
            workspace_acl=organization.workspace_acl,
            role=role,
        ):
            raise AuthorizationError(
                "WORKSPACE_ACCESS_DENIED",
                "You do not have permission to access this workspace.",
            )

    return organization, workspace_row, role


async def _proxy_mlflow(app: FastAPI, request: Request, path: str) -> Response:
    settings: Settings = app.state.settings
    request_id = getattr(request.state, "request_id", new_request_id())

    with session_scope() as session:
        principal = get_principal(request, session, settings, request.headers.get("authorization"))
        organization, workspace_row, role = _bind_workspace(session, principal, request)
        action = "mlflow.read" if request.method in {"GET", "HEAD", "OPTIONS"} else "mlflow.write"
        authorize(
            role=role,
            action=action,
            organization_id=organization.id,
            resource_organization_id=workspace_row.organization_id,
            workspace_id=workspace_row.id,
            resource_workspace_id=workspace_row.id,
        )
        if action == "mlflow.write":
            entitlements = EntitlementService(organization.plan)
            entitlements.enforce(
                "monthly_api_requests",
                usage_sum(session, organization.id, "monthly_api_requests"),
                1,
            )
            lowered = path.lower()
            if "/traces" in lowered:
                entitlements.enforce(
                    "monthly_traces",
                    usage_sum(session, organization.id, "monthly_traces"),
                    1,
                )
                _record_usage(
                    session,
                    organization.id,
                    workspace_row.id,
                    "monthly_traces",
                    1,
                    idempotency_key=f"trace:{request_id}",
                )
            elif "/runs/create" in lowered:
                entitlements.enforce(
                    "monthly_runs",
                    usage_sum(session, organization.id, "monthly_runs"),
                    1,
                )
                _record_usage(
                    session,
                    organization.id,
                    workspace_row.id,
                    "monthly_runs",
                    1,
                    idempotency_key=f"run:{request_id}",
                )
        _record_usage(
            session,
            organization.id,
            workspace_row.id,
            "monthly_api_requests",
            1,
            idempotency_key=f"req:{request_id}",
        )
        mlflow_workspace_name = workspace_row.mlflow_workspace_name
        organization_id = organization.id
        workspace_id = workspace_row.id

    if settings.mlflow_internal_uri.startswith("null://"):
        return _mlflow_unavailable()

    target = httpx.URL(settings.mlflow_internal_uri.rstrip("/") + path)
    headers = _filter_request_headers(request, strip_credentials=True)
    headers["x-mlflow-workspace"] = mlflow_workspace_name
    headers["x-request-id"] = request_id
    headers["x-tensorlane-organization-id"] = organization_id
    headers["x-tensorlane-workspace-id"] = workspace_id
    body = await request.body()
    client: httpx.AsyncClient = app.state.http
    upstream = await client.request(
        request.method,
        target,
        headers=headers,
        content=body or None,
        params=request.query_params,
    )
    response_headers = {k: v for k, v in upstream.headers.items() if k.lower() not in HOP_BY_HOP}
    return Response(
        content=upstream.content, status_code=upstream.status_code, headers=response_headers
    )


async def _proxy_web(app: FastAPI, request: Request, path: str) -> Response:
    """Single-host: browser talks to the gateway; UI and Better Auth live on Next.js."""
    settings: Settings = app.state.settings
    target = httpx.URL(settings.web_internal_uri.rstrip("/") + path)
    headers = _filter_request_headers(request, strip_credentials=False)
    body = await request.body()
    client: httpx.AsyncClient = app.state.http
    upstream = await client.request(
        request.method,
        target,
        headers=headers,
        content=body or None,
        params=request.query_params,
    )
    response_headers = {k: v for k, v in upstream.headers.items() if k.lower() not in HOP_BY_HOP}
    return Response(
        content=upstream.content, status_code=upstream.status_code, headers=response_headers
    )
