from __future__ import annotations

import httpx
from argus_core.models import Finding, ReviewResult

GITHUB_API = "https://api.github.com"


class GitHubClient:
    def __init__(self, token: str) -> None:
        self._headers = {
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def get_pr_diff(self, repo: str, pr_number: int) -> str:
        url = f"{GITHUB_API}/repos/{repo}/pulls/{pr_number}"
        async with httpx.AsyncClient() as client:
            resp = client.build_request(
                "GET", url, headers={**self._headers, "Accept": "application/vnd.github.v3.diff"}
            )
            response = await client.send(resp)
            response.raise_for_status()
            return response.text

    async def get_pr_metadata(self, repo: str, pr_number: int) -> dict:
        url = f"{GITHUB_API}/repos/{repo}/pulls/{pr_number}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url, headers={**self._headers, "Accept": "application/vnd.github+json"}
            )
            resp.raise_for_status()
            return resp.json()

    async def post_review_comment(
        self, repo: str, pr_number: int, commit_sha: str, finding: Finding, diff_hunk: str = ""
    ) -> None:
        url = f"{GITHUB_API}/repos/{repo}/pulls/{pr_number}/comments"
        body = _format_finding_comment(finding)
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                headers={**self._headers, "Accept": "application/vnd.github+json"},
                json={
                    "body": body,
                    "commit_id": commit_sha,
                    "path": finding.file_path,
                    "line": finding.line_end,
                    "side": "RIGHT",
                },
            )
            if resp.status_code not in (200, 201):
                pass

    async def post_summary_comment(self, repo: str, pr_number: int, result: ReviewResult) -> None:
        url = f"{GITHUB_API}/repos/{repo}/issues/{pr_number}/comments"
        body = _format_summary(result)
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                headers={**self._headers, "Accept": "application/vnd.github+json"},
                json={"body": body},
            )
            resp.raise_for_status()

    async def set_commit_status(
        self, repo: str, sha: str, score: int, description: str = ""
    ) -> None:
        url = f"{GITHUB_API}/repos/{repo}/statuses/{sha}"
        state = "success" if score >= 70 else ("pending" if score >= 50 else "failure")
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                headers={**self._headers, "Accept": "application/vnd.github+json"},
                json={
                    "state": state,
                    "description": description or f"Argus score: {score}/100",
                    "context": "argus/review",
                },
            )
            resp.raise_for_status()


def _format_finding_comment(f: Finding) -> str:
    severity_emoji = {
        "critical": "🔴",
        "high": "🟠",
        "medium": "🟡",
        "low": "🔵",
        "info": "⚪",
    }.get(f.severity, "⚪")
    return (
        f"{severity_emoji} **{f.severity.upper()}: {f.title}**\n\n"
        f"{f.description}\n\n"
        f"**Why it matters:** {f.why_it_matters}\n\n"
        f"**Suggested fix:**\n```\n{f.suggested_fix}\n```\n\n"
        f"*Confidence: {f.confidence:.0%} · Agent: {f.agent}*"
    )


def _format_summary(result: ReviewResult) -> str:
    severity_counts: dict[str, int] = {}
    for f in result.findings:
        severity_counts[f.severity] = severity_counts.get(f.severity, 0) + 1

    lines = [
        "## 🔍 Argus Code Review",
        "",
        f"**Quality Score: {result.score}/100**",
        "",
        "| Severity | Count |",
        "|----------|-------|",
    ]
    for sev in ("critical", "high", "medium", "low", "info"):
        count = severity_counts.get(sev, 0)
        if count:
            lines.append(f"| {sev.capitalize()} | {count} |")

    if not result.findings:
        lines.append("\n✅ No issues found.")
    else:
        lines.append(
            f"\n{len(result.findings)} total findings across {result.total_chunks_processed} chunks."
        )

    return "\n".join(lines)
