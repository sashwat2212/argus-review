# Diff Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store the raw unified diff per review in the DB and display it in a three-panel dashboard layout (findings / file diff / finding detail) with findings highlighted inline at the correct lines.

**Architecture:** Add a nullable `raw_diff TEXT` column to `reviews`, save it in the Celery task alongside findings, expose it in the API schema, then build a `DiffPanel` React component that uses `diff2html` to render the file-scoped diff with finding lines outlined, wired into an expanded three-panel `ReviewDetail` layout.

**Tech Stack:** Python/SQLAlchemy/Alembic (backend), FastAPI/Pydantic (API), React/TypeScript/Tailwind (frontend), `diff2html` (diff rendering)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `packages/api/argus_api/models/review.py` | Modify | Add `raw_diff` column |
| `packages/api/alembic/versions/0003_add_raw_diff.py` | Create | Migration |
| `packages/api/tests/test_models.py` | Modify | Test `raw_diff` persists |
| `packages/api/argus_api/tasks/review_task.py` | Modify | Save `raw_diff` in Celery task |
| `packages/api/argus_api/schemas/review.py` | Modify | Expose `raw_diff` in `ReviewOut` |
| `packages/api/tests/test_schemas.py` | Modify | Test `ReviewOut` includes `raw_diff` |
| `packages/api/tests/test_routers.py` | Modify | Test GET review returns `raw_diff` |
| `packages/dashboard/src/api/types.ts` | Modify | Add `raw_diff` to `Review` interface |
| `packages/dashboard/src/lib/parseDiff.ts` | Create | `extractFileDiff` + `findingLineRange` utilities |
| `packages/dashboard/src/components/DiffPanel.tsx` | Create | `diff2html`-based diff viewer |
| `packages/dashboard/src/index.css` | Modify | `diff2html` dark-theme CSS overrides + highlight class |
| `packages/dashboard/src/components/ReviewDetail.tsx` | Modify | Three-panel layout, wire `DiffPanel` |

---

## Task 1: DB model + migration

**Files:**
- Modify: `packages/api/argus_api/models/review.py`
- Create: `packages/api/alembic/versions/0003_add_raw_diff.py`
- Modify: `packages/api/tests/test_models.py`

- [ ] **Step 1: Write the failing test**

Append to `packages/api/tests/test_models.py`:

```python
@pytest.mark.asyncio
async def test_review_stores_raw_diff(session: AsyncSession):
    org = Organization(name="diff-org", github_org_login="diff-org")
    session.add(org)
    await session.flush()

    repo = Repository(
        org_id=org.id,
        github_repo_id="77777",
        full_name="diff-org/repo",
    )
    session.add(repo)
    await session.flush()

    raw = "diff --git a/foo.py b/foo.py\n--- a/foo.py\n+++ b/foo.py\n+new line\n"
    review = Review(
        repo_id=repo.id,
        pr_number=5,
        status="completed",
        raw_diff=raw,
    )
    session.add(review)
    await session.commit()

    assert review.raw_diff == raw
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest packages/api/tests/test_models.py::test_review_stores_raw_diff -v
```

Expected: `FAILED` — `TypeError: unexpected keyword argument 'raw_diff'`

- [ ] **Step 3: Add `raw_diff` column to the Review model**

In `packages/api/argus_api/models/review.py`, update the `ForeignKey, String` import to include `Text`, then add the column after `github_comment_status`:

```python
from sqlalchemy import ForeignKey, String, Text
```

```python
github_comment_status: Mapped[str | None] = mapped_column(String(20))
raw_diff: Mapped[str | None] = mapped_column(Text, nullable=True)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
uv run pytest packages/api/tests/test_models.py::test_review_stores_raw_diff -v
```

Expected: `PASSED`

- [ ] **Step 5: Create the Alembic migration**

Create `packages/api/alembic/versions/0003_add_raw_diff.py`:

```python
"""Add raw_diff to reviews

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reviews", sa.Column("raw_diff", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("reviews", "raw_diff")
```

