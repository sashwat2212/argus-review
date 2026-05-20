from __future__ import annotations

import asyncio
import logging

from langchain_core.language_models import BaseChatModel

from argus_core.agents._utils import parse_findings_response
from argus_core.models import DiffChunk, Finding
from argus_core.prompts.security import build_security_prompt

logger = logging.getLogger(__name__)


async def run_security_agent(
    chunk: DiffChunk,
    llm: BaseChatModel,
    sem: asyncio.Semaphore,
) -> tuple[list[Finding], list[str]]:
    """Run security review on a single diff chunk. Returns (findings, errors)."""
    prompt = build_security_prompt(chunk)

    for attempt in range(2):
        try:
            async with sem:
                response = await llm.ainvoke(prompt)
            findings = parse_findings_response(response.content, agent="security")
            logger.info("Security agent: %d findings for %s", len(findings), chunk.file_path)
            return findings, []
        except Exception as exc:
            logger.error(
                "Security agent error (attempt %d) for %s: %s",
                attempt + 1, chunk.file_path, exc,
            )
            if attempt == 0:
                await asyncio.sleep(1)

    return [], [f"security_agent {chunk.file_path}:{chunk.start_line}: failed after retry"]
