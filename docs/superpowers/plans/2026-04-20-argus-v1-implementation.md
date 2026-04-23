# Argus v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all stub/placeholder modules in the Argus monorepo so every package is fully functional and independently testable end-to-end.

**Architecture:** Six sequential modules, each fully functional before the next begins. Core engine → CLI commands → API SQLAlchemy models → API Pydantic schemas → API routers + Celery task → Dashboard React UI. Each module has its own test suite that passes before moving on.

**Tech Stack:** Python 3.11, uv workspace, LangGraph 0.2+, FastAPI, SQLAlchemy 2 async, Celery+Redis, Alembic, Vite+React 18+TypeScript+Tailwind+React Query+Recharts

---

## Current State Snapshot

Files that **already have real implementations** (do not re-implement):
- `packages/core/argus_core/models.py` — Finding, DiffChunk, ReviewResult, ReviewState
- `packages/core/argus_core/config.py` — CoreConfig with effective_backend()
- `packages/core/argus_core/diff_parser.py` — parse_diff()
- `packages/core/argus_core/llm_backend.py` — get_llm()
- `packages/core/argus_core/graph.py` — build_review_graph()
- `packages/core/argus_core/engine.py` — ReviewEngine, _compute_score()
- `packages/core/argus_core/agents/_utils.py` — parse_findings_response()
- `packages/core/argus_core/agents/quality_agent.py` — run_quality_agent()
- `packages/core/argus_core/agents/security_agent.py` — run_security_agent()
- `packages/core/argus_core/agents/synthesis_agent.py` — run_synthesis_agent()
- `packages/core/argus_core/prompts/quality.py` — build_quality_prompt()
- `packages/core/argus_core/prompts/security.py` — build_security_prompt()
- `packages/cli/argus_cli/local_db.py` — SQLite CRUD
- `packages/cli/argus_cli/display.py` — Rich table output
- `packages/cli/argus_cli/github_client.py` — GitHubClient (has one typo to fix)
- `packages/cli/argus_cli/commands/init_cmd.py` — argus init

