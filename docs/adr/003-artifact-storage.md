# ADR 003 — Artifact storage

**Status:** Accepted  
**Date:** 2026-08-25

## Problem

Artifacts must be isolated per organization and workspace, meterable, and compatible with the MLflow SDK (upload/download, models, traces).

## Context

MLflow already has `ArtifactRepository`, S3/GCS/Azure implementations, presigned URLs, multipart upload, and per-workspace `default_artifact_root`. When that field is set, the store does **not** append `/workspaces/<name>/`.

Clients cannot set `artifact_location` when workspaces are enabled.

Desired logical layout:

```text
/org/{org_id}/workspace/{workspace_id}/experiment/{experiment_id}/run/{run_id}/
```

Native MLflow layout after a workspace-specific root:

```text
{root}/{experiment_id}/{run_id}/artifacts
```

The extra `experiment/` and `run/` path segments are **not** required for isolation and would break URI conventions the SDK and UI expect.

## Options

1. **Custom artifact repository scheme** (`tensorlane://`) with a new path layout  
   More code, more fork risk, SDK still needs to understand URIs stored on runs.

2. **S3-compatible backend with per-workspace `default_artifact_root`**  
   Isolation in the key prefix; reuse S3 repo + presigned URLs.

3. **Always proxy through MLflow `--serve-artifacts`**  
   Simple, but the tracking server becomes a throughput bottleneck and a larger blast radius.

## Decision

Choose **option 2** for Phase 1.

- Provider interface in Tensorlane: `ArtifactStorageProvider` (S3-compatible first).
- On workspace create, set MLflow `default_artifact_root` to  
  `s3://$BUCKET/org/{org_id}/workspace/{ws_id}`  
  (path-style prefix; bucket may be shared).
- Sign upload/download URLs in the gateway or a thin data-plane plugin after authz and size checks.
- Meter stored bytes and bandwidth from object-store inventory jobs + PUT/GET logs, not from the browser.
- Future providers: GCS, Azure, customer-owned buckets — same prefix contract.

Do not invent `tensorlane://` until a provider cannot be expressed as a standard URI.

## Tradeoffs

- Key layout is MLflow-native under a tenant prefix, not the illustrative `/experiment/` segments. Accept for compatibility.
- Shared bucket relies on prefix isolation and IAM. Dedicated enterprises get a dedicated bucket.
- Presigned URLs must not be logged.

## Consequences

- Reuse `validate_path_is_safe` / prefix checks before every sign operation.
- Retention hooks are jobs (Phase 2+), not inline deletes on the request path.
- Local compose: S3-compatible store (RustFS already in `docker-compose/` or MinIO).
