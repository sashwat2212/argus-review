from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer


def review_command(
    pr: Optional[int] = typer.Option(None, "--pr", help="Review a specific PR number"),
    file: Optional[Path] = typer.Option(None, "--file", "-f", help="Review a single file"),
    repo: Optional[str] = typer.Option(None, "--repo", help="GitHub repo (owner/name)"),
    github_comment: bool = typer.Option(False, "--github-comment", help="Post findings to GitHub"),
    output_json: Optional[Path] = typer.Option(None, "--output-json", help="Write result as JSON"),
) -> None:
    """Review code using AI agents."""
    # Implementation coming soon
    pass
