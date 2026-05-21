from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://argus:argus_dev@localhost:5432/argus"
    redis_url: str = "redis://localhost:6379/0"
    secret_key: str = "change-me-in-production"
    api_key: str = "change-me-api-key"
    github_webhook_secret: str = ""
    github_token: str = ""
    
    # OAuth and JWT settings
    github_client_id: str = ""
    github_client_secret: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440  # 24 hours
    
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    argus_llm_backend: str = "ollama"
    argus_ollama_base_url: str = "http://localhost:11434"
    argus_ollama_model: str = "codellama:13b"
    anthropic_api_key: str = ""
    argus_anthropic_model: str = "claude-sonnet-4-6"


settings = Settings()
