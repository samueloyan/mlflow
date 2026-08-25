"""MLflow app plugin: Tensorlane Cloud does not use MLflow Basic Auth.

The public edge is the Tensorlane gateway. The data plane should bind to
loopback. This factory exists so operators can still run
`mlflow server --app-name tensorlane --enable-workspaces`.
"""

from __future__ import annotations

from flask import Flask


def create_app(app: Flask) -> Flask:
    return app