- [ ] **Step 6: Run the full model test suite**

```bash
uv run pytest packages/api/tests/test_models.py -v
```

Expected: all tests `PASSED`

- [ ] **Step 7: Commit**

```bash
git add packages/api/argus_api/models/review.py \
        packages/api/alembic/versions/0003_add_raw_diff.py \
        packages/api/tests/test_models.py
git commit -m "feat: add raw_diff column to reviews table"
```

---

## Task 2: Save raw diff in Celery task + expose in API schema

**Files:**
- Modify: `packages/api/argus_api/tasks/review_task.py`
- Modify: `packages/api/argus_api/schemas/review.py`
- Modify: `packages/api/tests/test_schemas.py`
- Modify: `packages/api/tests/test_routers.py`

- [ ] **Step 1: Write the failing schema test**

Append to `packages/api/tests/test_schemas.py`:

```python
def test_review_out_includes_raw_diff():
    import uuid
    data = {
        "id": uuid.uuid4(),
        "repo_id": uuid.uuid4(),
        "trigger_type": "webhook",
        "pr_number": 1,
        "pr_title": "Test",
        "base_sha": None,
        "head_sha": None,
        "status": "completed",
        "score": 85,
        "total_findings": 0,
        "started_at": None,
        "completed_at": None,
        "raw_diff": "diff --git a/foo.py b/foo.py\n+added\n",
        "findings": [],
    }
    out = ReviewOut(**data)
    assert out.raw_diff == data["raw_diff"]


def test_review_out_raw_diff_defaults_to_none():
    import uuid
    data = {
        "id": uuid.uuid4(),
        "repo_id": uuid.uuid4(),
        "trigger_type": "webhook",
        "pr_number": None,
        "pr_title": None,
        "base_sha": None,
        "head_sha": None,
        "status": "pending",
        "score": None,
        "total_findings": 0,
        "started_at": None,
        "completed_at": None,
        "findings": [],
    }
    out = ReviewOut(**data)
    assert out.raw_diff is None
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest packages/api/tests/test_schemas.py::test_review_out_includes_raw_diff -v
```

Expected: `FAILED` — `ValidationError: extra inputs are not permitted` (field not yet in schema)

- [ ] **Step 3: Add `raw_diff` to `ReviewOut` schema**

In `packages/api/argus_api/schemas/review.py`, add after `github_comment_status`:

```python
github_comment_status: str | None = None
raw_diff: str | None = None
repo_full_name: str | None = None
```

- [ ] **Step 4: Run schema tests to verify they pass**

```bash
uv run pytest packages/api/tests/test_schemas.py -v
```

Expected: all tests `PASSED`

- [ ] **Step 5: Write the failing router test**

Append to `packages/api/tests/test_routers.py`:

```python
@pytest.mark.asyncio
async def test_review_out_includes_raw_diff():
    from argus_api.database import AsyncSessionLocal, Base, engine
    from argus_api.models.organization import Organization
    from argus_api.models.repository import Repository
    from argus_api.models.review import Review as ReviewModel

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    raw = "diff --git a/foo.py b/foo.py\n--- a/foo.py\n+++ b/foo.py\n+new line\n"
    async with AsyncSessionLocal() as session:
        org = Organization(name="difforg", github_org_login="difforg")
        session.add(org)
        await session.flush()
        repo = Repository(
            org_id=org.id,
            github_repo_id="11111",
            full_name="difforg/repo",
            default_branch="main",
        )
        session.add(repo)
        await session.flush()
        review = ReviewModel(
            repo_id=repo.id,
            trigger_type="webhook",
            pr_number=10,
            pr_title="Diff PR",
            status="completed",
            raw_diff=raw,
        )
        session.add(review)
        await session.commit()
        review_id = str(review.id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/api/v1/reviews/{review_id}", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["raw_diff"] == raw
```

- [ ] **Step 6: Run router test to verify it passes end-to-end**

```bash
uv run pytest packages/api/tests/test_routers.py::test_review_out_includes_raw_diff -v
```

