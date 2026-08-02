// Admin console config for stockcalendar-config (public Pages repo).
// Default gate password plaintext: stockcalendar
// Rotate: await sha256Hex('new-password') in the browser console, paste here.
window.STOCKCALENDAR_ADMIN = {
  passwordSha256: "dc2b88d86d4327e61d52fc737d5a2eba53eb04bd7ce34e3a74805a267c4b72e8",
  /** 與 App MARKETING_VERSION／CFBundleShortVersionString 對齊（非 build 號） */
  currentAppVersion: "1.4",
  /** 永久型 App Store 連結（以 App ID，避免地區／名稱變動） */
  defaultAppStoreURL: "https://apps.apple.com/app/id6790064657",
  github: {
    owner: "jimmy77733",
    repo: "stockcalendar-config",
    path: "docs/app-config.json",
    branch: "main"
  },
  pagesConfigURL: "https://jimmy77733.github.io/stockcalendar-config/app-config.json",
  rawConfigURL: "https://raw.githubusercontent.com/jimmy77733/stockcalendar-config/main/docs/app-config.json"
};
