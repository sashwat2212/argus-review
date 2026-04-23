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
