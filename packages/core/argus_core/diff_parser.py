from __future__ import annotations

import re
from pathlib import Path

from argus_core.models import DiffChunk

SUPPORTED_EXTENSIONS = {".py", ".js", ".ts", ".tsx", ".jsx"}

_DIFF_HEADER = re.compile(r"^diff --git a/.+ b/(.+)$")
_NEW_FILE_LINE = re.compile(r"^\+\+\+ b/(.+)$")
_HUNK_HEADER = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@")


def _detect_language(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    return {
        ".py": "python",
        ".js": "javascript",
        ".jsx": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
    }.get(ext, "unknown")


def _is_supported(file_path: str) -> bool:
    return Path(file_path).suffix.lower() in SUPPORTED_EXTENSIONS


def parse_diff(raw_diff: str, max_chunk_lines: int = 150) -> list[DiffChunk]:
    """Parse a unified diff into DiffChunk objects, one per logical block."""
    chunks: list[DiffChunk] = []

    sections = re.split(r"(?=^diff --git )", raw_diff, flags=re.MULTILINE)

    for section in sections:
        if not section.strip():
            continue

        file_path: str | None = None
        for line in section.splitlines():
            m = _NEW_FILE_LINE.match(line)
            if m:
                file_path = m.group(1)
                break

        if not file_path or not _is_supported(file_path):
            continue

        if "Binary files" in section:
            continue

        language = _detect_language(file_path)
        file_chunks = _extract_chunks(file_path, language, section, max_chunk_lines)
        chunks.extend(file_chunks)

    return chunks


def _extract_chunks(
    file_path: str,
    language: str,
    section: str,
    max_chunk_lines: int,
) -> list[DiffChunk]:
    chunks: list[DiffChunk] = []
    accumulated: list[str] = []
    chunk_start_line = 1
    current_new_line = 1
    has_additions = False

    def flush(end_line: int) -> None:
        if accumulated and has_additions:
            chunks.append(
                DiffChunk(
                    file_path=file_path,
                    language=language,
                    lines=list(accumulated),
                    start_line=chunk_start_line,
                    end_line=end_line,
                )
            )

    for line in section.splitlines():
        hunk_m = _HUNK_HEADER.match(line)
        if hunk_m:
            current_new_line = int(hunk_m.group(1))
            if not accumulated:
                chunk_start_line = current_new_line
            accumulated.append(line)
            continue

        if line.startswith("diff ") or line.startswith("index ") or line.startswith("---"):
            continue

        if line.startswith("+++ "):
            continue

        if line.startswith("+"):
            content = line[1:]
            accumulated.append(f"+{content}")
            has_additions = True
            current_new_line += 1
        elif line.startswith("-"):
            accumulated.append(line)
        elif line.startswith(" "):
            accumulated.append(line)
            current_new_line += 1
        else:
            continue

        if len(accumulated) >= max_chunk_lines:
            flush(current_new_line)
            has_additions = False
            accumulated = []
            chunk_start_line = current_new_line

    flush(current_new_line)
    return chunks
