# Roadmap

What's planned, what's known-rough, and what's deliberately parked. Have an
idea or want to claim an item? Open an issue.

## Known issues

- **Electric vehicle tracking needs work.** Charge-session logging and mi/kWh
  work, but the EV experience is rougher than the gas path — charge tracking,
  stats, and the dashboard need a polish pass to reach parity.

## Shipped recently

- **First-login walkthrough** — new accounts get a short setup flow instead
  of an empty garage: install to the home screen (skipped when already
  installed; iOS gets the Share → "Add to Home Screen" steps), four tour
  cards, then adding the first vehicle with a pointer to the CSV importer.
  Skippable throughout, re-runnable from Settings → "Replay the welcome
  tour". Deliberately no "log a baseline odometer" step — it would be
  busywork before the user has done anything.

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
