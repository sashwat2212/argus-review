from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from argus_cli.app import app
from argus_core.models import ReviewResult
from typer.testing import CliRunner

runner = CliRunner()

FAKE_RESULT = ReviewResult(
    findings=[],
    score=100,
    total_chunks_processed=2,
    errors=[],
)

SAMPLE_DIFF = """\
diff --git a/foo.py b/foo.py
index abc..def 100644
--- a/foo.py
+++ b/foo.py
@@ -1,3 +1,5 @@
+import os
+SECRET = os.environ["AWS_KEY"]
 def foo():
     pass
"""


@pytest.fixture
def mock_engine():
    with patch("argus_cli.commands.review_cmd.ReviewEngine") as MockEngine:
        instance = MockEngine.return_value
        instance.review_diff = AsyncMock(return_value=FAKE_RESULT)
        yield MockEngine


@pytest.fixture
def mock_config():
    with patch("argus_cli.commands.review_cmd.load_config", return_value={}):
        yield


def test_review_file_mode(tmp_path, mock_engine, mock_config):
    """--file mode reads the file as a diff and runs the engine."""
    diff_file = tmp_path / "test.diff"
    diff_file.write_text(SAMPLE_DIFF)

    with patch("argus_cli.commands.review_cmd._diff_file", return_value=SAMPLE_DIFF):
        result = runner.invoke(app, ["review", "--file", str(diff_file)])

    assert result.exit_code == 0


def test_review_output_json(tmp_path, mock_engine, mock_config):
    """--output-json writes a JSON file with score and findings."""
    diff_file = tmp_path / "test.diff"
    diff_file.write_text(SAMPLE_DIFF)
    out_json = tmp_path / "result.json"

    with patch("argus_cli.commands.review_cmd._diff_file", return_value=SAMPLE_DIFF):
        result = runner.invoke(
            app, ["review", "--file", str(diff_file), "--output-json", str(out_json)]
        )

    assert result.exit_code == 0
    data = json.loads(out_json.read_text())
    assert data["score"] == 100
    assert "findings" in data


def test_review_exits_nonzero_on_critical(tmp_path, mock_config):
    """Exit code 1 when critical findings exist."""
    from argus_core.models import Finding

    critical_result = ReviewResult(
        findings=[
            Finding(
                file_path="foo.py",
                line_start=1,
                line_end=1,
                severity="critical",
                category="hardcoded_secret",
                confidence=0.9,
                title="Hardcoded secret",
                description="...",
                why_it_matters="...",
                suggested_fix="...",
                agent="security",
            )
        ],
        score=75,
        total_chunks_processed=1,
        errors=[],
    )

    diff_file = tmp_path / "test.diff"
    diff_file.write_text(SAMPLE_DIFF)

    with patch("argus_cli.commands.review_cmd.ReviewEngine") as MockEngine:
        instance = MockEngine.return_value
        instance.review_diff = AsyncMock(return_value=critical_result)
        with patch("argus_cli.commands.review_cmd.load_config", return_value={}):
            with patch("argus_cli.commands.review_cmd._diff_file", return_value=SAMPLE_DIFF):
                result = runner.invoke(app, ["review", "--file", str(diff_file)])

    assert result.exit_code == 1
