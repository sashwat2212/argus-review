from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from argus_api.github_client import post_pr_review, set_commit_status
from argus_core.models import Finding


def _make_finding(**kwargs) -> Finding:
    defaults = dict(
        file_path="example.py",
        line_start=1,
        line_end=2,
        severity="high",
        category="error_handling",
        confidence=0.8,
        title="Test finding",
        description="desc",
        why_it_matters="matters",
        suggested_fix="fix it",
        agent="quality",
    )
    defaults.update(kwargs)
    return Finding(**defaults)


@pytest.mark.asyncio
async def test_set_commit_status_returns_true_on_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 201

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        result = await set_commit_status(
            token="tok",
            repo_full_name="owner/repo",
            sha="abc123",
            state="success",
            description="Score 85/100",
        )
    assert result is True


@pytest.mark.asyncio
async def test_set_commit_status_returns_false_on_failure():
    mock_resp = MagicMock()
    mock_resp.status_code = 422
    mock_resp.text = "Unprocessable"

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        result = await set_commit_status(
            token="tok",
            repo_full_name="owner/repo",
            sha="abc123",
            state="success",
            description="Score 85/100",
        )
    assert result is False


@pytest.mark.asyncio
async def test_post_pr_review_returns_true_on_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        result = await post_pr_review(
            token="tok",
            repo_full_name="owner/repo",
            pr_number=1,
            commit_id="abc123",
            findings=[_make_finding()],
            score=85,
        )
    assert result is True


@pytest.mark.asyncio
async def test_post_pr_review_returns_false_when_falls_back():
    fail_resp = MagicMock()
    fail_resp.status_code = 422
    fail_resp.text = "Unprocessable"

    fallback_resp = MagicMock()
    fallback_resp.status_code = 201

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=[fail_resp, fallback_resp])
        mock_client_cls.return_value = mock_client

        result = await post_pr_review(
            token="tok",
            repo_full_name="owner/repo",
            pr_number=1,
            commit_id="abc123",
            findings=[_make_finding()],
            score=85,
        )
    assert result is False
