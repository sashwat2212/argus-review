from __future__ import annotations

from argus_core.models import Finding, ReviewState, SEVERITY_ORDER


async def run_synthesis_agent(state: ReviewState, _llm: object) -> dict:
    """Merge quality + security findings and deduplicate."""
    all_findings = state["quality_findings"] + state["security_findings"]
    deduplicated = _deduplicate(all_findings)
    return {**state, "synthesis_findings": deduplicated}


def _deduplicate(findings: list[Finding]) -> list[Finding]:
    sorted_findings = sorted(
        findings,
        key=lambda f: (SEVERITY_ORDER.get(f.severity, 0), f.confidence),
        reverse=True,
    )

    seen: set[tuple[str, int, str]] = set()
    result: list[Finding] = []

    for f in sorted_findings:
        key = (f.file_path, f.line_start // 5, f.category)
        if key not in seen:
            seen.add(key)
            result.append(f)

    return result
