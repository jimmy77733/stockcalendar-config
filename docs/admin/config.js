// Admin console config for stockcalendar-config (public Pages repo).
// Default gate password plaintext: stockcalendar
// Rotate: await sha256Hex('new-password') in the browser console, paste here.
window.STOCKCALENDAR_ADMIN = {
  passwordSha256: "241c11a93ddd70d72f7dad0f380ebb4ff19c4e1f6f3d8b0c89249ad661ce8884",
  /** 與 App MARKETING_VERSION／CFBundleShortVersionString 對齊（非 build 號） */
  currentAppVersion: "1.4",
  github: {
    owner: "jimmy77733",
    repo: "stockcalendar-config",
    path: "docs/app-config.json",
    branch: "main"
  },
  pagesConfigURL: "https://jimmy77733.github.io/stockcalendar-config/app-config.json",
  rawConfigURL: "https://raw.githubusercontent.com/jimmy77733/stockcalendar-config/main/docs/app-config.json"
};
