# Tensorlane information architecture

## Context

Every authenticated session has:

```
Organization  →  Workspace
Acme Corp         Production
```

Workspace is the MLflow isolation boundary (`X-MLFLOW-WORKSPACE` after gateway authz). Switching workspace refetches every workspace-scoped page. Organization-scoped pages (members, billing, audit, settings) stay on the org.

## Shell

Persistent AppShell: collapsible navy sidebar, white header (breadcrumb, global search / ⌘K, docs, notifications, user), workspace content.

## Sidebar

```
TENSORLANE
[Org · Workspace switcher]

OVERVIEW
  Overview

BUILD
  Experiments
  Runs
  Models
  Datasets

AI
  Traces
  Evaluations
  Prompts

OPERATE
  Deployments
  Monitoring
  Alerts
  Reports
  Workbench          ← MLflow UI iframe (escape hatch, not a product surface)

GOVERN
  Workspaces
  Members
  API Keys
  Integrations
  Usage
  Cost               ← keep; billing-adjacent, already shipped
  Billing
  Audit Logs
  Approvals          ← feature-flagged
  Security
  Retention
  Settings
```

Role and plan gates stay in `visibleNav()`. Viewers do not see API Keys. Billing role sees Usage / Cost / Billing. Approvals and Monitoring remain feature-gated.

## Routes

| Path | Scope | Notes |
| --- | --- | --- |
| `/overview` | org + workspace | Dashboard |
| `/experiments` | workspace | List |
| `/experiments/:experimentId` | workspace | Details + tabs |
| `/runs` | workspace | Explorer, multi-select |
| `/runs/compare?ids=` | workspace | 2–10 runs |
| `/runs/:runId` | workspace | Details |
| `/models` | workspace | Registry list |
| `/models/:modelId` | workspace | Later; list links to workbench until details ship |
| `/datasets` | workspace | List |
| `/traces` | workspace | Explorer |
| `/traces/:traceId` | workspace | Debugger |
| `/evaluations` | workspace | List |
| `/prompts` | workspace | List |
| `/deployments` | workspace | Honest empty until deploy API exists |
| `/monitoring` | org | Quality / usage signals |
| `/alerts` | org | Rules table (control plane) |
| `/reports` | org | Export-oriented summaries |
| `/tracking` | workspace | MLflow iframe |
| `/workspaces` | org | Workspace cards |
| `/members` | org | Members + invites |
| `/api-keys`, `/keys` | org | `/keys` redirects |
| `/integrations` | org | Provider cards |
| `/usage` | org | Meters |
| `/cost` | org | Cost estimate |
| `/billing` | org | Plans + Stripe |
| `/audit` | org | Audit table + CSV |
| `/security` | org | SSO / SCIM |
| `/retention` | org | Retention |
| `/settings` | org | Org + workspace ACL |
| `/approvals` | org | Four-eyes |
| `/onboarding` | user | First org + workspace |
| `/design-system` | internal | Component showcase |

## URL state

List pages persist filters in the query string:

- `q`, `status`, `sort`, `page`
- Experiment details: `tab`
- Run details: `tab`
- Trace details: `view` (`timeline` \| `tree` \| `waterfall` \| `raw`)
- Compare: `ids` comma-separated run ids

## Command palette (⌘K / Ctrl+K)

- Navigation to every visible sidebar item
- Actions: Create experiment, Create API key, Switch workspace, Open workbench
- Query prefix: type to filter; Enter navigates

## Permissions (UI)

Backend remains authoritative. UI:

- Viewer: lists and details; create/delete/promote disabled
- Developer: write experiments/keys in workspace; no billing/security
- Admin / Owner: govern
- Billing: usage, cost, billing only among govern pages

Do not hide unauthorized rows of data the API already returns; hide or disable **actions**.

## MLflow workbench

`/tracking` stays as “Workbench” under Operate. Tensorlane pages are the default path. The iframe is for capabilities not yet wrapped (artifact browsers, compare UI extras). Visual integration: same shell around the iframe; do not restyle `mlflow/server/js`.
