# Upstream synchronization

How Tensorlane tracks official MLflow without becoming an unmaintainable fork.

Related: [ADR 002](./adr/002-mlflow-extension-strategy.md).

---

## 1. Remotes

This working copy currently has:

```text
origin    https://github.com/samueloyan/mlflow   (Tensorlane distribution)
```

**Not yet configured:** official MLflow. Operators should add:

```bash
git remote add upstream https://github.com/mlflow/mlflow.git
git fetch upstream --tags
```

| Remote | Meaning |
| --- | --- |
| `origin` | Tensorlane distribution (this product) |
| `upstream` | https://github.com/mlflow/mlflow.git |

Do not push Tensorlane branches to `upstream`.

---

## 2. Version policy

| Line | Purpose |
| --- | --- |
| **Stable pin** | Last merged **upstream release tag** (today: `v3.15.1` is latest stable; this tree is `3.15.2.dev0` on `master`) |
| **Integration branch** | `tensorlane/upstream-integration` — merge/rebase target for `upstream/master` or a chosen tag |
| **Product main** | Tensorlane `main` / `master` — only after compatibility + isolation tests pass |

**Recommendation for first production pin:** merge/sync to **`v3.15.1`** (or a later patch tag), not a floating `master` SHA, unless we explicitly accept tracking pre-release.

Record the pin in `docs/upstream-pin.md` (created when Phase 1 starts) with tag + commit SHA.

---

## 3. Merge procedure

```text
git fetch upstream
git checkout -B tensorlane/upstream-integration origin/master

# Prefer merging a tag:
git merge --no-ff v3.15.x

# Run:
#   1. Upstream pytest subset (tracking, auth, workspace stores)
#   2. tests/tensorlane/compatibility
#   3. tests/tensorlane/isolation
#   4. ruff / existing pre-commit on tensorlane/ only if needed

# If mlflow/ conflicts: STOP.
# Conflicts inside mlflow/ mean someone violated the no-core-patch rule.
# Resolve by dropping our change or writing a plugin instead.

git checkout master
git merge --no-ff tensorlane/upstream-integration
```

Never force-push `master` to rewrite upstream history.

If a conflict appears in `tensorlane/`, that is expected and ours to resolve.

---

## 4. Allowed vs forbidden drift

**Forbidden without a new ADR**

- Edits under `mlflow/` except trivial generated files we do not own
- New columns on upstream tables
- Disabled upstream tests to make CI green
- Rebranded strings inside `mlflow/server/js` as the sole product UI

**Allowed**

- Entirely new files under `tensorlane/`, `tests/tensorlane/`, `deploy/`, `docs/`
- Tensorlane package entry points that hook `mlflow.app` without editing `mlflow/pyproject.toml` if the plugin is installed as a separate distribution
- Documented patches listed in §6

**pyproject.toml note:** root `pyproject.toml` is upstream-owned. Prefer a **separate** `tensorlane/pyproject.toml` so `git merge upstream` does not fight our entry points. If we must add `tensorlane = ...` to the root file, treat it as a tracked patch.

---

## 5. Compatibility suite (to be added in Phase 1)

New tests under `tests/tensorlane/compatibility/` run **against the composed gateway**, not against bare FileStore.

Golden path (also later an e2e):

1. Create experiment  
2. Start run  
3. Log params and metrics  
4. Upload artifact  
5. Download artifact  
6. Register model  
7. Search runs  
8. Create trace  
9. Retrieve trace  

Fail the upstream-integration merge if this suite fails.

Workspace isolation tests from upstream (`tests/store/tracking/sqlalchemy_store/test_sqlalchemy_workspace_store.py`, `tests/server/auth/test_auth_workspace.py`) stay enabled.

---

## 6. Patch register

Keep a table here when patches exist.

| ID | Upstream files | Reason | Removal criteria |
| --- | --- | --- | --- |
| _(none)_ | — | Phase 0: no patches | — |

---

## 7. Automation (Phase 1+)

- CI job `upstream-compat` on every PR that touches `tensorlane/` or `mlflow/`
- Periodic (weekly) CI: merge `upstream/master` into a throwaway branch and run the suite; open an issue on failure
- Do not auto-merge upstream into product main

---

## 8. Attribution on sync

When updating MLflow:

- Do not strip copyright headers
- Refresh `NOTICE` if upstream adds third-party notices
- Re-read license/trademark implications if upstream changes `LICENSE.txt`
