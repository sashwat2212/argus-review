from __future__ import annotations

import os
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

    def effective_backend(self) -> Literal["ollama", "anthropic"]:
        """Auto-detect: if ANTHROPIC_API_KEY is set in env, use anthropic."""
        if os.environ.get("ANTHROPIC_API_KEY") or (self.anthropic_api_key and self.llm_backend == "anthropic"):
            return "anthropic"
        return "ollama"
