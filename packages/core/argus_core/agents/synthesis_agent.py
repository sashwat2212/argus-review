from __future__ import annotations

import asyncio
import json
import logging
import re

from langchain_core.language_models import BaseChatModel

from argus_core.models import SEVERITY_ORDER, Finding, ReviewState

logger = logging.getLogger(__name__)


async def run_synthesis_agent(state: ReviewState, llm: BaseChatModel) -> dict:
    """Merge quality + security findings using semantic overlap deduplication."""
    all_findings = state["quality_findings"] + state["security_findings"]

    if not all_findings:
        return {**state, "synthesis_findings": []}

    groups, solos = _find_overlap_groups(all_findings)

    # Resolve each overlap group concurrently — each needs one LLM call
    merged_lists = await asyncio.gather(*[_merge_group(g, llm) for g in groups])

    result: list[Finding] = list(solos)
    for lst in merged_lists:
        result.extend(lst)

    result.sort(
        key=lambda f: (SEVERITY_ORDER.get(f.severity, 0), f.confidence),
        reverse=True,
    )

    return {**state, "synthesis_findings": result}


def _find_overlap_groups(
    findings: list[Finding],
) -> tuple[list[list[Finding]], list[Finding]]:
    """Partition findings into overlap groups (connected components) and solos.

    Two findings overlap when they share a file and their line ranges intersect:
        max(start_a, start_b) <= min(end_a, end_b)
    """
    n = len(findings)
    adj: list[set[int]] = [set() for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            fi, fj = findings[i], findings[j]
            if fi.file_path == fj.file_path and max(fi.line_start, fj.line_start) <= min(
                fi.line_end, fj.line_end
            ):
                adj[i].add(j)
                adj[j].add(i)

    visited = [False] * n
    groups: list[list[Finding]] = []
    solos: list[Finding] = []

    for start in range(n):
        if visited[start]:
            continue
        component: list[int] = []
        queue = [start]
        visited[start] = True
        while queue:
            node = queue.pop()
            component.append(node)
            for neighbour in adj[node]:
                if not visited[neighbour]:
                    visited[neighbour] = True
                    queue.append(neighbour)
        if len(component) == 1:
            solos.append(findings[component[0]])
        else:
            groups.append([findings[i] for i in component])

    return groups, solos


def _parse_merge_response(content: str) -> dict:
    """Extract JSON from LLM merge response, handling optional markdown fences."""
    raw = content.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if fence:
        raw = fence.group(1)
    else:
        obj = re.search(r"\{.*\}", raw, re.DOTALL)
        if obj:
            raw = obj.group(0)
    return json.loads(raw)


async def _merge_group(group: list[Finding], llm: BaseChatModel) -> list[Finding]:
    """Ask the LLM whether the top-2 findings in a group share a root cause.

    Returns a list with one merged Finding (agent="synthesis") if same root cause,
    or all original findings if different root causes or LLM fails.
    The third+ findings in a group always pass through unchanged.
    """
    from argus_core.prompts.synthesis import build_merge_prompt

    ordered = sorted(
        group,
        key=lambda f: (SEVERITY_ORDER.get(f.severity, 0), f.confidence),
        reverse=True,
    )
    to_merge, rest = ordered[:2], ordered[2:]

    try:
        prompt = build_merge_prompt(to_merge)
        response = await llm.ainvoke(prompt)
        data = _parse_merge_response(str(response.content))
    except Exception as exc:
        logger.warning("Synthesis merge LLM call failed: %s — keeping all findings", exc)
        return group

    if not data.get("same_root_cause"):
        return group

    merged_data = data.get("merged", {})
    f1, f2 = to_merge[0], to_merge[1]
    higher = f1 if SEVERITY_ORDER.get(f1.severity, 0) >= SEVERITY_ORDER.get(f2.severity, 0) else f2

    merged = Finding(
        file_path=f1.file_path,
        line_start=min(f1.line_start, f2.line_start),
        line_end=max(f1.line_end, f2.line_end),
        severity=higher.severity,
        category=higher.category,
        confidence=min(1.0, max(f1.confidence, f2.confidence) + 0.1),
        title=str(merged_data.get("title", higher.title))[:200],
        description=str(merged_data.get("description", higher.description)),
        why_it_matters=str(merged_data.get("why_it_matters", higher.why_it_matters)),
        suggested_fix=str(merged_data.get("suggested_fix", higher.suggested_fix)),
        agent="synthesis",
    )
    return [merged] + rest
