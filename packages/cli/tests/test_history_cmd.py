from __future__ import annotations

from unittest.mock import AsyncMock, patch

from argus_cli.app import app
from typer.testing import CliRunner

runner = CliRunner()

FAKE_REVIEWS = [
    {
        "id": 1,
        "pr_number": 42,
        "pr_title": "Fix auth bug",
        "repo": "owner/repo",
        "score": 85,
        "total_findings": 2,
        "reviewed_at": "2026-04-20 10:00:00",
    }
]


def test_history_list(mock_reviews=None):
    with patch("argus_cli.commands.history_cmd.list_reviews", new=AsyncMock(return_value=FAKE_REVIEWS)):
        result = runner.invoke(app, ["history"])
    assert result.exit_code == 0
    assert "Fix auth bug" in result.output or "42" in result.output


def test_history_empty():
    with patch("argus_cli.commands.history_cmd.list_reviews", new=AsyncMock(return_value=[])):
        result = runner.invoke(app, ["history"])
    assert result.exit_code == 0
    assert "No reviews" in result.output


def test_history_detail_not_found():
    with patch("argus_cli.commands.history_cmd.get_review", new=AsyncMock(return_value=None)):
        result = runner.invoke(app, ["history", "--detail", "999"])
    assert result.exit_code == 1
