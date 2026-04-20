from __future__ import annotations

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from argus_core.models import Finding, ReviewResult

console = Console()

_SEVERITY_STYLES: dict[str, str] = {
    "critical": "bold red",
    "high": "red",
    "medium": "yellow",
    "low": "cyan",
    "info": "dim white",
}


def show_review_result(result: ReviewResult, title: str = "Argus Code Review") -> None:
    show_score_panel(result.score, title, len(result.findings))
    if result.findings:
        show_findings_table(result.findings)
    else:
        console.print("\n[green]✓ No issues found.[/green]\n")

    if result.errors:
        console.print(f"\n[yellow]⚠ {len(result.errors)} agent error(s):[/yellow]")
        for err in result.errors:
            console.print(f"  [dim]{err}[/dim]")


def show_score_panel(score: int, title: str = "Review", total_findings: int = 0) -> None:
    color = "green" if score >= 80 else ("yellow" if score >= 60 else "red")
    score_text = Text(f"{score}/100", style=f"bold {color}")
    subtitle = f"{total_findings} finding(s) · {_score_label(score)}"
    panel = Panel(
        score_text,
        title=f"[bold]{title}[/bold]",
        subtitle=subtitle,
        expand=False,
        padding=(0, 2),
    )
    console.print()
    console.print(panel)


def show_findings_table(findings: list[Finding]) -> None:
    table = Table(show_header=True, header_style="bold", expand=True)
    table.add_column("Severity", style="bold", width=10)
    table.add_column("File", overflow="fold")
    table.add_column("Lines", width=8)
    table.add_column("Category", width=20)
    table.add_column("Title", overflow="fold")
    table.add_column("Conf", width=6)

    for f in sorted(findings, key=lambda x: (-_sev_order(x.severity), -x.confidence)):
        style = _SEVERITY_STYLES.get(f.severity, "")
        table.add_row(
            Text(f.severity.upper(), style=style),
            f.file_path,
            f"{f.line_start}–{f.line_end}",
            f.category,
            f.title,
            f"{f.confidence:.0%}",
        )

    console.print()
    console.print(table)


def show_finding_detail(f: Finding) -> None:
    style = _SEVERITY_STYLES.get(f.severity, "")
    console.print(
        Panel(
            f"[bold]{f.title}[/bold]\n\n"
            f"{f.description}\n\n"
            f"[bold]Why it matters:[/bold] {f.why_it_matters}\n\n"
            f"[bold]Suggested fix:[/bold]\n[code]{f.suggested_fix}[/code]",
            title=f"[{style}]{f.severity.upper()}[/{style}] · {f.file_path}:{f.line_start}",
            subtitle=f"Category: {f.category} · Confidence: {f.confidence:.0%} · Agent: {f.agent}",
        )
    )


def show_history_table(reviews: list[dict]) -> None:
    if not reviews:
        console.print("[dim]No reviews found.[/dim]")
        return

    table = Table(show_header=True, header_style="bold", expand=True)
    table.add_column("ID", width=5)
    table.add_column("Repo", overflow="fold")
    table.add_column("PR#", width=6)
    table.add_column("Title", overflow="fold")
    table.add_column("Score", width=7)
    table.add_column("Findings", width=9)
    table.add_column("Date")

    for r in reviews:
        score = r.get("score", 0) or 0
        color = "green" if score >= 80 else ("yellow" if score >= 60 else "red")
        table.add_row(
            str(r.get("id", "")),
            r.get("repo") or "",
            str(r.get("pr_number") or "—"),
            (r.get("pr_title") or "")[:60],
            Text(str(score), style=color),
            str(r.get("total_findings", 0)),
            str(r.get("reviewed_at", ""))[:16],
        )

    console.print(table)


def _sev_order(severity: str) -> int:
    return {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1}.get(severity, 0)


def _score_label(score: int) -> str:
    if score >= 80:
        return "Good"
    if score >= 60:
        return "Needs attention"
    return "Action required"
