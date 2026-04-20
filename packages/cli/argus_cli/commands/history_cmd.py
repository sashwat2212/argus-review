from __future__ import annotations

import asyncio

import typer


def history_command(
    limit: int = typer.Option(20, "--limit", "-n", help="Number of reviews to show"),
    detail: int | None = typer.Option(None, "--detail", "-d", help="Show findings for review ID"),
) -> None:
    """Show past review history."""
    asyncio.run(_run_history(limit=limit, detail=detail))


async def _run_history(limit: int, detail: int | None) -> None:
    # Implementation coming soon
    pass
