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
            model_name=config.anthropic_model,  # type: ignore[call-arg]
            api_key=api_key,  # type: ignore[arg-type]
            temperature=0.1,
            max_tokens_to_sample=4096,
        )

    if backend == "groq":
        from langchain_groq import ChatGroq
        from langchain_core.rate_limiters import InMemoryRateLimiter

        rate_limiter = InMemoryRateLimiter(
            requests_per_second=0.4,
            check_every_n_seconds=0.1,
            max_bucket_size=2,
        )
        api_key = os.environ.get("GROQ_API_KEY") or config.groq_api_key
        return ChatGroq(
            model_name=config.groq_model,
            api_key=api_key,
            temperature=0.1,
            max_tokens=4096,
            rate_limiter=rate_limiter,
        )

    from langchain_ollama import ChatOllama

    return ChatOllama(
        base_url=config.ollama_base_url,
        model=config.ollama_model,
        temperature=0.1,
        format="json",
    )
