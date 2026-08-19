"""Tests for GitHub webhook HMAC signature verification."""

import hashlib
import hmac

from routes.github_webhook import verify_hmac_signature

SECRET = "my-webhook-secret"
PAYLOAD = b'{"action":"opened"}'


def _sign(payload: bytes, secret: str) -> str:
    """Generate a valid x-hub-signature-256 header."""
    return "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


class TestHMACVerification:
    """verify_hmac_signature is the sole gate for webhook auth."""

    def test_valid_signature_passes(self):
        sig = _sign(PAYLOAD, SECRET)
        assert verify_hmac_signature(PAYLOAD, sig, SECRET) is True

    def test_invalid_signature_fails(self):
        sig = "sha256=" + "0" * 64
        assert verify_hmac_signature(PAYLOAD, sig, SECRET) is False

    def test_wrong_secret_fails(self):
        sig = _sign(PAYLOAD, "wrong-secret")
        assert verify_hmac_signature(PAYLOAD, sig, SECRET) is False

    def test_empty_signature_fails(self):
        assert verify_hmac_signature(PAYLOAD, "", SECRET) is False

    def test_missing_sha256_prefix_fails(self):
        raw_hex = hmac.new(SECRET.encode(), PAYLOAD, hashlib.sha256).hexdigest()
        assert verify_hmac_signature(PAYLOAD, raw_hex, SECRET) is False

    def test_tampered_payload_fails(self):
        sig = _sign(PAYLOAD, SECRET)
        assert verify_hmac_signature(b'{"action":"closed"}', sig, SECRET) is False

    def test_empty_secret_always_fails(self):
        sig = _sign(PAYLOAD, SECRET)
        assert verify_hmac_signature(PAYLOAD, sig, "") is False