Expected: `PASSED` — the model column (Task 1) and schema field (Step 3) are both in place, so the full pipeline should work. If it fails, check that `ReviewOut` was saved correctly in Step 3.

- [ ] **Step 7: Save `raw_diff` in the Celery task**

In `packages/api/argus_api/tasks/review_task.py`, inside `_async_run_review`, find the `async with AsyncSessionLocal() as session:` block and add `db_review.raw_diff = raw_diff` after `db_review.completed_at`:

```python
        db_review.status = "completed"
        db_review.score = result.score
        db_review.total_findings = len(result.findings)
        db_review.completed_at = datetime.utcnow()
        db_review.raw_diff = raw_diff
        pr_number = db_review.pr_number
        await session.commit()
```

- [ ] **Step 8: Run the full router test suite**

```bash
uv run pytest packages/api/tests/test_routers.py -v
```

Expected: all tests `PASSED`

- [ ] **Step 9: Run the full backend test suite**

```bash
uv run pytest packages/api/tests/ -v
```

Expected: all tests `PASSED`

- [ ] **Step 10: Commit**

```bash
git add packages/api/argus_api/tasks/review_task.py \
        packages/api/argus_api/schemas/review.py \
        packages/api/tests/test_schemas.py \
        packages/api/tests/test_routers.py
git commit -m "feat: save raw_diff in review task and expose in API schema"
```

---

## Task 3: Frontend type + parseDiff utility

**Files:**
- Modify: `packages/dashboard/src/api/types.ts`
- Create: `packages/dashboard/src/lib/parseDiff.ts`

- [ ] **Step 1: Add `raw_diff` to the `Review` interface**

In `packages/dashboard/src/api/types.ts`, add to the `Review` interface after `findings`:

```typescript
export interface Review {
  id: string;
  repo_id: string;
  trigger_type: string;
  pr_number: number | null;
  pr_title: string | null;
  base_sha: string | null;
  head_sha: string | null;
  status: ReviewStatus;
  score: number | null;
  total_findings: number;
  started_at: string | null;
  completed_at: string | null;
  github_comment_status: GHStatus;
  repo_full_name: string | null;
  findings: Finding[];
  raw_diff: string | null;
}
```

- [ ] **Step 2: Create the `lib/` directory and `parseDiff.ts`**

Create `packages/dashboard/src/lib/parseDiff.ts`:

```typescript
import type { Finding } from '../api/types';

/**
 * Extracts the diff section for a single file from a full unified diff.
 * Returns empty string if the file is not found in the diff.
 */
export function extractFileDiff(rawDiff: string, filePath: string): string {
  const sections = rawDiff.split(/(?=^diff --git )/m);
  return sections.find(s => s.includes(`+++ b/${filePath}`)) ?? '';
}

/**
 * Returns the set of new-file line numbers covered by a finding (inclusive).
 */
export function findingLineRange(finding: Finding): Set<number> {
  const lines = new Set<number>();
  for (let i = finding.line_start; i <= finding.line_end; i++) {
    lines.add(i);
  }
  return lines;
}
```

- [ ] **Step 3: Type-check the dashboard**

```bash
cd packages/dashboard && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/api/types.ts \
        packages/dashboard/src/lib/parseDiff.ts
git commit -m "feat: add raw_diff type and parseDiff utility"
```

---

## Task 4: DiffPanel component + diff2html + CSS overrides

**Files:**
- Modify: `packages/dashboard/package.json` (via npm install)
- Create: `packages/dashboard/src/components/DiffPanel.tsx`
- Modify: `packages/dashboard/src/index.css`

- [ ] **Step 1: Install diff2html**

```bash
cd packages/dashboard && npm install diff2html
```

Expected: `diff2html` appears in `package.json` dependencies, no peer-dependency warnings.

- [ ] **Step 2: Create `DiffPanel.tsx`**

Create `packages/dashboard/src/components/DiffPanel.tsx`:

