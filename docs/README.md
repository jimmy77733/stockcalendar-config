# Docs (GitHub Pages source)

Publish this folder via **Pages → Deploy from a branch → `/docs`**.

| File | Purpose |
|------|---------|
| `app-config.json` | App-facing remote config（`announcements[]`＋`frequency`） |
| `announcement-archive.json` | 公告 ID 庫／歷史快照（後台雙寫） |
| `admin/` | Publish console (password + PAT) |
| `.nojekyll` | Disable Jekyll processing |

Default admin gate password is documented in the private app project notes / `admin/config.js` hash. Rotate the hash before sharing the console widely.
