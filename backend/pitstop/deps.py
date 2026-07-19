from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlmodel import Session

from .db import get_session
from .models import Role, User
from .security import COOKIE_NAME, decode_access_token

SessionDep = Annotated[Session, Depends(get_session)]


def get_optional_user(
    session: SessionDep,
    pitstop_token: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
) -> User | None:
    if not pitstop_token:
        return None
    user_id = decode_access_token(pitstop_token)
    if user_id is None:
        return None
    return session.get(User, user_id)


def get_current_user(
    user: Annotated[User | None, Depends(get_optional_user)],
) -> User:
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


def require_admin(user: CurrentUser) -> User:
    if user.role != Role.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


AdminUser = Annotated[User, Depends(require_admin)]
