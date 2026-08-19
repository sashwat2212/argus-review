from __future__ import annotations

import json
import re

from argus_core.models import Finding, Severity


def parse_findings_response(content: str, agent: str) -> list[Finding]:
    """Parse LLM JSON response into Finding objects. Handles JSON wrapped in markdown fences."""
    raw = content.strip()

    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if fence_match:
        raw = fence_match.group(1)
    else:
        obj_match = re.search(r"\{.*\}", raw, re.DOTALL)
        if obj_match:
            raw = obj_match.group(0)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []

    raw_findings = data.get("findings", [])
    if not isinstance(raw_findings, list):
        return []

    findings: list[Finding] = []
    for item in raw_findings:
        if not isinstance(item, dict):
            continue
        try:
            findings.append(
                Finding(
                    file_path=str(item.get("file_path", "")),
                    line_start=int(item.get("line_start", 0)),
                    line_end=int(item.get("line_end", 0)),
                    severity=_normalize_severity(item.get("severity", "info")),
                    category=str(item.get("category", "general")),
                    confidence=float(item.get("confidence", 0.5)),
                    title=str(item.get("title", ""))[:200],
                    description=str(item.get("description", "")),
                    why_it_matters=str(item.get("why_it_matters", "")),
                    suggested_fix=str(item.get("suggested_fix", "")),
                    agent=agent,
                )
            )
        except (ValueError, TypeError):
            continue

    return findings


def _normalize_severity(value: object) -> Severity:
    s = str(value).lower().strip()
    if s in ("critical", "high", "medium", "low", "info"):
        return s  # type: ignore[return-value]  # narrowed by membership test
    return "info"
