from __future__ import annotations

from argus_core.config import CoreConfig
from argus_core.diff_parser import parse_diff
from argus_core.graph import build_review_graph
from argus_core.llm_backend import get_llm
from argus_core.models import SEVERITY_DEDUCTIONS, ReviewResult, ReviewState


class ReviewEngine:
    """Main entry point for running code reviews. Instantiate once per process."""

    def __init__(self, config: CoreConfig | None = None) -> None:
        self.config = config or CoreConfig()
        llm = get_llm(self.config)
        self.graph = build_review_graph(llm)

    async def review_diff(self, raw_diff: str) -> ReviewResult:
        """Run the full multi-agent review pipeline on a unified diff string."""
        chunks = parse_diff(raw_diff, self.config.max_chunk_lines)
        if not chunks:
            return ReviewResult(findings=[], score=100, total_chunks_processed=0)

        initial_state: ReviewState = {
            "diff_chunks": chunks,
            "quality_findings": [],
            "security_findings": [],
            "synthesis_findings": [],
            "errors": [],
        }

        final_state = await self.graph.ainvoke(initial_state)
        findings = final_state["synthesis_findings"]
        score = _compute_score(findings)

        return ReviewResult(
            findings=findings,
            score=score,
            total_chunks_processed=len(chunks),
            errors=final_state.get("errors", []),
        )


def _compute_score(findings: list) -> int:
    deductions = sum(SEVERITY_DEDUCTIONS.get(f.severity, 0) for f in findings)
    return max(0, 100 - deductions)
