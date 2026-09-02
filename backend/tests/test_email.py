"""Tests for services.email — send_alert_email."""

import os
from unittest.mock import AsyncMock, patch

import pytest

from services.email import send_alert_email


@pytest.mark.asyncio
async def test_returns_false_when_smtp_not_configured():
    with patch.dict(
        os.environ,
        {"SMTP_HOST": "", "SMTP_USER": "", "SMTP_PASSWORD": "", "SMTP_FROM": ""},
        clear=False,
    ):
        result = await send_alert_email(
            recipients=["test@example.com"],
            repo_name="test-repo",
            score_delta=-5,
            curr_health=75,
            new_findings=3,
            dashboard_url="https://example.com/dashboard",
        )
        assert result is False


@pytest.mark.asyncio
@patch("services.email.aiosmtplib.send", new_callable=AsyncMock, return_value=True)
async def test_sends_email_when_smtp_configured(mock_send):
    with patch.dict(
        os.environ,
        {
            "SMTP_HOST": "smtp.example.com",
            "SMTP_PORT": "587",
            "SMTP_USER": "user",
            "SMTP_PASSWORD": "pass",
            "SMTP_FROM": "alert@example.com",
        },
        clear=False,
    ):
        result = await send_alert_email(
            recipients=["dev@example.com"],
            repo_name="my-app",
            score_delta=-10,
            curr_health=60,
            new_findings=5,
            dashboard_url="https://example.com/report",
        )
        assert result is True
        mock_send.assert_called_once()


@pytest.mark.asyncio
@patch(
    "services.email.aiosmtplib.send",
    new_callable=AsyncMock,
    side_effect=Exception("SMTP error"),
)
async def test_returns_false_on_send_failure(mock_send):
    with patch.dict(
        os.environ,
        {
            "SMTP_HOST": "smtp.example.com",
            "SMTP_PORT": "587",
            "SMTP_USER": "user",
            "SMTP_PASSWORD": "pass",
            "SMTP_FROM": "alert@example.com",
        },
        clear=False,
    ):
        result = await send_alert_email(
            recipients=["dev@example.com"],
            repo_name="my-app",
            score_delta=-5,
            curr_health=80,
            new_findings=0,
            dashboard_url="https://example.com/report",
        )
        assert result is False


@pytest.mark.asyncio
@patch("services.email.aiosmtplib.send", new_callable=AsyncMock, return_value=True)
async def test_no_findings_row_when_zero(mock_send):
    with patch.dict(
        os.environ,
        {
            "SMTP_HOST": "smtp.example.com",
            "SMTP_PORT": "587",
            "SMTP_USER": "user",
            "SMTP_PASSWORD": "pass",
            "SMTP_FROM": "alert@example.com",
        },
        clear=False,
    ):
        result = await send_alert_email(
            recipients=["dev@example.com"],
            repo_name="my-app",
            score_delta=5,
            curr_health=90,
            new_findings=0,
            dashboard_url="https://example.com/report",
        )
        assert result is True
        # Verify the email message was constructed
        call_args = mock_send.call_args
        msg = call_args[0][0]
        html = msg.get_body(preferencelist=("html",)).get_content()
        assert "New findings" not in html
