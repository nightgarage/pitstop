import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from ..deps import CurrentUser, SessionDep
from ..models import Notification, NotificationChannel
from ..notify import sync_reminder_notifications
from ..schemas import ChannelIn, ChannelOut, NotificationList, NotificationOut

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=NotificationList)
def list_notifications(session: SessionDep, user: CurrentUser) -> NotificationList:
    """The user's notifications, newest first. Reading also refreshes
    reminder-driven notifications so the badge is always current."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    sync_reminder_notifications(session, user, now)
    rows = session.exec(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())  # type: ignore[union-attr]
        .limit(100)
    ).all()
    unread = sum(1 for n in rows if not n.read)
    return NotificationList(
        unread_count=unread,
        notifications=[NotificationOut.model_validate(n, from_attributes=True) for n in rows],
    )


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(notification_id: int, session: SessionDep, user: CurrentUser) -> None:
    notification = session.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.read = True
    session.add(notification)
    session.commit()


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(session: SessionDep, user: CurrentUser) -> None:
    rows = session.exec(
        select(Notification).where(Notification.user_id == user.id, Notification.read == False)  # noqa: E712
    ).all()
    for notification in rows:
        notification.read = True
        session.add(notification)
    session.commit()


# ---- optional delivery channels (scaffold) ----

@router.get("/channels", response_model=list[ChannelOut])
def list_channels(session: SessionDep, user: CurrentUser) -> list[ChannelOut]:
    rows = session.exec(
        select(NotificationChannel).where(NotificationChannel.user_id == user.id)
    ).all()
    return [
        ChannelOut(id=c.id, kind=c.kind, config=json.loads(c.config or "{}"), enabled=c.enabled)
        for c in rows
    ]


@router.put("/channels", response_model=list[ChannelOut])
def replace_channels(
    body: list[ChannelIn], session: SessionDep, user: CurrentUser
) -> list[ChannelOut]:
    """Replace the user's channel configuration wholesale (it's a small list)."""
    for old in session.exec(
        select(NotificationChannel).where(NotificationChannel.user_id == user.id)
    ).all():
        session.delete(old)
    created = []
    for channel in body:
        row = NotificationChannel(
            user_id=user.id,
            kind=channel.kind,
            config=json.dumps(channel.config),
            enabled=channel.enabled,
        )
        session.add(row)
        created.append(row)
    session.commit()
    return [
        ChannelOut(id=c.id, kind=c.kind, config=json.loads(c.config or "{}"), enabled=c.enabled)
        for c in created
    ]
