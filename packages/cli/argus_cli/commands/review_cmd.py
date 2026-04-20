from __future__ import annotations

import asyncio
import json
import re
import subprocess
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console

from argus_cli.commands.init_cmd import load_config
from argus_cli.display import show_review_result
from argus_cli.github_client import GitHubClient
from argus_cli.local_db import save_review
from argus_core.config import CoreConfig
from argus_core.engine import ReviewEngine
from argus_core.models import ReviewResult

console = Console()


def review_command(
    pr: Optional[int] = typer.Option(None, "--pr", help="Review a specific PR number"),
    file: Optional[Path] = typer.Option(None, "--file", "-f", help="Review a single file"),
    repo: Optional[str] = typer.Option(None, "--repo", help="GitHub repo (owner/name)"),
    github_comment: bool = typer.Option(False, "--github-comment", help="Post findings to GitHub"),
    output_json: Optional[Path] = typer.Option(None, "--output-json", help="Write result as JSON"),
) -> None:
    """Review code using AI agents."""
    asyncio.run(
        _run_review(
            pr=pr,
            file=file,
            repo=repo,
            github_comment=github_comment,
            output_json=output_json,
        )
    )


async def _run_review(
    pr: int | None,
    file: Path | None,
    repo: str | None,
    github_comment: bool,
    output_json: Path | None,
) -> None:
    cfg = load_config()
    core_config = _build_core_config(cfg)
    engine = ReviewEngine(core_config)

    metadata: dict = {}

    if file:
        raw_diff = _diff_file(file)
        title = f"File review: {file}"
    elif pr:
        token = cfg.get("github_token") or ""
        if not token:
            console.print("[red]Error: GitHub token required for --pr. Run `argus init`.[/red]")
            raise typer.Exit(1)
        repo = repo or _detect_repo()
        if not repo:
            console.print("[red]Error: Could not detect repo. Pass --repo owner/name.[/red]")
            raise typer.Exit(1)
        gh = GitHubClient(token)
        console.print(f"[dim]Fetching PR #{pr} from {repo}…[/dim]")
        raw_diff = await gh.get_pr_diff(repo, pr)
        pr_meta = await gh.get_pr_metadata(repo, pr)
        metadata = {
            "pr_title": pr_meta.get("title", ""),
            "head_sha": pr_meta.get("head", {}).get("sha", ""),
        }
        title = f"PR #{pr}: {metadata.get('pr_title', '')}"
    else:
        raw_diff = _git_diff_local()
        title = "Local diff vs main"

    console.print("[dim]Running review…[/dim]")
    result = await engine.review_diff(raw_diff)
    show_review_result(result, title=title)

    if pr:
        row_id = await save_review(
            result,
            pr_number=pr,
            pr_title=metadata.get("pr_title"),
            repo=repo,
        )
        console.print(f"[dim]Saved as review #{row_id}[/dim]")

    if output_json:
        _write_json(output_json, result, metadata)

    if github_comment and pr and repo:
        token = cfg.get("github_token") or ""
        gh = GitHubClient(token)
        head_sha = metadata.get("head_sha", "")
        for finding in result.findings:
            await gh.post_review_comment(repo, pr, head_sha, finding)
        await gh.post_summary_comment(repo, pr, result)
        if head_sha:
            await gh.set_commit_status(repo, head_sha, result.score)
        console.print("[green]✓ Posted findings to GitHub[/green]")

    has_blocking = any(f.severity in ("critical", "high") for f in result.findings)
    if has_blocking:
        raise typer.Exit(1)


def _build_core_config(cfg: dict) -> CoreConfig:
    import os
    overrides: dict = {}
    if cfg.get("llm_backend"):
        overrides["llm_backend"] = cfg["llm_backend"]
    if cfg.get("ollama_base_url"):
        overrides["ollama_base_url"] = cfg["ollama_base_url"]
    if cfg.get("ollama_model"):
        overrides["ollama_model"] = cfg["ollama_model"]
    if cfg.get("anthropic_api_key"):
        os.environ.setdefault("ANTHROPIC_API_KEY", cfg["anthropic_api_key"])
    if cfg.get("anthropic_model"):
        overrides["anthropic_model"] = cfg["anthropic_model"]
    return CoreConfig(**overrides)


def _git_diff_local() -> str:
    result = subprocess.run(
        ["git", "diff", "main...HEAD"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 and not result.stdout:
        result = subprocess.run(
            ["git", "diff", "origin/main...HEAD"],
            capture_output=True,
            text=True,
        )
    return result.stdout


def _diff_file(path: Path) -> str:
    result = subprocess.run(
        ["git", "diff", "--no-index", "/dev/null", str(path)],
        capture_output=True,
        text=True,
    )
    return result.stdout


def _detect_repo() -> str | None:
    result = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        capture_output=True,
        text=True,
    )
    url = result.stdout.strip()
    m = re.search(r"github\.com[:/]([^/]+/[^/.]+?)(?:\.git)?$", url)
    return m.group(1) if m else None


def _write_json(path: Path, result: ReviewResult, metadata: dict) -> None:
    from dataclasses import asdict
    data = {
        "score": result.score,
        "total_findings": len(result.findings),
        "total_chunks_processed": result.total_chunks_processed,
        "errors": result.errors,
        "findings": [asdict(f) for f in result.findings],
        **metadata,
    }
    path.write_text(json.dumps(data, indent=2))
