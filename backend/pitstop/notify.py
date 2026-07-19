"""Notification creation + delivery channels.

In-app notifications are the default and always on: rows in the notifications
table, surfaced as an unread badge. The optional per-user channels (email via
env-configured SMTP, ntfy, Gotify, generic webhook) deliver best-effort in
background threads — a dead endpoint never breaks the app.
"""

import json
import logging
import threading
import urllib.request

from sqlmodel import Session, select

from .models import Notification, NotificationChannel, ServiceReminder, User, Vehicle
from .reminders import ReminderInput, ReminderStatus, evaluate

logger = logging.getLogger(__name__)


def notify(
    session: Session,
    user: User,
    title: str,
    body: str | None = None,
    kind: str = "reminder",
    dedupe_key: str | None = None,
) -> Notification | None:
    """Create an in-app notification (skipped if its dedupe_key already exists),
    then hand it to any configured extra channels."""
    if dedupe_key is not None:
        existing = session.exec(
            select(Notification).where(
                Notification.user_id == user.id, Notification.dedupe_key == dedupe_key
            )
        ).first()
        if existing is not None:
            return None
    notification = Notification(
        user_id=user.id, title=title, body=body, kind=kind, dedupe_key=dedupe_key
    )
    session.add(notification)
    _dispatch_to_channels(session, user, notification)
    return notification


def _dispatch_to_channels(session: Session, user: User, notification: Notification) -> None:
    channels = session.exec(
        select(NotificationChannel).where(
            NotificationChannel.user_id == user.id, NotificationChannel.enabled == True  # noqa: E712
        )
    ).all()
    for channel in channels:
        try:
            config = json.loads(channel.config or "{}")
        except json.JSONDecodeError:
            config = {}
        # deliver in a background thread — a slow SMTP server or dead webhook
        # must never block (or fail) the request that raised the notification
        threading.Thread(
            target=_send, args=(channel.kind, config, notification.title, notification.body),
            daemon=True,
        ).start()


def _send(kind: str, config: dict, title: str, body: str | None) -> None:
    try:
        if kind == "ntfy":
            _send_ntfy(config, title, body)
        elif kind == "gotify":
            _send_gotify(config, title, body)
        elif kind == "webhook":
            _send_webhook(config, title, body)
        elif kind == "email":
            _send_email(config, title, body)
    except Exception:  # noqa: BLE001 — delivery is best-effort by design
        logger.warning("notification delivery via %s failed", kind, exc_info=True)


def _post(url: str, data: bytes, headers: dict) -> None:
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=10):
        pass


def _send_ntfy(config: dict, title: str, body: str | None) -> None:
    base = (config.get("url") or "https://ntfy.sh").rstrip("/")
    topic = config.get("topic")
    if not topic:
        return
    headers = {"Title": "Pitstop"}
    if config.get("token"):
        headers["Authorization"] = f"Bearer {config['token']}"
    _post(f"{base}/{topic}", (body or title).encode(), headers)


def _send_gotify(config: dict, title: str, body: str | None) -> None:
    url, token = config.get("url"), config.get("token")
    if not url or not token:
        return
    payload = json.dumps({"title": title, "message": body or title, "priority": 5})
    _post(
        f"{url.rstrip('/')}/message?token={token}",
        payload.encode(),
        {"Content-Type": "application/json"},
    )


def _send_webhook(config: dict, title: str, body: str | None) -> None:
    url = config.get("url")
    if not url:
        return
    payload = json.dumps({"app": "pitstop", "title": title, "body": body})
    _post(url, payload.encode(), {"Content-Type": "application/json"})


def _send_email(config: dict, title: str, body: str | None) -> None:
    """SMTP settings come from the environment; the channel holds the address."""
    import os
    import smtplib
    from email.message import EmailMessage

    host = os.environ.get("SMTP_HOST")
    to_address = config.get("address")
    if not host or not to_address:
        return
    message = EmailMessage()
    message["Subject"] = f"Pitstop: {title}"
    message["From"] = os.environ.get("SMTP_FROM", "pitstop@localhost")
    message["To"] = to_address
    message.set_content(body or title)
    port = int(os.environ.get("SMTP_PORT", "587"))
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        if os.environ.get("SMTP_TLS", "true").lower() != "false":
            smtp.starttls()
        smtp_user = os.environ.get("SMTP_USER")
        if smtp_user:
            smtp.login(smtp_user, os.environ.get("SMTP_PASSWORD", ""))
        smtp.send_message(message)


def sync_reminder_notifications(session: Session, user: User, now) -> None:
    """Create notifications for reminders that are currently due or overdue.
    Idempotent via dedupe keys; called whenever reminders/notifications are read."""
    from .api.service import current_odometer  # local import to avoid a cycle

    rows = session.exec(
        select(ServiceReminder, Vehicle)
        .join(Vehicle, Vehicle.id == ServiceReminder.vehicle_id)
        .where(
            Vehicle.owner_id == user.id,
            Vehicle.archived == False,  # noqa: E712
            ServiceReminder.active == True,  # noqa: E712
        )
    ).all()
    created = False
    for reminder, vehicle in rows:
        state = evaluate(
            ReminderInput(
                interval_miles=reminder.interval_miles,
                interval_months=reminder.interval_months,
                due_date=reminder.due_date,
                due_odometer=reminder.due_odometer,
                last_done_date=reminder.last_done_date,
                last_done_odometer=reminder.last_done_odometer,
            ),
            current_odometer(session, vehicle),
            now,
        )
        if state.status == ReminderStatus.upcoming:
            continue
        if state.status == ReminderStatus.overdue:
            if state.miles_remaining is not None and state.miles_remaining < 0:
                detail = f"{abs(round(state.miles_remaining)):,} mi over"
            elif state.days_remaining is not None and state.days_remaining < 0:
                detail = f"{abs(state.days_remaining)} days over"
            else:
                detail = "overdue"
            title = f"{reminder.name} is overdue on {vehicle.name} ({detail})"
        else:
            if state.miles_remaining is not None:
                detail = f"in {round(state.miles_remaining):,} mi"
            elif state.days_remaining is not None:
                detail = f"in {state.days_remaining} days"
            else:
                detail = "soon"
            title = f"{reminder.name} due {detail} on {vehicle.name}"
        result = notify(
            session,
            user,
            title,
            kind="reminder",
            dedupe_key=f"reminder:{reminder.id}:{state.status.value}",
        )
        created = created or result is not None
    if created:
        session.commit()
