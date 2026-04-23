from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage

from argus_core.models import DiffChunk

QUALITY_SYSTEM_PROMPT = """\
You are a senior software engineer performing a code quality review.
Your job is to identify code quality issues in a unified diff.

Focus ONLY on:
- Code complexity and readability (deeply nested logic, unclear naming)
- Missing or incorrect error handling (bare except, swallowed exceptions, missing finally)
- Dead code, unused variables or imports
- Code duplication and DRY violations
- Type annotation gaps in Python or missing TypeScript types
- Inappropriate use of globals or module-level side effects
- Logic errors: off-by-one, incorrect boolean operators, unreachable code
- Resource leaks: unclosed files, unreleased locks, missing context managers
- Test quality issues (if test files included): missing assertions, testing implementation details

Do NOT report on:
- Security vulnerabilities (handled by a separate security agent)
- Minor style/formatting issues a linter would catch automatically
- Issues in deleted lines (lines starting with -)

Respond with valid JSON only. No markdown, no explanation outside the JSON.
The JSON must be an object with a single key "findings" containing an array.
Each finding object must have exactly these fields:
{
  "file_path": string,
  "line_start": integer,
  "line_end": integer,
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "category": string,
  "confidence": float,
  "title": string,
  "description": string,
  "why_it_matters": string,
  "suggested_fix": string
}

category examples: "error_handling", "complexity", "dead_code", "type_safety",
"resource_leak", "logic_error", "duplication", "naming", "test_quality"

If you find no issues, return {"findings": []}.\
"""

QUALITY_HUMAN_TEMPLATE = """\
Review the following code diff for quality issues.
File: {file_path}
Language: {language}
Line range: {start_line}–{end_line}

Diff:
```
{diff_content}
```

Only report findings with confidence >= 0.5.
Focus on added/modified lines (starting with + or space).
Return valid JSON only.\
"""


def build_quality_prompt(chunk: DiffChunk) -> list[SystemMessage | HumanMessage]:
    diff_content = "\n".join(chunk.lines)
    human = QUALITY_HUMAN_TEMPLATE.format(
        file_path=chunk.file_path,
        language=chunk.language,
        start_line=chunk.start_line,
        end_line=chunk.end_line,
        diff_content=diff_content,
    )
    return [SystemMessage(content=QUALITY_SYSTEM_PROMPT), HumanMessage(content=human)]
