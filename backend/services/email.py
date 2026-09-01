import os
from email.message import EmailMessage

import aiosmtplib
import structlog

logger = structlog.get_logger(__name__)


async def send_alert_email(
    recipients: list[str],
    repo_name: str,
    score_delta: int,
    curr_health: int,
    new_findings: int,
    dashboard_url: str,
) -> bool:
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM")

    if not all([smtp_host, smtp_user, smtp_password, smtp_from]):
        logger.debug("SMTP not configured, skipping email alert")
        return False

    findings_row = ""
    if new_findings > 0:
        findings_row = f"""
        <tr>
          <td style="padding: 4px 0; color: #6b7280;">New findings</td>
          <td style="padding: 4px 0; color: #ef4444; font-weight: 600;">+{new_findings}</td>
        </tr>"""

    score_color = "#ef4444" if score_delta < 0 else "#22c55e"

    html_body = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                max-width: 480px; padding: 24px; border: 1px solid #e5e7eb;
                border-radius: 8px;">
      <h2 style="margin: 0 0 16px; font-size: 20px; color: #f59e0b;">
        &#9888;&#65039; GitMind Alert
      </h2>
      <table style="width: 100%; font-size: 14px; color: #374151; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 0; color: #6b7280;">Repository</td>
          <td style="padding: 4px 0; font-weight: 600;">{repo_name}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #6b7280;">Health score</td>
          <td style="padding: 4px 0;">
            {curr_health}/100
            <span style="color: {score_color};">({score_delta:+d})</span>
          </td>
        </tr>
        {findings_row}
      </table>
      <a href="{dashboard_url}"
         style="display: inline-block; margin-top: 16px; padding: 10px 20px;
                background: #3b82f6; color: white; text-decoration: none;
                border-radius: 6px; font-size: 14px; font-weight: 500;">
        View Full Report &rarr;
      </a>
    </div>"""

    msg = EmailMessage()
    msg["Subject"] = f"\u26a0\ufe0f GitMind Alert: {repo_name}"
    msg["From"] = smtp_from
    msg["To"] = ", ".join(recipients)
    msg.set_content(
        f"GitMind Alert: {repo_name}\n"
        f"Health score: {curr_health}/100 (changed by {score_delta:+d})\n"
        f"{'New findings: +' + str(new_findings) if new_findings > 0 else ''}\n"
        f"View report: {dashboard_url}"
    )
    msg.add_alternative(html_body, subtype="html")

    try:
        await aiosmtplib.send(
            msg,
            hostname=smtp_host,
            port=smtp_port,
            username=smtp_user,
            password=smtp_password,
            start_tls=True,
        )
        logger.info("Email alert sent", recipients=recipients, repo=repo_name)
        return True
    except Exception as exc:
        logger.warning(
            "Email alert failed", recipients=recipients, error=str(exc)[:200]
        )
        return False
