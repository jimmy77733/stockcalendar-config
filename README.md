# StockCalendar Remote Config

Public hosting for the **StockCalendar** (股帳曆) iOS app remote configuration.

This repository stores:

- **`docs/app-config.json`** — in-app announcements and update-prompt settings (read by the app over HTTPS)
- **`docs/admin/`** — a small web console to preview and publish that JSON

App source code lives in a separate private repository. This repo is intentionally public so devices can fetch config without authentication.

## Public endpoints

After GitHub Pages is enabled (`Settings → Pages → Deploy from branch → /docs`):

| Resource | Path |
|----------|------|
| Config JSON | `/app-config.json` |
| Admin console | `/admin/` |

Raw GitHub URLs under `main/docs/` can be used as a fallback.

## Notes

- Changing announcement or update text only requires editing and publishing the JSON; it does not require an App Store resubmit.
- The admin console gate password only hides the UI. Writing still requires a GitHub token with permission to this repository.
- Do not commit tokens or plaintext secrets.
