# Semantic Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bucket-key deduplication in the synthesis agent with geometric overlap detection + a targeted LLM merge call that produces a single richer finding when two agents flag the same root cause on overlapping lines.

**Architecture:** Four tasks in order — (1) synthesis prompt file, (2) overlap detection function, (3) LLM merge function, (4) wire into `run_synthesis_agent` and clean up old code. Tasks 2 and 3 add new private functions to `synthesis_agent.py` without touching the existing `run_synthesis_agent` or `_deduplicate`, so the pipeline stays green throughout. Task 4 does the final swap and removes the old bucket-key logic.

**Tech Stack:** Python, LangChain (`BaseChatModel.ainvoke`), LangGraph (`ReviewState`), pytest-asyncio

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `packages/core/argus_core/prompts/synthesis.py` | Create | LLM merge prompt + `build_merge_prompt()` |
| `packages/core/argus_core/agents/synthesis_agent.py` | Rewrite | Overlap detection, LLM merge, new `run_synthesis_agent` |
| `packages/core/tests/test_synthesis.py` | Create | All synthesis-specific tests |
| `packages/core/tests/test_engine.py` | Modify | Remove broken `_deduplicate` import + 3 old tests |

---

## Task 1: Synthesis merge prompt

**Files:**
- Create: `packages/core/argus_core/prompts/synthesis.py`
- Test: `packages/core/tests/test_synthesis.py`

- [ ] **Step 1: Create `packages/core/tests/test_synthesis.py` with the prompt test**

```python
from __future__ import annotations

import json

import pytest
from unittest.mock import AsyncMock, MagicMock

from argus_core.models import Finding, SEVERITY_ORDER


def _make_finding(**kwargs) -> Finding:
    defaults = dict(
        file_path="test.py",
        line_start=10,
        line_end=15,
        severity="medium",
        category="sql_injection",
        confidence=0.8,
        title="Test finding",
        description="desc",
        why_it_matters="matters",
        suggested_fix="fix",
        agent="security",
    )
    defaults.update(kwargs)
    return Finding(**defaults)


def test_build_merge_prompt_returns_two_messages():
    from argus_core.prompts.synthesis import build_merge_prompt
    from langchain_core.messages import HumanMessage, SystemMessage

    f1 = _make_finding(agent="security", title="SQL Injection")
    f2 = _make_finding(agent="quality", title="Unsafe Format")
    messages = build_merge_prompt([f1, f2])

    assert len(messages) == 2
    assert isinstance(messages[0], SystemMessage)
    assert isinstance(messages[1], HumanMessage)
    # Human message must contain both findings serialised
    assert "SQL Injection" in messages[1].content
    assert "Unsafe Format" in messages[1].content
    # Schema keywords must be in system prompt
    assert "same_root_cause" in messages[0].content
    assert "merged" in messages[0].content
```

- [ ] **Step 2: Run to verify it fails**

```bash
uv run pytest packages/core/tests/test_synthesis.py::test_build_merge_prompt_returns_two_messages -v
```

Expected: `FAILED` — `ModuleNotFoundError: No module named 'argus_core.prompts.synthesis'`

- [ ] **Step 3: Create `packages/core/argus_core/prompts/synthesis.py`**

```python
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
```

- [ ] **Step 4: Run to verify it passes**

```bash
uv run pytest packages/core/tests/test_synthesis.py::test_build_merge_prompt_returns_two_messages -v
```

Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add packages/core/argus_core/prompts/synthesis.py \
        packages/core/tests/test_synthesis.py
git commit -m "feat: add synthesis merge prompt"
```

---

## Task 2: Overlap detection

**Files:**
- Modify: `packages/core/argus_core/agents/synthesis_agent.py` (add `_find_overlap_groups`, keep existing code)
- Modify: `packages/core/tests/test_synthesis.py` (append tests)

- [ ] **Step 1: Append overlap detection tests to `packages/core/tests/test_synthesis.py`**

```python
def test_overlap_same_file_overlapping_lines():
    f1 = _make_finding(file_path="a.py", line_start=10, line_end=15)
    f2 = _make_finding(file_path="a.py", line_start=13, line_end=20)
    from argus_core.agents.synthesis_agent import _find_overlap_groups
    groups, solos = _find_overlap_groups([f1, f2])
    assert len(groups) == 1
    assert len(groups[0]) == 2
    assert solos == []


