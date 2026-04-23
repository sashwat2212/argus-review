from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

import aiosqlite

from argus_core.models import ReviewResult

DB_PATH = Path.home() / ".argus" / "local.db"

_CREATE_REVIEWS = """
CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pr_number INTEGER,
    pr_title TEXT,
    repo TEXT,
    score INTEGER,
    total_findings INTEGER,
    reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    raw_json TEXT
)
"""


async def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(_CREATE_REVIEWS)
        await db.commit()


async def save_review(
    result: ReviewResult,
    pr_number: int | None = None,
    pr_title: str | None = None,
    repo: str | None = None,
) -> int:
    raw = json.dumps(
        {
            "score": result.score,
            "total_chunks_processed": result.total_chunks_processed,
            "errors": result.errors,
            "findings": [asdict(f) for f in result.findings],
        }
    )
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO reviews (pr_number, pr_title, repo, score, total_findings, raw_json)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (pr_number, pr_title, repo, result.score, len(result.findings), raw),
        )
        await db.commit()
        return cursor.lastrowid or 0


async def list_reviews(limit: int = 20) -> list[dict]:
    if not DB_PATH.exists():
        return []
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, pr_number, pr_title, repo, score, total_findings, reviewed_at"
            " FROM reviews ORDER BY id DESC LIMIT ?",
            (limit,),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_review(review_id: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM reviews WHERE id = ?", (review_id,))
        row = await cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        d["detail"] = json.loads(d.pop("raw_json", "{}"))
        return d
