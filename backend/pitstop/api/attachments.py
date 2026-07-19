import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from ..config import get_settings
from ..deps import CurrentUser, SessionDep
from ..models import Attachment, ServiceRecord, Vehicle
from ..schemas import AttachmentOut
from .service import _get_owned_record

router = APIRouter(prefix="/api", tags=["attachments"])

MAX_SIZE = 15 * 1024 * 1024  # 15 MB
ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
}


def attachments_dir() -> Path:
    directory = get_settings().data_dir / "attachments"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _get_owned_attachment(
    session: Session, user: CurrentUser, attachment_id: int
) -> Attachment:
    attachment = session.get(Attachment, attachment_id)
    if attachment is not None and attachment.service_record_id is not None:
        record = session.get(ServiceRecord, attachment.service_record_id)
        if record is not None:
            vehicle = session.get(Vehicle, record.vehicle_id)
            if vehicle is not None and vehicle.owner_id == user.id:
                return attachment
    raise HTTPException(status_code=404, detail="Attachment not found")


@router.post(
    "/vehicles/{vehicle_id}/services/{record_id}/attachments",
    response_model=AttachmentOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    vehicle_id: int,
    record_id: int,
    file: UploadFile,
    session: SessionDep,
    user: CurrentUser,
) -> Attachment:
    record = _get_owned_record(session, user, vehicle_id, record_id)
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=415, detail="Only images (JPEG/PNG/WebP/HEIC/GIF) and PDFs are supported"
        )
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File is too large (15 MB max)")

    stored_name = f"{uuid.uuid4().hex}{ALLOWED_TYPES[content_type]}"
    (attachments_dir() / stored_name).write_bytes(data)

    attachment = Attachment(
        service_record_id=record.id,
        filename=file.filename or stored_name,
        stored_name=stored_name,
        content_type=content_type,
        size=len(data),
        kind="receipt" if content_type == "application/pdf" else "photo",
    )
    session.add(attachment)
    session.commit()
    session.refresh(attachment)
    return attachment


@router.get("/attachments/{attachment_id}")
def serve_attachment(attachment_id: int, session: SessionDep, user: CurrentUser) -> FileResponse:
    attachment = _get_owned_attachment(session, user, attachment_id)
    path = attachments_dir() / attachment.stored_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File is missing from storage")
    # inline so images/PDFs open in the browser instead of downloading
    return FileResponse(
        path,
        media_type=attachment.content_type,
        filename=attachment.filename,
        content_disposition_type="inline",
    )


@router.delete("/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(attachment_id: int, session: SessionDep, user: CurrentUser) -> None:
    attachment = _get_owned_attachment(session, user, attachment_id)
    (attachments_dir() / attachment.stored_name).unlink(missing_ok=True)
    session.delete(attachment)
    session.commit()


def delete_record_attachments(session: Session, record_id: int) -> None:
    """Remove all attachment rows + files for a service record (used on record delete)."""
    for attachment in session.exec(
        select(Attachment).where(Attachment.service_record_id == record_id)
    ).all():
        (attachments_dir() / attachment.stored_name).unlink(missing_ok=True)
        session.delete(attachment)
