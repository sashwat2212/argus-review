from __future__ import annotations

from langchain_core.language_models import BaseChatModel

from argus_core.agents._utils import parse_findings_response
from argus_core.models import Finding, ReviewState
from argus_core.prompts.quality import build_quality_prompt


async def run_quality_agent(state: ReviewState, llm: BaseChatModel) -> dict:
    findings: list[Finding] = []
    errors: list[str] = list(state["errors"])

    for chunk in state["diff_chunks"]:
        prompt = build_quality_prompt(chunk)
        try:
            response = await llm.ainvoke(prompt)
            chunk_findings = parse_findings_response(response.content, agent="quality")
            findings.extend(chunk_findings)
        except Exception as exc:
            errors.append(f"quality_agent {chunk.file_path}:{chunk.start_line}: {exc}")

    return {**state, "quality_findings": findings, "errors": errors}
