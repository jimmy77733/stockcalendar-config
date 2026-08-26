// Admin console config for stockcalendar-config (public Pages repo).
// Rotate gate password: await sha256Hex('new-password') in the browser console, paste into passwordSha256.
window.STOCKCALENDAR_ADMIN = {
  passwordSha256: "dc2b88d86d4327e61d52fc737d5a2eba53eb04bd7ce34e3a74805a267c4b72e8",
  /**
   * 後備參考版（僅在 App Store／GitHub 抓取失敗時使用）。
   * 請與 App `MARKETING_VERSION`／`CFBundleShortVersionString` 對齊；正式來源改由 admin 動態抓取。
   */
  currentAppVersion: "1.7",
  /** App Store 數字 ID，用於 lookup 目前商店行銷版 */
  appStoreId: "6790064657",
  /** 主 App 倉庫 Info.plist（開發主線行銷版） */
  appInfoPlistURL: "https://raw.githubusercontent.com/jimmy77733/KSH-10-StockCalendar/main/StockCalendar/Info.plist",
  /** 永久型 App Store 連結（以 App ID，避免地區／名稱變動） */
  defaultAppStoreURL: "https://apps.apple.com/app/id6790064657",
  github: {
    owner: "jimmy77733",
    repo: "stockcalendar-config",
    path: "docs/app-config.json",
    archivePath: "docs/announcement-archive.json",
    branch: "main"
  },
  pagesConfigURL: "https://jimmy77733.github.io/stockcalendar-config/app-config.json",
  rawConfigURL: "https://raw.githubusercontent.com/jimmy77733/stockcalendar-config/main/docs/app-config.json",
  pagesArchiveURL: "https://jimmy77733.github.io/stockcalendar-config/announcement-archive.json",
  rawArchiveURL: "https://raw.githubusercontent.com/jimmy77733/stockcalendar-config/main/docs/announcement-archive.json"
};
