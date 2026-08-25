# Architecture Decision Records

ADRs capture significant Tensorlane decisions.

| ID | Title | Status |
| --- | --- | --- |
| [001](./001-tenant-isolation.md) | Tenant isolation | Proposed |
| [002](./002-mlflow-extension-strategy.md) | MLflow extension strategy | Proposed |
| [003](./003-artifact-storage.md) | Artifact storage | Proposed |
| [004](./004-authentication.md) | Authentication | Proposed |
| [005](./005-billing-metering.md) | Billing and metering | Proposed |

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
