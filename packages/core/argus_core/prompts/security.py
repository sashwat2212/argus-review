from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage

from argus_core.models import DiffChunk

SECURITY_SYSTEM_PROMPT = """\
You are an application security engineer performing a security-focused code review.
Your job is to identify security vulnerabilities in a unified diff.

Focus ONLY on:
- Injection: SQL injection, command injection, LDAP injection, XPath injection
- Authentication/authorization flaws: missing auth checks, insecure direct object references
- Sensitive data exposure: hardcoded secrets, API keys, passwords, tokens in source code
- Insecure cryptography: weak algorithms (MD5/SHA1 for passwords), hardcoded IVs, predictable random
- Cross-site scripting (XSS): unescaped output in HTML/template contexts (JS/TS files)
- Insecure deserialization: pickle.loads on untrusted data, eval() on user input
- Path traversal: unsanitized file paths derived from user input
- SSRF: HTTP requests to URLs derived from user input without validation
- Timing attacks: non-constant-time comparison for secrets/tokens
- Missing input validation on API endpoints that accept user data

Severity guide:
- critical: remote code execution, full auth bypass, plaintext credential storage
- high: SQL injection, stored XSS, significant data exposure
- medium: CSRF, open redirect, reflected XSS, information disclosure
- low: minor info leak, missing security header in code
- info: defense-in-depth suggestion

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

category must be a CWE-style label, e.g.:
"sql_injection", "hardcoded_secret", "path_traversal", "insecure_deserialization",
"xss", "weak_crypto", "ssrf", "command_injection", "auth_bypass", "timing_attack",
"missing_input_validation"

If you find no issues, return {"findings": []}.\
"""

SECURITY_HUMAN_TEMPLATE = """\
Perform a security review of the following code diff.
File: {file_path}
Language: {language}
Line range: {start_line}–{end_line}

Diff:
```
{diff_content}
```

Only report findings with confidence >= 0.6.
Focus on code that was ADDED or MODIFIED (lines starting with + or space).
For each finding, suggested_fix must include a concrete safe code example, not just generic advice.
Return valid JSON only.\
"""


def build_security_prompt(chunk: DiffChunk) -> list[SystemMessage | HumanMessage]:
    diff_content = "\n".join(chunk.lines)
    human = SECURITY_HUMAN_TEMPLATE.format(
        file_path=chunk.file_path,
        language=chunk.language,
        start_line=chunk.start_line,
        end_line=chunk.end_line,
        diff_content=diff_content,
    )
    return [SystemMessage(content=SECURITY_SYSTEM_PROMPT), HumanMessage(content=human)]
