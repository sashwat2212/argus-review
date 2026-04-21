from __future__ import annotations

import logging
from typing import Literal

import httpx

from argus_core.models import Finding

logger = logging.getLogger(__name__)

GH_API = "https://api.github.com"
CommitState = Literal["pending", "success", "failure", "error"]


async def set_commit_status(
    token: str,
    repo_full_name: str,
    sha: str,
    state: CommitState,
    description: str,
    target_url: str = "",
) -> None:
    url = f"{GH_API}/repos/{repo_full_name}/statuses/{sha}"
    payload: dict = {
        "state": state,
        "description": description[:140],
        "context": "argus-review",
    }
    if target_url:
        payload["target_url"] = target_url

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            json=payload,
            headers=_headers(token),
            timeout=15,
        )
        if resp.status_code not in (200, 201):
            logger.warning("commit status post failed: %s %s", resp.status_code, resp.text[:200])


async def post_pr_review(
    token: str,
    repo_full_name: str,
    pr_number: int,
    commit_id: str,
    findings: list[Finding],
    score: int,
) -> None:
    summary = _build_summary(findings, score)
    event = "REQUEST_CHANGES" if score < 70 else "COMMENT"

    inline_comments = []
    for f in findings:
        if f.line_start and f.line_start > 0:
            severity_emoji = _severity_emoji(f.severity)
            body = (
                f"{severity_emoji} **[{f.severity.upper()}] {f.title}**\n\n"
                f"{f.description}\n\n"
                f"**Why it matters:** {f.why_it_matters}\n\n"
                f"**Suggested fix:** {f.suggested_fix}"
            )
            inline_comments.append({
                "path": f.file_path,
                "line": f.line_end if f.line_end else f.line_start,
                "body": body,
            })

    url = f"{GH_API}/repos/{repo_full_name}/pulls/{pr_number}/reviews"
    payload: dict = {
        "commit_id": commit_id,
        "body": summary,
        "event": event,
        "comments": inline_comments,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            json=payload,
            headers=_headers(token),
            timeout=30,
        )
        if resp.status_code not in (200, 201):
            logger.warning("PR review post failed: %s %s", resp.status_code, resp.text[:300])
            # Fall back to a plain comment with no inline annotations
            await _post_plain_comment(client, token, repo_full_name, pr_number, summary)


async def _post_plain_comment(
    client: httpx.AsyncClient,
    token: str,
    repo_full_name: str,
    pr_number: int,
    body: str,
) -> None:
    url = f"{GH_API}/repos/{repo_full_name}/issues/{pr_number}/comments"
    resp = await client.post(
        url,
        json={"body": body},
        headers=_headers(token),
        timeout=15,
    )
    if resp.status_code not in (200, 201):
        logger.warning("plain comment post failed: %s %s", resp.status_code, resp.text[:200])


def _build_summary(findings: list[Finding], score: int) -> str:
    counts: dict[str, int] = {}
    for f in findings:
        counts[f.severity] = counts.get(f.severity, 0) + 1

    score_emoji = "✅" if score >= 80 else "⚠️" if score >= 60 else "❌"
    lines = [
        f"## Argus Review {score_emoji}",
        f"",
        f"**Score: {score}/100** | **{len(findings)} finding(s)**",
        f"",
    ]

    if counts:
        lines.append("| Severity | Count |")
        lines.append("|----------|-------|")
        for sev in ("critical", "high", "medium", "low", "info"):
            if sev in counts:
                lines.append(f"| {_severity_emoji(sev)} {sev.capitalize()} | {counts[sev]} |")
        lines.append("")

    if not findings:
        lines.append("No issues found. Great work! 🎉")
    elif score >= 70:
        lines.append("Minor issues found. Please review the inline comments.")
    else:
        lines.append("Issues require attention before merging.")

    return "\n".join(lines)


def _severity_emoji(severity: str) -> str:
    return {
        "critical": "🔴",
        "high": "🟠",
        "medium": "🟡",
        "low": "🔵",
        "info": "ℹ️",
    }.get(severity, "⚪")


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
