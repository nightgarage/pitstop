# Deploying Pitstop

Pitstop is one container on one port. Every deployment boils down to: run the
app, point something at port 8080, back up the data directory.

## Docker (recommended)

```bash
git clone https://github.com/nightgarage/pitstop.git
cd pitstop
docker compose up -d
```

Open `http://<host>:8080` and complete the first-run admin setup. All
configuration is environment variables — see [`.env.example`](../.env.example).
Data (SQLite DB, generated secret, attachments) lives in the `pitstop_data`
volume; backing up means copying that volume (or using Settings → Export).

### Postgres instead of SQLite

Uncomment the `db` service and the `DATABASE_URL` line in
`docker-compose.yml`, then `docker compose up -d`. Migrations run automatically
on start.

## Behind a Cloudflare tunnel

The intended setup: `cloudflared` on the same host, pointing at the container.

```yaml
# cloudflared config.yml
ingress:
  - hostname: pitstop.example.com
    service: http://localhost:8080
  - service: http_status:404
```

- The container starts uvicorn with `--proxy-headers`, so `X-Forwarded-*` from
  the tunnel (or any reverse proxy) is honored.
- Set `COOKIE_SECURE=true` once the app is served over HTTPS.
- **Subpath:** to serve under `https://example.com/pitstop`, set
  `BASE_PATH=/pitstop` and configure the proxy to strip the prefix.
- **Cloudflare Access:** put an Access policy in front of the hostname for an
  extra login wall. Pitstop's own accounts still apply behind it. (Trusting the
  Access JWT to skip Pitstop's login is a planned stretch feature.)

Any other reverse proxy (Caddy, nginx, Traefik) works the same way: forward to
port 8080 and pass the standard `X-Forwarded-*` headers.

## Without Docker (VM / LXC / bare metal)

Requirements: Python 3.12+, Node 20+ (only to build the frontend once).

```bash
git clone https://github.com/nightgarage/pitstop.git
cd pitstop

# build the web UI
cd frontend && npm ci && npm run build && cd ..

# install the backend
python3 -m venv /opt/pitstop-venv
/opt/pitstop-venv/bin/pip install ./backend            # add ".[postgres]" for Postgres

# configure
cp .env.example /opt/pitstop.env                       # edit to taste
```

Systemd unit (`/etc/systemd/system/pitstop.service`):

```ini
[Unit]
Description=Pitstop fuel & maintenance tracker
After=network.target

[Service]
User=pitstop
WorkingDirectory=/opt/pitstop/backend
EnvironmentFile=/opt/pitstop.env
Environment=DATA_DIR=/var/lib/pitstop
Environment=FRONTEND_DIST=/opt/pitstop/frontend/dist
# backs up the SQLite database, then applies any pending migrations
ExecStartPre=/opt/pitstop-venv/bin/python -m pitstop.premigrate
ExecStart=/opt/pitstop-venv/bin/uvicorn pitstop.main:app --host 0.0.0.0 --port 8080 --proxy-headers
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /usr/sbin/nologin pitstop
sudo mkdir -p /var/lib/pitstop && sudo chown pitstop: /var/lib/pitstop
sudo systemctl enable --now pitstop
```

## Updates — no data loss, by design

Updating is "pull the new version, restart":

```bash
git pull && docker compose up -d --build     # Docker
# or: git pull, rebuild the frontend, restart the systemd unit
```

On every start, before the app comes up, Pitstop:

1. **Backs up the SQLite database** to `DATA_DIR/backups/` (stamped with the
   app version and time; the last 5 are kept). If anything ever goes wrong,
   restoring is copying one file back.
2. **Applies pending schema migrations** (Alembic). Migrations are additive
   and versioned; running them on an already-current database is a no-op, so
   restarts and repeated deploys are harmless. Accounts, vehicles, and history
   carry forward automatically.

The test suite enforces that the migration chain always builds the current
schema from scratch and never drifts from the models, so a release can't ship
with a missing migration. Postgres users: schedule `pg_dump` yourself — the
automatic pre-migration backup covers SQLite only.

## Health & backups

- `GET /api/health` returns `{"status": "ok"}` — wire it to your uptime monitor
  or the compose healthcheck.
- Back up `DATA_DIR` (SQLite file + `attachments/` + `.secret_key`), or use
  Settings → Export for a portable JSON/CSV copy.
- A demo instance: set `SEED_DEMO=true` on an empty database to get a
  `demo@example.com` / `pitstop-demo` account with sample data.
