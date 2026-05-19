from __future__ import annotations

import json

from langchain_core.messages import HumanMessage, SystemMessage

from argus_core.models import Finding

SYNTHESIS_SYSTEM_PROMPT = """\
You are a code review synthesis expert. Given two findings flagged on overlapping \
lines by different analysis agents, decide if they describe the same root cause. \
If they do, produce a single merged finding that combines the most useful parts \
of each. If they are genuinely separate issues, say so.

Respond with valid JSON only. No markdown, no explanation outside the JSON.

Schema when same root cause:
{"same_root_cause": true, "merged": {"title": "...", "description": "...", \
"why_it_matters": "...", "suggested_fix": "..."}}

Schema when different root causes:
{"same_root_cause": false}
"""


def build_merge_prompt(findings: list[Finding]) -> list:
    """Build a LangChain message list for the LLM merge call."""
    serialised = json.dumps(
        [
            {
                "agent": f.agent,
                "file_path": f.file_path,
                "line_start": f.line_start,
                "line_end": f.line_end,
                "severity": f.severity,
                "category": f.category,
                "confidence": f.confidence,
                "title": f.title,
                "description": f.description,
                "why_it_matters": f.why_it_matters,
                "suggested_fix": f.suggested_fix,
            }
            for f in findings
        ],
        indent=2,
    )
    return [
        SystemMessage(content=SYNTHESIS_SYSTEM_PROMPT),
        HumanMessage(content=f"Findings to evaluate:\n{serialised}"),
    ]
