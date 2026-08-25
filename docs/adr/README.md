# Architecture Decision Records

ADRs capture significant Tensorlane decisions.

| ID | Title | Status |
| --- | --- | --- |
| [001](./001-tenant-isolation.md) | Tenant isolation | Accepted |
| [002](./002-mlflow-extension-strategy.md) | MLflow extension strategy | Accepted |
| [003](./003-artifact-storage.md) | Artifact storage | Accepted |
| [004](./004-authentication.md) | Authentication | Accepted |
| [005](./005-billing-metering.md) | Billing and metering | Accepted |
| [006](./006-identity-and-defaults.md) | Identity vendor and product defaults | Accepted |

Template:

```markdown
# ADR NNN — Title

**Status:** Proposed | Accepted | Superseded
**Date:** YYYY-MM-DD

## Problem
## Context
## Options
## Decision
## Tradeoffs
## Consequences
```

Architecture-changing database migrations require an ADR and centralized review (do not let parallel agents redesign shared schemas independently).
