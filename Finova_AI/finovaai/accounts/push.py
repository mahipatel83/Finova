"""
Web Push helpers: VAPID keys, sending, and bill-reminder logic.

VAPID keys are read from the environment (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).
If they are not set, a key pair is generated once and saved to `.vapid_keys.json`
next to manage.py, so push works with zero configuration. Keep that file private
and do not change keys later, or existing phone subscriptions stop working.
"""
import base64
import json
import logging
import os
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

from django.conf import settings

logger = logging.getLogger(__name__)

KEY_FILE = Path(settings.BASE_DIR) / ".vapid_keys.json"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _generate_keys():
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())
    private_int = key.private_numbers().private_value.to_bytes(32, "big")
    public_bytes = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return {"public": _b64url(public_bytes), "private": _b64url(private_int)}


def get_vapid_keys():
    pub = os.environ.get("VAPID_PUBLIC_KEY", "").strip()
    priv = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    if pub and priv:
        return {"public": pub, "private": priv}
    if KEY_FILE.exists():
        return json.loads(KEY_FILE.read_text())
    keys = _generate_keys()
    KEY_FILE.write_text(json.dumps(keys))
    logger.warning("Generated new VAPID keys at %s", KEY_FILE)
    return keys


def reminder_timezone():
    return ZoneInfo(os.environ.get("REMINDER_TIME_ZONE", "Asia/Kolkata"))


def local_today():
    return datetime.now(reminder_timezone()).date()


def send_push(subscription, title, body, url="/", tag=None):
    """Send one notification. Returns True on success, False if the subscription is dead."""
    from pywebpush import webpush, WebPushException

    keys = get_vapid_keys()
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag or "finova"})
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=payload,
            vapid_private_key=keys["private"],
            vapid_claims={"sub": os.environ.get("VAPID_ADMIN_EMAIL", "mailto:admin@finova.local")},
            ttl=60 * 60 * 12,
        )
        return True
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in (404, 410):  # phone unsubscribed / app uninstalled
            subscription.delete()
            return False
        logger.warning("Push failed (%s): %s", status, exc)
        return False
    except Exception as exc:  # network errors etc. - never crash the caller
        logger.warning("Push error: %s", exc)
        return False


def push_to_user(user, title, body, url="/", tag=None):
    """Send to every device the user registered. Returns number of devices reached."""
    sent = 0
    for sub in list(user.push_subscriptions.all()):
        if send_push(sub, title, body, url=url, tag=tag):
            sent += 1
    return sent


def _reminder_text(bill, kind, symbol):
    amount = f"{symbol}{Decimal(bill.amount):,.2f}"
    if kind == "today":
        return "Bill due TODAY", f"{bill.name} bill of {amount} is due today."
    return "Bill due tomorrow", f"{bill.name} bill of {amount} is due tomorrow."


def send_bill_reminders_for(bills, today=None):
    """Push reminders for the given bills (unpaid, due today/tomorrow), once per bill per day."""
    from .models import BillReminderLog, UserSettings

    today = today or local_today()
    sent_total = 0
    for bill in bills:
        if bill.status == "Paid":
            continue
        diff = (bill.due_date - today).days
        if diff not in (0, 1):
            continue
        kind = "today" if diff == 0 else "tomorrow"
        log, created = BillReminderLog.objects.get_or_create(bill=bill, kind=kind, sent_on=today)
        if not created:
            continue
        user_settings = UserSettings.objects.filter(user=bill.user).first()
        symbol = user_settings.currency_symbol if user_settings else "₹"
        title, body = _reminder_text(bill, kind, symbol)
        sent = push_to_user(bill.user, "🔔 " + title, body, url="/", tag=f"bill-{bill.id}-{kind}")
        sent_total += sent
    return sent_total
