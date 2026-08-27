"""Artifact prefix checks, local/S3 inventory, and signed download URLs."""

from __future__ import annotations

import logging
import time
from pathlib import Path
from urllib.parse import quote, urljoin, urlparse

from tensorlane.errors import AuthorizationError, NotFoundError

log = logging.getLogger("tensorlane.storage")


def workspace_prefix(artifact_root: str, organization_id: str, workspace_id: str) -> str:
    root = artifact_root.rstrip("/")
    expected = f"org/{organization_id}/workspace/{workspace_id}"
    if expected not in root:
        return f"{root}/{expected}"
    return root


def assert_artifact_prefix(organization_id: str, workspace_id: str, object_key: str) -> None:
    expected = f"org/{organization_id}/workspace/{workspace_id}"
    normalized = object_key.lstrip("/")
    if normalized != expected and not normalized.startswith(expected + "/"):
        raise AuthorizationError(
            "ARTIFACT_PATH_DENIED",
            "Artifact key is outside the workspace prefix.",
        )


def proxy_url(public_url: str, organization_id: str, workspace_id: str, object_key: str) -> str:
    key = quote(object_key.lstrip("/"), safe="/")
    return urljoin(
        public_url.rstrip("/") + "/",
        f"api/v1/artifacts/download?organization_id={organization_id}&workspace_id={workspace_id}&key={key}",
    )


def _file_path(uri: str) -> Path | None:
    parsed = urlparse(uri)
    if parsed.scheme not in {"", "file"}:
        return None
    path = parsed.path or uri
    if uri.startswith("file://"):
        path = uri[len("file://") :]
    return Path(path)


def _remainder_after_prefix(organization_id: str, workspace_id: str, object_key: str) -> str:
    expected = f"org/{organization_id}/workspace/{workspace_id}"
    normalized = object_key.lstrip("/")
    if normalized == expected:
        return ""
    return normalized[len(expected) :].lstrip("/")


def resolve_local_file(
    workspace_artifact_root: str, organization_id: str, workspace_id: str, object_key: str
) -> Path:
    root = _file_path(workspace_artifact_root)
    if root is None:
        raise NotFoundError("Artifact is not on local storage.")
    remainder = _remainder_after_prefix(organization_id, workspace_id, object_key)
    candidate = (root / remainder).resolve() if remainder else root.resolve()
    base = root.resolve()
    if candidate != base and not str(candidate).startswith(str(base) + "/"):
        raise AuthorizationError(
            "ARTIFACT_PATH_DENIED",
            "Artifact key is outside the workspace prefix.",
        )
    if not candidate.is_file():
        raise NotFoundError("Artifact not found.")
    return candidate


def measure_bytes(artifact_root: str) -> int:
    local = _file_path(artifact_root)
    if local is not None:
        if not local.exists():
            return 0
        total = 0
        for path in local.rglob("*"):
            if path.is_file():
                try:
                    total += path.stat().st_size
                except OSError:
                    continue
        return total
    if artifact_root.startswith("s3://"):
        return _measure_s3(artifact_root)
    return 0


def _measure_s3(uri: str) -> int:
    try:
        import boto3
    except ImportError:
        log.warning("s3_inventory_skipped reason=no_boto3")
        return 0
    parsed = urlparse(uri)
    bucket = parsed.netloc
    prefix = parsed.path.lstrip("/")
    if not bucket:
        return 0
    total = 0
    try:
        client = boto3.client("s3")
        token: str | None = None
        while True:
            kwargs: dict[str, object] = {"Bucket": bucket, "Prefix": prefix}
            if token:
                kwargs["ContinuationToken"] = token
            page = client.list_objects_v2(**kwargs)
            for item in page.get("Contents") or []:
                total += int(item.get("Size") or 0)
            if not page.get("IsTruncated"):
                break
            token = page.get("NextContinuationToken")
            if not token:
                break
    except Exception:
        log.exception("s3_inventory_failed bucket=%s", bucket)
        return 0
    return total


def presign_s3(workspace_artifact_root: str, object_key: str, expires: int = 300) -> str | None:
    try:
        import boto3
    except ImportError:
        return None
    parsed = urlparse(workspace_artifact_root)
    if parsed.scheme != "s3" or not parsed.netloc:
        return None
    remainder = object_key.lstrip("/")
    prefix = parsed.path.lstrip("/")
    expected_prefix = prefix.rstrip("/")
    if expected_prefix and not remainder.startswith(expected_prefix):
        key = f"{expected_prefix}/{remainder}" if remainder else expected_prefix
    else:
        key = remainder
    try:
        client = boto3.client("s3")
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": parsed.netloc, "Key": key},
            ExpiresIn=expires,
        )
    except Exception:
        log.exception("s3_presign_failed bucket=%s", parsed.netloc)
        return None


def purge_older_than(artifact_root: str, days: int) -> int:
    if days < 1:
        return 0
    cutoff = time.time() - days * 86400
    local = _file_path(artifact_root)
    if local is None or not local.exists():
        return 0
    deleted = 0
    for path in local.rglob("*"):
        if not path.is_file():
            continue
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink()
                deleted += 1
        except OSError:
            continue
    return deleted
