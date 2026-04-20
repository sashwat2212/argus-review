from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer


def config_command(
    set_key: Optional[str] = typer.Option(None, "--set", help="Set key=value"),
) -> None:
    """View or edit Argus configuration."""
    # Implementation coming soon
    pass
