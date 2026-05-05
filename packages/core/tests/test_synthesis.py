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
