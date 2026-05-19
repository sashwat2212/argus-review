from __future__ import annotations

import asyncio
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


@pytest.mark.asyncio
async def test_quality_agent_returns_findings_for_single_chunk():
    import asyncio
    from unittest.mock import AsyncMock, MagicMock
    from argus_core.agents.quality_agent import run_quality_agent
    from argus_core.models import DiffChunk

    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(return_value=MagicMock(
        content='{"findings": [{"file_path": "a.py", "line_start": 1, "line_end": 2, '
                '"severity": "high", "category": "error_handling", "confidence": 0.9, '
                '"title": "T", "description": "D", "why_it_matters": "W", "suggested_fix": "F"}]}'
    ))

    chunk = DiffChunk(file_path="a.py", language="python", lines=["+x=1"], start_line=1, end_line=2)
    sem = asyncio.Semaphore(3)

    findings, errors = await run_quality_agent(chunk, mock_llm, sem)

    assert len(findings) == 1
    assert findings[0].severity == "high"
    assert findings[0].agent == "quality"
    assert errors == []


@pytest.mark.asyncio
async def test_quality_agent_retries_once_then_returns_error():
    import asyncio
    from unittest.mock import AsyncMock, MagicMock
    from argus_core.agents.quality_agent import run_quality_agent
    from argus_core.models import DiffChunk

    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(side_effect=RuntimeError("timeout"))

    chunk = DiffChunk(file_path="b.py", language="python", lines=["+y=2"], start_line=1, end_line=1)
    sem = asyncio.Semaphore(3)

    findings, errors = await run_quality_agent(chunk, mock_llm, sem)

    assert findings == []
    assert len(errors) == 1
    assert "quality_agent" in errors[0]
    assert "b.py" in errors[0]
    assert mock_llm.ainvoke.call_count == 2


@pytest.mark.asyncio
async def test_security_agent_returns_findings_for_single_chunk():
    import asyncio
    from unittest.mock import AsyncMock, MagicMock
    from argus_core.agents.security_agent import run_security_agent
    from argus_core.models import DiffChunk

    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(return_value=MagicMock(
        content='{"findings": [{"file_path": "c.py", "line_start": 3, "line_end": 4, '
                '"severity": "critical", "category": "hardcoded_secret", "confidence": 0.95, '
                '"title": "Secret", "description": "D", "why_it_matters": "W", "suggested_fix": "F"}]}'
    ))

    chunk = DiffChunk(file_path="c.py", language="python", lines=["+secret='abc'"], start_line=3, end_line=4)
    sem = asyncio.Semaphore(3)

    findings, errors = await run_security_agent(chunk, mock_llm, sem)

    assert len(findings) == 1
    assert findings[0].severity == "critical"
    assert findings[0].agent == "security"
    assert errors == []


@pytest.mark.asyncio
async def test_security_agent_retries_once_then_returns_error():
    import asyncio
    from unittest.mock import AsyncMock, MagicMock
    from argus_core.agents.security_agent import run_security_agent
    from argus_core.models import DiffChunk

    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(side_effect=RuntimeError("rate limited"))

    chunk = DiffChunk(file_path="d.py", language="python", lines=["+z=3"], start_line=5, end_line=5)
    sem = asyncio.Semaphore(3)

    findings, errors = await run_security_agent(chunk, mock_llm, sem)

    assert findings == []
    assert len(errors) == 1
    assert "security_agent" in errors[0]
    assert "d.py" in errors[0]
    assert mock_llm.ainvoke.call_count == 2


@pytest.mark.asyncio
async def test_chunks_processed_in_parallel():
    """3 chunks with 0.05s LLM delay should finish in ~0.05s, not ~0.15s."""
    import time

    async def slow_invoke(messages):
        await asyncio.sleep(0.05)
        return MagicMock(content='{"findings": []}')

    mock_llm = MagicMock()
    mock_llm.ainvoke = slow_invoke

    from argus_core.graph import build_review_graph
    from argus_core.models import DiffChunk, ReviewState

    config = CoreConfig(max_concurrent_chunks=10)
    graph = build_review_graph(mock_llm, config)

    chunks = [
        DiffChunk(file_path=f"file{i}.py", language="python", lines=["+x = 1"], start_line=1, end_line=1)
        for i in range(3)
    ]
    state: ReviewState = {
        "diff_chunks": chunks,
        "quality_findings": [],
        "security_findings": [],
        "synthesis_findings": [],
        "errors": [],
    }

    start = time.monotonic()
    await graph.ainvoke(state)
    elapsed = time.monotonic() - start

    # Sequential: 3 chunks × 2 agents × 0.05s = 0.30s
    # Parallel: ~0.05s (all concurrent)
    assert elapsed < 0.25, f"Expected parallel execution but took {elapsed:.2f}s"


@pytest.mark.asyncio
async def test_semaphore_limits_concurrent_llm_calls():
    """With max_concurrent_chunks=2, peak concurrent LLM calls must never exceed 2."""
    peak = 0
    current = 0
    lock = asyncio.Lock()

    async def tracked_invoke(messages):
        nonlocal peak, current
        async with lock:
            current += 1
            if current > peak:
                peak = current
        await asyncio.sleep(0.02)
        async with lock:
            current -= 1
        return MagicMock(content='{"findings": []}')

    mock_llm = MagicMock()
    mock_llm.ainvoke = tracked_invoke

    from argus_core.graph import build_review_graph
    from argus_core.models import DiffChunk, ReviewState

    config = CoreConfig(max_concurrent_chunks=2)
    graph = build_review_graph(mock_llm, config)

    chunks = [
        DiffChunk(file_path=f"file{i}.py", language="python", lines=["+x = 1"], start_line=1, end_line=1)
        for i in range(5)
    ]
    state: ReviewState = {
        "diff_chunks": chunks,
        "quality_findings": [],
        "security_findings": [],
        "synthesis_findings": [],
        "errors": [],
    }

    await graph.ainvoke(state)

    assert peak <= 2, f"Expected max 2 concurrent LLM calls, observed peak of {peak}"


@pytest.mark.asyncio
async def test_chunk_failure_logs_error_and_review_completes():
    """When all LLM calls for a chunk fail after retry, errors are recorded and review still completes."""

    async def always_fails(messages):
        raise RuntimeError("LLM unavailable")

    mock_llm = MagicMock()
    mock_llm.ainvoke = always_fails

    from argus_core.graph import build_review_graph
    from argus_core.models import DiffChunk, ReviewState

    config = CoreConfig(max_concurrent_chunks=3)
    graph = build_review_graph(mock_llm, config)

    chunks = [
        DiffChunk(file_path="broken.py", language="python", lines=["+x = 1"], start_line=1, end_line=1)
    ]
    state: ReviewState = {
        "diff_chunks": chunks,
        "quality_findings": [],
        "security_findings": [],
        "synthesis_findings": [],
        "errors": [],
    }

    # Patch asyncio.sleep in both agent modules so retry doesn't add 2s to test time
    no_sleep = AsyncMock()
    with patch("argus_core.agents.quality_agent.asyncio.sleep", no_sleep), \
         patch("argus_core.agents.security_agent.asyncio.sleep", no_sleep):
        result = await graph.ainvoke(state)

    assert result is not None
    assert len(result["errors"]) >= 1
    assert result["synthesis_findings"] == []
