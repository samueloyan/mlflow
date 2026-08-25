from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)

    database_url: str = "sqlite:///./tensorlane.db"
    tensorlane_pepper: str = "dev-only-pepper"
    tensorlane_secret_key: str = "dev-only-secret"
    public_url: str = "http://localhost:8080"
    mlflow_internal_uri: str = "http://127.0.0.1:5000"
    web_internal_uri: str = ""
    artifact_root: str = "file:///tmp/tensorlane-artifacts"
    redis_url: str | None = None
    web_origin: str = "http://localhost:3000"
    environment: str = "development"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


def get_settings() -> Settings:
    return Settings()
