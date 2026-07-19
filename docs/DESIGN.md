# Pitstop

*A self-hosted fuel & maintenance tracker you actually own.*

Pitstop lets you log fuel-ups, watch your fuel economy, and stay on top of vehicle
maintenance — all running on your own hardware and open to
anyone who wants to self-host it. It supports multiple users, each with a private
garage of vehicles, handles everything from gas trucks to pure EVs, and installs
to your phone's home screen so logging a fill-up at the pump takes seconds. It ships
as a single Docker container designed to sit behind a Cloudflare tunnel, and it's
built to run just as happily on a bare VM or LXC.

---

## Decisions at a glance

| Area | Decision |
|------|----------|
| **Name** | Pitstop |
| **Scope** | Multi-tenant — every user gets their own private garage |
| **Backend** | Python 3.12 + FastAPI (SQLModel/SQLAlchemy, Alembic migrations) |
| **Database** | SQLite by default; Postgres optional |
| **Frontend** | React + Vite + TypeScript, built as an installable PWA |
| **Packaging** | One Docker container (also runs on bare metal / VM / LXC) |
| **Mobile** | PWA — no native app |
| **Vehicle types** | Gas, diesel, hybrid, plug-in hybrid, electric |
| **Default units** | Miles + gallons + USD (overridable per user & vehicle) |
| **Notifications** | In-app by default; email / ntfy / Gotify / webhook optional |
| **Auth** | Local accounts; optional OIDC + reverse-proxy header (Cloudflare Access) |
| **Design** | Dark-first, minimal, Tesla / Starlink-inspired |
| **Accent color** | Electric blue `#3B9EFF` |
| **License** | MIT |
| **Standout feature** | Per-grade cost-per-mile comparison + a live "which grade to buy" advisor |

---

## 1. Goals & Principles

**Self-hosted and yours.** The core loop is simple — fast fuel
logging, clean fuel-economy stats, and maintenance tracking with reminders — and
the data lives on your server and the whole thing is open source.

**Mobile-first.** The pump is the primary use case, so logging a fill-up has to be
fast and thumb-friendly on a phone. The desktop experience is fully supported but
secondary.

**Multi-tenant.** Multiple user accounts, each with a private garage. One person's
vehicles and data are invisible to everyone else by default.

**Open-source & homelab friendly.** Pitstop should run every common way people
self-host: `docker run` / Docker Compose as the primary, best-documented path, but
also straight on a VM, LXC, or bare metal via a plain `pip install` and a systemd
service. Nothing should *require* Docker, and nobody should ever have to edit code
to configure it — everything is driven by environment variables (with a `.env` file
option for non-Docker setups), sane defaults, and clear per-method docs.

**API-first.** A documented REST API sits underneath the web app. There's no native
app — the installable PWA covers the phone experience without paying Apple's
developer fee — but a clean API keeps the door open for Home Assistant, automation
scripts, and other integrations.

**Own your data.** Easy CSV import (with column mapping and presets for the
formats other fuel trackers export) and full CSV/JSON export, always.

### Out of scope (at least for v1)
Native iOS/Android apps (the PWA is the mobile experience), fleet/business features
(driver assignment, IFTA tax, cost centers), and social features (public
leaderboards and comparisons).

---

## 2. Feature Set

### 2.1 Vehicles — "the garage"
Each user's garage holds any number of vehicles. A vehicle has a nickname, year,
make, model, trim, and photo, plus per-vehicle settings for its fuel/energy type,
optional tank or battery size, and starting odometer.

Its **energy type** — gasoline, diesel, hybrid, plug-in hybrid, or electric — is the
defining setting: it decides what the vehicle can log and how its economy is
calculated, and it's what keeps a gas truck from ever showing EV fields (and vice
versa). Units are configurable per user and per vehicle (distance in mi/km, volume in
US/UK gallons or liters, economy in MPG / L·100km / km/L / mi·kWh, and currency),
defaulting to **miles + gallons + USD**. Vehicles are archived rather than deleted, so
history is always preserved.

### 2.2 Fuel-ups — the heart of it
A fuel-up captures the date and odometer, the volume, the price per unit and/or the
total cost, and the **fill type** — full, partial, or missed — which is essential for
correct economy math. Optional details (fuel grade, station, location, payment
method, tags, notes, and so on) live behind a "more" section so the everyday path
stays lean.

Two things make logging fast at the pump:

