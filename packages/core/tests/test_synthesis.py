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
