from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from argus_core.engine import ReviewEngine, _compute_score
from argus_core.config import CoreConfig
from argus_core.models import Finding


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


def test_core_config_default_max_concurrent_chunks():
    config = CoreConfig()
    assert config.max_concurrent_chunks == 3


def test_core_config_custom_max_concurrent_chunks():
    config = CoreConfig(max_concurrent_chunks=5)
    assert config.max_concurrent_chunks == 5


def test_review_state_has_annotated_reducers():
    """Verify ReviewState fields use add reducer so parallel Send nodes accumulate correctly."""
    from typing import get_type_hints, get_args, get_origin, Annotated
    from operator import add
    from argus_core.models import ReviewState

    hints = get_type_hints(ReviewState, include_extras=True)

    for field in ("quality_findings", "security_findings", "errors"):
        hint = hints[field]
        assert get_origin(hint) is Annotated, f"{field} must be Annotated"
        args = get_args(hint)
        assert args[1] is add, f"{field} reducer must be operator.add"


def test_chunk_state_exists():
    from argus_core.models import ChunkState
    from argus_core.models import DiffChunk
    cs: ChunkState = {"chunk": DiffChunk(
        file_path="f.py", language="python",
        lines=["+x=1"], start_line=1, end_line=1,
    )}
    assert cs["chunk"].file_path == "f.py"