- **A short quick-add path.** The default form is roughly four fields — odometer,
  gallons, cost, full/partial — with everything else collapsed away.
- **Live price math.** Gallons, price-per-gallon, and total cost are linked: enter
  any two and the third fills in instantly as you type, no button to press. Whatever
  pair is easiest to read off the pump is all you type, and the computed field stays
  editable so you can override it.

EVs and plug-in hybrids log a **charge session** instead of (or, for a PHEV,
alongside) a fuel-up — the same quick-add flow, just kWh and charge type in place of
gallons. The form a vehicle shows follows its energy type, so gas-only drivers never
see any of it.

**Every entry is editable after saving.** Tap any past fill-up to open it and fix a
mistyped odometer, price, or volume — or delete it outright — and the affected
economy stats recompute automatically. The same applies to charge sessions and
service records; nothing is write-once.

### 2.3 Fuel economy & stats
Pitstop computes per-fill and rolling/average economy (best, worst, lifetime, last
N), cost per mile/km, monthly cost, and total spend. It handles the tricky cases
correctly: partial fills accumulate until the next full tank, and a "missed"
fill flags a gap so a bogus number is never shown. EVs get the equivalent set —
mi/kWh, cost per mile, kWh per charge.

**Fuel-grade comparison — is premium actually worth it?**
This is Pitstop's standout feature. It tracks economy **per fuel grade** (87 / 89 /
91 / 93, regular vs. premium, diesel blends) rather than as one blended average, and
the metric that settles the debate is **cost per mile for each grade** — that grade's
average price divided by its average MPG. Because that single number folds in both
the higher pump price *and* any efficiency gain, it honestly answers whether pricier
fuel is actually cheaper to run in *this specific car*, and translates the gap into
real money ("91 costs ~$X more per 1,000 miles than 87" — or the reverse when premium
genuinely wins).

It comes in two forms:

- **Backward-looking comparison** — across all your fill-ups, which grade has been
  cheaper to run, and by how much per year.
- **Live "which should I buy right now?" advisor** — at the pump, type today's posted
  prices for each grade and Pitstop applies your car's already-measured MPG per grade
  to recommend the cheapest to run today, including the break-even price a grade
  would need to hit to win.

Guardrails keep it honest: a verdict appears once each grade has at least one clean
full tank, always shows the sample size alongside a reminder that more tanks per
grade sharpen the numbers, and excludes tanks where the grade changed mid-fill.
If a grade has no history yet, it says so rather than guessing — which is what the
optional **grade-test mode** (run N tanks of one grade, then N of another) is for.

### 2.4 Maintenance & service log
Services are logged with date, odometer, one or more service types, cost, shop or
DIY, parts, notes, and receipt attachments (photo or PDF). There's a set of
predefined service types (oil change, tires, brakes, and so on) plus custom types,
and multiple line items can be grouped under a single shop visit.

### 2.5 Service reminders
Reminders fire on a **mileage interval** (every 5,000 mi), a **time interval** (every
6 months), or both (whichever comes first), with status computed from the latest
odometer and date as upcoming, due, or overdue. One-off reminders (like a
registration renewal) are supported too. Notifications are **in-app by default** — an
unread badge waiting when you log in, no setup required — with email, ntfy, Gotify,
and webhook available as optional per-user channels.

### 2.6 Insights & charts
MPG over time, cost over time, fill-up frequency, and spend by category, all in the
dark theme, with a summary card per vehicle.

### 2.7 Import & export
A generic CSV importer with a column-mapping step, plus built-in **presets for the
column layouts other fuel trackers commonly export**, so existing history comes in
cleanly (fuel-ups and service records alike).
Everything can be exported back out as CSV and JSON for portability and backups.

---

## 3. Design Language

The look is inspired by the **Tesla** and **Starlink** apps: dark-first, minimal,
high-contrast, and data-forward, with a premium, calm feel. The interface gets out of
the way so the numbers — odometer, MPG, next service — are the hero. Five reference
mockups exist for the core screens (pump logging, fuel-grade comparison, the buy
advisor, the garage, and service/reminders).

### Principles
- **Dark-first.** Near-black backgrounds, content floating on subtly lighter,
  elevated surfaces. A light theme can come later, but dark is Pitstop's identity.
- **Minimal & uncluttered.** Generous negative space, almost no visible borders,
  information grouped into clean cards.
