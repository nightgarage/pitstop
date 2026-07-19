from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .api import (
    admin,
    attachments,
    auth,
    charges,
    export,
    fuelups,
    grades,
    imports,
    notifications,
    service,
    stats,
    vehicles,
)
from .config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Pitstop",
        version=__version__,
        description="Self-hosted fuel & maintenance tracker",
        openapi_url="/api/openapi.json",
        docs_url="/api/docs",
        redoc_url=None,
        root_path=settings.base_path,
    )

    app.include_router(auth.router)
    # stats first: its literal /api/vehicles/stats-summary path must win over
    # the /api/vehicles/{vehicle_id} route
    app.include_router(stats.router)
    app.include_router(vehicles.router)
    app.include_router(fuelups.router)
    app.include_router(charges.router)
    app.include_router(service.router)
    app.include_router(attachments.router)
    app.include_router(grades.router)
    app.include_router(export.router)
    app.include_router(imports.router)
    app.include_router(admin.router)
    app.include_router(notifications.router)

    @app.get("/api/health", tags=["system"])
    def health() -> dict:
        return {"status": "ok", "version": __version__}

    if settings.seed_demo:

        @app.on_event("startup")
        def _seed() -> None:
            from sqlmodel import Session

            from .db import get_engine
            from .seed import seed_demo_data

            with Session(get_engine()) as session:
                seed_demo_data(session)

    _mount_frontend(app, settings.frontend_dist)
    return app


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    """Serve the built SPA. All non-API paths fall back to index.html."""
    if not dist.is_dir() or not (dist / "index.html").is_file():
        return  # dev mode: frontend served separately by Vite

    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        candidate = (dist / full_path).resolve()
        # only serve real files that live inside dist; everything else -> SPA
        if full_path and candidate.is_file() and candidate.is_relative_to(dist.resolve()):
            return FileResponse(candidate)
        return FileResponse(dist / "index.html")


app = create_app()
