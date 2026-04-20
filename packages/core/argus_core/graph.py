from __future__ import annotations

from langchain_core.language_models import BaseChatModel
from langgraph.graph import END, StateGraph

from argus_core.agents.quality_agent import run_quality_agent
from argus_core.agents.security_agent import run_security_agent
from argus_core.agents.synthesis_agent import run_synthesis_agent
from argus_core.models import ReviewState


def build_review_graph(llm: BaseChatModel):
    """Compile the LangGraph review pipeline: quality → security → synthesis."""
    graph = StateGraph(ReviewState)

    graph.add_node("quality", lambda s: run_quality_agent(s, llm))
    graph.add_node("security", lambda s: run_security_agent(s, llm))
    graph.add_node("synthesis", lambda s: run_synthesis_agent(s, llm))

    graph.set_entry_point("quality")
    graph.add_edge("quality", "security")
    graph.add_edge("security", "synthesis")
    graph.add_edge("synthesis", END)

    return graph.compile()
