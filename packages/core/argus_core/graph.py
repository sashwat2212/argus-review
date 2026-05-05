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