def test_overlap_same_file_non_overlapping_lines():
    f1 = _make_finding(file_path="a.py", line_start=10, line_end=12)
    f2 = _make_finding(file_path="a.py", line_start=13, line_end=20)
    from argus_core.agents.synthesis_agent import _find_overlap_groups
    groups, solos = _find_overlap_groups([f1, f2])
    assert groups == []
    assert len(solos) == 2


def test_overlap_different_files_same_lines():
    f1 = _make_finding(file_path="a.py", line_start=10, line_end=15)
    f2 = _make_finding(file_path="b.py", line_start=10, line_end=15)
    from argus_core.agents.synthesis_agent import _find_overlap_groups
    groups, solos = _find_overlap_groups([f1, f2])
    assert groups == []
    assert len(solos) == 2


def test_overlap_single_line_exact_match():
    f1 = _make_finding(file_path="a.py", line_start=10, line_end=10)
    f2 = _make_finding(file_path="a.py", line_start=10, line_end=20)
    from argus_core.agents.synthesis_agent import _find_overlap_groups
    groups, solos = _find_overlap_groups([f1, f2])
    assert len(groups) == 1


def test_overlap_empty_list():
    from argus_core.agents.synthesis_agent import _find_overlap_groups
    groups, solos = _find_overlap_groups([])
    assert groups == []
    assert solos == []


def test_overlap_single_finding_is_solo():
    f = _make_finding()
    from argus_core.agents.synthesis_agent import _find_overlap_groups
    groups, solos = _find_overlap_groups([f])
    assert groups == []
    assert solos == [f]


def test_overlap_three_findings_two_overlap_one_solo():
    f1 = _make_finding(file_path="a.py", line_start=10, line_end=15)
    f2 = _make_finding(file_path="a.py", line_start=13, line_end=20)
    f3 = _make_finding(file_path="a.py", line_start=50, line_end=60)
    from argus_core.agents.synthesis_agent import _find_overlap_groups
    groups, solos = _find_overlap_groups([f1, f2, f3])
    assert len(groups) == 1
    assert len(groups[0]) == 2
    assert len(solos) == 1
    assert solos[0].line_start == 50
