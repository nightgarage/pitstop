# Contributing to Pitstop

Thanks for the interest! The design is settled and documented in
[`docs/DESIGN.md`](docs/DESIGN.md) — please keep changes aligned with it. Good
starting points live in [`ROADMAP.md`](ROADMAP.md); open an issue to claim one.

## Development setup

See "Development setup" in the [README](README.md#development-setup): the
FastAPI backend runs on :8000, the Vite dev server on :5173 with a proxy.

## Ground rules

- **Tests:** the fuel-economy math is the heart of the app — anything touching
  `backend/pitstop/economy.py`, `reminders.py`, or the importer needs tests.
  Run `pytest` from `backend/`; the whole suite should stay green.
- **Migrations:** any model change needs an Alembic migration
  (`alembic revision --autogenerate` from `backend/`). The test suite fails if
  models and migrations drift apart.
- **Design language:** dark-first, card-based, thumb-first. Match the tokens in
  `docs/DESIGN.md` §3 — background `#0A0A0B`, surfaces `#1C1C1E`, accent
  `#3B9EFF`, Inter, Lucide icons.
- **Frontend:** `npm run build` from `frontend/` must pass clean (it
  type-checks).
- Conventional commit messages (`feat:`, `fix:`, `chore:`).
