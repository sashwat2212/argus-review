from __future__ import annotations

import typer

from argus_cli.commands.config_cmd import config_command
from argus_cli.commands.history_cmd import history_command
from argus_cli.commands.init_cmd import init_command
from argus_cli.commands.review_cmd import review_command

app = typer.Typer(
    name="argus",
    help="AI-powered multi-agent code review CLI.",
    add_completion=False,
    rich_markup_mode="rich",
)

app.command("init")(init_command)
app.command("review")(review_command)
app.command("history")(history_command)
app.command("config")(config_command)


def main() -> None:
    app()


if __name__ == "__main__":
    main()
