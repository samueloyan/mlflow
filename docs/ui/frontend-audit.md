# Tensorlane frontend audit

**Date:** 2026-08-26  
**Scope:** `tensorlane/web` (Next.js control-plane dashboard) and how it relates to unmodified `mlflow/server/js`.  
**Constraint:** Do not aggressively modify upstream MLflow UI. Tensorlane presentation layers wrap stable APIs.

## 1. Current frontend framework

| Layer | Choice |
| --- | --- |
| App | Next.js 15 App Router (`tensorlane/web`) |
| UI | React 19 + TypeScript (strict, `noUncheckedIndexedAccess`) |
| Auth | Better Auth (`lib/auth.ts`, `lib/auth-client.ts`, `/api/auth/[...all]`) |
| Component library | None (no shadcn, MUI, Ant, Databricks design-system) |
| Styling | Single file `app/globals.css` with copper/paper tokens |
| Fonts | Instrument Sans + Instrument Serif (Google) |
| Charts | None |
| Tables | Ad-hoc `<table className="data">` per page |
| Storybook | Not present |
| State | React context in `components/Shell.tsx` (`lib/shell.ts`) |
| Data fetching | `fetch` helpers `lib/api.ts` and `lib/mlflow.ts` (no React Query) |

The dashboard is a **Tensorlane-native** Next app. MLflow’s React UI is only loaded inside `/tracking` as an iframe of `/mlflow/`.

## 2. Routing

App Router groups:

- `(app)/` — authenticated shell (`components/Shell.tsx`)
- `(auth)/` — login / signup
- `invite/[token]` — invitation accept
- `api/auth/[...all]` — Better Auth
- `api/logout` — session destroy

Rewrites in `next.config.ts` proxy `/api/v1`, `/ajax-api`, `/api/2.0`, `/api/3.0`, `/mlflow`, `/mlflow-artifacts` to `TENSORLANE_API_ORIGIN` (default `http://127.0.0.1:8080`). The gateway is the only public process; the browser never talks to MLflow with the user’s cookie.

Middleware (`middleware.ts`) sends unauthenticated users to `/login`. Public paths: `/login`, `/signup`, `/invite`.

## 3. Component library and styling

There is **one visual system today**, but it is not the Tensorlane product language requested for this work:

- Paper background `#f3efe6`, copper accent `#b85a28`, serif titles
- Left rail only (no global header, search, ⌘K, breadcrumbs, notifications)
- Sidebar does not collapse to icons
- No design tokens named `--color-primary` / `--color-sidebar`
- No shared DataTable, Modal, Drawer, Toast, Chart, StatusBadge, or skeleton primitives beyond `PageHeader` / `EmptyState` / `CopyButton` / `SavedViews` / `UsageBanner`

**Decision:** Replace the copper/paper theme with a single navy + purple enterprise system. Do **not** introduce a second library alongside it. Existing class names (`.page`, `.card`, `.btn`, `table.data`, `.field`) stay so governance pages inherit the new look without a rewrite of every form.

## 4. MLflow UI dependencies

| Surface | How Tensorlane uses it |
| --- | --- |
| Workbench | Iframe `/mlflow/` — full upstream UI, no Tensorlane chrome inside the iframe |
| Experiments list | `POST /ajax-api/2.0/mlflow/experiments/search` |
| Traces list | `POST /ajax-api/3.0/mlflow/traces/search` (currently missing required `locations`) |
| Prompts list | `GET /ajax-api/2.0/mlflow/registered-models/search` |
| Evaluations list | `POST /ajax-api/2.0/mlflow/logged-model/search` (weak mapping) |

Stable APIs available and **not** yet wrapped as Tensorlane pages:

- `GET /ajax-api/2.0/mlflow/experiments/get`
- `POST /ajax-api/2.0/mlflow/experiments/create`
- `POST /ajax-api/2.0/mlflow/runs/search`
- `GET /ajax-api/2.0/mlflow/runs/get`
- `GET /ajax-api/2.0/mlflow/metrics/get-history`
- `GET /ajax-api/2.0/mlflow/artifacts/list`
- `GET /ajax-api/3.0/mlflow/traces/get`
- `GET /ajax-api/2.0/mlflow/get-trace-artifact`

`mlflowJson` swallows HTTP errors and returns `null`, so failed MLflow calls look like empty lists. That must be fixed for functional loading/error states.

## 5. Existing reusable components

- `Shell` — org/workspace selects, grouped nav, usage banner, mobile menu
- `PageHeader`, `EmptyState`, `PlanGate`
- `SavedViews` — control-plane saved filters
- `CopyButton`, `Wordmark`, `UsageBanner`

Missing relative to the product spec: AppShell header, collapsible sidebar, command palette, DataTable, charts, drawers, modals, toasts, skeletons, StatusBadge, notification center.

## 6. Authentication integration

Better Auth session cookie. Shell loads `/api/v1/me` and `/api/v1/organizations`. 401 → `/login`. Org and workspace IDs are sent to MLflow ajax calls as `X-Tensorlane-Organization-Id` / `X-Tensorlane-Workspace-Id`. The gateway overwrites `X-MLFLOW-WORKSPACE` after authz and strips `Authorization` / `Cookie` before proxying.

Identity is **not** Clerk. Do not add Clerk.

## 7. API clients

- `api()` — control plane `/api/v1/*`, throws `ApiError`
- `mlflowJson()` — MLflow ajax-api via the Next rewrite, credentials included, org/workspace headers

No generated OpenAPI client. Keep it that way unless a contract change is approved.

## 8. State management

- Org/workspace in `localStorage` (`tensorlane.org`, `tensorlane.workspace`)
- Page filters are React `useState` (not URL-backed except billing checkout query params)
- No global store

Follow-up: persist list filters in the URL (`?q=`, `?status=`, `?tab=`).

## 9. Charts and tables

None shared. Dashboard metrics are plan/workspace/role counts, not run/trace analytics.

## 10. Forms

Native `<form>` + labeled `.field` inputs. Validation is HTML `required` / `minLength` plus server `ApiError` banners. Keep that pattern; add a `FormField` primitive and modal submit states.

## 11. What this redesign must not do

- Do not edit `mlflow/server/js` to “Tensorlane-ify” upstream screens.
- Do not change backend APIs for frontend convenience.
- Do not add `organization_id` to MLflow tables.
- Do not leave a copper theme on billing/settings while Overview becomes navy/purple.
- Do not ship static mock data as if it were a product. Use ajax-api and `/api/v1` with real request states.