```

- [ ] **Step 2: Run to verify they fail**

```bash
uv run pytest packages/core/tests/test_synthesis.py -k "overlap" -v
```

Expected: `FAILED` — `ImportError: cannot import name '_find_overlap_groups'`

- [ ] **Step 3: Add `_find_overlap_groups` to `packages/core/argus_core/agents/synthesis_agent.py`**

Append after the existing `_deduplicate` function (do NOT remove `_deduplicate` yet — Task 4 does that):

```python
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
            if (
                fi.file_path == fj.file_path
                and max(fi.line_start, fj.line_start) <= min(fi.line_end, fj.line_end)
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
```

- [ ] **Step 4: Run to verify tests pass**

```bash
uv run pytest packages/core/tests/test_synthesis.py -k "overlap" -v
```

Expected: all 7 overlap tests `PASSED`

- [ ] **Step 5: Run full core test suite to confirm nothing broken**

```bash
uv run pytest packages/core/tests/ -v
```

Expected: all tests `PASSED`

- [ ] **Step 6: Commit**

```bash
git add packages/core/argus_core/agents/synthesis_agent.py \
        packages/core/tests/test_synthesis.py
git commit -m "feat: add overlap detection for synthesis deduplication"
```

---

## Task 3: LLM merge function

**Files:**
- Modify: `packages/core/argus_core/agents/synthesis_agent.py` (add `_parse_merge_response`, `_merge_group`)
- Modify: `packages/core/tests/test_synthesis.py` (append tests)

- [ ] **Step 1: Append LLM merge tests to `packages/core/tests/test_synthesis.py`**

```python
@pytest.mark.asyncio
async def test_merge_group_same_root_cause_returns_one_merged_finding():
    import json
    from argus_core.agents.synthesis_agent import _merge_group

    f1 = _make_finding(severity="critical", confidence=0.9, agent="security", title="SQL Injection",
                       line_start=10, line_end=15)
    f2 = _make_finding(severity="medium", confidence=0.7, agent="quality", title="Unsafe Format",
                       line_start=12, line_end=18)
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(return_value=MagicMock(content=json.dumps({
        "same_root_cause": True,
        "merged": {
            "title": "SQL Injection via string formatting",
            "description": "User input passed directly into SQL query.",
            "why_it_matters": "Allows database compromise.",
            "suggested_fix": "Use parameterized queries.",
        },
    })))

    result = await _merge_group([f1, f2], mock_llm)

    assert len(result) == 1
    m = result[0]
    assert m.agent == "synthesis"
    assert m.severity == "critical"
    assert m.confidence == min(1.0, 0.9 + 0.1)
    assert m.line_start == 10
    assert m.line_end == 18
    assert m.title == "SQL Injection via string formatting"


@pytest.mark.asyncio
async def test_merge_group_different_root_cause_returns_both():
    import json
    from argus_core.agents.synthesis_agent import _merge_group

    f1 = _make_finding(severity="high", agent="security")
    f2 = _make_finding(severity="medium", agent="quality")
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(return_value=MagicMock(content=json.dumps({
        "same_root_cause": False,
    })))

    result = await _merge_group([f1, f2], mock_llm)

    assert len(result) == 2
    agents = {f.agent for f in result}
    assert "security" in agents
    assert "quality" in agents


@pytest.mark.asyncio
async def test_merge_group_llm_exception_keeps_both():
    from argus_core.agents.synthesis_agent import _merge_group

    f1 = _make_finding(severity="high", agent="security")
    f2 = _make_finding(severity="medium", agent="quality")
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(side_effect=RuntimeError("LLM unavailable"))

    result = await _merge_group([f1, f2], mock_llm)

    assert len(result) == 2


@pytest.mark.asyncio
async def test_merge_group_bad_json_keeps_both():
    from argus_core.agents.synthesis_agent import _merge_group

    f1 = _make_finding(severity="high", agent="security")
    f2 = _make_finding(severity="medium", agent="quality")
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(return_value=MagicMock(content="not json at all"))

    result = await _merge_group([f1, f2], mock_llm)

    assert len(result) == 2


@pytest.mark.asyncio
async def test_merge_group_group_of_three_merges_top_two_keeps_third():
    import json
    from argus_core.agents.synthesis_agent import _merge_group

    f_critical = _make_finding(severity="critical", confidence=0.95, agent="security")
    f_high = _make_finding(severity="high", confidence=0.85, agent="quality")
    f_low = _make_finding(severity="low", confidence=0.6, agent="security")
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(return_value=MagicMock(content=json.dumps({
        "same_root_cause": True,
        "merged": {
            "title": "Merged top two",
            "description": "D",
            "why_it_matters": "W",
            "suggested_fix": "F",
        },
    })))

    result = await _merge_group([f_critical, f_high, f_low], mock_llm)

    # Top-2 merged into 1 synthesis finding, low-severity third passes through
    assert len(result) == 2
    assert any(f.agent == "synthesis" for f in result)
    assert any(f.severity == "low" for f in result)
    # LLM called exactly once (for top-2 only)
    assert mock_llm.ainvoke.call_count == 1
```

- [ ] **Step 2: Run to verify they fail**

```bash
uv run pytest packages/core/tests/test_synthesis.py -k "merge_group" -v
```

Expected: `FAILED` — `ImportError: cannot import name '_merge_group'`

- [ ] **Step 3: Add `_parse_merge_response` and `_merge_group` to `packages/core/argus_core/agents/synthesis_agent.py`**

First add the missing imports at the top of the file (the current file only imports from `argus_core.models`):

```python
from __future__ import annotations

import json
import logging
import re

from langchain_core.language_models import BaseChatModel

from argus_core.models import Finding, ReviewState, SEVERITY_ORDER

logger = logging.getLogger(__name__)
```

Then append after `_find_overlap_groups`:

```python
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
        data = _parse_merge_response(response.content)
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
```

- [ ] **Step 4: Run merge tests to verify they pass**

```bash
uv run pytest packages/core/tests/test_synthesis.py -k "merge_group" -v
```

Expected: all 5 merge_group tests `PASSED`

- [ ] **Step 5: Run full core test suite**

```bash
uv run pytest packages/core/tests/ -v
```

Expected: all tests `PASSED`

- [ ] **Step 6: Commit**

```bash
git add packages/core/argus_core/agents/synthesis_agent.py \
        packages/core/tests/test_synthesis.py
git commit -m "feat: add LLM merge function for overlapping findings"
```

---

## Task 4: Wire synthesis agent + clean up old code

**Files:**
- Modify: `packages/core/argus_core/agents/synthesis_agent.py` (rewrite `run_synthesis_agent`, remove `_deduplicate`)
- Modify: `packages/core/tests/test_synthesis.py` (append integration tests)
- Modify: `packages/core/tests/test_engine.py` (remove old `_deduplicate` import and 3 stale tests)

- [ ] **Step 1: Append integration tests to `packages/core/tests/test_synthesis.py`**

```python
@pytest.mark.asyncio
async def test_run_synthesis_agent_merges_overlapping_findings():
    import json
    from argus_core.agents.synthesis_agent import run_synthesis_agent

    f_security = _make_finding(file_path="auth.py", line_start=10, line_end=15,
                               severity="critical", agent="security", title="SQL Injection")
    f_quality = _make_finding(file_path="auth.py", line_start=12, line_end=18,
                              severity="medium", agent="quality", title="Unsafe Format")
    state = {
        "quality_findings": [f_quality],
        "security_findings": [f_security],
        "synthesis_findings": [],
        "errors": [],
        "diff_chunks": [],
    }
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(return_value=MagicMock(content=json.dumps({
        "same_root_cause": True,
        "merged": {
            "title": "SQL Injection via unsafe formatting",
            "description": "Combined desc",
            "why_it_matters": "Critical risk",
            "suggested_fix": "Use parameterized queries",
        },
    })))

    result = await run_synthesis_agent(state, mock_llm)

    findings = result["synthesis_findings"]
    assert len(findings) == 1
    assert findings[0].agent == "synthesis"
    assert findings[0].severity == "critical"
    assert findings[0].title == "SQL Injection via unsafe formatting"
    assert findings[0].line_start == 10
    assert findings[0].line_end == 18


@pytest.mark.asyncio
async def test_run_synthesis_agent_keeps_non_overlapping():
    from argus_core.agents.synthesis_agent import run_synthesis_agent

    f_security = _make_finding(file_path="auth.py", line_start=1, line_end=5,
                               severity="high", agent="security")
    f_quality = _make_finding(file_path="utils.py", line_start=1, line_end=5,
                              severity="medium", agent="quality")
    state = {
        "quality_findings": [f_quality],
        "security_findings": [f_security],
        "synthesis_findings": [],
        "errors": [],
        "diff_chunks": [],
    }
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock()

    result = await run_synthesis_agent(state, mock_llm)

    findings = result["synthesis_findings"]
    assert len(findings) == 2
    # No LLM call — no overlap candidates
    mock_llm.ainvoke.assert_not_called()


@pytest.mark.asyncio
async def test_run_synthesis_agent_sorted_by_severity():
    from argus_core.agents.synthesis_agent import run_synthesis_agent

    f1 = _make_finding(file_path="a.py", line_start=1, line_end=5,
                       severity="low", confidence=0.9, agent="quality")
    f2 = _make_finding(file_path="b.py", line_start=1, line_end=5,
                       severity="critical", confidence=0.7, agent="security")
    state = {
        "quality_findings": [f1],
        "security_findings": [f2],
        "synthesis_findings": [],
        "errors": [],
        "diff_chunks": [],
    }
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock()

    result = await run_synthesis_agent(state, mock_llm)

    findings = result["synthesis_findings"]
    assert findings[0].severity == "critical"
    assert findings[1].severity == "low"


@pytest.mark.asyncio
async def test_run_synthesis_agent_empty():
    from argus_core.agents.synthesis_agent import run_synthesis_agent

    state = {
        "quality_findings": [],
        "security_findings": [],
        "synthesis_findings": [],
        "errors": [],
        "diff_chunks": [],
    }
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock()

    result = await run_synthesis_agent(state, mock_llm)

    assert result["synthesis_findings"] == []
    mock_llm.ainvoke.assert_not_called()
```

- [ ] **Step 2: Run integration tests to verify they fail**

```bash
uv run pytest packages/core/tests/test_synthesis.py -k "run_synthesis_agent" -v
```

Expected: `FAILED` — the current `run_synthesis_agent` uses `_deduplicate` and never calls the LLM, so the merged-finding assertions will fail.

- [ ] **Step 3: Rewrite `run_synthesis_agent` and remove `_deduplicate` in `packages/core/argus_core/agents/synthesis_agent.py`**

The complete new file content (replaces the entire file):

```python
from __future__ import annotations

import json
import logging
import re

from langchain_core.language_models import BaseChatModel

from argus_core.models import Finding, ReviewState, SEVERITY_ORDER
from argus_core.prompts.synthesis import build_merge_prompt

logger = logging.getLogger(__name__)


async def run_synthesis_agent(state: ReviewState, llm: BaseChatModel) -> dict:
    """Merge quality + security findings with overlap detection and LLM semantic merge."""
    all_findings = state["quality_findings"] + state["security_findings"]
    overlap_groups, solos = _find_overlap_groups(all_findings)

    merged: list[Finding] = list(solos)
    for group in overlap_groups:
        merged.extend(await _merge_group(group, llm))

    sorted_findings = sorted(
        merged,
        key=lambda f: (SEVERITY_ORDER.get(f.severity, 0), f.confidence),
        reverse=True,
    )
    return {**state, "synthesis_findings": sorted_findings}


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
            if (
                fi.file_path == fj.file_path
                and max(fi.line_start, fj.line_start) <= min(fi.line_end, fj.line_end)
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
        data = _parse_merge_response(response.content)
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
```

- [ ] **Step 4: Update `packages/core/tests/test_engine.py` — remove stale `_deduplicate` tests**

Find and remove these lines from `test_engine.py` (they reference the deleted `_deduplicate` function):

```python
from argus_core.agents.synthesis_agent import _deduplicate


def test_deduplicate_removes_same_bucket():
    """Two findings on same file/line-bucket/category → keep highest severity."""
    high = _make_finding(severity="high", line_start=10, category="sql_injection", confidence=0.9)
    low = _make_finding(severity="low", line_start=12, category="sql_injection", confidence=0.7)
    result = _deduplicate([high, low])
    assert len(result) == 1
    assert result[0].severity == "high"


def test_deduplicate_keeps_different_categories():
    """Same file/line-bucket but different category → both kept."""
    f1 = _make_finding(severity="high", line_start=10, category="sql_injection", confidence=0.9)
    f2 = _make_finding(severity="high", line_start=10, category="error_handling", confidence=0.9)
    result = _deduplicate([f1, f2])
    assert len(result) == 2


def test_deduplicate_empty():
    assert _deduplicate([]) == []
```

After removing those, verify `test_engine.py` still has no import of `_deduplicate`.

- [ ] **Step 5: Run full synthesis test suite**

```bash
uv run pytest packages/core/tests/test_synthesis.py -v
```

Expected: all synthesis tests `PASSED`

- [ ] **Step 6: Run full core test suite**

```bash
uv run pytest packages/core/tests/ -v
```

Expected: all tests `PASSED` (no references to `_deduplicate` remain)

- [ ] **Step 7: Run ruff and mypy**

```bash
uv run ruff check packages/core/
uv run mypy packages/core/argus_core
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add packages/core/argus_core/agents/synthesis_agent.py \
        packages/core/argus_core/prompts/synthesis.py \
        packages/core/tests/test_synthesis.py \
        packages/core/tests/test_engine.py
git commit -m "feat: semantic deduplication with LLM merge in synthesis agent"
```