- **Monochrome + one accent.** Mostly grayscale, with a single accent color used
  sparingly for the primary action, active states, and the single most important stat.
- **Thumb-first.** Big tap targets and a bottom nav bar for one-handed use — the
  Log tab is always one tap away, so a fuel-up takes a couple of taps.
- **Card-based, rounded, soft depth.** Large corner radius, gentle elevation, each
  vehicle / stat / reminder in its own card.
- **Subtle, smooth motion.** Quiet, responsive transitions — never bouncy or gimmicky.

The **hero element** is the vehicle card — nickname, photo, current odometer, latest
MPG, and a next-service countdown, with the quick-add button right there — Pitstop's
equivalent of the Tesla app's car view.

### Design tokens
- **Backgrounds:** near-black `#0A0A0B`; elevated surfaces `#1C1C1E`.
- **Text:** primary near-white `#F5F5F7`; secondary muted gray `#8E8E93`.
- **Accent:** electric blue `#3B9EFF` (Starlink-style) — crisp on the near-black,
  used for the primary action, active states, the key stat, and the primary chart
  series. It's a single swappable token, so it's trivial to re-theme later.
- **Status colors:** green `#30D158` = good, amber `#FFB020` = due soon, red
  `#FF453A` = overdue.
- **Radius:** ~16px cards, ~12px controls, pill-shaped buttons.
- **Type:** Inter (free, open-source), with large tabular figures for the big stat
  readouts.
- **Icons:** thin, consistent line icons (Lucide / Feather style).
- **Charts:** inherit the dark theme — minimal gridlines, accent color for the
  primary series, muted grays for context, large readable numbers.

---

## 4. Users, Accounts & Multi-Tenancy

Accounts use an email/username and password, hashed with argon2 or bcrypt. First-run
setup creates an admin, and open registration is a toggle — off by default for a
private instance, on if you want a public demo. Every garage is private to its owner,
with data scoped to that user throughout, and an admin panel handles user management,
the registration toggle, and instance settings.

Two stretch items round this out: **optional vehicle sharing** (invite another user
to view or log a shared household car, off by default), and **flexible auth for
self-hosters** — built-in local accounts by default, with optional OIDC/SSO
(Authentik, Authelia, Keycloak) and an optional "trust reverse-proxy auth header"
mode that pairs naturally with Cloudflare Access in front of the tunnel.

---

## 5. Tech Stack

- **Backend:** Python 3.12 + **FastAPI** with SQLModel/SQLAlchemy and Alembic
  migrations. FastAPI's auto-generated OpenAPI docs and typed clients make the
  API-first goal essentially free, and it's approachable for open-source
  contributors.
- **Database:** **SQLite by default** — zero-config, one file, trivial backups — with
  **Postgres optional** through the same ORM, selected by an environment variable.
- **Frontend:** **React + Vite + TypeScript**, built as an installable **PWA** (add to
  home screen, offline-capable logging that syncs when back online). React is chosen
  for the largest open-source contributor pool; charts via Recharts or Chart.js.
- **Packaging:** FastAPI serves the built frontend as static files, so the whole app
  is **one image, one port, one container**. The shipped `docker-compose.yml` uses a
  SQLite volume by default with a commented-out Postgres service.

**Fallback (not chosen):** a SvelteKit or Next.js full-stack setup would collapse this
to a single language and build. It's kept in reserve in case the two-toolchain build
ever becomes a maintenance burden, but FastAPI's typed-API story wins for the
integration goals.

---

## 6. Data Model

At its core, Pitstop remembers **users**, their **vehicles**, the **energy events**
logged against each vehicle (a gas fill-up *or* an EV charge), **service records**,
and **reminders**. The model is deliberately shaped to handle gas, diesel, hybrid,
plug-in hybrid, and pure-electric vehicles without forcing any of them into the
wrong-shaped form.

