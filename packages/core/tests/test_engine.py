from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from argus_core.engine import ReviewEngine, _compute_score
from argus_core.models import Finding, CoreConfig


def _make_finding(**kwargs) -> Finding:
    defaults = dict(
        file_path="test.py",
        line_start=1,
        line_end=5,
        severity="medium",
        category="test",
        confidence=0.8,
        title="Test finding",
        description="desc",
        why_it_matters="matters",
        suggested_fix="fix",
        agent="quality",
    )
    defaults.update(kwargs)
    return Finding(**defaults)


def test_compute_score_no_findings():
    assert _compute_score([]) == 100


def test_compute_score_critical():
    f = _make_finding(severity="critical")
    assert _compute_score([f]) == 75


def test_compute_score_floor_at_zero():
    findings = [_make_finding(severity="critical") for _ in range(10)]
    assert _compute_score(findings) == 0


def test_compute_score_mixed():
    findings = [
        _make_finding(severity="high"),
        _make_finding(severity="medium"),
        _make_finding(severity="low"),
    ]
    assert _compute_score(findings) == 84


@pytest.mark.asyncio
async def test_review_engine_empty_diff():
    with patch("argus_core.engine.get_llm", return_value=MagicMock()):
        with patch("argus_core.engine.build_review_graph") as mock_graph:
            mock_compiled = MagicMock()
            mock_compiled.ainvoke = AsyncMock(
                return_value={
                    "synthesis_findings": [],
                    "quality_findings": [],
                    "security_findings": [],
                    "errors": [],
                    "diff_chunks": [],
                }
            )
            mock_graph.return_value = mock_compiled
            engine = ReviewEngine()
            result = await engine.review_diff("")
            assert result.score == 100
            assert result.findings == []
            assert result.total_chunks_processed == 0
