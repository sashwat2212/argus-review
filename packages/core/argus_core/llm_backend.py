from __future__ import annotations

import os

from langchain_core.language_models import BaseChatModel

from argus_core.config import CoreConfig


def get_llm(config: CoreConfig) -> BaseChatModel:
    """Return a LangChain chat model based on the effective backend."""
    backend = config.effective_backend()

    if backend == "anthropic":
        from langchain_anthropic import ChatAnthropic

        api_key = os.environ.get("ANTHROPIC_API_KEY") or config.anthropic_api_key
        return ChatAnthropic(
            model=config.anthropic_model,
            api_key=api_key,  # type: ignore[arg-type]
            temperature=0.1,
            max_tokens=4096,
        )

    from langchain_ollama import ChatOllama

    return ChatOllama(
        base_url=config.ollama_base_url,
        model=config.ollama_model,
        temperature=0.1,
        format="json",
    )
