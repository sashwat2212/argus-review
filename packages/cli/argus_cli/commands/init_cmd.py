from __future__ import annotations

import asyncio
from pathlib import Path

import httpx
import typer
import yaml
from rich.console import Console

from argus_cli.local_db import init_db

console = Console()
CONFIG_PATH = Path.home() / ".argus" / "config.yml"


def init_command() -> None:
    """Initialize Argus configuration interactively."""
    console.print("\n[bold]Argus — Initial Setup[/bold]\n")

    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)

    existing: dict = {}
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            existing = yaml.safe_load(f) or {}

    backend = typer.prompt(
        "LLM backend",
        default=existing.get("llm_backend", "ollama"),
        show_default=True,
    )

    if backend == "ollama":
        ollama_url = typer.prompt(
            "Ollama base URL",
            default=existing.get("ollama_base_url", "http://localhost:11434"),
        )
        model = typer.prompt(
            "Ollama model",
            default=existing.get("ollama_model", "codellama:13b"),
        )
        config = {
            "llm_backend": "ollama",
            "ollama_base_url": ollama_url,
            "ollama_model": model,
        }
        _test_ollama(ollama_url)
    else:
        api_key = typer.prompt("Anthropic API key", hide_input=True)
        model = typer.prompt(
            "Anthropic model",
            default=existing.get("anthropic_model", "claude-sonnet-4-6"),
        )
        config = {
            "llm_backend": "anthropic",
            "anthropic_model": model,
        }
        if api_key:
            config["anthropic_api_key"] = api_key

    github_token = typer.prompt(
        "GitHub token (optional, for --pr reviews)",
        default=existing.get("github_token", ""),
        show_default=False,
    )
    if github_token:
        config["github_token"] = github_token

    with open(CONFIG_PATH, "w") as f:
        yaml.dump(config, f, default_flow_style=False)

    asyncio.run(init_db())
    console.print(f"\n[green]✓ Config saved to {CONFIG_PATH}[/green]")
    console.print("[green]✓ Local database initialized[/green]\n")


def _test_ollama(base_url: str) -> None:
    try:
        resp = httpx.get(f"{base_url}/api/tags", timeout=5)
        if resp.status_code == 200:
            console.print("[green]✓ Ollama connection successful[/green]")
        else:
            console.print(f"[yellow]⚠ Ollama returned status {resp.status_code}[/yellow]")
    except Exception as exc:
        console.print(f"[yellow]⚠ Could not connect to Ollama: {exc}[/yellow]")


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {}
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f) or {}
