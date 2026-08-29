(() => {
  const CFG = window.STOCKCALENDAR_ADMIN;
  const SESSION_KEY = "sc_admin_unlocked";
  const PAT_SESSION_KEY = "sc_admin_pat";
  const THEME_KEY = "sc_admin_theme";

  /** 預覽流程：update → announcement → done */
  let previewPhase = "auto";
  /** 公告翻頁索引（對 includedActive 佇列） */
  let previewAnnIndex = 0;

  /** @type {Array<DraftAnn>} */
  let drafts = [];
  let selectedIndex = 0;
  let suppressEditorSync = false;

  /** @type {{ version: number, updatedAt: string, entries: Array }} */
  let archive = { version: 1, updatedAt: new Date().toISOString(), entries: [] };
  let librarySelectedId = "";
  let librarySelectedSnap = null;

  /**
   * @typedef {object} DraftAnn
   * @property {boolean} include
   * @property {boolean} idLocked
   * @property {boolean} enabled
   * @property {string} id
   * @property {string} style
   * @property {string} title
   * @property {string} body
   * @property {string} accent
   * @property {string|null} ctaLabel
   * @property {string|null} ctaURL
   * @property {boolean} dismissible
   * @property {string|null} startsAt
   * @property {string|null} endsAt
   * @property {string} frequency
   */

  const EYE_OPEN = '<svg class="eye-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 5c-5 0-9.27 3.11-11 7 1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>';
  const EYE_OFF = '<svg class="eye-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 6.5c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-3.89-6-7-11-7-1.4 0-2.74.25-3.98.7l2.16 2.16c.57-.23 1.18-.36 1.83-.36zM3.27 2.5 2 3.77l2.1 2.1C2.61 7.16 1.28 8.88.42 11c1.73 3.89 6 7 11 7 1.55 0 3.03-.3 4.38-.84l2.42 2.42L19.5 18.3 3.27 2.5zM12 16.5c-2.76 0-5-2.24-5-5 0-.77.18-1.5.49-2.14l1.57 1.57c-.03.18-.06.37-.06.57a3 3 0 0 0 3 3c.2 0 .39-.03.57-.06l1.57 1.57c-.64.31-1.37.49-2.14.49zm2.97-5.33a2.97 2.97 0 0 0-2.64-2.64l2.64 2.64z"/></svg>';

  const $ = (id) => document.getElementById(id);

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") setTheme(saved);
  }

  function unlockUI() {
    $("gate").classList.add("hidden");
    $("app").classList.remove("hidden");
    sessionStorage.setItem(SESSION_KEY, "1");
    restorePatFromSession();
  }

  function lockUI() {
    $("gate").classList.remove("hidden");
    $("app").classList.add("hidden");
    sessionStorage.removeItem(SESSION_KEY);
    $("pat").value = "";
  }

  function restorePatFromSession() {
    const saved = sessionStorage.getItem(PAT_SESSION_KEY) || "";
    if (saved) $("pat").value = saved;
  }

  function persistPatToSession() {
    const token = ($("pat").value || "").trim();
    if (token) sessionStorage.setItem(PAT_SESSION_KEY, token);
    else sessionStorage.removeItem(PAT_SESSION_KEY);
  }

  function emptyToNull(s) {
    const t = (s || "").trim();
    return t ? t : null;
  }

  function defaultDraft(partial = {}) {
    const day = new Date().toISOString().slice(0, 10);
    return {
      include: true,
      idLocked: false,
      enabled: true,
      id: "ann-" + day + "-" + Math.random().toString(36).slice(2, 6),
      style: "modal",
      title: "",
      body: "",
      accent: "brand",
      ctaLabel: null,
      ctaURL: null,
      dismissible: true,
      startsAt: null,
      endsAt: null,
      frequency: "once",
      ...partial
    };
  }

  function normalizeAnn(raw) {
    const a = raw || {};
    return defaultDraft({
      include: true,
      idLocked: false,
      enabled: !!a.enabled,
      id: a.id || "",
      style: a.style || "fullscreen",
      title: a.title || "",
      body: a.body || "",
      accent: a.accent || "brand",
      ctaLabel: a.ctaLabel ?? null,
      ctaURL: a.ctaURL ?? null,
      dismissible: a.dismissible !== false,
      startsAt: a.startsAt ?? null,
      endsAt: a.endsAt ?? null,
      frequency: (a.frequency === "daily" ? "daily" : "once")
    });
  }

  function announcementsFromConfig(cfg) {
    if (Array.isArray(cfg.announcements) && cfg.announcements.length) {
      return cfg.announcements.map(normalizeAnn);
    }
    if (cfg.announcement) return [normalizeAnn(cfg.announcement)];
    return [];
  }

  function draftToPayload(d) {
    return {
      enabled: !!d.enabled,
      id: (d.id || "").trim(),
      style: d.style || "modal",
      title: (d.title || "").trim(),
      body: (d.body || "").trim(),
      accent: d.accent || "brand",
      ctaLabel: emptyToNull(d.ctaLabel),
      ctaURL: emptyToNull(d.ctaURL),
      dismissible: !!d.dismissible,
      startsAt: d.startsAt || null,
      endsAt: d.endsAt || null,
      frequency: d.dismissible === false ? "once" : (d.frequency === "daily" ? "daily" : "once")
    };
  }

  // —— Datetime helpers（綁定目前選中草稿）——

  const DT_FIELDS = {
    starts: { y: "startsY", m: "startsM", d: "startsD", h: "startsH", min: "startsMin", hidden: "annStarts", iso: "startsISO", err: "startsErr" },
    ends: { y: "endsY", m: "endsM", d: "endsD", h: "endsH", min: "endsMin", hidden: "annEnds", iso: "endsISO", err: "endsErr" }
  };

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function readDtParts(key) {
    const f = DT_FIELDS[key];
    return {
      y: ($(f.y).value || "").trim(),
      m: ($(f.m).value || "").trim(),
      d: ($(f.d).value || "").trim(),
      h: ($(f.h).value || "").trim(),
      min: ($(f.min).value || "").trim()
    };
  }

  function clearDtInvalid(key) {
    const f = DT_FIELDS[key];
    [f.y, f.m, f.d, f.h, f.min].forEach((id) => $(id).classList.remove("is-invalid"));
  }

  function markDtInvalid(key, fields) {
    const f = DT_FIELDS[key];
    const map = { y: f.y, m: f.m, d: f.d, h: f.h, min: f.min };
    fields.forEach((k) => {
      if (map[k]) $(map[k]).classList.add("is-invalid");
    });
  }

  function assembleDatetime(key) {
    const parts = readDtParts(key);
    const values = [parts.y, parts.m, parts.d, parts.h, parts.min];
    const filled = values.filter((v) => v !== "");
    if (filled.length === 0) {
      return { ok: true, empty: true, iso: null, error: "", invalidFields: [] };
    }
    if (filled.length < 5) {
      const missing = [];
      if (!parts.y) missing.push("y");
      if (!parts.m) missing.push("m");
      if (!parts.d) missing.push("d");
      if (!parts.h) missing.push("h");
      if (!parts.min) missing.push("min");
      return {
        ok: false,
        empty: false,
        iso: null,
        error: "請填齊年／月／日／時／分，或全部清空",
        invalidFields: missing
      };
    }

    if (!/^\d{4}$/.test(parts.y)) {
      return { ok: false, empty: false, iso: null, error: "年份須為 4 位數字", invalidFields: ["y"] };
    }
    const y = parseInt(parts.y, 10);
    const m = parseInt(parts.m, 10);
    const d = parseInt(parts.d, 10);
    const h = parseInt(parts.h, 10);
    const min = parseInt(parts.min, 10);

    if (!Number.isInteger(m) || m < 1 || m > 12 || !/^\d{1,2}$/.test(parts.m)) {
      return { ok: false, empty: false, iso: null, error: "月份須為 1–12", invalidFields: ["m"] };
    }
    const maxD = daysInMonth(y, m);
    if (!Number.isInteger(d) || d < 1 || d > maxD || !/^\d{1,2}$/.test(parts.d)) {
      return { ok: false, empty: false, iso: null, error: `日期須為 1–${maxD}`, invalidFields: ["d"] };
    }
    if (!Number.isInteger(h) || h < 0 || h > 23 || !/^\d{1,2}$/.test(parts.h)) {
      return { ok: false, empty: false, iso: null, error: "小時須為 0–23", invalidFields: ["h"] };
    }
    if (!Number.isInteger(min) || min < 0 || min > 59 || !/^\d{1,2}$/.test(parts.min)) {
      return { ok: false, empty: false, iso: null, error: "分鐘須為 0–59", invalidFields: ["min"] };
    }
    if (y < 2020 || y > 2100) {
      return { ok: false, empty: false, iso: null, error: "年份請介於 2020–2100", invalidFields: ["y"] };
    }

    const iso = `${y}-${pad2(m)}-${pad2(d)}T${pad2(h)}:${pad2(min)}:00+08:00`;
    const parsed = Date.parse(iso);
    if (Number.isNaN(parsed)) {
      return { ok: false, empty: false, iso: null, error: "無法組成有效時間", invalidFields: ["y", "m", "d", "h", "min"] };
    }
    return { ok: true, empty: false, iso, error: "", invalidFields: [] };
  }

  function syncDatetimeUI(key) {
    const f = DT_FIELDS[key];
    clearDtInvalid(key);
    const result = assembleDatetime(key);
    const isoEl = $(f.iso);
    const errEl = $(f.err);
    if (result.empty) {
      $(f.hidden).value = "";
      isoEl.textContent = "（未設定）";
      isoEl.classList.remove("ok");
      errEl.hidden = true;
      errEl.textContent = "";
      return result;
    }
    if (!result.ok) {
      $(f.hidden).value = "";
      markDtInvalid(key, result.invalidFields);
      isoEl.textContent = "格式錯誤";
      isoEl.classList.remove("ok");
      errEl.hidden = false;
      errEl.textContent = result.error;
      return result;
    }
    $(f.hidden).value = result.iso;
    isoEl.textContent = result.iso;
    isoEl.classList.add("ok");
    errEl.hidden = true;
    errEl.textContent = "";
    return result;
  }

  function syncAllDatetimes() {
    return {
      starts: syncDatetimeUI("starts"),
      ends: syncDatetimeUI("ends")
    };
  }

  function clearDatetime(key) {
    const f = DT_FIELDS[key];
    [f.y, f.m, f.d, f.h, f.min].forEach((id) => { $(id).value = ""; });
    syncDatetimeUI(key);
    pullEditorIntoDraft();
    bumpPreview();
  }

  function fillDatetimeFromISO(key, iso) {
    const f = DT_FIELDS[key];
    [f.y, f.m, f.d, f.h, f.min].forEach((id) => { $(id).value = ""; });
    if (!iso) {
      syncDatetimeUI(key);
      return;
    }
    const m = String(iso).match(
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/
    );
    if (!m) {
      $(f.hidden).value = iso;
      $(f.iso).textContent = iso;
      $(f.iso).classList.remove("ok");
      $(f.err).hidden = false;
      $(f.err).textContent = "線上值無法拆解，請重新用下方欄位設定";
      return;
    }
    $(f.y).value = m[1];
    $(f.m).value = String(parseInt(m[2], 10));
    $(f.d).value = String(parseInt(m[3], 10));
    $(f.h).value = String(parseInt(m[4], 10));
    $(f.min).value = String(parseInt(m[5], 10));
    syncDatetimeUI(key);
  }

  function validateDraftDatetimes(d) {
    const check = (iso, label) => {
      if (!iso) return null;
      if (Number.isNaN(Date.parse(iso))) return label + "無效";
      return null;
    };
    const a = check(d.startsAt, "開始時間");
    if (a) return a;
    const b = check(d.endsAt, "結束時間");
    if (b) return b;
    if (d.startsAt && d.endsAt && Date.parse(d.startsAt) >= Date.parse(d.endsAt)) {
      return "結束時間必須晚於開始時間（ID：" + (d.id || "未命名") + "）";
    }
    return null;
  }

  function validateDatetimesForPublish() {
    pullEditorIntoDraft();
    for (const d of drafts) {
      if (!d.include) continue;
      const err = validateDraftDatetimes(d);
      if (err) return err;
    }
    // 也驗證目前編輯器欄位（若有選中）
    if (drafts[selectedIndex]) {
      const { starts, ends } = syncAllDatetimes();
      if (!starts.ok) return "開始時間格式有誤：" + starts.error;
      if (!ends.ok) return "結束時間格式有誤：" + ends.error;
    }
    return null;
  }

  /** 動態解析到的行銷版（App Store → GitHub Info.plist → config 後備） */
  let resolvedAppVersion = {
    version: CFG.currentAppVersion || "1.7",
    source: "本機後備"
  };

  function parseVersionParts(v) {
    return String(v || "")
      .trim()
      .split(".")
      .map((p) => parseInt(p.replace(/\D/g, ""), 10) || 0);
  }

  function compareVersion(a, b) {
    const left = parseVersionParts(a);
    const right = parseVersionParts(b);
    const n = Math.max(left.length, right.length);
    for (let i = 0; i < n; i++) {
      const lv = left[i] || 0;
      const rv = right[i] || 0;
      if (lv < rv) return -1;
      if (lv > rv) return 1;
    }
    return 0;
  }

  function versionFromInfoPlist(xml) {
    if (!xml || typeof xml !== "string") return "";
    const re = /<key>\s*CFBundleShortVersionString\s*<\/key>\s*<string>\s*([^<]+)\s*<\/string>/i;
    const m = xml.match(re);
    return m ? String(m[1]).trim() : "";
  }

  async function fetchAppStoreMarketingVersion() {
    const id = String(CFG.appStoreId || "6790064657").replace(/\D/g, "");
    if (!id) return "";
    const url =
      "https://itunes.apple.com/lookup?id=" +
      encodeURIComponent(id) +
      "&country=tw&_=" +
      Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("App Store lookup HTTP " + res.status);
    const data = await res.json();
    const version = data && data.results && data.results[0] && data.results[0].version;
    return version ? String(version).trim() : "";
  }

  async function fetchGitHubAppMarketingVersion() {
    const url = CFG.appInfoPlistURL;
    if (!url) return "";
    const res = await fetch(url + (url.includes("?") ? "&" : "?") + "_=" + Date.now(), {
      cache: "no-store"
    });
    if (!res.ok) throw new Error("Info.plist HTTP " + res.status);
    const text = await res.text();
    return versionFromInfoPlist(text);
  }

  async function resolveCurrentAppVersion() {
    const label = $("currentAppVersionLabel");
    const sourceEl = $("currentAppVersionSource");
    if (label) label.textContent = "抓取中…";
    if (sourceEl) sourceEl.textContent = "";

    try {
      const storeVer = await fetchAppStoreMarketingVersion();
      if (storeVer) {
        resolvedAppVersion = { version: storeVer, source: "App Store" };
        updateVersionHints();
        return resolvedAppVersion;
      }
    } catch (e) {
      console.warn("[admin] App Store version lookup failed", e);
    }

    try {
      const ghVer = await fetchGitHubAppMarketingVersion();
      if (ghVer) {
        resolvedAppVersion = { version: ghVer, source: "GitHub Info.plist" };
        updateVersionHints();
        return resolvedAppVersion;
      }
    } catch (e) {
      console.warn("[admin] GitHub Info.plist version lookup failed", e);
    }

    resolvedAppVersion = {
      version: CFG.currentAppVersion || "1.7",
      source: "本機後備 config.js"
    };
    updateVersionHints();
    return resolvedAppVersion;
  }

  function updateVersionHints() {
    const current = resolvedAppVersion.version || CFG.currentAppVersion || "1.7";
    const label = $("currentAppVersionLabel");
    if (label) label.textContent = current;
    const sourceEl = $("currentAppVersionSource");
    if (sourceEl) {
      sourceEl.textContent = resolvedAppVersion.source
        ? "（來源：" + resolvedAppVersion.source + "）"
        : "";
    }

    const target = ($("updTarget").value || "").trim();
    const hint = $("updTargetHint");
    if (!hint) return;
    if (!target) {
      hint.textContent = "請填與 App 相同格式，例如 " + current;
      hint.style.color = "";
      return;
    }
    if (!/^\d+(\.\d+)*$/.test(target)) {
      hint.textContent = "格式建議為數字與點，例如 1.7 或 1.7.0（不要填 build）";
      hint.style.color = "var(--danger)";
      return;
    }
    const cmp = compareVersion(current, target);
    if (cmp === 0) {
      hint.textContent = "等於目前參考版 " + current + " → 已安裝此版的使用者不會被提醒";
      hint.style.color = "var(--text2)";
    } else if (cmp < 0) {
      hint.textContent =
        "高於目前參考版 " + current + " → 仍在使用 ≤" + current + " 的使用者會被提醒／強制（視模式）";
      hint.style.color = "var(--accent)";
    } else {
      hint.textContent = "低於目前參考版 " + current + " → 通常不會觸發（本機已較新）";
      hint.style.color = "var(--danger)";
    }
  }

  // —— List / editor ——

  function selectedDraft() {
    return drafts[selectedIndex] || null;
  }

  function renderAnnList() {
    const box = $("annList");
    box.innerHTML = "";
    drafts.forEach((d, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ann-list-item" + (i === selectedIndex ? " active" : "");
      const include = document.createElement("input");
      include.type = "checkbox";
      include.checked = !!d.include;
      include.title = "納入本次";
      include.addEventListener("click", (e) => e.stopPropagation());
      include.addEventListener("change", () => {
        d.include = include.checked;
        bumpPreview();
      });

      const meta = document.createElement("div");
      meta.className = "ann-meta";
      const title = document.createElement("strong");
      title.textContent = (d.title || "").trim() || (d.id || "（無 ID）");
      const sub = document.createElement("small");
      sub.textContent = (d.id || "無 ID") + (d.enabled ? "" : " · 未啟用");
      meta.appendChild(title);
      meta.appendChild(sub);

      const badges = document.createElement("div");
      badges.style.display = "flex";
      badges.style.flexDirection = "column";
      badges.style.gap = "4px";
      badges.style.alignItems = "flex-end";
      if (!d.dismissible) {
        const b = document.createElement("span");
        b.className = "ann-badge maint";
        b.textContent = "維護";
        badges.appendChild(b);
      }
      const freq = document.createElement("span");
      freq.className = "ann-badge" + (d.frequency === "daily" && d.dismissible ? " daily" : "");
      freq.textContent = (!d.dismissible || d.frequency !== "daily") ? "單次" : "循環";
      badges.appendChild(freq);
      if (!d.enabled) {
        const off = document.createElement("span");
        off.className = "ann-badge off";
        off.textContent = "關";
        badges.appendChild(off);
      }

      btn.appendChild(include);
      btn.appendChild(meta);
      btn.appendChild(badges);
      btn.addEventListener("click", () => {
        pullEditorIntoDraft();
        selectedIndex = i;
        pushDraftToEditor();
        renderAnnList();
        bumpPreview();
      });
      box.appendChild(btn);
    });
  }

  function updateFrequencyUI() {
    const d = selectedDraft();
    const sel = $("annFrequency");
    const hint = $("annFrequencyHint");
    const maint = $("annMaintenance").checked;
    if (!d) return;
    if (maint) {
      sel.value = "once";
      sel.disabled = true;
      hint.textContent = "維護中固定為單次（不可關閉，不套用循環）。";
    } else {
      sel.disabled = false;
      hint.textContent = sel.value === "daily"
        ? "循環：每日台北日最多一次；關閉記今日；勾「不再顯示」才永久關閉。"
        : "單次：關閉後同 ID 永久不再顯示；要再觸達請換新 ID。";
    }
  }

  function pushDraftToEditor() {
    const d = selectedDraft();
    const editor = $("annEditor");
    const empty = $("annEditorEmpty");
    if (!d) {
      editor.classList.add("hidden");
      empty.classList.remove("hidden");
      return;
    }
    editor.classList.remove("hidden");
    empty.classList.add("hidden");
    suppressEditorSync = true;
    $("annEnabled").checked = !!d.enabled;
    $("annMaintenance").checked = d.dismissible === false;
    $("annId").value = d.id || "";
    $("annId").readOnly = !!d.idLocked;
    $("annIdLockHint").textContent = d.idLocked ? "（自 ID 庫載入，唯讀）" : "";
    $("annFrequency").value = d.frequency === "daily" ? "daily" : "once";
    $("annStyle").value = d.style || "fullscreen";
    $("annTitle").value = d.title || "";
    $("annBody").value = d.body || "";
    $("annCtaLabel").value = d.ctaLabel || "";
    $("annCtaURL").value = d.ctaURL || "";
    syncCtaPresetFromURL();
    fillDatetimeFromISO("starts", d.startsAt || "");
    fillDatetimeFromISO("ends", d.endsAt || "");
    updateFrequencyUI();
    suppressEditorSync = false;
  }

  function pullEditorIntoDraft() {
    if (suppressEditorSync) return;
    const d = selectedDraft();
    if (!d) return;
    syncAllDatetimes();
    d.enabled = $("annEnabled").checked;
    d.dismissible = !$("annMaintenance").checked;
    if (!d.idLocked) d.id = ($("annId").value || "").trim();
    d.frequency = d.dismissible === false ? "once" : ($("annFrequency").value === "daily" ? "daily" : "once");
    d.style = $("annStyle").value;
    d.title = ($("annTitle").value || "").trim();
    d.body = ($("annBody").value || "").trim();
    d.ctaLabel = emptyToNull($("annCtaLabel").value);
    d.ctaURL = emptyToNull($("annCtaURL").value);
    d.startsAt = emptyToNull($("annStarts").value);
    d.endsAt = emptyToNull($("annEnds").value);
  }

  function bumpPreview() {
    previewPhase = "auto";
    previewAnnIndex = 0;
    updatePreview();
  }

  function addDraft(partial) {
    pullEditorIntoDraft();
    drafts.push(defaultDraft(partial));
    selectedIndex = drafts.length - 1;
    renderAnnList();
    pushDraftToEditor();
    bumpPreview();
  }

  function deleteSelected() {
    if (!drafts.length) return;
    pullEditorIntoDraft();
    drafts.splice(selectedIndex, 1);
    selectedIndex = Math.max(0, Math.min(selectedIndex, drafts.length - 1));
    renderAnnList();
    pushDraftToEditor();
    bumpPreview();
  }

  function duplicateSelected() {
    const d = selectedDraft();
    if (!d) return;
    pullEditorIntoDraft();
    const copy = defaultDraft({
      ...draftToPayload(d),
      include: true,
      idLocked: false,
      id: (d.id || "ann") + "-copy"
    });
    drafts.splice(selectedIndex + 1, 0, copy);
    selectedIndex += 1;
    renderAnnList();
    pushDraftToEditor();
    bumpPreview();
  }

  function moveSelected(delta) {
    const i = selectedIndex;
    const j = i + delta;
    if (j < 0 || j >= drafts.length) return;
    pullEditorIntoDraft();
    const [item] = drafts.splice(i, 1);
    drafts.splice(j, 0, item);
    selectedIndex = j;
    renderAnnList();
    bumpPreview();
  }

  function readForm() {
    pullEditorIntoDraft();
    const included = drafts.filter((d) => d.include).map(draftToPayload);
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      feedbackFormURL: ($("feedbackURL").value || "").trim() || "https://forms.gle/tGECU4KmFZqs8DRD8",
      update: {
        mode: $("updMode").value,
        targetVersion: ($("updTarget").value || "").trim(),
        storeURL: ($("updStore").value || "").trim(),
        title: ($("updTitle").value || "").trim(),
        message: ($("updMessage").value || "").trim()
      },
      announcements: included
    };
  }

  function fillForm(cfg) {
    drafts = announcementsFromConfig(cfg);
    if (!drafts.length) drafts = [];
    selectedIndex = 0;
    const upd = cfg.update || {};
    $("updMode").value = upd.mode || "off";
    $("updTarget").value = upd.targetVersion || "";
    $("updStore").value = upd.storeURL || CFG.defaultAppStoreURL || "";
    $("updTitle").value = upd.title || "";
    $("updMessage").value = upd.message || "";
    $("feedbackURL").value = cfg.feedbackFormURL || "https://forms.gle/tGECU4KmFZqs8DRD8";
    renderAnnList();
    pushDraftToEditor();
    previewPhase = "auto";
    previewAnnIndex = 0;
    updatePreview();
    updateVersionHints();
  }

  function fillDefaultStoreURL() {
    $("updStore").value = CFG.defaultAppStoreURL || "https://apps.apple.com/app/id6790064657";
  }

  function syncCtaPresetFromURL() {
    const preset = $("annCtaPreset");
    if (!preset) return;
    const url = ($("annCtaURL").value || "").trim();
    const match = [...preset.options].some((o) => o.value && o.value === url);
    preset.value = match ? url : "";
  }

  function applyCtaPreset() {
    const preset = $("annCtaPreset");
    if (!preset) return;
    const v = preset.value;
    if (!v) return;
    $("annCtaURL").value = v;
    if (!$("annCtaLabel").value.trim()) {
      const text = preset.selectedOptions[0]?.textContent || "";
      if (text && text !== "自訂／外部網址（下方填）") {
        $("annCtaLabel").value = text === "關閉公告" ? "關閉" : ("前往" + text);
      }
    }
    pullEditorIntoDraft();
    bumpPreview();
  }

  function describeInternalLink(url) {
    const map = {
      "stockcalendar://close": "關閉公告",
      "stockcalendar://calendar": "日曆",
      "stockcalendar://analytics": "資產分析",
      "stockcalendar://mt": "Market Track",
      "stockcalendar://discover": "每日精選",
      "stockcalendar://accounts": "資金帳戶",
      "stockcalendar://holdings": "持股列表",
      "stockcalendar://battlefield": "加權戰線",
      "stockcalendar://settings": "設定",
      "stockcalendar://aichat": "AI 對話",
      "stockcalendar://offline": "離線資料庫",
      "stockcalendar://notifications": "推播設定",
      "stockcalendar://finmind": "FinMind Token 教學",
      "stockcalendar://finnhub": "Finnhub Token 教學",
      "https://finmindtrade.com/analysis/#/dashboards/new-info": "FinMind 申請頁",
      "https://finnhub.io/register": "Finnhub 註冊頁"
    };
    return map[(url || "").trim()] || null;
  }

  function togglePasswordVisibility(inputId, btnId) {
    const input = $(inputId);
    const btn = $(btnId);
    if (!input || !btn) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.innerHTML = show ? EYE_OFF : EYE_OPEN;
    btn.setAttribute("aria-label", show ? "隱藏密碼" : "顯示密碼");
  }

  function willShowAnnouncement(ann) {
    if (!ann || !ann.enabled) return false;
    const t = (ann.title || "").trim();
    const b = (ann.body || "").trim();
    return !!(t || b);
  }

  function previewQueue(cfg) {
    const list = (cfg.announcements || []).filter(willShowAnnouncement);
    const maint = list.find((a) => a.dismissible === false);
    if (maint) return [maint];
    return list;
  }

  function willShowUpdate(upd) {
    const mode = (upd.mode || "off").toLowerCase();
    if (mode === "off") return false;
    const target = (upd.targetVersion || "").trim();
    if (!target) return false;
    const current = CFG.currentAppVersion || "0";
    return compareVersion(current, target) < 0;
  }

  function ensureCalGrid() {
    const grid = document.querySelector(".home-cal-grid");
    if (grid && !grid.dataset.ready) {
      for (let d = 1; d <= 31; d++) {
        const cell = document.createElement("i");
        cell.textContent = String(d);
        if (d === 2) cell.className = "on";
        grid.appendChild(cell);
      }
      grid.dataset.ready = "1";
    }
  }

  function openExternal(url) {
    if (!url) return;
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (_) { /* ignore */ }
  }

  function resolvePreviewPhase(cfg) {
    const showUpd = willShowUpdate(cfg.update);
    const queue = previewQueue(cfg);
    const showAnn = queue.length > 0;
    const maintenance = showAnn && queue[0].dismissible === false;
    if (maintenance) {
      if (previewPhase === "done") return "done";
      return "announcement";
    }
    if (previewPhase === "auto") {
      if (showUpd) return "update";
      if (showAnn) return "announcement";
      return "done";
    }
    if (previewPhase === "update" && !showUpd) {
      return showAnn ? "announcement" : "done";
    }
    if (previewPhase === "announcement" && !showAnn) {
      return "done";
    }
    return previewPhase;
  }

  function setPreviewHint(phase, cfg) {
    const hint = $("previewStepHint");
    if (!hint) return;
    const showUpd = willShowUpdate(cfg.update);
    const queue = previewQueue(cfg);
    const showAnn = queue.length > 0;
    if (phase === "update") {
      hint.textContent = "步驟：版本更新（略過後看公告佇列）";
    } else if (phase === "announcement") {
      const ann = queue[Math.min(previewAnnIndex, queue.length - 1)];
      const maint = ann && ann.dismissible === false;
      const page = queue.length > 1 ? `（第 ${previewAnnIndex + 1}／${queue.length} 則）` : "";
      hint.textContent = maint
        ? "維護中：無法關閉，使用者被擋在公告外"
        : ("公告翻頁" + page + (ann && ann.frequency === "daily" ? " · 循環示意左下「不再顯示」" : ""));
    } else if (!showUpd && !showAnn) {
      hint.textContent = "目前不會顯示更新或公告";
    } else {
      hint.textContent = "流程結束 · 按「重播流程」再看一次";
    }
  }

  function buildUpdateCard(upd) {
    const mode = (upd.mode || "soft").toLowerCase();
    const card = document.createElement("div");
    card.className = "upd-card" + (mode === "force" ? " force" : "");

    const tag = document.createElement("div");
    tag.className = "upd-tag";
    tag.textContent = mode === "force" ? "強制更新" : "版本提醒";
    card.appendChild(tag);

    const h = document.createElement("h3");
    h.textContent = upd.title || "有新版本可用";
    card.appendChild(h);

    const p = document.createElement("p");
    p.textContent = upd.message || "建議更新以獲得最新功能與修正。";
    card.appendChild(p);

    const row = document.createElement("div");
    row.className = "cta-row";

    const go = document.createElement("button");
    go.type = "button";
    go.className = "cta primary";
    go.textContent = "前往更新";
    go.addEventListener("click", () => {
      const url = (upd.storeURL || "").trim() || CFG.defaultAppStoreURL;
      openExternal(url);
      const q = previewQueue(readForm());
      previewAnnIndex = 0;
      previewPhase = q.length ? "announcement" : "done";
      updatePreview();
    });
    row.appendChild(go);

    if (mode !== "force") {
      const later = document.createElement("button");
      later.type = "button";
      later.className = "cta ghost";
      later.textContent = "稍後";
      later.addEventListener("click", () => {
        const q = previewQueue(readForm());
        previewAnnIndex = 0;
        previewPhase = q.length ? "announcement" : "done";
        updatePreview();
      });
      row.appendChild(later);
    }

    card.appendChild(row);
    return card;
  }

  function advancePreviewAnn(queue) {
    if (previewAnnIndex + 1 < queue.length) {
      previewAnnIndex += 1;
      previewPhase = "announcement";
    } else {
      previewPhase = "done";
    }
    updatePreview();
  }

  function buildAnnouncementCard(ann, pageIndex, pageCount) {
    const maintenance = ann.dismissible === false;
    const style = maintenance ? "fullscreen" : (ann.style || "fullscreen");
    // 僅維護中真正鋪滿手機預覽；一般 fullscreen 仍是內縮卡片
    const wrap = document.createElement("div");
    wrap.className = "ann-preview-wrap" + (maintenance ? " is-fill" : "");

    const card = document.createElement("div");
    card.className = "ann-card " + style + (maintenance ? " maintenance" : "");
    card.style.border = "none";

    if (maintenance) {
      const top = document.createElement("div");
      top.className = "hazard";
      top.innerHTML = '<div class="hazard-track" aria-hidden="true"></div>';
      card.appendChild(top);
    }

    if (!maintenance) {
      const tagRow = document.createElement("div");
      tagRow.style.display = "flex";
      tagRow.style.alignItems = "center";
      const tag = document.createElement("div");
      tag.className = "tag";
      tag.textContent = "公告";
      tagRow.appendChild(tag);
      if (pageCount > 1) {
        const page = document.createElement("span");
        page.className = "ann-page-label";
        page.textContent = `第 ${pageIndex + 1}／${pageCount} 則`;
        tagRow.appendChild(page);
      }
      card.appendChild(tagRow);
    }

    const bodyWrap = document.createElement("div");
    bodyWrap.className = "ann-body";
    if (maintenance) {
      const tag = document.createElement("div");
      tag.className = "tag";
      tag.textContent = "維護中";
      bodyWrap.appendChild(tag);
    }
    if (ann.title) {
      const h = document.createElement("h3");
      h.textContent = ann.title;
      bodyWrap.appendChild(h);
    }
    if (ann.body) {
      const p = document.createElement("p");
      p.textContent = ann.body;
      bodyWrap.appendChild(p);
    }

    const row = document.createElement("div");
    row.className = "cta-row";
    if (ann.ctaLabel) {
      const cta = document.createElement("button");
      cta.type = "button";
      cta.className = "cta primary";
      cta.textContent = ann.ctaLabel;
      cta.addEventListener("click", () => {
        const dest = describeInternalLink(ann.ctaURL);
        if (dest) {
          if (dest === "關閉公告") {
            if (ann.dismissible) advancePreviewAnn(previewQueue(readForm()));
          } else {
            window.alert("App 內導向：" + dest + "\n（實際裝置會關閉公告並打開該頁）");
            if (ann.dismissible) advancePreviewAnn(previewQueue(readForm()));
          }
          return;
        }
        openExternal((ann.ctaURL || "").trim());
      });
      row.appendChild(cta);
    }
    if (!maintenance && ann.dismissible) {
      const close = document.createElement("button");
      close.type = "button";
      close.className = "cta ghost";
      close.textContent = ann.ctaLabel ? "關閉" : "知道了";
      close.addEventListener("click", () => {
        advancePreviewAnn(previewQueue(readForm()));
      });
      row.appendChild(close);
    }
    if (row.childNodes.length) bodyWrap.appendChild(row);
    card.appendChild(bodyWrap);

    if (maintenance) {
      const bottom = document.createElement("div");
      bottom.className = "hazard";
      bottom.innerHTML = '<div class="hazard-track" aria-hidden="true"></div>';
      card.appendChild(bottom);
    }

    wrap.appendChild(card);

    if (!maintenance && ann.dismissible && ann.frequency === "daily") {
      const never = document.createElement("label");
      never.className = "ann-never-again";
      never.innerHTML = '<input type="checkbox" /> 不再顯示';
      wrap.appendChild(never);
    }

    return wrap;
  }

  function updatePreview() {
    const cfg = readForm();
    const box = $("annPreview");
    const stage = box.closest(".home-stage");
    ensureCalGrid();

    const phase = resolvePreviewPhase(cfg);
    previewPhase = phase;
    setPreviewHint(phase, cfg);

    box.innerHTML = "";
    box.classList.remove("banner-mode", "modal-mode", "fullscreen-mode");

    const showUpd = willShowUpdate(cfg.update);
    const queue = previewQueue(cfg);
    const showAnn = queue.length > 0;

    if (phase === "update" && showUpd) {
      if (stage) stage.classList.add("has-ann");
      box.classList.add("modal-mode");
      box.appendChild(buildUpdateCard(cfg.update));
      return;
    }

    if (phase === "announcement" && showAnn) {
      if (stage) stage.classList.add("has-ann");
      if (previewAnnIndex >= queue.length) previewAnnIndex = 0;
      const ann = queue[previewAnnIndex];
      const maintenance = ann.dismissible === false;
      const style = maintenance ? "fullscreen" : (ann.style || "fullscreen");
      box.classList.toggle("banner-mode", style === "banner");
      box.classList.toggle("modal-mode", style === "modal");
      box.classList.toggle("fullscreen-mode", style === "fullscreen");
      box.appendChild(buildAnnouncementCard(ann, previewAnnIndex, queue.length));
      return;
    }

    if (stage) stage.classList.toggle("has-ann", false);
    const empty = document.createElement("div");
    empty.className = "phone-empty";
    if (!showUpd && !showAnn) {
      empty.textContent = "不顯示更新／公告";
    } else {
      empty.textContent = "流程已結束（重播可再看）";
    }
    box.appendChild(empty);
  }

  function resetPreviewFlow() {
    previewPhase = "auto";
    previewAnnIndex = 0;
    updatePreview();
  }

  // —— Archive / ID library ——

  async function fetchArchive() {
    const urls = [CFG.pagesArchiveURL, CFG.rawArchiveURL].filter(Boolean);
    for (const url of urls) {
      try {
        const res = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
        if (!res.ok) continue;
        const json = await res.json();
        archive = {
          version: json.version || 1,
          updatedAt: json.updatedAt || new Date().toISOString(),
          entries: Array.isArray(json.entries) ? json.entries : []
        };
        return;
      } catch (_) { /* next */ }
    }
    archive = { version: 1, updatedAt: new Date().toISOString(), entries: [] };
  }

  function groupArchiveById() {
    const map = new Map();
    for (const entry of archive.entries || []) {
      const snap = entry.announcement || entry.snapshot || entry;
      const id = (snap.id || entry.id || "").trim();
      if (!id) continue;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push({
        publishedAt: entry.publishedAt || entry.updatedAt || "",
        announcement: normalizeAnn(snap)
      });
    }
    for (const [, list] of map) {
      list.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
    }
    return map;
  }

  function openLibrary() {
    $("idLibraryModal").classList.remove("hidden");
    renderLibrary();
  }

  function closeLibrary() {
    $("idLibraryModal").classList.add("hidden");
  }

  function renderLibrary() {
    const idsBox = $("libraryIdList");
    const hist = $("libraryHistory");
    const edit = $("libraryEdit");
    const empty = $("libraryEmpty");
    idsBox.innerHTML = "";
    hist.innerHTML = "";
    const map = groupArchiveById();
    const ids = [...map.keys()].sort();
    if (!ids.length) {
      edit.classList.add("hidden");
      empty.classList.remove("hidden");
      empty.textContent = "尚無歷史。發布公告後會寫入此庫。";
      return;
    }
    empty.classList.add("hidden");
    if (!librarySelectedId || !map.has(librarySelectedId)) {
      librarySelectedId = ids[0];
    }
    ids.forEach((id) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "library-id-btn" + (id === librarySelectedId ? " active" : "");
      btn.textContent = id + "（" + map.get(id).length + "）";
      btn.addEventListener("click", () => {
        librarySelectedId = id;
        librarySelectedSnap = map.get(id)[0] || null;
        renderLibrary();
      });
      idsBox.appendChild(btn);
    });

    const snaps = map.get(librarySelectedId) || [];
    if (!librarySelectedSnap) librarySelectedSnap = snaps[0] || null;
    snaps.forEach((s, idx) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "library-snap" + (librarySelectedSnap === s ? " active" : "");
      const strong = document.createElement("strong");
      strong.textContent = (s.announcement.title || "").trim() || "(無標題)";
      const small = document.createElement("small");
      const freq = s.announcement.frequency === "daily" ? "循環" : "單次";
      small.textContent = (s.publishedAt || "未知時間") + " · " + freq;
      el.appendChild(strong);
      el.appendChild(small);
      el.addEventListener("click", () => {
        librarySelectedSnap = s;
        fillLibraryEdit(s.announcement);
        renderLibrary();
      });
      hist.appendChild(el);
      if (idx === 0 && librarySelectedSnap === s) fillLibraryEdit(s.announcement);
    });
    if (librarySelectedSnap) {
      edit.classList.remove("hidden");
      fillLibraryEdit(librarySelectedSnap.announcement);
    } else {
      edit.classList.add("hidden");
    }
  }

  function fillLibraryEdit(ann) {
    $("libId").value = ann.id || "";
    $("libFrequency").value = ann.frequency === "daily" ? "daily" : "once";
    $("libTitle").value = ann.title || "";
    $("libBody").value = ann.body || "";
  }

  function applyLibraryToDrafts() {
    const id = ($("libId").value || "").trim();
    if (!id || !librarySelectedSnap) return;
    const base = librarySelectedSnap.announcement;
    const draft = defaultDraft({
      ...draftToPayload(base),
      id,
      title: ($("libTitle").value || "").trim(),
      body: ($("libBody").value || "").trim(),
      frequency: $("libFrequency").value === "daily" ? "daily" : "once",
      include: true,
      idLocked: true
    });
    pullEditorIntoDraft();
    drafts.push(draft);
    selectedIndex = drafts.length - 1;
    renderAnnList();
    pushDraftToEditor();
    closeLibrary();
    bumpPreview();
  }

  function mergeArchiveEntries(publishedAnns, publishedAt) {
    const next = {
      version: 1,
      updatedAt: publishedAt,
      entries: Array.isArray(archive.entries) ? [...archive.entries] : []
    };
    for (const ann of publishedAnns) {
      if (!ann.id) continue;
      next.entries.unshift({
        publishedAt,
        announcement: { ...ann }
      });
    }
    // 保留最近 200 筆
    if (next.entries.length > 200) next.entries = next.entries.slice(0, 200);
    archive = next;
    return next;
  }

  async function fetchConfig() {
    const status = $("loadStatus");
    status.textContent = "載入中…";
    status.className = "status";
    await resolveCurrentAppVersion();
    await fetchArchive();
    const urls = [CFG.pagesConfigURL, CFG.rawConfigURL];
    for (const url of urls) {
      try {
        const res = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
        if (!res.ok) continue;
        const json = await res.json();
        fillForm(json);
        status.textContent = "已載入：" + url;
        status.className = "status ok";
        return;
      } catch (_) { /* try next */ }
    }
    status.textContent = "載入失敗（Pages 可能尚未啟用，可先手動填寫後發布）";
    status.className = "status err";
  }

  function downloadJSON() {
    const dtError = validateDatetimesForPublish();
    if (dtError) {
      $("publishStatus").textContent = dtError;
      $("publishStatus").className = "status err";
      return;
    }
    const blob = new Blob([JSON.stringify(readForm(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "app-config.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
  }

  async function fetchLatestSha(apiBase, branch, token) {
    const metaRes = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`
      }
    });
    if (metaRes.ok) {
      const meta = await metaRes.json();
      return meta.sha;
    }
    if (metaRes.status === 404) return null;
    throw new Error("讀取遠端檔案失敗：" + metaRes.status);
  }

  async function putFile({ path, contentObj, message, token, branch }) {
    const { owner, repo } = CFG.github;
    const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const content = utf8ToBase64(JSON.stringify(contentObj, null, 2) + "\n");

    async function putOnce(sha) {
      const body = { message, content, branch };
      if (sha) body.sha = sha;
      return fetch(apiBase, {
        method: "PUT",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
    }

    let sha = await fetchLatestSha(apiBase, branch, token);
    let putRes = await putOnce(sha);
    if (putRes.status === 409) {
      sha = await fetchLatestSha(apiBase, branch, token);
      putRes = await putOnce(sha);
    }
    return putRes;
  }

  async function publish() {
    const status = $("publishStatus");
    const token = ($("pat").value || "").trim();
    if (!token) {
      status.textContent = "請先貼上 GitHub PAT";
      status.className = "status err";
      return;
    }
    const dtError = validateDatetimesForPublish();
    if (dtError) {
      status.textContent = dtError;
      status.className = "status err";
      return;
    }
    const cfg = readForm();
    if (cfg.update.mode !== "off" && !cfg.update.targetVersion) {
      status.textContent = "更新模式非 off 時請填 targetVersion";
      status.className = "status err";
      return;
    }

    const maintList = cfg.announcements.filter((a) => a.dismissible === false);
    if (maintList.length > 1) {
      status.textContent = "維護中最多只能納入一則";
      status.className = "status err";
      return;
    }
    for (const ann of cfg.announcements) {
      if (!ann.dismissible) {
        if (!ann.enabled) {
          status.textContent = "維護中需啟用該則公告";
          status.className = "status err";
          return;
        }
        if (!(ann.title || "").trim() && !(ann.body || "").trim()) {
          status.textContent = "維護中請填寫標題或內文";
          status.className = "status err";
          return;
        }
      }
      if (ann.enabled && !(ann.id || "").trim()) {
        status.textContent = "已啟用的公告需要 ID";
        status.className = "status err";
        return;
      }
    }

    // 重複 ID 警告（仍允許，但提示）
    const ids = cfg.announcements.map((a) => a.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      status.textContent = "納入清單有重複 ID，請先修正";
      status.className = "status err";
      return;
    }

    status.textContent = "發布中…";
    status.className = "status";

    const { path, archivePath, branch } = CFG.github;
    const message = ($("commitMsg").value || "").trim() || "chore: update app-config";
    const publishedAt = cfg.updatedAt;
    const archiveNext = mergeArchiveEntries(cfg.announcements, publishedAt);

    try {
      const putCfg = await putFile({
        path,
        contentObj: cfg,
        message,
        token,
        branch: branch || "main"
      });
      if (!putCfg.ok) {
        const errText = await putCfg.text();
        if (putCfg.status === 409) {
          status.textContent = "發布衝突（409）：檔案已被更新。請按「載入最新版」後再發布一次。";
        } else {
          status.textContent = "發布 app-config 失敗：" + putCfg.status + " " + errText.slice(0, 160);
        }
        status.className = "status err";
        return;
      }

      if (archivePath) {
        const putArch = await putFile({
          path: archivePath,
          contentObj: archiveNext,
          message: message + " (archive)",
          token,
          branch: branch || "main"
        });
        if (!putArch.ok) {
          const errText = await putArch.text();
          status.textContent = "app-config 已寫入，但 archive 失敗：" + putArch.status + " " + errText.slice(0, 120);
          status.className = "status err";
          return;
        }
      }

      status.textContent = "已發布，正在載入最新版…";
      status.className = "status ok";
      persistPatToSession();
      // 立即套用本次寫入內容（Pages 可能尚未更新；避免載到舊快取）
      fillForm(cfg);
      const loadStatus = $("loadStatus");
      if (loadStatus) {
        loadStatus.textContent = "已載入本次發布內容";
        loadStatus.className = "status ok";
      }
      status.textContent = "已發布 app-config 與 ID 庫，並載入最新版。對外 Pages 可能需數分鐘生效。";
    } catch (e) {
      status.textContent = "發布錯誤：" + e.message;
      status.className = "status err";
    }
  }

  async function tryGate() {
    const status = $("gateStatus");
    const hash = await sha256Hex($("gatePassword").value || "");
    if (hash === CFG.passwordSha256) {
      unlockUI();
      fetchConfig();
    } else {
      status.textContent = "密碼錯誤";
      status.className = "status err";
    }
  }

  $("gateBtn").addEventListener("click", tryGate);
  $("gatePassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryGate();
  });
  $("gatePassToggle").addEventListener("click", () => togglePasswordVisibility("gatePassword", "gatePassToggle"));
  $("logoutBtn").addEventListener("click", lockUI);
  $("themeBtn").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : cur === "light" ? "dark" : (
      window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark"
    );
    setTheme(next);
  });
  $("loadBtn").addEventListener("click", fetchConfig);
  $("downloadBtn").addEventListener("click", downloadJSON);
  $("publishBtn").addEventListener("click", publish);
  $("fillStoreBtn").addEventListener("click", fillDefaultStoreURL);
  $("patToggle").addEventListener("click", () => togglePasswordVisibility("pat", "patToggle"));
  $("pat").addEventListener("change", persistPatToSession);
  $("pat").addEventListener("blur", persistPatToSession);
  $("previewResetBtn").addEventListener("click", resetPreviewFlow);
  $("annCtaPreset").addEventListener("change", applyCtaPreset);
  $("annCtaURL").addEventListener("input", syncCtaPresetFromURL);
  $("updTarget").addEventListener("input", updateVersionHints);
  $("updTarget").addEventListener("change", updateVersionHints);

  $("annAddBtn").addEventListener("click", () => addDraft());
  $("annDupBtn").addEventListener("click", duplicateSelected);
  $("annDelBtn").addEventListener("click", deleteSelected);
  $("annUpBtn").addEventListener("click", () => moveSelected(-1));
  $("annDownBtn").addEventListener("click", () => moveSelected(1));
  $("annLibraryBtn").addEventListener("click", async () => {
    await fetchArchive();
    openLibrary();
  });
  $("idLibraryClose").addEventListener("click", closeLibrary);
  document.querySelectorAll("[data-close-library]").forEach((el) => {
    el.addEventListener("click", closeLibrary);
  });
  $("libApplyBtn").addEventListener("click", applyLibraryToDrafts);

  $("annMaintenance").addEventListener("change", () => {
    if ($("annMaintenance").checked) {
      $("annFrequency").value = "once";
    }
    updateFrequencyUI();
    pullEditorIntoDraft();
    renderAnnList();
    bumpPreview();
  });

  [
    "annEnabled", "annId", "annFrequency", "annStyle",
    "annTitle", "annBody", "annCtaLabel", "annCtaURL",
    "updMode", "updTarget", "updStore", "updTitle", "updMessage"
  ].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", () => {
      if (id === "annFrequency") updateFrequencyUI();
      pullEditorIntoDraft();
      renderAnnList();
      bumpPreview();
    });
    el.addEventListener("change", () => {
      if (id === "annFrequency") updateFrequencyUI();
      pullEditorIntoDraft();
      renderAnnList();
      bumpPreview();
    });
  });

  const dtInputIds = [
    "startsY", "startsM", "startsD", "startsH", "startsMin",
    "endsY", "endsM", "endsD", "endsH", "endsMin"
  ];
  dtInputIds.forEach((id) => {
    const el = $(id);
    el.addEventListener("input", () => {
      el.value = el.value.replace(/\D/g, "");
      syncAllDatetimes();
      pullEditorIntoDraft();
      bumpPreview();
    });
    el.addEventListener("blur", () => {
      syncAllDatetimes();
      pullEditorIntoDraft();
      updatePreview();
    });
  });
  document.querySelectorAll("[data-clear]").forEach((btn) => {
    btn.addEventListener("click", () => clearDatetime(btn.getAttribute("data-clear")));
  });

  function initCollapsiblePanels() {
    document.querySelectorAll("[data-collapsible]").forEach((panel) => {
      const btn = panel.querySelector(".panel-toggle");
      if (!btn) return;
      const key = "sc_admin_panel_" + (panel.getAttribute("data-panel") || "");
      const saved = sessionStorage.getItem(key);
      if (saved === "0") {
        panel.classList.add("collapsed");
        btn.setAttribute("aria-expanded", "false");
      }
      btn.addEventListener("click", () => {
        const collapsed = panel.classList.toggle("collapsed");
        btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
        sessionStorage.setItem(key, collapsed ? "0" : "1");
      });
    });
  }

  initTheme();
  initCollapsiblePanels();
  updateVersionHints();
  resolveCurrentAppVersion();
  drafts = [];
  renderAnnList();
  pushDraftToEditor();
  syncAllDatetimes();
  if (sessionStorage.getItem(SESSION_KEY) === "1") {
    unlockUI();
    fetchConfig();
  }

  window.sha256Hex = sha256Hex;
})();
