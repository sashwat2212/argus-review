# Parallel LLM Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace sequential per-chunk LLM calls inside each agent with LangGraph Send fan-out, so all diff chunks are processed concurrently across both quality and security agents, throttled by a configurable semaphore.

**Architecture:** A `fan_out` conditional edge from `START` emits one `Send("process_chunk", {chunk})` per diff chunk. Each `process_chunk` node runs quality and security agents concurrently via `asyncio.gather`, with individual LLM calls throttled by a shared `asyncio.Semaphore(max_concurrent_chunks)`. Results accumulate into `ReviewState` via LangGraph `add` reducers. Synthesis deduplicates as before.

**Tech Stack:** LangGraph `Send` API (`langgraph.types.Send`), `asyncio.Semaphore`, `asyncio.gather`, `typing.Annotated`, `operator.add`

---

## File Structure

| Action | File | Change |
|--------|------|--------|
| Modify | `packages/core/argus_core/config.py` | Add `max_concurrent_chunks: int = 3` |
| Modify | `packages/core/argus_core/models.py` | Add `Annotated` reducers to `ReviewState`, add `ChunkState` |
| Modify | `packages/core/argus_core/agents/quality_agent.py` | Refactor to single-chunk with semaphore + retry |
| Modify | `packages/core/argus_core/agents/security_agent.py` | Same refactor |
| Modify | `packages/core/argus_core/graph.py` | Full rewrite using `Send` fan-out |
| Modify | `packages/core/argus_core/engine.py` | Pass `self.config` to `build_review_graph` |
| Modify | `packages/core/tests/test_engine.py` | Add 3 new parallel-behavior tests |

---

## Task P1: Add `max_concurrent_chunks` to CoreConfig

**Files:**
- Modify: `packages/core/argus_core/config.py`
- Test: `packages/core/tests/test_engine.py`

- [ ] **Step 1: Write the failing test**

Add to `packages/core/tests/test_engine.py`:

```python
def test_core_config_default_max_concurrent_chunks():
    config = CoreConfig()
    assert config.max_concurrent_chunks == 3

def test_core_config_custom_max_concurrent_chunks():
    config = CoreConfig(max_concurrent_chunks=5)
    assert config.max_concurrent_chunks == 5
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/kdn_aisashwat/Documents/argus-review
uv run pytest packages/core/tests/test_engine.py::test_core_config_default_max_concurrent_chunks -v
```

Expected: FAIL with `AttributeError: 'CoreConfig' object has no attribute 'max_concurrent_chunks'`

- [ ] **Step 3: Add the field to CoreConfig**

Replace the entire `packages/core/argus_core/config.py` with:

```python
from __future__ import annotations

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class CoreConfig(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ARGUS_", env_file=".env", extra="ignore")

    llm_backend: Literal["ollama", "anthropic"] = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "codellama:13b"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-4-6"
    max_chunk_lines: int = 150
    max_concurrent_chunks: int = 3

    def effective_backend(self) -> Literal["ollama", "anthropic"]:
        """Use explicit backend setting; only auto-select anthropic if explicitly configured."""
        if self.llm_backend == "anthropic" and self.anthropic_api_key:
            return "anthropic"
        return "ollama"
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest packages/core/tests/test_engine.py::test_core_config_default_max_concurrent_chunks packages/core/tests/test_engine.py::test_core_config_custom_max_concurrent_chunks -v
```

Expected: both PASS

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
uv run pytest packages/core/tests/ -v
```

Expected: all tests PASS

---

## Task P2: Update ReviewState with reducers + add ChunkState

**Files:**
- Modify: `packages/core/argus_core/models.py`

- [ ] **Step 1: Write the failing test**

Add to `packages/core/tests/test_engine.py`:

```python
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
    # ChunkState is a TypedDict with a 'chunk' key
    cs: ChunkState = {"chunk": DiffChunk(
        file_path="f.py", language="python",
        lines=["+x=1"], start_line=1, end_line=1,
    )}
    assert cs["chunk"].file_path == "f.py"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest packages/core/tests/test_engine.py::test_review_state_has_annotated_reducers packages/core/tests/test_engine.py::test_chunk_state_exists -v