```typescript
import { useEffect, useRef } from 'react';
import { html as diff2html } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import { extractFileDiff, findingLineRange } from '../lib/parseDiff';
import type { Finding } from '../api/types';

interface DiffPanelProps {
  rawDiff: string | null;
  finding: Finding | null;
}

export function DiffPanel({ rawDiff, finding }: DiffPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const fileDiff = rawDiff && finding
    ? extractFileDiff(rawDiff, finding.file_path)
    : '';

  const diffHtml = fileDiff
    ? diff2html(fileDiff, {
        drawFileList: false,
        matching: 'lines',
        outputFormat: 'line-by-line',
      })
    : '';

  useEffect(() => {
    if (!containerRef.current || !finding || !diffHtml) return;
    const container = containerRef.current;
    const lineNums = findingLineRange(finding);
    let firstRow: HTMLElement | null = null;

    container.querySelectorAll<HTMLTableRowElement>('tr').forEach(row => {
      row.classList.remove('argus-highlight');
      const lineNumEl = row.querySelector<HTMLElement>('.line-num2');
      if (!lineNumEl) return;
      const lineNum = parseInt(lineNumEl.textContent ?? '', 10);
      if (!isNaN(lineNum) && lineNums.has(lineNum)) {
        row.classList.add('argus-highlight');
        if (!firstRow) firstRow = row;
      }
    });

    firstRow?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [diffHtml, finding]);

  if (!rawDiff) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm px-4 text-center">
        No diff stored for this review
      </div>
    );
  }

  if (!finding) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Select a finding to view the diff
      </div>
    );
  }

  if (!fileDiff) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm font-mono px-4 text-center">
        Diff not available for {finding.file_path}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto text-xs argus-diff"
      dangerouslySetInnerHTML={{ __html: diffHtml }}
    />
  );
}
```

- [ ] **Step 3: Add CSS overrides to `index.css`**

Append to `packages/dashboard/src/index.css`:

```css
/* ── diff2html dark theme overrides ── */
.argus-diff .d2h-file-wrapper {
  background-color: #0d1117;
  border-color: #21262d;
  margin-bottom: 0;
}
.argus-diff .d2h-file-header {
  background-color: #161b22;
  border-color: #21262d;
  color: #e6edf3;
}
.argus-diff .d2h-code-wrapper,
.argus-diff table {
  background-color: #0d1117;
  width: 100%;
}
.argus-diff td.d2h-code-linenumber {
  background-color: #0d1117;
  border-color: #21262d;
  color: #484f58;
}
.argus-diff td.d2h-code-side-linenumber {
  background-color: #0d1117;
  border-color: #21262d;
  color: #484f58;
}
.argus-diff .d2h-code-line,
.argus-diff td.d2h-code-side-line {
  color: #e6edf3;
  background-color: #0d1117;
}
.argus-diff tr.d2h-ins td {
  background-color: #0d2818;
  color: #7ee787;
}
.argus-diff tr.d2h-ins td.d2h-code-linenumber {
  background-color: #0d2818;
  border-color: #2ea043;
}
.argus-diff tr.d2h-del td {
  background-color: #3d0f0f;
  color: #ffa198;
}
.argus-diff tr.d2h-del td.d2h-code-linenumber {
  background-color: #3d0f0f;
  border-color: #f85149;
}
.argus-diff tr.d2h-info td {
  background-color: #1c2128;
  color: #8b949e;
  border-color: #21262d;
}
.argus-diff .d2h-tag {
  background-color: #161b22;
  color: #58a6ff;
  border-color: #21262d;
}

/* Finding highlight */
.argus-diff tr.argus-highlight td {
  background-color: rgba(245, 158, 11, 0.15) !important;
  border-top: 1px solid #d97706 !important;
  border-bottom: 1px solid #d97706 !important;
}
```

- [ ] **Step 4: Type-check**

```bash
cd packages/dashboard && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/package.json \
        packages/dashboard/package-lock.json \
        packages/dashboard/src/components/DiffPanel.tsx \
        packages/dashboard/src/index.css
git commit -m "feat: add DiffPanel component with diff2html rendering"
```

