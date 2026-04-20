from __future__ import annotations

from langchain_core.language_models import BaseChatModel

from argus_core.agents._utils import parse_findings_response
from argus_core.models import Finding, ReviewState
from argus_core.prompts.security import build_security_prompt


async def run_security_agent(state: ReviewState, llm: BaseChatModel) -> dict:
    findings: list[Finding] = []
    errors: list[str] = list(state["errors"])

    for chunk in state["diff_chunks"]:
        prompt = build_security_prompt(chunk)
        try:
            response = await llm.ainvoke(prompt)
            chunk_findings = parse_findings_response(response.content, agent="security")
            findings.extend(chunk_findings)
        except Exception as exc:
            errors.append(f"security_agent {chunk.file_path}:{chunk.start_line}: {exc}")

    return {**state, "security_findings": findings, "errors": errors}
