(() => {
  const CFG = window.STOCKCALENDAR_ADMIN;
  const SESSION_KEY = "sc_admin_unlocked";
  const PAT_SESSION_KEY = "sc_admin_pat";
  const THEME_KEY = "sc_admin_theme";

  /** 預覽流程：update → announcement → done */
  let previewPhase = "auto";

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

  function initAccordions() {
    document.querySelectorAll("[data-accordion]").forEach((section) => {
      const head = section.querySelector(".accordion-head");
      if (!head) return;
      head.addEventListener("click", () => {
        const open = section.classList.toggle("open");
        head.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
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
    // PAT 留在 Session，下次進站門後自動還原
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

  /** 回傳 { ok, empty, iso, error, invalidFields } */
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
    // 再驗證可被 Date 解析
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
    updatePreview();
  }

  /** 解析 ISO 字串填回分割欄位（支援 +08:00 / Z） */
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
      // 無法分割時仍寫入 hidden，並提示
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

  function validateDatetimesForPublish() {
    const { starts, ends } = syncAllDatetimes();
    if (!starts.ok) return "開始時間格式有誤：" + starts.error;
    if (!ends.ok) return "結束時間格式有誤：" + ends.error;
    if (starts.iso && ends.iso && Date.parse(starts.iso) >= Date.parse(ends.iso)) {
      return "結束時間必須晚於開始時間";
    }
    return null;
  }

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

  function updateVersionHints() {
    const current = CFG.currentAppVersion || "1.4";
    const label = $("currentAppVersionLabel");
    if (label) label.textContent = current;

    const target = ($("updTarget").value || "").trim();
    const hint = $("updTargetHint");
    if (!hint) return;
    if (!target) {
      hint.textContent = "請填與 App 相同格式，例如 " + current;
      hint.style.color = "";
      return;
    }
    if (!/^\d+(\.\d+)*$/.test(target)) {
      hint.textContent = "格式建議為數字與點，例如 1.4 或 1.4.0（不要填 build）";
      hint.style.color = "var(--danger)";
      return;
    }
    const cmp = compareVersion(current, target);
    if (cmp === 0) {
      hint.textContent = "等於目前參考版 " + current + " → 已安裝此版的使用者不會被提醒";
      hint.style.color = "var(--text2)";
    } else if (cmp < 0) {
      hint.textContent = "高於目前參考版 " + current + " → 現有 1.4 使用者會被提醒／強制（視模式）";
      hint.style.color = "var(--accent)";
    } else {
      hint.textContent = "低於目前參考版 " + current + " → 通常不會觸發（本機已較新）";
      hint.style.color = "var(--danger)";
    }
  }

  function readForm() {
    syncAllDatetimes();
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
      announcement: {
        enabled: $("annEnabled").checked,
        id: ($("annId").value || "").trim(),
        style: $("annStyle").value,
        title: ($("annTitle").value || "").trim(),
        body: ($("annBody").value || "").trim(),
        accent: $("annAccent").value,
        ctaLabel: emptyToNull($("annCtaLabel").value),
        ctaURL: emptyToNull($("annCtaURL").value),
        dismissible: !$("annMaintenance").checked,
        startsAt: emptyToNull($("annStarts").value),
        endsAt: emptyToNull($("annEnds").value)
      }
    };
  }

  function fillForm(cfg) {
    const ann = cfg.announcement || {};
    const upd = cfg.update || {};
    $("annEnabled").checked = !!ann.enabled;
    $("annMaintenance").checked = ann.dismissible === false;
    $("annId").value = ann.id || "";
    $("annStyle").value = ann.style || "fullscreen";
    $("annAccent").value = ann.accent || "brand";
    $("annTitle").value = ann.title || "";
    $("annBody").value = ann.body || "";
    $("annCtaLabel").value = ann.ctaLabel || "";
    $("annCtaURL").value = ann.ctaURL || "";
    fillDatetimeFromISO("starts", ann.startsAt || "");
    fillDatetimeFromISO("ends", ann.endsAt || "");
    $("updMode").value = upd.mode || "off";
    $("updTarget").value = upd.targetVersion || "";
    $("updStore").value = upd.storeURL || CFG.defaultAppStoreURL || "";
    $("updTitle").value = upd.title || "";
    $("updMessage").value = upd.message || "";
    $("feedbackURL").value = cfg.feedbackFormURL || "https://forms.gle/tGECU4KmFZqs8DRD8";
    previewPhase = "auto";
    updatePreview();
    updateVersionHints();
  }

  function fillDefaultStoreURL() {
    $("updStore").value = "";
    $("updStore").value = CFG.defaultAppStoreURL || "https://apps.apple.com/app/id6790064657";
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

  function togglePatVisibility() {
    togglePasswordVisibility("pat", "patToggle");
  }

  function toggleGatePassVisibility() {
    togglePasswordVisibility("gatePassword", "gatePassToggle");
  }

  function willShowAnnouncement(ann) {
    if (!ann.enabled) return false;
    const t = (ann.title || "").trim();
    const b = (ann.body || "").trim();
    return !!(t || b);
  }

  function willShowUpdate(upd) {
    const mode = (upd.mode || "off").toLowerCase();
    if (mode === "off") return false;
    const target = (upd.targetVersion || "").trim();
    if (!target) return false;
    const current = CFG.currentAppVersion || "0";
    return compareVersion(current, target) < 0;
  }

  function accentBorder(accent) {
    switch ((accent || "").toLowerCase()) {
      case "warning": return "#F59E0B";
      case "danger": return "#F87171";
      case "info": return "#3B82F6";
      default: return "#16A34A";
    }
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
    const showAnn = willShowAnnouncement(cfg.announcement);
    const maintenance = showAnn && cfg.announcement.dismissible === false;
    // 維護中：直接擋在公告，略過更新預覽步驟
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
    const showAnn = willShowAnnouncement(cfg.announcement);
    if (phase === "update") {
      hint.textContent = "步驟 1／2：版本更新（點按鈕可開連結／略過後看公告）";
    } else if (phase === "announcement") {
      const maint = cfg.announcement && cfg.announcement.dismissible === false;
      hint.textContent = maint
        ? "維護中：無法關閉，使用者被擋在公告外（僅 CTA 可點）"
        : (showUpd ? "步驟 2／2：公告（點 CTA 可開啟連結）" : "目前：公告（點 CTA 可開啟連結）");
    } else if (!showUpd && !showAnn) {
      hint.textContent = "目前不會顯示更新或公告（可調高 targetVersion 或啟用公告）";
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
      previewPhase = willShowAnnouncement(readForm().announcement) ? "announcement" : "done";
      updatePreview();
    });
    row.appendChild(go);

    if (mode !== "force") {
      const later = document.createElement("button");
      later.type = "button";
      later.className = "cta ghost";
      later.textContent = "稍後";
      later.addEventListener("click", () => {
        previewPhase = willShowAnnouncement(readForm().announcement) ? "announcement" : "done";
        updatePreview();
      });
      row.appendChild(later);
    }

    card.appendChild(row);
    return card;
  }

  function buildAnnouncementCard(ann) {
    const maintenance = ann.dismissible === false;
    const style = maintenance ? "fullscreen" : (ann.style || "fullscreen");
    const card = document.createElement("div");
    card.className = "ann-card " + style + (maintenance ? " maintenance" : "");
    card.style.borderColor = accentBorder(ann.accent);

    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = maintenance ? "維護中" : "公告";
    tag.style.color = maintenance ? "#DC2626" : accentBorder(ann.accent);
    tag.style.background = maintenance ? "#DC262633" : accentBorder(ann.accent) + "33";
    card.appendChild(tag);

    const bodyWrap = document.createElement("div");
    bodyWrap.className = "ann-body";
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
    card.appendChild(bodyWrap);

    const row = document.createElement("div");
    row.className = "cta-row";
    if (ann.ctaLabel) {
      const cta = document.createElement("button");
      cta.type = "button";
      cta.className = "cta primary";
      cta.style.background = accentBorder(ann.accent);
      cta.textContent = ann.ctaLabel;
      cta.addEventListener("click", () => {
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
        previewPhase = "done";
        updatePreview();
      });
      row.appendChild(close);
    }
    if (row.childNodes.length) card.appendChild(row);
    return card;
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
    const showAnn = willShowAnnouncement(cfg.announcement);

    if (phase === "update" && showUpd) {
      if (stage) stage.classList.add("has-ann");
      box.classList.add("modal-mode");
      box.appendChild(buildUpdateCard(cfg.update));
      return;
    }

    if (phase === "announcement" && showAnn) {
      if (stage) stage.classList.add("has-ann");
      const maintenance = cfg.announcement.dismissible === false;
      const style = maintenance ? "fullscreen" : (cfg.announcement.style || "fullscreen");
      box.classList.toggle("banner-mode", style === "banner");
      box.classList.toggle("modal-mode", style === "modal");
      box.classList.toggle("fullscreen-mode", style === "fullscreen");
      box.appendChild(buildAnnouncementCard(cfg.announcement));
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
    updatePreview();
  }

  async function fetchConfig() {
    const status = $("loadStatus");
    status.textContent = "載入中…";
    status.className = "status";
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
    if ($("annMaintenance").checked) {
      if (!cfg.announcement.enabled) {
        status.textContent = "維護中需勾選「啟用公告」";
        status.className = "status err";
        return;
      }
      const t = (cfg.announcement.title || "").trim();
      const b = (cfg.announcement.body || "").trim();
      if (!t && !b) {
        status.textContent = "維護中請填寫公告標題或內文，否則使用者看不到阻擋畫面";
        status.className = "status err";
        return;
      }
    }
    status.textContent = "發布中…";
    status.className = "status";

    const { owner, repo, path, branch } = CFG.github;
    const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const content = utf8ToBase64(JSON.stringify(cfg, null, 2) + "\n");
    const message = ($("commitMsg").value || "").trim() || "chore: update app-config";

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

    try {
      let sha = await fetchLatestSha(apiBase, branch, token);
      let putRes = await putOnce(sha);
      // 409：遠端已變（例如剛發布過）→ 重抓 SHA 再試一次
      if (putRes.status === 409) {
        sha = await fetchLatestSha(apiBase, branch, token);
        putRes = await putOnce(sha);
      }
      if (!putRes.ok) {
        const errText = await putRes.text();
        if (putRes.status === 409) {
          status.textContent = "發布衝突（409）：檔案已被更新。請按「載入線上版」後再發布一次。";
        } else {
          status.textContent = "發布失敗：" + putRes.status + " " + errText.slice(0, 160);
        }
        status.className = "status err";
        return;
      }
      status.textContent = "已發布。GitHub Pages 可能需數分鐘才生效。";
      status.className = "status ok";
      persistPatToSession();
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
  $("gatePassToggle").addEventListener("click", toggleGatePassVisibility);
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
  $("patToggle").addEventListener("click", togglePatVisibility);
  $("pat").addEventListener("change", persistPatToSession);
  $("pat").addEventListener("blur", persistPatToSession);
  $("previewResetBtn").addEventListener("click", resetPreviewFlow);
  $("updTarget").addEventListener("input", updateVersionHints);
  $("updTarget").addEventListener("change", updateVersionHints);

  [
    "annEnabled", "annMaintenance", "annId", "annStyle", "annAccent",
    "annTitle", "annBody", "annCtaLabel", "annCtaURL",
    "updMode", "updTarget", "updStore", "updTitle", "updMessage"
  ].forEach((id) => {
    $(id).addEventListener("input", () => {
      previewPhase = "auto";
      updatePreview();
    });
    $(id).addEventListener("change", () => {
      previewPhase = "auto";
      updatePreview();
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
      previewPhase = "auto";
      updatePreview();
    });
    el.addEventListener("blur", () => {
      syncAllDatetimes();
      updatePreview();
    });
  });
  document.querySelectorAll("[data-clear]").forEach((btn) => {
    btn.addEventListener("click", () => clearDatetime(btn.getAttribute("data-clear")));
  });

  initTheme();
  updateVersionHints();
  syncAllDatetimes();
  if (sessionStorage.getItem(SESSION_KEY) === "1") {
    unlockUI();
    fetchConfig();
  }

  window.sha256Hex = sha256Hex;
})();
