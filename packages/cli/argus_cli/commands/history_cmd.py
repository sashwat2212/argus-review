from __future__ import annotations

import asyncio
import json

import typer
from rich.console import Console

from argus_cli.display import show_finding_detail, show_history_table
from argus_cli.local_db import get_review, list_reviews

console = Console()


def history_command(
    limit: int = typer.Option(20, "--limit", "-n", help="Number of reviews to show"),
    detail: int | None = typer.Option(None, "--detail", "-d", help="Show findings for review ID"),
) -> None:
    """Show past review history."""
    asyncio.run(_run_history(limit=limit, detail=detail))


async def _run_history(limit: int, detail: int | None) -> None:
    if detail is not None:
        row = await get_review(detail)
        if not row:
            console.print(f"[red]Review #{detail} not found.[/red]")
            raise typer.Exit(1)
        console.print(
            f"\n[bold]Review #{detail}[/bold] · PR #{row.get('pr_number', '—')} · "
            f"Score {row.get('score', '?')}/100\n"
        )
        findings_data = row.get("detail", {}).get("findings", [])
        from argus_core.models import Finding

        for fd in findings_data:
            try:
                f = Finding(**fd)
                show_finding_detail(f)
            except TypeError:
                console.print(json.dumps(fd, indent=2))
        return

    reviews = await list_reviews(limit=limit)
    show_history_table(reviews)