```

Expected: FAIL — fields not yet Annotated, ChunkState doesn't exist

- [ ] **Step 3: Update models.py**

Replace the entire `packages/core/argus_core/models.py` with:

```python
from __future__ import annotations

from dataclasses import dataclass, field
from operator import add
from typing import Annotated, Literal, TypedDict

Severity = Literal["critical", "high", "medium", "low", "info"]

SEVERITY_DEDUCTIONS: dict[str, int] = {
    "critical": 25,
    "high": 10,
    "medium": 4,
    "low": 2,
    "info": 0,
}

SEVERITY_ORDER: dict[str, int] = {
    "critical": 5,
    "high": 4,
    "medium": 3,
    "low": 2,
    "info": 1,
}


@dataclass
class Finding:
    file_path: str
    line_start: int
    line_end: int
    severity: Severity
    category: str
    confidence: float
    title: str
    description: str
    why_it_matters: str
    suggested_fix: str
    agent: str


@dataclass
class DiffChunk:
    file_path: str
    language: str
    lines: list[str]
    start_line: int
    end_line: int


@dataclass
class ReviewResult:
    findings: list[Finding]
    score: int
    total_chunks_processed: int
    errors: list[str] = field(default_factory=list)


class ReviewState(TypedDict):
    diff_chunks: list[DiffChunk]
    quality_findings: Annotated[list[Finding], add]
    security_findings: Annotated[list[Finding], add]
    synthesis_findings: list[Finding]
    errors: Annotated[list[str], add]


class ChunkState(TypedDict):
    chunk: DiffChunk
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest packages/core/tests/test_engine.py::test_review_state_has_annotated_reducers packages/core/tests/test_engine.py::test_chunk_state_exists -v
```

Expected: both PASS

- [ ] **Step 5: Run full test suite**

```bash
uv run pytest packages/core/tests/ -v
```

Expected: all tests PASS

---

## Task P3: Refactor quality_agent to single-chunk with semaphore + retry

**Files:**
- Modify: `packages/core/argus_core/agents/quality_agent.py`
- Test: `packages/core/tests/test_engine.py`

- [ ] **Step 1: Write the failing test**

Add to `packages/core/tests/test_engine.py`:

```python
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
    # Should have called ainvoke twice (original + 1 retry)
    assert mock_llm.ainvoke.call_count == 2
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest packages/core/tests/test_engine.py::test_quality_agent_returns_findings_for_single_chunk packages/core/tests/test_engine.py::test_quality_agent_retries_once_then_returns_error -v
```

Expected: FAIL — function signature doesn't match yet

- [ ] **Step 3: Rewrite quality_agent.py**

Replace the entire `packages/core/argus_core/agents/quality_agent.py` with:

```python
from __future__ import annotations

import asyncio
import logging

from langchain_core.language_models import BaseChatModel

from argus_core.agents._utils import parse_findings_response
from argus_core.models import DiffChunk, Finding
from argus_core.prompts.quality import build_quality_prompt

logger = logging.getLogger(__name__)


async def run_quality_agent(
    chunk: DiffChunk,
    llm: BaseChatModel,
    sem: asyncio.Semaphore,
) -> tuple[list[Finding], list[str]]:
    """Run quality review on a single diff chunk. Returns (findings, errors)."""
    prompt = build_quality_prompt(chunk)

    for attempt in range(2):
        try:
            async with sem:
                response = await llm.ainvoke(prompt)
            findings = parse_findings_response(response.content, agent="quality")
            logger.info("Quality agent: %d findings for %s", len(findings), chunk.file_path)
            return findings, []
        except Exception as exc:
            logger.error(
                "Quality agent error (attempt %d) for %s: %s",
                attempt + 1, chunk.file_path, exc,
            )
            if attempt == 0:
                await asyncio.sleep(1)

    return [], [f"quality_agent {chunk.file_path}:{chunk.start_line}: failed after retry"]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest packages/core/tests/test_engine.py::test_quality_agent_returns_findings_for_single_chunk packages/core/tests/test_engine.py::test_quality_agent_retries_once_then_returns_error -v
