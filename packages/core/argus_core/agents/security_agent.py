from __future__ import annotations

import logging
from langchain_core.language_models import BaseChatModel

from argus_core.agents._utils import parse_findings_response
from argus_core.models import Finding, ReviewState
from argus_core.prompts.security import build_security_prompt

logger = logging.getLogger(__name__)


async def run_security_agent(state: ReviewState, llm: BaseChatModel) -> dict:
    findings: list[Finding] = []
    errors: list[str] = list(state["errors"])

    for chunk in state["diff_chunks"]:
        prompt = build_security_prompt(chunk)
        try:
            response = await llm.ainvoke(prompt)
            logger.info(f"Security agent response for {chunk.file_path}: {response.content[:300]}")
            chunk_findings = parse_findings_response(response.content, agent="security")
            logger.info(f"Security agent parsed {len(chunk_findings)} findings")
            findings.extend(chunk_findings)
        except Exception as exc:
            logger.error(f"Security agent error for {chunk.file_path}: {exc}")
            errors.append(f"security_agent {chunk.file_path}:{chunk.start_line}: {exc}")

    return {**state, "security_findings": findings, "errors": errors}
