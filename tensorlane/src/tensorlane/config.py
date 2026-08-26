from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)

    database_url: str = "sqlite:///./tensorlane.db"
    tensorlane_pepper: str = "dev-only-pepper"
    tensorlane_secret_key: str = "dev-only-secret"
    public_url: str = "http://localhost:8080"
    mlflow_internal_uri: str = "http://127.0.0.1:5000"
    mlflow_static_prefix: str = "/mlflow"
    web_internal_uri: str = ""
    artifact_root: str = "file:///tmp/tensorlane-artifacts"
    redis_url: str | None = None
    web_origin: str = "http://localhost:3000"
    environment: str = "development"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_team: str = ""
    stripe_price_growth: str = ""
    smtp_url: str = ""
    mail_from: str = "Tensorlane <noreply@tensorlane.ai>"
    control_plane_rpm: int = 120
    mlflow_write_rpm: int = 600
    trace_ingest_rpm: int = 1200

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def stripe_configured(self) -> bool:
        return bool(self.stripe_secret_key)


def get_settings() -> Settings:
    return Settings()
