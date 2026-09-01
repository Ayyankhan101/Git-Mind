import httpx
import structlog
from fastapi import APIRouter, Request

from models.requests import WebhookNotifyRequest
from routes._errors import error_response
from services.auth import require_gh_token_or_service_key
from services.rate_limit_response import rate_limit_response
from services.rate_limiter import check_rate_limit, get_client_ip

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/webhook/notify")
async def notify_webhook(req: WebhookNotifyRequest, request: Request):
    require_gh_token_or_service_key(request)

    client_ip = get_client_ip(request)
    if not (await check_rate_limit("webhook_notify", client_ip))[0]:
        return await rate_limit_response("webhook_notify", client_ip)

    if not req.slack_webhook_url.startswith("https://hooks.slack.com/"):
        return error_response("Invalid Slack webhook URL — must start with https://hooks.slack.com/", 400)

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
            return error_response(f"Webhook failed with status {resp.status_code}", 502)
        logger.info("Slack notification sent")
        return {"ok": True}
    except httpx.TimeoutException:
        return error_response("Webhook timed out", 504)
    except Exception as exc:
        logger.error("Webhook error", error=str(exc))
        return error_response("Webhook request failed", 500)
