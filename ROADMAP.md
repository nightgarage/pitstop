# Roadmap

What's planned, what's known-rough, and what's deliberately parked. Have an
idea or want to claim an item? Open an issue.

## Known issues

- **Electric vehicle tracking needs work.** Charge-session logging and mi/kWh
  work, but the EV experience is rougher than the gas path — charge tracking,
  stats, and the dashboard need a polish pass to reach parity.

## Planned

- **First-login walkthrough.** A short guided tour after account creation:
  add your first vehicle, log a fill-up, set a service reminder — so a new
  user lands somewhere useful instead of an empty garage. It should also
  cover installing to the home screen, since that's what turns Pitstop into
  a real full-screen app (and on iOS it's the non-obvious Share → "Add to
  Home Screen"). Show it only when running in a browser tab, not when
  already installed — `display-mode: standalone` tells you which.

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