```

Expected: both PASS

- [ ] **Step 5: Run full test suite**

```bash
uv run pytest packages/core/tests/ -v
```

Expected: all tests PASS

---

## Task P4: Refactor security_agent to single-chunk with semaphore + retry

**Files:**
- Modify: `packages/core/argus_core/agents/security_agent.py`
- Test: `packages/core/tests/test_engine.py`

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/tests/test_engine.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest packages/core/tests/test_engine.py::test_security_agent_returns_findings_for_single_chunk packages/core/tests/test_engine.py::test_security_agent_retries_once_then_returns_error -v
```

Expected: FAIL — function signature doesn't match yet

- [ ] **Step 3: Rewrite security_agent.py**

Replace the entire `packages/core/argus_core/agents/security_agent.py` with:

```python
from __future__ import annotations

import asyncio
import logging

from langchain_core.language_models import BaseChatModel

from argus_core.agents._utils import parse_findings_response
from argus_core.models import DiffChunk, Finding
from argus_core.prompts.security import build_security_prompt

logger = logging.getLogger(__name__)


async def run_security_agent(
    chunk: DiffChunk,
    llm: BaseChatModel,
    sem: asyncio.Semaphore,
) -> tuple[list[Finding], list[str]]:
    """Run security review on a single diff chunk. Returns (findings, errors)."""
    prompt = build_security_prompt(chunk)

    for attempt in range(2):
        try:
            async with sem:
                response = await llm.ainvoke(prompt)
            findings = parse_findings_response(response.content, agent="security")
            logger.info("Security agent: %d findings for %s", len(findings), chunk.file_path)
            return findings, []
        except Exception as exc:
            logger.error(
                "Security agent error (attempt %d) for %s: %s",
                attempt + 1, chunk.file_path, exc,
            )
            if attempt == 0:
                await asyncio.sleep(1)

    return [], [f"security_agent {chunk.file_path}:{chunk.start_line}: failed after retry"]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest packages/core/tests/test_engine.py::test_security_agent_returns_findings_for_single_chunk packages/core/tests/test_engine.py::test_security_agent_retries_once_then_returns_error -v
```

Expected: both PASS

- [ ] **Step 5: Run full test suite**

```bash
uv run pytest packages/core/tests/ -v
```

Expected: all tests PASS

---

## Task P5: Rewrite graph.py with Send fan-out + update engine.py

**Files:**
- Modify: `packages/core/argus_core/graph.py`
- Modify: `packages/core/argus_core/engine.py`

- [ ] **Step 1: Verify existing engine test still works as baseline**

```bash
uv run pytest packages/core/tests/test_engine.py::test_review_engine_empty_diff -v
```

Expected: PASS (this test mocks `build_review_graph` entirely and should continue to pass)

- [ ] **Step 2: Rewrite graph.py**

Replace the entire `packages/core/argus_core/graph.py` with:

