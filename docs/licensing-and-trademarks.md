# Licensing and trademarks (human review required)

This is **not legal advice**. A human with authority must review before any public distribution, marketing site, or commercial contract.

## Software license (MLflow)

| Item | Value |
| --- | --- |
| File | `LICENSE.txt` |
| License | Apache License 2.0 |
| Copyright line | Copyright 2018 Databricks, Inc. All rights reserved. |
| NOTICE file in upstream | **None** at inspection time |

Apache 2.0 allows commercial use, modification, and distribution of derivative works if we:

- Keep the license and copyright notices on MLflow source
- State modifications if we distribute modified files
- Include a NOTICE if/when we add one or upstream adds one
- Do not use the license grant as a trademark grant (§6)

Tensorlane proprietary code under `tensorlane/` should use a **separate** license (to be chosen). Do not relicense `mlflow/` files as proprietary.

## Trademarks

Apache 2.0 §6: the license **does not** grant trademark rights except reasonable description of origin.

“MLflow” is associated with Databricks / the MLflow project. Product rules:

- Customer-facing name: **Tensorlane**
- Do **not** ship as “Tensorlane MLflow”
- Do **not** use MLflow or Databricks logos as Tensorlane’s mark
- Do **not** imply endorsement
- Descriptive compatibility (“MLflow compatible”, “works with the MLflow Python SDK”) is the intended language — **confirm with counsel**
- Domain, ads, and PyPI classifiers need the same review

## Third-party notices

Before distribution, generate a dependency license inventory (Python + JS) and keep `NOTICE` plus a third-party list. MLflow’s own UI vendors `@databricks/design-system`; that branding/licensing also needs review if Tensorlane’s dashboard embeds it.

## Security disclosure

Upstream policy: `SECURITY.md` (GitHub private vulnerability reporting). Tensorlane Cloud needs its own disclosure address before serving customers; do not file Tensorlane Cloud issues against github.com/mlflow/mlflow.
