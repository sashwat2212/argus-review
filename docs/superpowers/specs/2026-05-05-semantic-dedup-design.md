# Semantic Deduplication — Design Spec

**Date:** 2026-05-05
**Branch:** feat/semantic-dedup (new branch off main)
**Status:** Approved

## Overview

Replace the current bucket-key deduplication in the synthesis agent with a two-stage approach: geometric line-range overlap detection (pure Python, no LLM) to find merge candidates, followed by a targeted LLM call per overlap group to decide whether findings share a root cause and, if so, produce a single merged finding richer than either original.

## Problem

The current synthesis agent deduplicates by a fixed key `(file_path, line_start // 5, category)`. Two findings from different agents at the same lines but with different categories — e.g., security agent's "SQL Injection" and quality agent's "Unsafe String Formatting" at `auth.py:42` — are both passed through unchanged, giving the developer two overlapping cards describing the same underlying bug. The LLM parameter `_llm` is accepted but never used.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Approach | Overlap detection + targeted LLM merge | LLM only fires for genuine candidates — surgical, testable, predictable |
| Merge vs drop | Merge into one richer finding | Combined description/fix is more useful; cross-agent agreement boosts confidence |
| Merged finding `agent` field | `"synthesis"` | Signals cross-agent origin without adding new model fields |
| Confidence boost on merge | `min(1.0, max(f1.confidence, f2.confidence) + 0.1)` | Two independent agents agreeing increases trust |
| LLM failure handling | Fall back to keeping both findings unchanged | Never silently drop a finding due to a transient LLM error |

---

## Section 1 — Overlap Detection

Pure Python, zero LLM involvement.

**Condition:** two findings are overlap candidates when:
1. `f1.file_path == f2.file_path`
2. `max(f1.line_start, f2.line_start) <= min(f1.line_end, f2.line_end)`

**Algorithm:**
- Combine `quality_findings + security_findings` into one list
- Build a graph where findings are nodes and an edge exists between any two findings that satisfy the overlap condition
- Compute connected components of that graph — each component is an **overlap group**
- A finding in a component of size 1 is a **solo** — it passes directly to output with no LLM call

This entirely replaces the existing `(file_path, line_start // 5, category)` bucket key.

---

## Section 2 — LLM Merge Call

**Trigger:** one call per overlap group (typically 0–3 groups per review, 2 findings each).

**Prompt location:** `packages/core/argus_core/prompts/synthesis.py`

**Input to LLM:** both findings serialised as compact JSON, plus the two-question schema.

**JSON response schema:**
```json
{
  "same_root_cause": true,
  "merged": {
    "title": "...",
    "description": "...",
    "why_it_matters": "...",
    "suggested_fix": "..."
  }
}
```

If `same_root_cause` is `false`, the `merged` key is omitted and both findings are kept unchanged.

**Merged finding construction** (when `same_root_cause` is `true`):
- `file_path` — same for both (overlap requires same file)
- `line_start` — `min(f1.line_start, f2.line_start)` (union start)
- `line_end` — `max(f1.line_end, f2.line_end)` (union end)
- `severity` — the higher of the two
- `confidence` — `min(1.0, max(f1.confidence, f2.confidence) + 0.1)`
- `category` — from the higher-severity finding
- `title`, `description`, `why_it_matters`, `suggested_fix` — from the LLM response
- `agent` — `"synthesis"`

**Error handling:** if the LLM call raises an exception or returns unparseable JSON, log a warning and keep both original findings unchanged.

---

## Section 3 — Synthesis Agent Rewrite

### New flow in `packages/core/argus_core/agents/synthesis_agent.py`

```
1. Combine quality_findings + security_findings → all_findings
2. Compute overlap groups (Section 1 algorithm)
3. For each overlap group (size > 1):
     → call LLM merge (Section 2)
     → replace group with merged finding OR keep originals (LLM veto)
4. Concatenate solo findings + merge results
5. Sort by (severity, confidence) descending
6. Return as synthesis_findings
```

The `_llm` parameter is now actually used (currently ignored).

### Files

| File | Action | Purpose |
|---|---|---|
| `packages/core/argus_core/agents/synthesis_agent.py` | Rewrite | New two-stage dedup logic |
| `packages/core/argus_core/prompts/synthesis.py` | Create | LLM merge prompt + JSON schema |
| `packages/core/tests/test_synthesis.py` | Create | Dedicated synthesis unit tests |

### Test coverage

- Overlap detection correctly identifies candidates (same file, overlapping lines)
- Non-overlapping findings at same file but different lines → pass through untouched
- Findings in different files → never considered candidates regardless of line numbers
- LLM says `same_root_cause: true` → one merged finding with `agent="synthesis"`, boosted confidence, higher severity
- LLM says `same_root_cause: false` → both findings kept, neither dropped
- LLM raises exception → falls back to keeping both findings (warning logged)
- Solo findings (no overlap partner) never trigger an LLM call

---

## Out of Scope

- Groups of 3+ findings overlapping: within any overlap group, only the top-2 findings by severity (then confidence as tiebreaker) are sent to the LLM merge call. Remaining findings in the group pass through as solos. This keeps the JSON schema simple and the prompt focused.
- Semantic similarity across non-overlapping line ranges (would require embeddings — deferred)
- Dashboard changes (the `agent="synthesis"` field is already displayed in the FindingDetail card)
- Changes to `Finding` dataclass (no new fields needed)
