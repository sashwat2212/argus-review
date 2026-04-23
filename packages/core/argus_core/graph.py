from __future__ import annotations

import asyncio

from langchain_core.language_models import BaseChatModel
from langgraph.graph import END, StateGraph

from argus_core.agents.quality_agent import run_quality_agent
from argus_core.agents.security_agent import run_security_agent
from argus_core.agents.synthesis_agent import run_synthesis_agent
from argus_core.models import ReviewState


def build_review_graph(llm: BaseChatModel):
    """Compile the LangGraph review pipeline: quality+security in parallel → synthesis."""
    graph = StateGraph(ReviewState)

    async def parallel_node(s: ReviewState) -> dict:
        quality_result, security_result = await asyncio.gather(
            run_quality_agent(s, llm),
            run_security_agent(s, llm),
        )
        return {
            **s,
            "quality_findings": quality_result.get("quality_findings", []),
            "security_findings": security_result.get("security_findings", []),
        }

    async def synthesis_node(s: ReviewState) -> dict:
        return await run_synthesis_agent(s, llm)

    graph.add_node("parallel", parallel_node)
    graph.add_node("synthesis", synthesis_node)

    graph.set_entry_point("parallel")
    graph.add_edge("parallel", "synthesis")
    graph.add_edge("synthesis", END)

    return graph.compile()
