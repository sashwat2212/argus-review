from __future__ import annotations

import uuid

from argus_api.schemas.finding import FindingOut, FindingPatch
from argus_api.schemas.review import ReviewListOut, ReviewOut


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