```python
from __future__ import annotations

import asyncio
import logging

from langchain_core.language_models import BaseChatModel
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from argus_core.agents.quality_agent import run_quality_agent
from argus_core.agents.security_agent import run_security_agent
from argus_core.agents.synthesis_agent import run_synthesis_agent
from argus_core.config import CoreConfig
from argus_core.models import ChunkState, Finding, ReviewState

logger = logging.getLogger(__name__)


def build_review_graph(llm: BaseChatModel, config: CoreConfig | None = None):
    """Compile the LangGraph review pipeline with Send-based chunk fan-out."""
    cfg = config or CoreConfig()
    sem = asyncio.Semaphore(cfg.max_concurrent_chunks)

    def fan_out(state: ReviewState) -> list[Send]:
        return [Send("process_chunk", {"chunk": chunk}) for chunk in state["diff_chunks"]]

    async def process_chunk(state: ChunkState) -> dict:
        chunk = state["chunk"]

        quality_result, security_result = await asyncio.gather(
            run_quality_agent(chunk, llm, sem),
            run_security_agent(chunk, llm, sem),
            return_exceptions=True,
        )

        quality_findings: list[Finding] = []
        security_findings: list[Finding] = []
        errors: list[str] = []

        if isinstance(quality_result, Exception):
            logger.error("Quality agent raised for %s: %s", chunk.file_path, quality_result)
            errors.append(f"quality_agent {chunk.file_path}:{chunk.start_line}: {quality_result}")
        else:
            q_findings, q_errors = quality_result
            quality_findings.extend(q_findings)
            errors.extend(q_errors)

        if isinstance(security_result, Exception):
            logger.error("Security agent raised for %s: %s", chunk.file_path, security_result)
            errors.append(f"security_agent {chunk.file_path}:{chunk.start_line}: {security_result}")
        else:
            s_findings, s_errors = security_result
            security_findings.extend(s_findings)
            errors.extend(s_errors)

        return {
            "quality_findings": quality_findings,
            "security_findings": security_findings,
            "errors": errors,
        }

    async def synthesis_node(state: ReviewState) -> dict:
        return await run_synthesis_agent(state, llm)

    graph = StateGraph(ReviewState)
    graph.add_node("process_chunk", process_chunk)
    graph.add_node("synthesis", synthesis_node)
    graph.add_conditional_edges(START, fan_out, ["process_chunk"])
    graph.add_edge("process_chunk", "synthesis")
    graph.add_edge("synthesis", END)

    return graph.compile()
```

- [ ] **Step 3: Update engine.py to pass config to build_review_graph**

In `packages/core/argus_core/engine.py`, change line 16 from:

```python
        self.graph = build_review_graph(llm)
```

to:

```python
        self.graph = build_review_graph(llm, self.config)
```

- [ ] **Step 4: Run full test suite**

```bash
uv run pytest packages/core/tests/ -v
```

Expected: all existing tests PASS

---

## Task P6: New parallel-behavior integration tests

**Files:**
- Modify: `packages/core/tests/test_engine.py`

- [ ] **Step 1: Add the three parallel-behavior tests**

Add to `packages/core/tests/test_engine.py`:

```python
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

    # Sequential would take 3 chunks × 2 agents × 0.05s = 0.30s
    # Parallel should be ~0.05s (all concurrent)
    assert elapsed < 0.20, f"Expected parallel execution but took {elapsed:.2f}s"


@pytest.mark.asyncio
async def test_semaphore_limits_concurrent_llm_calls():
    """With max_concurrent_chunks=2, peak concurrent LLM calls must never exceed 2."""
    import asyncio

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
    from unittest.mock import patch

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

    # Patch asyncio.sleep in both agent modules so the retry doesn't add 2s to test time
    no_sleep = AsyncMock()
    with patch("argus_core.agents.quality_agent.asyncio.sleep", no_sleep), \
         patch("argus_core.agents.security_agent.asyncio.sleep", no_sleep):
        result = await graph.ainvoke(state)

    # Review did not abort — a result was returned
    assert result is not None
    # Errors were recorded for both agents
    assert len(result["errors"]) >= 1
    # No findings since all calls failed
    assert result["synthesis_findings"] == []
```

Also add `import asyncio` at the top of the test file imports if not already present.

- [ ] **Step 2: Run the new tests**

```bash
uv run pytest packages/core/tests/test_engine.py::test_chunks_processed_in_parallel packages/core/tests/test_engine.py::test_semaphore_limits_concurrent_llm_calls packages/core/tests/test_engine.py::test_chunk_failure_logs_error_and_review_completes -v
```

Expected: all 3 PASS

- [ ] **Step 3: Run the full test suite one final time**

```bash
uv run pytest packages/core/tests/ -v
```

Expected: all tests PASS. Count should be 18+ (original + new).

- [ ] **Step 4: Quick smoke test — verify the engine still works end-to-end with a real diff**

```bash
cat > /tmp/smoke.diff <<'EOF'
diff --git a/example.py b/example.py
index abc..def 100644
--- a/example.py
+++ b/example.py
@@ -1,3 +1,5 @@
+import os
+secret = os.environ['AWS_KEY']
 def foo():
     pass
EOF

uv run argus review --file /tmp/smoke.diff
```

Expected: CLI outputs findings without errors. The review completes — agent backend determines finding content.
