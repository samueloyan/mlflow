# Tensorlane page inventory

Legend: **Native** = control plane only. **Wrapped** = Tensorlane UI on MLflow ajax-api. **Iframe** = upstream MLflow UI. **Missing** = no route yet (this pass may add a thin page).

| Route | Status before this work | Kind | This pass |
| --- | --- | --- | --- |
| `/overview` | Exists (plan/workspace/role cards) | Native + wrap | Redesign to dashboard spec; real run/trace/model counts |
| `/experiments` | Thin list (name/id/stage) | Wrapped | Full table, search, sort, create, URL filters |
| `/experiments/:id` | Missing | Wrapped | Overview + runs + traces tabs |
| `/runs` | Missing | Wrapped | Dense explorer, multi-select, compare |
| `/runs/:id` | Missing | Wrapped | Tabs: overview, params, metrics, artifacts, traces |
| `/runs/compare` | Missing | Wrapped | Side-by-side params/metrics |
| `/models` | Missing (prompts reused registry) | Wrapped | Registered model list |
| `/models/:id` | Missing | Wrapped | Later; link out |
| `/datasets` | Missing | Wrapped | `search-datasets` when available |
| `/traces` | Thin list; search missing `locations` | Wrapped | Fix API contract; full explorer |
| `/traces/:id` | Missing | Wrapped | Timeline / tree / waterfall / raw |
| `/evaluations` | Thin / weak mapping | Wrapped | Restyle; keep workbench CTA |
| `/prompts` | Thin registry list | Wrapped | Restyle |
| `/deployments` | Missing | Native stub | Empty state, no fake traffic |
| `/monitoring` | Alert rules (misnamed vs spec) | Native | Dashboard cards + charts from usage/traces |
| `/alerts` | Buried in monitoring | Native | Dedicated rules table using `/api/v1/.../alerts` |
| `/reports` | Missing | Native stub | Export hooks (audit CSV exists) |
| `/tracking` | Iframe | Iframe | Keep in shell |
| `/workspaces` | CRUD in settings | Native | Dedicated cards |
| `/members` | Full invite/role/remove | Native | Restyle onto tokens |
| `/keys` | Create/revoke + one-time secret | Native | Restyle; alias `/api-keys` |
| `/integrations` | Missing | Native stub | Provider cards, configure drawer |
| `/usage` | Meters | Native | Restyle + period copy |
| `/cost` | Cost report | Native | Restyle |
| `/billing` | Plans, checkout, portal | Native | Restyle; same flows |
| `/audit` | Table + CSV | Native | Restyle; details drawer |
| `/security` | SSO/SCIM | Native | Restyle |
| `/retention` | Retention PATCH | Native | Restyle |
| `/settings` | Org + ACL + workspaces | Native | Restyle |
| `/approvals` | Four-eyes | Native | Restyle |
| `/onboarding` | Create org+workspace | Native | Restyle; tracking snippet |
| `/login`, `/signup` | Better Auth | Native | Same tokens as product |
| `/invite/:token` | Accept invite | Native | Unchanged flow |
| `/design-system` | Missing | Native | Component showcase |

## MLflow-dependent vs Tensorlane-native

**MLflow-dependent (must preserve ajax-api behavior):** experiments, runs, models, datasets, traces, prompts, evaluations, workbench.

**Tensorlane-native:** overview chrome, members, keys, usage, cost, billing, audit, security, retention, settings, approvals, alerts, onboarding, integrations, reports, deployments (until a deploy API exists).

## Actions that must keep working

Do not drop because the mockup omitted them:

- Invite / change role / remove member / last-owner protection
- API key create (secret once) / revoke
- Billing checkout + confirm + portal
- Audit CSV export
- Saved views on list surfaces
- SSO/SCIM forms
- Retention save
- Approval request/review
- Alert rule create
- Workspace create + ACL grants
- MLflow create experiment (when the user can write)

## Known API gaps (document only — no backend change in this pass)

1. Traces search **requires** `locations` (experiment ids). Lists must load experiments first.
2. Evaluations have no first-class list API; logged-model search is a stopgap.
3. No deployments API. Page must not invent request/error metrics.
4. `mlflowJson` previously hid errors. UI must distinguish empty vs down.
5. Owner on experiments is not a first-class field; derive from latest run `user_id` / tags when present.
