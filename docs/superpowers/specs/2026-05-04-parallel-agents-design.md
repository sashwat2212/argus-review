# Parallel LLM Agents — Design Spec

**Date:** 2026-05-04
**Status:** Approved

---

## Goal

Replace the sequential per-chunk processing inside each agent with LangGraph Send fan-out, running all chunks concurrently across both quality and security agents, throttled by a configurable semaphore to avoid hitting LLM rate limits.

## Background

The current graph already runs quality and security agents concurrently using `asyncio.gather` at the agent level. The bottleneck is within each agent: a PR with N diff chunks makes N sequential LLM calls per agent (2N total sequential). With Send fan-out, all chunks run concurrently — max concurrent LLM calls is capped by `max_concurrent_chunks`.

## Architecture

**Current graph:**
```
parallel_node (all chunks × quality sequential, all chunks × security sequential) → synthesis → END
```

**New graph:**
```
fan_out (Send × N chunks) → process_chunk (quality ∥ security per chunk) → synthesis → END
```

`fan_out` is a conditional edge function returning `[Send("process_chunk", {"chunk": c}) for c in state["diff_chunks"]]`. LangGraph spawns one independent `process_chunk` invocation per chunk. Results are merged back into main state via reducers. `synthesis` deduplicates as before.

**Tech Stack:** LangGraph Send API, asyncio.Semaphore, asyncio.gather, Python 3.11+

---

## Section 1: State Changes (`models.py`)

Fields that accumulate results across parallel nodes need LangGraph `add` reducers:

```python
from typing import Annotated
from operator import add

class ReviewState(TypedDict):
    diff_chunks: list[DiffChunk]
    quality_findings: Annotated[list[Finding], add]
    security_findings: Annotated[list[Finding], add]
    synthesis_findings: list[Finding]
    errors: Annotated[list[str], add]
```

New `ChunkState` TypedDict passed to each `process_chunk` node via `Send`:

```python
class ChunkState(TypedDict):
    chunk: DiffChunk
```

---

## Section 2: Config (`config.py`)

Add one field to `CoreConfig`:

```python
max_concurrent_chunks: int = 3
```

This caps how many LLM calls run simultaneously across all chunks and both agents. Default of 3 is safe for Anthropic and Ollama rate limits. Users can raise it for faster reviews or lower it for stricter rate limit compliance.

---

## Section 3: Graph Rewrite (`graph.py`)

One `asyncio.Semaphore(config.max_concurrent_chunks)` is created at graph-build time and captured in the `process_chunk` closure.

```
build_review_graph(llm, config)
  sem = asyncio.Semaphore(config.max_concurrent_chunks)

  fan_out(state) → list[Send]
    return [Send("process_chunk", {"chunk": c}) for c in state["diff_chunks"]]

  process_chunk(state: ChunkState) → dict
    run quality_call and security_call concurrently via asyncio.gather
    each call acquires sem individually before invoking llm
    retry once on failure (1s sleep), then skip and log to errors
    return {"quality_findings": [...], "security_findings": [...], "errors": [...]}

  synthesis_node(state) → dict
    unchanged — deduplicates quality + security findings

graph: entry_point=fan_out edge, process_chunk node, synthesis node, END
```

The semaphore wraps individual LLM calls (not the whole chunk), so quality and security calls within one chunk compete fairly with calls from other chunks.

---

## Section 4: Agent Function Changes

`run_quality_agent` and `run_security_agent` drop their internal chunk loop. New signatures process a single chunk:

```python
async def run_quality_agent(
    chunk: DiffChunk, llm: BaseChatModel, sem: asyncio.Semaphore
) -> tuple[list[Finding], list[str]]:
    """Returns (findings, errors) for one diff chunk."""

async def run_security_agent(
    chunk: DiffChunk, llm: BaseChatModel, sem: asyncio.Semaphore
) -> tuple[list[Finding], list[str]]:
    """Returns (findings, errors) for one diff chunk."""
```

Both are called from `process_chunk` via `asyncio.gather(..., return_exceptions=True)`.

---

## Section 5: Error Handling

Within `process_chunk`:
- `asyncio.gather(quality_call, security_call, return_exceptions=True)` runs both concurrently
- If either raises: retry once after `await asyncio.sleep(1)`
- If retry also raises: skip that agent for this chunk, append to `errors`
- A chunk with both agents failing returns empty findings — never aborts the review
- The `errors` list propagates to `ReviewResult.errors` and is stored in the DB as before

---

## Section 6: Testing

Three new test behaviors in `packages/core/tests/test_engine.py`:

**1. Parallelism verified by wall-clock time**
Mock LLM with a fixed async sleep. Run review with 3 chunks. Assert total time < 3× single-call time.

**2. Semaphore limits peak concurrency**
Set `max_concurrent_chunks=2`. Mock LLM tracks concurrent active calls. Run 5 chunks. Assert peak concurrency ≤ 2.

**3. Partial failure — review continues**
Mock LLM raises on chunk 2 of 3. Assert result has findings from chunks 1 and 3. Assert `errors` has exactly one entry for chunk 2.

Existing tests updated: mock setup changes to match new single-chunk agent signatures; score and finding behavior expectations unchanged.

---

## Out of Scope

- Per-agent concurrency limits (one semaphore shared across both agents is sufficient)
- Streaming partial results to the API while chunks complete
- Chunk-level retry with exponential backoff (one retry is sufficient for 95%+ of transient failures)
