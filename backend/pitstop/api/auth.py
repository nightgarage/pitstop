from fastapi import APIRouter, HTTPException, Response, status
from sqlmodel import func, select

from ..config import get_settings
from ..deps import CurrentUser, OptionalUser, SessionDep
from ..models import Role, User
from ..schemas import (
    AuthStatus,
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    SetupRequest,
    UserOut,
    UserUpdate,
)
from ..security import COOKIE_NAME, create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_count(session) -> int:
    return session.exec(select(func.count()).select_from(User)).one()


def _set_auth_cookie(response: Response, user_id: int) -> None:
    settings = get_settings()
    response.set_cookie(
        COOKIE_NAME,
        create_access_token(user_id),
        max_age=settings.access_token_expire_days * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


def _normalize_email(email: str) -> str:
    return email.strip().lower()


@router.get("/status", response_model=AuthStatus)
def auth_status(session: SessionDep, user: OptionalUser) -> AuthStatus:
    from .admin import registration_allowed

    return AuthStatus(
        setup_required=_user_count(session) == 0,
        allow_registration=registration_allowed(session),
        user=UserOut.model_validate(user, from_attributes=True) if user else None,
    )


@router.post("/setup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def first_run_setup(body: SetupRequest, session: SessionDep, response: Response) -> User:
    """Create the first (admin) account. Only available while no users exist."""
    if _user_count(session) > 0:
        raise HTTPException(status_code=403, detail="Setup has already been completed")
    user = User(
        email=_normalize_email(body.email),
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        role=Role.admin,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    _set_auth_cookie(response, user.id)
    return user


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, session: SessionDep, response: Response) -> User:
    from .admin import registration_allowed

    if _user_count(session) == 0:
        raise HTTPException(status_code=403, detail="Use first-run setup to create the admin account")
    if not registration_allowed(session):
        raise HTTPException(status_code=403, detail="Registration is disabled on this instance")
    email = _normalize_email(body.email)
    existing = session.exec(select(User).where(User.email == email)).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        role=Role.user,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    _set_auth_cookie(response, user.id)
    return user


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, session: SessionDep, response: Response) -> User:
    email = _normalize_email(body.email)
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None or not verify_password(user.password_hash, body.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    _set_auth_cookie(response, user.id)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: UserUpdate, user: CurrentUser, session: SessionDep) -> User:
    updates = body.model_dump(exclude_unset=True, exclude_none=True)
    for field, value in updates.items():
        setattr(user, field, value)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(body: ChangePasswordRequest, user: CurrentUser, session: SessionDep) -> None:
    if not verify_password(user.password_hash, body.current_password):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    session.add(user)
    session.commit()
