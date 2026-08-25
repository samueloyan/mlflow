# ADR 002 — MLflow extension strategy

**Status:** Accepted  
**Date:** 2026-08-25

## Problem

We need Tensorlane capabilities (identity, orgs, billing, gateway) without creating an unmaintainable MLflow fork.

## Context

This repo is a full MLflow source tree (`3.15.2.dev0`). Upstream exposes plugins: `mlflow.app`, store registries, `authorization_function`, `mlflow.workspace_provider`, `mlflow.artifact_repository`, request header/auth providers.

Heavy edits to `mlflow/server/handlers.py` (8k+ lines) or SQLAlchemy models would make `git fetch upstream` painful.

Apache 2.0 allows derivative works; trademarks are separate.

## Options

1. **Patch MLflow core in place** (org columns, new routes in `handlers.py`, rebranded JS)  
   Fast locally, ruinous to sync.

2. **Downstream-only package** that depends on released `mlflow` from PyPI and never vendors source  
   Cleanest sync, but we lose the ability to carry a tiny documented patch if upstream has a blocker, and the current git remote is already a source fork.

3. **Distribution fork with a hard directory boundary**  
   Keep `mlflow/` identical to upstream except for a documented, minimal patch set (ideally **empty**). Put proprietary code in `tensorlane/`. Register plugins via the Tensorlane package’s own entry points. Sidecar gateway and control plane processes.

4. **Git submodule / subtree of mlflow inside a new monorepo**  
   Extra tooling; this repository is already the MLflow tree.

## Decision

Choose **option 3**.

```text
Upstream MLflow
      ↓  (git remote "upstream")
Tensorlane distribution (this repo’s mlflow/ + trivial glue)
      ↓  (plugins, no behavior forks)
Tensorlane extensions (tensorlane/data_plane)
      ↓
Tensorlane control plane + gateway (tensorlane/control_plane, tensorlane/gateway)
```

Allowed modifications to `mlflow/` without a new ADR:

- None by default.

Allowed with an ADR and a patch note in `docs/upstream-sync.md`:

- Entry point registration if it cannot live in the Tensorlane package.
- Emergency security backports not yet in upstream.

Frontend: do not rewrite tracking/trace/run pages for branding. Tensorlane chrome + reuse MLflow UI modules; proprietary screens (orgs, billing, keys) are new.

## Tradeoffs

- Two (or three) processes locally (gateway, control plane, MLflow) vs one `mlflow server`. Compose hides this.
- Plugin bugs can look like “MLflow broke.” Compatibility suite must run against the composed stack.
- If we ever **must** patch core, the patch list stays short and reviewed.

## Consequences

- `origin` = Tensorlane distribution; `upstream` = `https://github.com/mlflow/mlflow.git`.
- CI runs upstream unit tests **and** Tensorlane isolation/compatibility tests.
- Branding: product name Tensorlane; never “Tensorlane MLflow.”
