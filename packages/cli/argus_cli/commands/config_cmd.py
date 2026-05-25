from __future__ import annotations

from pathlib import Path

import typer
import yaml
from rich.console import Console
from rich.syntax import Syntax

console = Console()
CONFIG_PATH = Path.home() / ".argus" / "config.yml"


def config_command(
    set_key: str | None = typer.Option(None, "--set", help="Set key=value"),
) -> None:
    """View or edit Argus configuration."""
    if set_key:
        if "=" not in set_key:
            console.print("[red]Error: use --set key=value[/red]")
            raise typer.Exit(1)
        key, _, value = set_key.partition("=")
        cfg = _load()
        cfg[key.strip()] = value.strip()
        _save(cfg)
        console.print(f"[green]✓ Set {key} = {value}[/green]")
        return

    cfg = _load()
    if not cfg:
        console.print("[dim]No config found. Run `argus init` first.[/dim]")
        return
    syntax = Syntax(yaml.dump(cfg, default_flow_style=False), "yaml", theme="monokai")
    console.print(syntax)


def _load() -> dict:
    if not CONFIG_PATH.exists():
        return {}
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f) or {}


def _save(cfg: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        yaml.dump(cfg, f, default_flow_style=False)