Files that are **stubs requiring full implementation** (this plan's work):
- `packages/core/tests/test_engine.py` — has a wrong import (CoreConfig from models)
- `packages/cli/argus_cli/commands/review_cmd.py` — body is `pass`
- `packages/cli/argus_cli/commands/history_cmd.py` — body is `pass`
- `packages/cli/argus_cli/commands/config_cmd.py` — body is `pass`
- `packages/api/argus_api/main.py` — no routers registered, no router imports
- `packages/api/argus_api/models/*.py` — wrong Base class, no real columns
- `packages/api/argus_api/schemas/*.py` — empty Pydantic models
- `packages/api/argus_api/routers/*.py` — placeholder `pass`
- `packages/api/argus_api/tasks/review_task.py` — stub
- `packages/api/alembic/versions/0001_initial_schema.py` — empty upgrade/downgrade
- `packages/dashboard/src/` — minimal placeholder App.tsx, no components/pages/hooks

---

## Module 1: Core Engine — Install & Verify

**Goal:** Confirm the existing core implementation runs and all tests pass. Fix the one known import bug in test_engine.py.

**Files:**
- Fix: `packages/core/tests/test_engine.py`

---

- [ ] **Step 1: Install workspace dependencies**

```bash
cd /Users/kdn_aisashwat/Documents/argus-review
uv sync
```

Expected output: resolving + installing packages, no errors.

- [ ] **Step 2: Fix the wrong import in test_engine.py**

Open `packages/core/tests/test_engine.py` line 8. It currently reads:
```python
from argus_core.models import Finding, CoreConfig
```

CoreConfig lives in `argus_core.config`, not `argus_core.models`. Replace line 8:
```python
from argus_core.config import CoreConfig
from argus_core.models import Finding
```

Also remove `CoreConfig` from the import on line 8 and ensure the test file compiles.

- [ ] **Step 3: Run existing core tests**

```bash
cd /Users/kdn_aisashwat/Documents/argus-review
uv run pytest packages/core/tests/ -v
```

Expected output:
```
PASSED packages/core/tests/test_diff_parser.py::test_parse_python_diff
PASSED packages/core/tests/test_diff_parser.py::test_unsupported_extension_skipped
PASSED packages/core/tests/test_diff_parser.py::test_empty_diff_returns_empty
PASSED packages/core/tests/test_diff_parser.py::test_binary_file_skipped
PASSED packages/core/tests/test_diff_parser.py::test_chunking_large_diff
PASSED packages/core/tests/test_engine.py::test_compute_score_no_findings
PASSED packages/core/tests/test_engine.py::test_compute_score_critical
PASSED packages/core/tests/test_engine.py::test_compute_score_floor_at_zero
PASSED packages/core/tests/test_engine.py::test_compute_score_mixed
PASSED packages/core/tests/test_engine.py::test_review_engine_empty_diff
```

All 10 pass, 0 failures.

- [ ] **Step 4: Add tests for synthesis deduplication**

These behaviors exist in code but have no tests. Add to `packages/core/tests/test_engine.py`:

```python
from argus_core.agents.synthesis_agent import _deduplicate


def test_deduplicate_removes_same_bucket():
    """Two findings on same file/line-bucket/category → keep highest severity."""
    high = _make_finding(severity="high", line_start=10, category="sql_injection", confidence=0.9)
    low = _make_finding(severity="low", line_start=12, category="sql_injection", confidence=0.7)
    result = _deduplicate([high, low])
    assert len(result) == 1
    assert result[0].severity == "high"


def test_deduplicate_keeps_different_categories():
    """Same file/line-bucket but different category → both kept."""
    f1 = _make_finding(severity="high", line_start=10, category="sql_injection", confidence=0.9)
    f2 = _make_finding(severity="high", line_start=10, category="error_handling", confidence=0.9)
    result = _deduplicate([f1, f2])
    assert len(result) == 2


def test_deduplicate_empty():
    assert _deduplicate([]) == []
```

- [ ] **Step 5: Run full core test suite**

```bash
uv run pytest packages/core/tests/ -v
```

Expected: 13 tests pass, 0 failures.

- [ ] **Step 6: Fix github_client.py typo**

In `packages/cli/argus_cli/github_client.py`, the `_format_finding_comment` function has `{f.title}}` (extra closing brace). Fix it:

Find line with `f"{severity_emoji} **{f.severity.upper()}: {f.title}}**\\n\\n"` and remove the extra `}`:
```python
    return (
        f"{severity_emoji} **{f.severity.upper()}: {f.title}**\n\n"
        f"{f.description}\n\n"
        f"**Why it matters:** {f.why_it_matters}\n\n"
        f"**Suggested fix:**\n```\n{f.suggested_fix}\n```\n\n"
        f"*Confidence: {f.confidence:.0%} · Agent: {f.agent}*"
    )
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/tests/test_engine.py packages/cli/argus_cli/github_client.py
git commit -m "fix: correct CoreConfig import in tests, fix github_client typo"
```

---

## Module 2: CLI — review, history, config Commands

**Goal:** Implement the three stub CLI commands so `argus review`, `argus history`, and `argus config` fully work. Test each command's logic with unit tests (no real LLM calls).

**Files:**
- Implement: `packages/cli/argus_cli/commands/review_cmd.py`
- Implement: `packages/cli/argus_cli/commands/history_cmd.py`
- Implement: `packages/cli/argus_cli/commands/config_cmd.py`
- Create: `packages/cli/tests/__init__.py`
- Create: `packages/cli/tests/test_review_cmd.py`
- Create: `packages/cli/tests/test_history_cmd.py`
- Create: `packages/cli/tests/test_config_cmd.py`

---

### Task 2a: Implement `review_cmd.py`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/tests/__init__.py` (empty) and `packages/cli/tests/test_review_cmd.py`:

```python
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from typer.testing import CliRunner

from argus_cli.app import app
from argus_core.models import ReviewResult


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
                result = runner.invoke(
                    app, ["review", "--file", str(diff_file)]
                )

    assert result.exit_code == 1
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
uv run pytest packages/cli/tests/test_review_cmd.py -v 2>&1 | head -30
```

Expected: errors about `_diff_file` not importable from `review_cmd` (since it's a stub).

- [ ] **Step 3: Implement `review_cmd.py`**

Replace `packages/cli/argus_cli/commands/review_cmd.py` with:

```python
from __future__ import annotations

import asyncio
import json
import re
import subprocess
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console

from argus_cli.commands.init_cmd import load_config
from argus_cli.display import show_review_result
from argus_cli.github_client import GitHubClient
from argus_cli.local_db import save_review
from argus_core.config import CoreConfig
from argus_core.engine import ReviewEngine
from argus_core.models import ReviewResult

console = Console()


def review_command(
    pr: Optional[int] = typer.Option(None, "--pr", help="Review a specific PR number"),
    file: Optional[Path] = typer.Option(None, "--file", "-f", help="Review a single file"),
    repo: Optional[str] = typer.Option(None, "--repo", help="GitHub repo (owner/name)"),
    github_comment: bool = typer.Option(False, "--github-comment", help="Post findings to GitHub"),
    output_json: Optional[Path] = typer.Option(None, "--output-json", help="Write result as JSON"),
) -> None:
    """Review code using AI agents."""
    asyncio.run(
        _run_review(
            pr=pr,
            file=file,
            repo=repo,
            github_comment=github_comment,
            output_json=output_json,
        )
    )


async def _run_review(
    pr: int | None,
    file: Path | None,
    repo: str | None,
    github_comment: bool,
    output_json: Path | None,
) -> None:
    cfg = load_config()
    core_config = _build_core_config(cfg)
    engine = ReviewEngine(core_config)

    metadata: dict = {}

    if file:
        raw_diff = _diff_file(file)
        title = f"File review: {file}"
    elif pr:
        token = cfg.get("github_token") or ""
        if not token:
            console.print("[red]Error: GitHub token required for --pr. Run `argus init`.[/red]")
            raise typer.Exit(1)
        repo = repo or _detect_repo()
        if not repo:
            console.print("[red]Error: Could not detect repo. Pass --repo owner/name.[/red]")
            raise typer.Exit(1)
        gh = GitHubClient(token)
        console.print(f"[dim]Fetching PR #{pr} from {repo}…[/dim]")
        raw_diff = await gh.get_pr_diff(repo, pr)
        pr_meta = await gh.get_pr_metadata(repo, pr)
        metadata = {
            "pr_title": pr_meta.get("title", ""),
            "head_sha": pr_meta.get("head", {}).get("sha", ""),
        }
        title = f"PR #{pr}: {metadata.get('pr_title', '')}"
    else:
        raw_diff = _git_diff_local()
        title = "Local diff vs main"

    console.print("[dim]Running review…[/dim]")
    result = await engine.review_diff(raw_diff)
    show_review_result(result, title=title)

    if pr:
        row_id = await save_review(
            result,
            pr_number=pr,
            pr_title=metadata.get("pr_title"),
            repo=repo,
        )
        console.print(f"[dim]Saved as review #{row_id}[/dim]")

    if output_json:
        _write_json(output_json, result, metadata)

    if github_comment and pr and repo:
        token = cfg.get("github_token") or ""
        gh = GitHubClient(token)
        head_sha = metadata.get("head_sha", "")
        for finding in result.findings:
            await gh.post_review_comment(repo, pr, head_sha, finding)
        await gh.post_summary_comment(repo, pr, result)
        if head_sha:
            await gh.set_commit_status(repo, head_sha, result.score)
        console.print("[green]✓ Posted findings to GitHub[/green]")

    has_blocking = any(f.severity in ("critical", "high") for f in result.findings)
    if has_blocking:
        raise typer.Exit(1)


def _build_core_config(cfg: dict) -> CoreConfig:
    import os
    overrides: dict = {}
    if cfg.get("llm_backend"):
        overrides["llm_backend"] = cfg["llm_backend"]
    if cfg.get("ollama_base_url"):
        overrides["ollama_base_url"] = cfg["ollama_base_url"]
    if cfg.get("ollama_model"):
        overrides["ollama_model"] = cfg["ollama_model"]
    if cfg.get("anthropic_api_key"):
        os.environ.setdefault("ANTHROPIC_API_KEY", cfg["anthropic_api_key"])
    if cfg.get("anthropic_model"):
        overrides["anthropic_model"] = cfg["anthropic_model"]
    return CoreConfig(**overrides)


def _git_diff_local() -> str:
    result = subprocess.run(
        ["git", "diff", "main...HEAD"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 and not result.stdout:
        result = subprocess.run(
            ["git", "diff", "origin/main...HEAD"],
            capture_output=True,
            text=True,
        )
    return result.stdout


def _diff_file(path: Path) -> str:
    result = subprocess.run(
        ["git", "diff", "--no-index", "/dev/null", str(path)],
        capture_output=True,
        text=True,
    )
    return result.stdout


def _detect_repo() -> str | None:
    result = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        capture_output=True,
        text=True,
    )
    url = result.stdout.strip()
    m = re.search(r"github\.com[:/]([^/]+/[^/.]+?)(?:\.git)?$", url)
    return m.group(1) if m else None


def _write_json(path: Path, result: ReviewResult, metadata: dict) -> None:
    from dataclasses import asdict
    data = {
        "score": result.score,
        "total_findings": len(result.findings),
        "total_chunks_processed": result.total_chunks_processed,
        "errors": result.errors,
        "findings": [asdict(f) for f in result.findings],
        **metadata,
    }
    path.write_text(json.dumps(data, indent=2))
```

- [ ] **Step 4: Run review tests**

```bash
uv run pytest packages/cli/tests/test_review_cmd.py -v
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/argus_cli/commands/review_cmd.py \
        packages/cli/tests/__init__.py \
        packages/cli/tests/test_review_cmd.py
git commit -m "feat: implement review_cmd with file/PR/local review modes"
```

---

### Task 2b: Implement `history_cmd.py`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/tests/test_history_cmd.py`:

```python
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from typer.testing import CliRunner

from argus_cli.app import app

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
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run pytest packages/cli/tests/test_history_cmd.py -v 2>&1 | head -20
```

Expected: ImportError or attribute errors (history_cmd body is `pass`).

- [ ] **Step 3: Implement `history_cmd.py`**

Replace `packages/cli/argus_cli/commands/history_cmd.py`:

```python
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
```

- [ ] **Step 4: Run history tests**

```bash
uv run pytest packages/cli/tests/test_history_cmd.py -v
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/argus_cli/commands/history_cmd.py \
        packages/cli/tests/test_history_cmd.py
git commit -m "feat: implement history_cmd with list and detail views"
```

---

### Task 2c: Implement `config_cmd.py`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/tests/test_config_cmd.py`:

```python
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from typer.testing import CliRunner

from argus_cli.app import app

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
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run pytest packages/cli/tests/test_config_cmd.py -v 2>&1 | head -20
```

Expected: failures (config_cmd is a stub).

- [ ] **Step 3: Implement `config_cmd.py`**

Replace `packages/cli/argus_cli/commands/config_cmd.py`:

```python
from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer
import yaml
from rich.console import Console
from rich.syntax import Syntax

console = Console()
CONFIG_PATH = Path.home() / ".argus" / "config.yml"


def config_command(
    set_key: Optional[str] = typer.Option(None, "--set", help="Set key=value"),
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
```

- [ ] **Step 4: Run config tests**

```bash
uv run pytest packages/cli/tests/test_config_cmd.py -v
```

Expected: all 4 tests pass.

- [ ] **Step 5: Run full CLI test suite**

```bash
uv run pytest packages/cli/tests/ -v
```

Expected: all tests pass (7 total across 3 files).

- [ ] **Step 6: Commit**

```bash
git add packages/cli/argus_cli/commands/config_cmd.py \
        packages/cli/tests/test_config_cmd.py
git commit -m "feat: implement config_cmd view and set"
```

---

## Module 3: API — SQLAlchemy Models + Alembic Migration

**Goal:** Replace stub model files with real SQLAlchemy 2.0 `Mapped[]` models sharing a single `Base`. Implement the Alembic migration so `alembic upgrade head` creates all 5 tables.

**Files:**
- Rewrite: `packages/api/argus_api/models/organization.py`
- Rewrite: `packages/api/argus_api/models/user.py`
- Rewrite: `packages/api/argus_api/models/repository.py`
- Rewrite: `packages/api/argus_api/models/review.py`
- Rewrite: `packages/api/argus_api/models/finding.py`
- Rewrite: `packages/api/argus_api/models/__init__.py`
- Rewrite: `packages/api/alembic/versions/0001_initial_schema.py`
- Create: `packages/api/tests/__init__.py`
- Create: `packages/api/tests/test_models.py`

---

- [ ] **Step 1: Write failing tests**

Create `packages/api/tests/__init__.py` (empty) and `packages/api/tests/test_models.py`:

```python
from __future__ import annotations

import asyncio
import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from argus_api.models import Organization, Repository, Review, Finding


DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def engine():
    from argus_api.database import Base
    eng = create_async_engine(DATABASE_URL, echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session(engine):
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    async with SessionLocal() as s:
        yield s
        await s.rollback()


@pytest.mark.asyncio
async def test_create_org_and_repo(session: AsyncSession):
    org = Organization(name="acme", github_org_login="acme")
    session.add(org)
    await session.flush()

    repo = Repository(
        org_id=org.id,
        github_repo_id="12345",
        full_name="acme/backend",
    )
    session.add(repo)
    await session.flush()

    assert repo.id is not None
    assert repo.org_id == org.id


@pytest.mark.asyncio
async def test_create_review_and_finding(session: AsyncSession):
    org = Organization(name="test-org", github_org_login="test-org")
    session.add(org)
    await session.flush()

    repo = Repository(
        org_id=org.id,
        github_repo_id="99999",
        full_name="test-org/repo",
    )
    session.add(repo)
    await session.flush()

    review = Review(
        repo_id=repo.id,
        pr_number=1,
        pr_title="Test PR",
        status="pending",
    )
    session.add(review)
    await session.flush()

    finding = Finding(
        review_id=review.id,
        file_path="main.py",
        line_start=10,
        line_end=12,
        severity="high",
        category="sql_injection",
        confidence=0.9,
        title="SQL Injection",
        description="desc",
        why_it_matters="matters",
        suggested_fix="fix",
        agent="security",
    )
    session.add(finding)
    await session.commit()

    assert finding.id is not None
    assert finding.is_resolved is False
```

Add `aiosqlite` dev dependency:
```bash
uv add --dev aiosqlite pytest-asyncio
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run pytest packages/api/tests/test_models.py -v 2>&1 | head -30
```

Expected: ImportError — models don't export anything real yet.

- [ ] **Step 3: Implement `models/__init__.py`**

Replace `packages/api/argus_api/models/__init__.py`:

```python
from argus_api.models.organization import Organization
from argus_api.models.repository import Repository
from argus_api.models.review import Review
from argus_api.models.user import User
from argus_api.models.finding import Finding

__all__ = ["Organization", "Repository", "Review", "User", "Finding"]
```

- [ ] **Step 4: Implement `models/organization.py`**

Replace `packages/api/argus_api/models/organization.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from argus_api.database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    github_org_login: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    plan: Mapped[str] = mapped_column(String(50), default="free")
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    users: Mapped[list["User"]] = relationship("User", back_populates="organization")
    repositories: Mapped[list["Repository"]] = relationship("Repository", back_populates="organization")
```

- [ ] **Step 5: Implement `models/user.py`**

Replace `packages/api/argus_api/models/user.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from argus_api.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    github_login: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50), default="member")
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    organization: Mapped["Organization"] = relationship("Organization", back_populates="users")
    triggered_reviews: Mapped[list["Review"]] = relationship("Review", back_populates="triggered_by_user")
```

- [ ] **Step 6: Implement `models/repository.py`**

Replace `packages/api/argus_api/models/repository.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from argus_api.database import Base


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    github_repo_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    default_branch: Mapped[str] = mapped_column(String(255), default="main")
    is_active: Mapped[bool] = mapped_column(default=True)
    config: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    organization: Mapped["Organization"] = relationship("Organization", back_populates="repositories")
    reviews: Mapped[list["Review"]] = relationship("Review", back_populates="repository")
```

- [ ] **Step 7: Implement `models/review.py`**

Replace `packages/api/argus_api/models/review.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from argus_api.database import Base


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    repo_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("repositories.id"), nullable=False)
    triggered_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    trigger_type: Mapped[str] = mapped_column(String(50), default="webhook")
    pr_number: Mapped[int | None]
    pr_title: Mapped[str | None] = mapped_column(String(500))
    base_sha: Mapped[str | None] = mapped_column(String(40))
    head_sha: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    score: Mapped[int | None]
    total_findings: Mapped[int] = mapped_column(default=0)
    started_at: Mapped[datetime | None]
    completed_at: Mapped[datetime | None]

    repository: Mapped["Repository"] = relationship("Repository", back_populates="reviews")
    triggered_by_user: Mapped["User | None"] = relationship("User", back_populates="triggered_reviews")
    findings: Mapped[list["Finding"]] = relationship("Finding", back_populates="review", cascade="all, delete-orphan")
```

- [ ] **Step 8: Implement `models/finding.py`**

Replace `packages/api/argus_api/models/finding.py`:

```python
from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from argus_api.database import Base


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    review_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reviews.id"), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    line_start: Mapped[int]
    line_end: Mapped[int]
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    confidence: Mapped[float]
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text)
    why_it_matters: Mapped[str] = mapped_column(Text)
    suggested_fix: Mapped[str] = mapped_column(Text)
    agent: Mapped[str] = mapped_column(String(50))
    is_resolved: Mapped[bool] = mapped_column(default=False)

    review: Mapped["Review"] = relationship("Review", back_populates="findings")
```

- [ ] **Step 9: Run model tests**

```bash
uv run pytest packages/api/tests/test_models.py -v
```

Expected: both tests pass.

- [ ] **Step 10: Implement the Alembic migration**

Replace the body of `packages/api/alembic/versions/0001_initial_schema.py`:

```python
"""Initial schema: organizations, users, repositories, reviews, findings

Revision ID: 0001
Revises:
Create Date: 2026-04-20
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("github_org_login", sa.String(255), nullable=False, unique=True),
        sa.Column("plan", sa.String(50), nullable=False, server_default="free"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_orgs_login", "organizations", ["github_org_login"], unique=True)

    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("org_id", sa.UUID(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("github_login", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255)),
        sa.Column("role", sa.String(50), nullable=False, server_default="member"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_org_login", "users", ["org_id", "github_login"], unique=True)

    op.create_table(
        "repositories",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("org_id", sa.UUID(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("github_repo_id", sa.String(100), nullable=False, unique=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("default_branch", sa.String(255), nullable=False, server_default="main"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("config", sa.JSON()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_repos_github_id", "repositories", ["github_repo_id"], unique=True)

    op.create_table(
        "reviews",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("repo_id", sa.UUID(), sa.ForeignKey("repositories.id"), nullable=False),
        sa.Column("triggered_by", sa.UUID(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("trigger_type", sa.String(50), nullable=False, server_default="webhook"),
        sa.Column("pr_number", sa.Integer()),
        sa.Column("pr_title", sa.String(500)),
        sa.Column("base_sha", sa.String(40)),
        sa.Column("head_sha", sa.String(40)),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("score", sa.Integer()),
        sa.Column("total_findings", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime()),
        sa.Column("completed_at", sa.DateTime()),
    )
    op.create_index("ix_reviews_repo_status", "reviews", ["repo_id", "status"])
    op.create_index("ix_reviews_pr_number", "reviews", ["pr_number"])

    op.create_table(
        "findings",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("review_id", sa.UUID(), sa.ForeignKey("reviews.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("line_start", sa.Integer(), nullable=False),
        sa.Column("line_end", sa.Integer(), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("why_it_matters", sa.Text()),
        sa.Column("suggested_fix", sa.Text()),
        sa.Column("agent", sa.String(50)),
        sa.Column("is_resolved", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_index("ix_findings_review_severity", "findings", ["review_id", "severity"])
    op.create_index("ix_findings_file_path", "findings", ["file_path"])


def downgrade() -> None:
    op.drop_table("findings")
    op.drop_table("reviews")
    op.drop_table("repositories")
    op.drop_table("users")
    op.drop_table("organizations")
```

- [ ] **Step 11: Commit**

```bash
git add packages/api/argus_api/models/ \
        packages/api/alembic/versions/0001_initial_schema.py \
        packages/api/tests/__init__.py \
        packages/api/tests/test_models.py
git commit -m "feat: implement SQLAlchemy models and Alembic migration"
```

---

## Module 4: API — Pydantic Schemas

**Goal:** Replace stub schema files with proper Pydantic v2 `from_attributes=True` models. These are used by the FastAPI routers.

**Files:**
- Rewrite: `packages/api/argus_api/schemas/finding.py`
- Rewrite: `packages/api/argus_api/schemas/review.py`
- Rewrite: `packages/api/argus_api/schemas/repository.py`
- Create: `packages/api/tests/test_schemas.py`

---

- [ ] **Step 1: Write failing tests**

Create `packages/api/tests/test_schemas.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime

from argus_api.schemas.finding import FindingOut, FindingPatch
from argus_api.schemas.review import ReviewOut, ReviewListOut
from argus_api.schemas.repository import RepositoryOut


def test_finding_out_from_dict():
    data = {
        "id": uuid.uuid4(),
        "review_id": uuid.uuid4(),
        "file_path": "main.py",
        "line_start": 10,
        "line_end": 12,
        "severity": "high",
        "category": "sql_injection",
        "confidence": 0.9,
        "title": "SQL Injection",
        "description": "desc",
        "why_it_matters": "matters",
        "suggested_fix": "fix",
        "agent": "security",
        "is_resolved": False,
    }
    finding = FindingOut(**data)
    assert finding.severity == "high"


def test_finding_patch_validation():
    p = FindingPatch(is_resolved=True)
    assert p.is_resolved is True


def test_review_list_out():
    review_id = uuid.uuid4()
    repo_id = uuid.uuid4()
    data = {
        "items": [
            {
                "id": review_id,
                "repo_id": repo_id,
                "trigger_type": "webhook",
                "pr_number": 1,
                "pr_title": "Test",
                "base_sha": None,
                "head_sha": None,
                "status": "completed",
                "score": 85,
                "total_findings": 2,
                "started_at": None,
                "completed_at": None,
                "findings": [],
            }
        ],
        "total": 1,
        "page": 1,
        "page_size": 20,
    }
    out = ReviewListOut(**data)
    assert out.total == 1
    assert out.items[0].score == 85
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run pytest packages/api/tests/test_schemas.py -v 2>&1 | head -20
```

Expected: validation errors (schemas are stubs).

- [ ] **Step 3: Implement `schemas/finding.py`**

Replace `packages/api/argus_api/schemas/finding.py`:

```python
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict


class FindingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    review_id: uuid.UUID
    file_path: str
    line_start: int
    line_end: int
    severity: str
    category: str
    confidence: float
    title: str
    description: str
    why_it_matters: str
    suggested_fix: str
    agent: str
    is_resolved: bool


class FindingPatch(BaseModel):
    is_resolved: bool
```

- [ ] **Step 4: Implement `schemas/review.py`**

Replace `packages/api/argus_api/schemas/review.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from argus_api.schemas.finding import FindingOut


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    repo_id: uuid.UUID
    trigger_type: str
    pr_number: int | None
    pr_title: str | None
    base_sha: str | None
    head_sha: str | None
    status: str
    score: int | None
    total_findings: int
    started_at: datetime | None
    completed_at: datetime | None
    findings: list[FindingOut] = []


class ReviewListOut(BaseModel):
    items: list[ReviewOut]
    total: int
    page: int
    page_size: int
```

- [ ] **Step 5: Implement `schemas/repository.py`**

Replace `packages/api/argus_api/schemas/repository.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RepositoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    github_repo_id: str
    full_name: str
    default_branch: str
    is_active: bool
    created_at: datetime
```

- [ ] **Step 6: Run schema tests**

```bash
uv run pytest packages/api/tests/test_schemas.py -v
```

Expected: all 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/api/argus_api/schemas/ packages/api/tests/test_schemas.py
git commit -m "feat: implement Pydantic v2 schemas for API responses"
```

---

## Module 5: API — Routers + Celery Task

**Goal:** Implement all four routers (health, webhooks, reviews, repositories) and the Celery `run_review_task`. Register routers in `main.py`.

**Files:**
- Rewrite: `packages/api/argus_api/routers/health.py`
- Rewrite: `packages/api/argus_api/routers/reviews.py`
- Rewrite: `packages/api/argus_api/routers/repositories.py`
- Rewrite: `packages/api/argus_api/routers/webhooks.py`
- Rewrite: `packages/api/argus_api/tasks/review_task.py`
- Rewrite: `packages/api/argus_api/main.py`
- Create: `packages/api/tests/test_routers.py`

---

### Task 5a: health, reviews, repositories routers + main.py wiring

- [ ] **Step 1: Write failing tests**

Create `packages/api/tests/test_routers.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from argus_api.main import app


@pytest.mark.asyncio
async def test_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_list_reviews_empty():
    from argus_api.database import Base, engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/reviews")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


@pytest.mark.asyncio
async def test_list_repositories_empty():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/repositories")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_get_review_not_found():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/api/v1/reviews/{uuid.uuid4()}")
    assert resp.status_code == 404
```

Set up test DB URL as SQLite in-memory by patching settings. Add to the test file top:

```python
import os
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
```

And add `httpx>=0.27` to test dependencies if not present.

- [ ] **Step 2: Run to confirm failure**

```bash
uv run pytest packages/api/tests/test_routers.py::test_health -v 2>&1 | head -25
```

Expected: 404 (no routes registered) or startup error.

- [ ] **Step 3: Implement `routers/health.py`**

Replace `packages/api/argus_api/routers/health.py`:

```python
from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok"})
```

- [ ] **Step 4: Implement `routers/reviews.py`**

Replace `packages/api/argus_api/routers/reviews.py`:

```python
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from argus_api.database import get_session
from argus_api.models.finding import Finding
from argus_api.models.review import Review
from argus_api.schemas.finding import FindingOut, FindingPatch
from argus_api.schemas.review import ReviewListOut, ReviewOut

router = APIRouter(prefix="/api/v1/reviews", tags=["reviews"])


@router.get("", response_model=ReviewListOut)
async def list_reviews(
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> ReviewListOut:
    offset = (page - 1) * page_size
    query = select(Review).options(selectinload(Review.findings))
    count_query = select(func.count()).select_from(Review)

    if status:
        query = query.where(Review.status == status)
        count_query = count_query.where(Review.status == status)

    total = (await session.execute(count_query)).scalar_one()
    rows = (
        await session.execute(
            query.order_by(Review.started_at.desc()).offset(offset).limit(page_size)
        )
    ).scalars().all()

    return ReviewListOut(items=list(rows), total=total, page=page, page_size=page_size)


@router.get("/{review_id}", response_model=ReviewOut)
async def get_review(
    review_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> Review:
    row = (
        await session.execute(
            select(Review)
            .options(selectinload(Review.findings))
            .where(Review.id == review_id)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Review not found")
    return row


@router.patch("/{review_id}/findings/{finding_id}", response_model=FindingOut)
async def patch_finding(
    review_id: uuid.UUID,
    finding_id: uuid.UUID,
    body: FindingPatch,
    session: AsyncSession = Depends(get_session),
) -> Finding:
    finding = (
        await session.execute(
            select(Finding).where(
                Finding.id == finding_id, Finding.review_id == review_id
            )
        )
    ).scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    finding.is_resolved = body.is_resolved
    await session.commit()
    await session.refresh(finding)
    return finding
```

- [ ] **Step 5: Implement `routers/repositories.py`**

Replace `packages/api/argus_api/routers/repositories.py`:

```python
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from argus_api.database import get_session
from argus_api.models.repository import Repository
from argus_api.schemas.repository import RepositoryOut

router = APIRouter(prefix="/api/v1/repositories", tags=["repositories"])


@router.get("", response_model=list[RepositoryOut])
async def list_repositories(
    session: AsyncSession = Depends(get_session),
) -> list[Repository]:
    rows = (
        await session.execute(select(Repository).where(Repository.is_active.is_(True)))
    ).scalars().all()
    return list(rows)


@router.get("/{repo_id}", response_model=RepositoryOut)
async def get_repository(
    repo_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> Repository:
    row = (
        await session.execute(select(Repository).where(Repository.id == repo_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Repository not found")
    return row
```

- [ ] **Step 6: Wire routers in `main.py`**

Replace `packages/api/argus_api/main.py`:

```python
from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from argus_api.config import settings
from argus_api.database import init_db
from argus_api.routers.health import router as health_router
from argus_api.routers.repositories import router as repos_router
from argus_api.routers.reviews import router as reviews_router
from argus_api.routers.webhooks import router as webhooks_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    await init_db()
    yield


app = FastAPI(title="Argus API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(webhooks_router)
app.include_router(reviews_router)
app.include_router(repos_router)
```

- [ ] **Step 7: Run router tests**

```bash
uv run pytest packages/api/tests/test_routers.py -v
```

Expected: all 4 tests pass.

---

### Task 5b: Webhooks router

- [ ] **Step 1: Write failing tests**

Add to `packages/api/tests/test_routers.py`:

```python
import hashlib
import hmac
import json as _json


@pytest.mark.asyncio
async def test_webhook_ignores_non_pr_event():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/webhooks/github",
            content=b"{}",
            headers={"X-GitHub-Event": "push", "X-GitHub-Delivery": str(uuid.uuid4())},
        )
    assert resp.status_code == 202
    assert resp.json()["status"] == "ignored"


@pytest.mark.asyncio
async def test_webhook_pr_opened_enqueues_task():
    payload = {
        "action": "opened",
        "pull_request": {
            "number": 1,
            "title": "Test PR",
            "url": "https://api.github.com/repos/owner/repo/pulls/1",
            "head": {"sha": "abc123"},
            "base": {"sha": "def456"},
        },
        "repository": {
            "id": 123456,
            "full_name": "owner/repo",
            "default_branch": "main",
            "owner": {"login": "owner"},
        },
    }
    body = _json.dumps(payload).encode()
    delivery_id = str(uuid.uuid4())

    with patch("argus_api.routers.webhooks.run_review_task") as mock_task:
        mock_task.delay.return_value.id = "fake-task-id"
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/webhooks/github",
                content=body,
                headers={
                    "X-GitHub-Event": "pull_request",
                    "X-GitHub-Delivery": delivery_id,
                    "Content-Type": "application/json",
                },
            )
    assert resp.status_code == 202
    assert resp.json()["status"] == "queued"
```

- [ ] **Step 2: Implement `routers/webhooks.py`**

Replace `packages/api/argus_api/routers/webhooks.py`:

```python
from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timedelta

import redis.asyncio as aioredis
from fastapi import APIRouter, Header, HTTPException, Request
from sqlalchemy import select

from argus_api.config import settings
from argus_api.database import AsyncSessionLocal
from argus_api.models.organization import Organization
from argus_api.models.repository import Repository
from argus_api.models.review import Review
from argus_api.tasks.review_task import run_review_task

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

_redis: aioredis.Redis | None = None


def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


@router.post("/github", status_code=202)
async def github_webhook(
    request: Request,
    x_hub_signature_256: str | None = Header(None),
    x_github_event: str | None = Header(None),
    x_github_delivery: str | None = Header(None),
) -> dict:
    body = await request.body()

    if settings.github_webhook_secret:
        _verify_signature(body, x_hub_signature_256 or "")

    if x_github_delivery:
        r = _get_redis()
        key = f"webhook:delivery:{x_github_delivery}"
        if await r.exists(key):
            return {"status": "duplicate", "delivery": x_github_delivery}
        await r.setex(key, int(timedelta(hours=24).total_seconds()), "1")

    if x_github_event != "pull_request":
        return {"status": "ignored", "event": x_github_event}

    payload = json.loads(body)
    action = payload.get("action")
    if action not in ("opened", "synchronize", "reopened"):
        return {"status": "ignored", "action": action}

    pr = payload["pull_request"]
    repo_data = payload["repository"]

    async with AsyncSessionLocal() as session:
        org_login = repo_data.get("owner", {}).get("login", "unknown")
        org = (
            await session.execute(
                select(Organization).where(Organization.github_org_login == org_login)
            )
        ).scalar_one_or_none()
        if not org:
            org = Organization(name=org_login, github_org_login=org_login)
            session.add(org)
            await session.flush()

        gh_repo_id = str(repo_data["id"])
        repo = (
            await session.execute(
                select(Repository).where(Repository.github_repo_id == gh_repo_id)
            )
        ).scalar_one_or_none()
        if not repo:
            repo = Repository(
                org_id=org.id,
                github_repo_id=gh_repo_id,
                full_name=repo_data["full_name"],
                default_branch=repo_data.get("default_branch", "main"),
            )
            session.add(repo)
            await session.flush()

        review = Review(
            repo_id=repo.id,
            trigger_type="webhook",
            pr_number=pr["number"],
            pr_title=pr.get("title", ""),
            base_sha=pr.get("base", {}).get("sha"),
            head_sha=pr.get("head", {}).get("sha"),
            status="pending",
            started_at=datetime.utcnow(),
        )
        session.add(review)
        await session.commit()

    task = run_review_task.delay(
        review_id=str(review.id),
        pr_diff_url=pr.get("url", ""),
        head_sha=pr.get("head", {}).get("sha", ""),
        repo_full_name=repo_data["full_name"],
    )

    return {"status": "queued", "review_id": str(review.id), "task_id": task.id}


def _verify_signature(body: bytes, signature: str) -> None:
    secret = settings.github_webhook_secret.encode()
    expected = "sha256=" + hmac.new(secret, body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
```

- [ ] **Step 3: Implement `tasks/review_task.py`**

Replace `packages/api/argus_api/tasks/review_task.py`:

```python
from __future__ import annotations

import asyncio
from datetime import datetime

import httpx
from sqlalchemy import select

from argus_api.config import settings
from argus_api.database import AsyncSessionLocal
from argus_api.models.finding import Finding as FindingModel
from argus_api.models.review import Review
from argus_api.tasks.celery_app import celery_app
from argus_core.config import CoreConfig
from argus_core.engine import ReviewEngine


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def run_review_task(
    self,
    review_id: str,
    pr_diff_url: str,
    head_sha: str,
    repo_full_name: str,
) -> None:
    """Fetch diff, run the review engine, persist findings, post GitHub comments."""
    try:
        asyncio.run(
            _async_run_review(
                review_id=review_id,
                pr_diff_url=pr_diff_url,
                head_sha=head_sha,
                repo_full_name=repo_full_name,
            )
        )
    except Exception as exc:
        asyncio.run(_mark_failed(review_id, str(exc)))
        raise self.retry(exc=exc)


async def _async_run_review(
    review_id: str,
    pr_diff_url: str,
    head_sha: str,
    repo_full_name: str,
) -> None:
    await _update_review_status(review_id, "running", started_at=datetime.utcnow())

    token = settings.github_token
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3.diff",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get(pr_diff_url, headers=headers, follow_redirects=True)
        resp.raise_for_status()
        raw_diff = resp.text

    core_cfg = CoreConfig(
        llm_backend=settings.argus_llm_backend,  # type: ignore[arg-type]
        ollama_base_url=settings.argus_ollama_base_url,
        ollama_model=settings.argus_ollama_model,
        anthropic_api_key=settings.anthropic_api_key or None,
        anthropic_model=settings.argus_anthropic_model,
    )
    engine = ReviewEngine(core_cfg)
    result = await engine.review_diff(raw_diff)

    import uuid

    review_uuid = uuid.UUID(review_id)
    async with AsyncSessionLocal() as session:
        for f in result.findings:
            session.add(
                FindingModel(
                    review_id=review_uuid,
                    file_path=f.file_path,
                    line_start=f.line_start,
                    line_end=f.line_end,
                    severity=f.severity,
                    category=f.category,
                    confidence=f.confidence,
                    title=f.title,
                    description=f.description,
                    why_it_matters=f.why_it_matters,
                    suggested_fix=f.suggested_fix,
                    agent=f.agent,
                )
            )
        stmt = select(Review).where(Review.id == review_uuid)
        db_review = (await session.execute(stmt)).scalar_one()
        db_review.status = "completed"
        db_review.score = result.score
        db_review.total_findings = len(result.findings)
        db_review.completed_at = datetime.utcnow()
        await session.commit()


async def _update_review_status(review_id: str, status: str, **kwargs: object) -> None:
    import uuid

    review_uuid = uuid.UUID(review_id)
    async with AsyncSessionLocal() as session:
        stmt = select(Review).where(Review.id == review_uuid)
        db_review = (await session.execute(stmt)).scalar_one_or_none()
        if db_review:
            db_review.status = status
            for k, v in kwargs.items():
                setattr(db_review, k, v)
            await session.commit()


async def _mark_failed(review_id: str, error: str) -> None:
    await _update_review_status(review_id, "failed", completed_at=datetime.utcnow())
```

- [ ] **Step 4: Run all API tests**

```bash
uv run pytest packages/api/tests/ -v
```

Expected: all tests pass (models, schemas, routers, webhooks).

- [ ] **Step 5: Commit**

```bash
git add packages/api/argus_api/ packages/api/tests/
git commit -m "feat: implement all API routers, webhooks handler, and Celery review task"
```

---

## Module 6: Dashboard — React UI

**Goal:** Build the three pages (Feed, ReviewDetail, Analytics) and their supporting components/hooks so the dashboard renders real data from the API.

**Files:**
- Create: `packages/dashboard/src/components/Layout.tsx`
- Create: `packages/dashboard/src/components/FindingBadge.tsx`
- Create: `packages/dashboard/src/components/FindingCard.tsx`
- Create: `packages/dashboard/src/components/ScoreGauge.tsx`
- Create: `packages/dashboard/src/hooks/useReviews.ts`
- Create: `packages/dashboard/src/hooks/useReview.ts`
- Create: `packages/dashboard/src/pages/Feed.tsx`
- Create: `packages/dashboard/src/pages/ReviewDetail.tsx`
- Create: `packages/dashboard/src/pages/Analytics.tsx`
- Rewrite: `packages/dashboard/src/App.tsx`

---

- [ ] **Step 1: Install dashboard dependencies**

```bash
cd /Users/kdn_aisashwat/Documents/argus-review/packages/dashboard
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 2: Add react-router-dom to package.json**

The `package.json` already lists `react-router-dom`. Run:
```bash
npm install
```

Confirm `react-router-dom` appears in `node_modules`. If not, add explicitly:
```bash
npm install react-router-dom @tanstack/react-query recharts
```

- [ ] **Step 3: Create `src/components/FindingBadge.tsx`**

```tsx
import type { Severity } from '../api/types';

const STYLES: Record<Severity, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-red-400 text-white',
  medium: 'bg-yellow-400 text-black',
  low: 'bg-blue-300 text-black',
  info: 'bg-gray-200 text-gray-700',
};

interface Props {
  severity: Severity;
  className?: string;
}

export function FindingBadge({ severity, className = '' }: Props) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase ${STYLES[severity]} ${className}`}
    >
      {severity}
    </span>
  );
}
```

- [ ] **Step 4: Create `src/components/ScoreGauge.tsx`**

```tsx
interface Props {
  score: number;
  size?: number;
}

export function ScoreGauge({ score, size = 80 }: Props) {
  const radius = (size - 8) / 2;
  const circumference = Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg width={size} height={size / 2 + 4} viewBox={`0 0 ${size} ${size / 2 + 4}`}>
      <path
        d={`M 4 ${cy} A ${radius} ${radius} 0 0 1 ${size - 4} ${cy}`}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d={`M 4 ${cy} A ${radius} ${radius} 0 0 1 ${size - 4} ${cy}`}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
      />
      <text
        x={cx}
        y={cy - 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={size * 0.22}
        fontWeight="bold"
        fill={color}
      >
        {score}
      </text>
    </svg>
  );
}
```

- [ ] **Step 5: Create `src/components/FindingCard.tsx`**

```tsx
import { useState } from 'react';
import type { Finding } from '../api/types';
import { FindingBadge } from './FindingBadge';

interface Props {
  finding: Finding;
  onResolve?: (id: string) => void;
}

export function FindingCard({ finding, onResolve }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-lg border p-4 bg-white shadow-sm ${finding.is_resolved ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <FindingBadge severity={finding.severity} />
          <div>
            <p className="font-medium text-sm">{finding.title}</p>
            <p className="text-xs text-gray-500">
              {finding.file_path}:{finding.line_start}–{finding.line_end} ·{' '}
              {finding.category} · {Math.round(finding.confidence * 100)}% confidence
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            className="text-xs text-gray-400 hover:text-gray-700"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Collapse' : 'Details'}
          </button>
          {onResolve && !finding.is_resolved && (
            <button
              className="text-xs text-green-600 hover:text-green-800 font-medium"
              onClick={() => onResolve(finding.id)}
            >
              Resolve
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-gray-700">{finding.description}</p>
          <div>
            <p className="font-medium text-gray-600">Why it matters</p>
            <p className="text-gray-600">{finding.why_it_matters}</p>
          </div>
          <div>
            <p className="font-medium text-gray-600">Suggested fix</p>
            <pre className="mt-1 rounded bg-gray-50 p-2 text-xs overflow-auto whitespace-pre-wrap">
              {finding.suggested_fix}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create `src/components/Layout.tsx`**

```tsx
import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Reviews' },
  { to: '/analytics', label: 'Analytics' },
];

export function Layout() {
  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      <aside className="w-48 shrink-0 bg-gray-900 flex flex-col p-4 gap-2">
        <div className="text-xl font-bold text-white mb-6">Argus</div>
        {navItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `rounded px-3 py-2 text-sm transition-colors ${
                isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Create `src/hooks/useReviews.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export function useReviews(page = 1) {
  return useQuery({
    queryKey: ['reviews', page],
    queryFn: () => api.listReviews(page),
    refetchInterval: 10_000,
  });
}
```

- [ ] **Step 8: Create `src/hooks/useReview.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function useReview(id: string) {
  return useQuery({
    queryKey: ['review', id],
    queryFn: () => api.getReview(id),
    enabled: !!id,
  });
}

export function useResolveFinding(reviewId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) => api.resolveFinding(reviewId, findingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['review', reviewId] }),
  });
}
```

- [ ] **Step 9: Create `src/pages/Feed.tsx`**

```tsx
import { Link } from 'react-router-dom';
import type { Review, Severity } from '../api/types';
import { FindingBadge } from '../components/FindingBadge';
import { ScoreGauge } from '../components/ScoreGauge';
import { useReviews } from '../hooks/useReviews';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

function ReviewCard({ review }: { review: Review }) {
  const counts = SEVERITIES.reduce(
    (acc, s) => { acc[s] = review.findings.filter((f) => f.severity === s).length; return acc; },
    {} as Record<Severity, number>,
  );
  const statusColor: Record<string, string> = {
    completed: 'text-green-400',
    running: 'text-yellow-400',
    pending: 'text-gray-400',
    failed: 'text-red-400',
  };

  return (
    <Link to={`/reviews/${review.id}`} className="block rounded-lg bg-gray-800 p-4 hover:bg-gray-700 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-gray-400 mb-1">PR #{review.pr_number}</p>
          <h3 className="font-semibold text-white truncate">{review.pr_title ?? 'Untitled'}</h3>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
              <span key={s} className="flex items-center gap-1">
                <FindingBadge severity={s} />
                <span className="text-xs text-gray-400">{counts[s]}</span>
              </span>
            ))}
            <span className={`text-xs ${statusColor[review.status] ?? 'text-gray-400'}`}>
              {review.status}
            </span>
          </div>
        </div>
        {review.score !== null && (
          <div className="shrink-0"><ScoreGauge score={review.score} size={64} /></div>
        )}
      </div>
    </Link>
  );
}

export function Feed() {
  const { data, isLoading, error } = useReviews();
  if (isLoading) return <p className="text-gray-400">Loading…</p>;
  if (error) return <p className="text-red-400">Failed to load reviews.</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Review Feed</h1>
      {data?.items.length === 0 && (
        <p className="text-gray-400">No reviews yet. Connect a repo and open a PR.</p>
      )}
      <div className="space-y-3">
        {data?.items.map((r) => <ReviewCard key={r.id} review={r} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Create `src/pages/ReviewDetail.tsx`**

```tsx
import { useParams } from 'react-router-dom';
import type { Severity } from '../api/types';
import { FindingCard } from '../components/FindingCard';
import { ScoreGauge } from '../components/ScoreGauge';
import { useResolveFinding, useReview } from '../hooks/useReview';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export function ReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: review, isLoading } = useReview(id ?? '');
  const { mutate: resolve } = useResolveFinding(id ?? '');

  if (isLoading) return <p className="text-gray-400">Loading…</p>;
  if (!review) return <p className="text-red-400">Review not found.</p>;

  const counts = SEVERITIES.reduce(
    (acc, s) => { acc[s] = review.findings.filter((f) => f.severity === s).length; return acc; },
    {} as Record<Severity, number>,
  );

  const byFile = review.findings.reduce(
    (acc, f) => { (acc[f.file_path] ??= []).push(f); return acc; },
    {} as Record<string, typeof review.findings>,
  );

  return (
    <div>
      <div className="flex items-start gap-6 mb-8">
        {review.score !== null && <ScoreGauge score={review.score} size={100} />}
        <div>
          <p className="text-sm text-gray-400">PR #{review.pr_number}</p>
          <h1 className="text-xl font-bold text-white">{review.pr_title ?? 'Untitled'}</h1>
          <div className="flex gap-3 mt-2 flex-wrap">
            {SEVERITIES.map((s) =>
              counts[s] > 0 ? (
                <span key={s} className="text-sm text-gray-300">
                  <span className="font-semibold">{counts[s]}</span> {s}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>

      {Object.entries(byFile).map(([file, findings]) => (
        <div key={file} className="mb-6">
          <h2 className="text-sm font-mono text-gray-400 mb-2">{file}</h2>
          <div className="space-y-2">
            {findings.map((f) => (
              <FindingCard key={f.id} finding={f} onResolve={(fid) => resolve(fid)} />
            ))}
          </div>
        </div>
      ))}

      {review.findings.length === 0 && (
        <p className="text-green-400">✓ No findings — clean diff!</p>
      )}
    </div>
  );
}
```

- [ ] **Step 11: Create `src/pages/Analytics.tsx`**

```tsx
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useReviews } from '../hooks/useReviews';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626', high: '#f97316', medium: '#eab308', low: '#3b82f6', info: '#9ca3af',
};

export function Analytics() {
  const { data } = useReviews(1);
  const reviews = data?.items ?? [];

  const scoreTrend = reviews
    .filter((r) => r.score !== null)
    .slice().reverse()
    .map((r, i) => ({ name: `PR #${r.pr_number ?? i}`, score: r.score }));

  const severityCounts: Record<string, number> = {};
  for (const r of reviews) {
    for (const f of r.findings) {
      severityCounts[f.severity] = (severityCounts[f.severity] ?? 0) + 1;
    }
  }
  const severityData = Object.entries(severityCounts).map(([severity, count]) => ({ severity, count }));

  const fileCounts: Record<string, number> = {};
  for (const r of reviews) {
    for (const f of r.findings) {
      fileCounts[f.file_path] = (fileCounts[f.file_path] ?? 0) + 1;
    }
  }
  const topFiles = Object.entries(fileCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([file, count]) => ({ file: file.split('/').pop() ?? file, count }));

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold text-white">Analytics</h1>

      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Score Trend</h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={scoreTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <Tooltip contentStyle={{ background: '#1f2937', border: 'none', color: '#f3f4f6' }} />
            <Line type="monotone" dataKey="score" stroke="#22c55e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Findings by Severity</h2>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={severityData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="severity" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <Tooltip contentStyle={{ background: '#1f2937', border: 'none', color: '#f3f4f6' }} />
            <Bar dataKey="count">
              {severityData.map((entry) => (
                <Cell key={entry.severity} fill={SEVERITY_COLORS[entry.severity] ?? '#6b7280'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Most Flagged Files</h2>
        <ResponsiveContainer width="100%" height={Math.max(topFiles.length * 30, 100)}>
          <BarChart data={topFiles} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis dataKey="file" type="category" tick={{ fill: '#9ca3af', fontSize: 12 }} width={120} />
            <Tooltip contentStyle={{ background: '#1f2937', border: 'none', color: '#f3f4f6' }} />
            <Bar dataKey="count" fill="#6366f1" />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}
```

- [ ] **Step 12: Rewrite `src/App.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Analytics } from './pages/Analytics';
import { Feed } from './pages/Feed';
import { ReviewDetail } from './pages/ReviewDetail';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, retry: 1 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Feed />} />
            <Route path="/reviews/:id" element={<ReviewDetail />} />
            <Route path="/analytics" element={<Analytics />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 13: Build the dashboard to confirm no TypeScript errors**

```bash
cd /Users/kdn_aisashwat/Documents/argus-review/packages/dashboard
npm run build
```

Expected: `dist/` created, no errors, no TypeScript compile failures.

- [ ] **Step 14: Commit**

```bash
git add packages/dashboard/src/ packages/dashboard/package.json
git commit -m "feat: implement full dashboard UI with Feed, ReviewDetail, Analytics pages"
```

---

## Module 7: End-to-End Smoke Test

**Goal:** Run the entire stack locally and verify a complete flow: POST a webhook → Celery task runs → findings appear in API → dashboard renders them.

**Pre-requisites:** Docker installed, `.env` configured with at least `ANTHROPIC_API_KEY` or a running Ollama.

---

- [ ] **Step 1: Run full Python test suite**

```bash
cd /Users/kdn_aisashwat/Documents/argus-review
uv run pytest packages/core/tests/ packages/cli/tests/ packages/api/tests/ -v --tb=short
```

Expected: all tests pass, 0 failures.

- [ ] **Step 2: Start Docker Compose stack**

```bash
docker compose up -d --build
```

Expected: postgres, redis, ollama, api, worker all healthy.
Check logs: `docker compose logs api --tail=20` — should see "Application startup complete".

- [ ] **Step 3: Run Alembic migration**

```bash
docker compose exec api alembic upgrade head
```

Expected: `Running upgrade  -> 0001, Initial schema` (or already at head).

- [ ] **Step 4: Hit the health endpoint**

```bash
curl http://localhost:8000/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 5: Send a test webhook**

```bash
curl -X POST http://localhost:8000/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: $(uuidgen)" \
  -d '{
    "action": "opened",
    "pull_request": {
      "number": 1,
      "title": "Test PR",
      "url": "https://api.github.com/repos/test/repo/pulls/1",
      "head": {"sha": "abc123"},
      "base": {"sha": "def456"}
    },
    "repository": {
      "id": 999,
      "full_name": "test/repo",
      "default_branch": "main",
      "owner": {"login": "test"}
    }
  }'
```

Expected: `{"status":"queued","review_id":"<uuid>","task_id":"<task-id>"}`

- [ ] **Step 6: Check review status**

```bash
curl http://localhost:8000/api/v1/reviews | python3 -m json.tool
```

Expected: 1 review in `items[]` with `status` progressing from `pending` → `running` → `completed`.

- [ ] **Step 7: Start dashboard and open browser**

```bash
cd packages/dashboard
npm run dev
```

Open http://localhost:5173 — should see the Feed with the review card.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "chore: end-to-end verified, all modules complete"
git push origin claude/multi-agent-review-engine-oEuJz
```

---

## Appendix: Test commands at a glance

```bash
# Core
uv run pytest packages/core/tests/ -v

# CLI
uv run pytest packages/cli/tests/ -v

# API
uv run pytest packages/api/tests/ -v

# All Python
uv run pytest packages/ -v --tb=short

# Dashboard build
cd packages/dashboard && npm run build

# Lint + types (CI)
uv run ruff check packages/
uv run mypy packages/core/argus_core packages/cli/argus_cli packages/api/argus_api
```