| Entity | Key fields |
|--------|-----------|
| **User** | id, email, password_hash, display_name, role (admin/user), unit & currency prefs, created_at |
| **Vehicle** | id, owner_id, name, year/make/model/trim, **energy_type**, tank_size and/or battery_size, photo, unit overrides, archived |
| **FuelUp** *(gas/diesel/hybrid/PHEV)* | id, vehicle_id, date, odometer, volume, price_per_unit, total_cost, fill_type (full/partial/missed), fuel_grade, station, location, notes, tags |
| **ChargeSession** *(EV/PHEV)* | id, vehicle_id, date, odometer, kwh_added, price_per_kwh, total_cost, charge_type (home / public L2 / DC fast), start_% & end_% (optional), location, notes, tags |
| **OdometerAdjustment** | a marker for an odometer reset or jump, so distance math never goes haywire |
| **ServiceRecord** | id, vehicle_id, date, odometer, total_cost, shop, notes; has many **ServiceItems** (type, cost, parts) |
| **ServiceReminder** | id, vehicle_id, service_type, interval_miles, interval_months, last_done_odometer/date, next_due (computed), active |
| **Tag** | id, owner_id, name; joins to FuelUp / ChargeSession / ServiceRecord |
| **VehicleShare** *(stretch)* | vehicle_id, user_id, permission |
| **Attachment** | id, parent ref, file path/blob, kind (receipt/photo) |

### How each vehicle type is handled
- **Gas / diesel / regular hybrid** — logs FuelUps only; MPG is miles between
  consecutive full fills divided by fuel added (a hybrid is the same math with better
  numbers). This is the default path.
- **Pure electric** — logs ChargeSessions only; efficiency shows as mi/kWh and cost
  per mile, with no MPG anywhere.
- **Plug-in hybrid** — logs both, and Pitstop shows gas MPG for the gas it burns,
  mi/kWh for the electric, and a blended cost per mile as the honest all-in figure.

### Edge cases designed for
- **The first entry** sets a baseline only — no economy number is shown for it.
- **Partial & missed fills** accumulate or break the chain so a bad number never
  appears (same idea for charges).
- **Odometer resets / vehicle swaps** are absorbed by the OdometerAdjustment marker,
  keeping mileage math correct across a cluster replacement, rollover, or wound-back
  odometer.
- **Unit changes** never corrupt history: everything is stored in one canonical unit
  and only *displayed* in each user's preferred units.
- **Fuel-grade attribution** credits a tank's MPG to the grade actually being burned
  over that interval (the fuel added at its start), and marks any mid-tank grade
  change as "mixed" so it's excluded from the per-grade comparison.

The **economy math** — distance between full fills ÷ fuel added, with partials
accumulated and missed fills breaking the chain — is the single trickiest correctness
detail. It has to stay consistent for imported history too, so it's worth locking
down with tests early.

---

## 7. Deployment

Pitstop runs as a **single container** on one port (e.g. `8080`). The shipped
`docker-compose.yml` pairs the app with a named volume for the SQLite database and
uploaded attachments, plus a commented-out Postgres service for anyone who wants it.
Everything is configured through environment variables — `SECRET_KEY`,
`DATABASE_URL`, `ALLOW_REGISTRATION`, `DEFAULT_UNITS`, `DEFAULT_CURRENCY`, SMTP/ntfy
settings, `BASE_PATH`, and so on.

For the intended setup, `cloudflared` points at the container's port; the app honors
`X-Forwarded-*` headers, supports running under a subpath, and can optionally sit
behind **Cloudflare Access** using the reverse-proxy auth mode. Backups are trivial —
copy the one SQLite file plus the attachments folder, or use the JSON export — and a
healthcheck endpoint with structured logs keeps self-host debugging painless.

For those who'd rather not use Docker, the same app runs on a plain VM, LXC, or bare
metal via `pip install` and a systemd service reading a `.env` file. Docker is the
recommended, best-documented path — not a hard requirement.

---

## 8. Build Roadmap

1. **Foundation** — auth and users, vehicle CRUD, database and migrations,
   Docker/compose, and the API skeleton with OpenAPI docs.
2. **Fuel-ups & economy** — the mobile quick-add flow, the fuel-economy math with
   tests, and the per-vehicle dashboard.
3. **Maintenance & reminders** — the service log, reminder rules, due/overdue status,
   and the first notification channel.
4. **Fuel-grade tools** — per-grade tracking, the cost-per-mile comparison, and the
   live "which grade to buy" advisor.
5. **Import/export** — the generic CSV importer with column mapping and presets,
   and full export.
6. **Polish** — PWA/offline support, charts and insights, the admin panel,
   attachments, demo mode (seeded sample data / public demo instance), and the
   GitHub README with screenshots.
7. **Stretch** — OIDC/SSO, vehicle sharing, i18n, and API integrations (Home
   Assistant, automation scripts).
