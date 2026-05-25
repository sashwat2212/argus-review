from __future__ import annotations

from unittest.mock import patch

from argus_cli.app import app
from typer.testing import CliRunner

runner = CliRunner()


def test_config_view_no_config(tmp_path):
    fake_path = tmp_path / ".argus" / "config.yml"
    with patch("argus_cli.commands.config_cmd.CONFIG_PATH", fake_path):
        result = runner.invoke(app, ["config"])
    assert result.exit_code == 0
    assert "No config" in result.output


def test_config_view_existing(tmp_path):
    fake_path = tmp_path / ".argus" / "config.yml"
    fake_path.parent.mkdir(parents=True)
    fake_path.write_text("llm_backend: ollama\n")
    with patch("argus_cli.commands.config_cmd.CONFIG_PATH", fake_path):
        result = runner.invoke(app, ["config"])
    assert result.exit_code == 0
    assert "ollama" in result.output


def test_config_set_key(tmp_path):
    fake_path = tmp_path / ".argus" / "config.yml"
    fake_path.parent.mkdir(parents=True)
    fake_path.write_text("llm_backend: ollama\n")
    with patch("argus_cli.commands.config_cmd.CONFIG_PATH", fake_path):
        result = runner.invoke(app, ["config", "--set", "llm_backend=anthropic"])
    assert result.exit_code == 0
    assert "anthropic" in fake_path.read_text()


def test_config_set_bad_format(tmp_path):
    fake_path = tmp_path / ".argus" / "config.yml"
    with patch("argus_cli.commands.config_cmd.CONFIG_PATH", fake_path):
        result = runner.invoke(app, ["config", "--set", "noequals"])
    assert result.exit_code == 1
