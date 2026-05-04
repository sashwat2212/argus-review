from __future__ import annotations

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class CoreConfig(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ARGUS_", env_file=".env", extra="ignore")

    llm_backend: Literal["ollama", "anthropic"] = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "codellama:13b"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-4-6"
    max_chunk_lines: int = 150
    max_concurrent_chunks: int = 3

    def effective_backend(self) -> Literal["ollama", "anthropic"]:
        """Use explicit backend setting; only auto-select anthropic if explicitly configured."""
        if self.llm_backend == "anthropic" and self.anthropic_api_key:
            return "anthropic"
        return "ollama"
