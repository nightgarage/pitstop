# Roadmap

What's planned, what's known-rough, and what's deliberately parked. Have an
idea or want to claim an item? Open an issue.

## Known issues

- **Electric vehicle tracking needs work.** Charge-session logging and mi/kWh
  work, but the EV experience is rougher than the gas path — charge tracking,
  stats, and the dashboard need a polish pass to reach parity.

## Planned

### First-login walkthrough

A new account lands on an empty garage, where nothing in the app means
anything yet. This is a short setup flow to get past that. Four steps, in
this order:

**1. Install to the home screen.** First, deliberately — on iOS a home-screen
web app gets its own storage container, so anything set up in a browser tab
(including the login session) may not carry over. Better to install before
doing the work than to do it twice.

- Skip this step entirely when already running installed — check
  `display-mode: standalone`, so it never reappears post-install.
- iOS: spell out Share → "Add to Home Screen"; it's genuinely hidden.
- Android/desktop: use the native install prompt where available, and play
  it down on desktop where it matters much less.
- Word it so it holds either way: "if it asks you to sign in again, use the
  same login."
- Skippable, like every step except the vehicle.

**2. A short tour — four illustrative cards.** Not spotlights on the live UI:
at this point every screen is empty, so highlighting them shows nothing, and
tooltips anchored to real elements break whenever the layout moves. Cards
that simply describe each tab:

- Garage — your vehicles at a glance
- Log — the pump screen, including the live two-of-three price math
- Service — reminders by mileage, time, or both
- Stats — trends, and which fuel grade is actually cheaper to run

Swipeable, progress dots, skip always visible.

**3. Add the first vehicle.** The one real gate. Reuse `VehicleForm` rather
than writing a second copy of it. Underneath, one quiet line pointing at the
importer for anyone arriving from another tracker — a pointer, not a second
path through the flow:

> Already tracking somewhere else? You can bring in your history later from
> Settings → Import.

**4. Done** — drop them on the garage with a real vehicle card.

Mechanics: triggers on login when the user has no vehicles and hasn't
finished it; needs an `onboarding_done` flag on the user plus a migration so
it doesn't return every session; re-runnable from Settings; never shown to
the demo account, which already has data.

Deliberately not included: a "log your current odometer as a baseline" step.
It would spare the confusion of the first real fill-up showing no economy,
but it asks for busywork before the user has done anything.

## Not yet verified

- End-to-end `docker compose up` on a fresh host (the image mirrors the
  tested local commands, but hasn't had a clean-machine run).
- The PWA offline logging queue on a physical phone.
- Email notification delivery against a real SMTP server (ntfy, Gotify, and
  webhook delivery are covered by tests).

## Stretch (by demand)

- OIDC / SSO login (Authentik, Authelia, Keycloak)
- Reverse-proxy header auth (e.g. Cloudflare Access) for proxy-fronted setups
- Vehicle sharing between accounts (household cars)
- i18n / translations
- API integrations (Home Assistant, automation scripts) on top of the
  existing REST API