---

## Task 5: Wire three-panel layout in ReviewDetail

**Files:**
- Modify: `packages/dashboard/src/components/ReviewDetail.tsx`

- [ ] **Step 1: Import `DiffPanel`**

At the top of `packages/dashboard/src/components/ReviewDetail.tsx`, add the import after the existing imports:

```typescript
import { DiffPanel } from './DiffPanel';
```

- [ ] **Step 2: Replace the two-panel layout with three panels**

Find the current two-panel block (lines 124–155):

```tsx
{data.findings.length > 0 && (
  <div className="flex gap-4 flex-1 min-h-0 lg:flex-row flex-col">
    <div className="lg:w-2/5 overflow-y-auto space-y-1 pr-1">
      {data.findings.map(f => (
        ...
      ))}
    </div>

    <div className="lg:w-3/5 overflow-y-auto">
      {displayFinding ? (
        <FindingDetail finding={displayFinding} reviewId={reviewId} />
      ) : (
        <div className="text-gray-500 text-sm p-4">Select a finding to see details</div>
      )}
    </div>
  </div>
)}
```

Replace it with:

```tsx
{data.findings.length > 0 && (
  <div className="flex gap-3 flex-1 min-h-0 lg:flex-row flex-col">
    {/* Panel 1 — findings list */}
    <div className="lg:w-1/4 overflow-y-auto space-y-1 pr-1 shrink-0">
      {data.findings.map(f => (
        <button
          key={f.id}
          onClick={() => setSelectedFinding(f)}
          className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
            displayFinding?.id === f.id
              ? 'bg-blue-600/20 border border-blue-600/40'
              : 'hover:bg-gray-800 border border-transparent'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">{SEVERITY_ICON[f.severity] ?? '⚪'}</span>
            <span className={`text-xs font-medium truncate ${f.is_resolved ? 'line-through text-gray-500' : 'text-white'}`}>
              {f.title}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate pl-6">{f.file_path}:{f.line_start}</p>
        </button>
      ))}
    </div>

    {/* Panel 2 — diff viewer */}
    <div className="lg:w-1/2 overflow-y-auto border border-gray-800 rounded-lg min-h-0">
      <DiffPanel rawDiff={data.raw_diff} finding={displayFinding} />
    </div>

    {/* Panel 3 — finding detail */}
    <div className="lg:w-1/4 overflow-y-auto shrink-0">
      {displayFinding ? (
        <FindingDetail finding={displayFinding} reviewId={reviewId} />
      ) : (
        <div className="text-gray-500 text-sm p-4">Select a finding to see details</div>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 3: Type-check**

```bash
cd packages/dashboard && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Start the dashboard dev server and verify manually**

```bash
# Terminal 1 — API (needs DB with raw_diff column migrated)
uv run uvicorn argus_api.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — Dashboard
cd packages/dashboard && npm run dev
```

Open http://localhost:5173 and open a completed review:

- [ ] Three panels are visible side-by-side on a wide screen
- [ ] Clicking a finding updates the middle diff panel to show that file's diff
- [ ] The finding's lines are highlighted in amber
- [ ] The diff panel auto-scrolls to the highlighted lines
- [ ] Reviews without `raw_diff` (pre-migration) show "No diff stored" gracefully
- [ ] On a narrow window, panels stack vertically (findings → diff → detail)

- [ ] **Step 5: Run full backend test suite one final time**

```bash
uv run pytest packages/api/tests/ -v
```

Expected: all tests `PASSED`

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/components/ReviewDetail.tsx
git commit -m "feat: three-panel diff preview layout in ReviewDetail"
```

---

## Post-implementation checklist

- [ ] Run `docker compose up -d` and `docker compose exec api alembic upgrade head` to apply migration `0003` in the local Docker environment
- [ ] Run `uv run ruff check packages/` — fix any lint issues
- [ ] Run `uv run mypy packages/core/argus_core packages/cli/argus_cli packages/api/argus_api` — fix any type errors
