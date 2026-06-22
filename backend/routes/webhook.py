import structlog
import httpx
from fastapi import APIRouter, Request

from models.requests import WebhookNotifyRequest
from services.auth import require_gh_token_or_service_key

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/webhook/notify")
async def notify_webhook(req: WebhookNotifyRequest, request: Request):
    require_gh_token_or_service_key(request)

    if not req.slack_webhook_url.startswith("https://hooks.slack.com/"):
        return {"error": "Invalid Slack webhook URL — must start with https://hooks.slack.com/"}

    payload: dict = {"text": req.message}
    if req.channel:
        payload["channel"] = req.channel
    if req.blocks:
        payload["blocks"] = req.blocks

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(req.slack_webhook_url, json=payload)
        if resp.status_code != 200:
            logger.warning("Slack webhook failed", status=resp.status_code, body=resp.text[:200])
            return {"error": f"Webhook failed with status {resp.status_code}"}
        logger.info("Slack notification sent")
        return {"ok": True}
    except httpx.TimeoutException:
        return {"error": "Webhook timed out"}
    except Exception as exc:
        logger.error("Webhook error", error=str(exc))
        return {"error": "Webhook request failed"}
