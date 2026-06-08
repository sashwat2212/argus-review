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
