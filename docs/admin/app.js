(() => {
  const CFG = window.STOCKCALENDAR_ADMIN;
  const SESSION_KEY = "sc_admin_unlocked";
  const THEME_KEY = "sc_admin_theme";

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
  }

  function lockUI() {
    $("gate").classList.remove("hidden");
    $("app").classList.add("hidden");
    sessionStorage.removeItem(SESSION_KEY);
    $("pat").value = "";
  }

  function emptyToNull(s) {
    const t = (s || "").trim();
    return t ? t : null;
  }

  function readForm() {
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
        dismissible: $("annDismissible").checked,
        startsAt: emptyToNull($("annStarts").value),
        endsAt: emptyToNull($("annEnds").value)
      }
    };
  }

  function fillForm(cfg) {
    const ann = cfg.announcement || {};
    const upd = cfg.update || {};
    $("annEnabled").checked = !!ann.enabled;
    $("annDismissible").checked = ann.dismissible !== false;
    $("annId").value = ann.id || "";
    $("annStyle").value = ann.style || "fullscreen";
    $("annAccent").value = ann.accent || "brand";
    $("annTitle").value = ann.title || "";
    $("annBody").value = ann.body || "";
    $("annCtaLabel").value = ann.ctaLabel || "";
    $("annCtaURL").value = ann.ctaURL || "";
    $("annStarts").value = ann.startsAt || "";
    $("annEnds").value = ann.endsAt || "";
    $("updMode").value = upd.mode || "off";
    $("updTarget").value = upd.targetVersion || "";
    $("updStore").value = upd.storeURL || "";
    $("updTitle").value = upd.title || "";
    $("updMessage").value = upd.message || "";
    $("feedbackURL").value = cfg.feedbackFormURL || "https://forms.gle/tGECU4KmFZqs8DRD8";
    updatePreview();
  }

  function willShowAnnouncement(ann) {
    if (!ann.enabled) return false;
    const t = (ann.title || "").trim();
    const b = (ann.body || "").trim();
    return !!(t || b);
  }

  function updatePreview() {
    const cfg = readForm();
    const box = $("annPreview");
    const ann = cfg.announcement;
    if (!willShowAnnouncement(ann)) {
      box.className = "preview empty";
      box.textContent = "不顯示公告";
      return;
    }
    box.className = "preview";
    box.innerHTML = "";
    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = `公告 · ${ann.style}`;
    box.appendChild(tag);
    if (ann.title) {
      const h = document.createElement("h3");
      h.textContent = ann.title;
      box.appendChild(h);
    }
    if (ann.body) {
      const p = document.createElement("p");
      p.textContent = ann.body;
      box.appendChild(p);
    }
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

  async function publish() {
    const status = $("publishStatus");
    const token = ($("pat").value || "").trim();
    if (!token) {
      status.textContent = "請先貼上 GitHub PAT";
      status.className = "status err";
      return;
    }
    const cfg = readForm();
    if (cfg.update.mode !== "off" && !cfg.update.targetVersion) {
      status.textContent = "更新模式非 off 時請填 targetVersion";
      status.className = "status err";
      return;
    }
    status.textContent = "發布中…";
    status.className = "status";

    const { owner, repo, path, branch } = CFG.github;
    const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    let sha;
    try {
      const metaRes = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`
        }
      });
      if (metaRes.ok) {
        const meta = await metaRes.json();
        sha = meta.sha;
      } else if (metaRes.status !== 404) {
        status.textContent = "讀取遠端檔案失敗：" + metaRes.status;
        status.className = "status err";
        return;
      }
    } catch (e) {
      status.textContent = "網路錯誤：" + e.message;
      status.className = "status err";
      return;
    }

    const body = {
      message: ($("commitMsg").value || "").trim() || "chore: update app-config",
      content: utf8ToBase64(JSON.stringify(cfg, null, 2) + "\n"),
      branch
    };
    if (sha) body.sha = sha;

    try {
      const putRes = await fetch(apiBase, {
        method: "PUT",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      if (!putRes.ok) {
        const errText = await putRes.text();
        status.textContent = "發布失敗：" + putRes.status + " " + errText.slice(0, 180);
        status.className = "status err";
        return;
      }
      status.textContent = "已發布。GitHub Pages 可能需數分鐘才生效。";
      status.className = "status ok";
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

  // Events
  $("gateBtn").addEventListener("click", tryGate);
  $("gatePassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryGate();
  });
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

  [
    "annEnabled", "annDismissible", "annId", "annStyle", "annAccent",
    "annTitle", "annBody", "annCtaLabel", "annCtaURL", "annStarts", "annEnds"
  ].forEach((id) => {
    $(id).addEventListener("input", updatePreview);
    $(id).addEventListener("change", updatePreview);
  });

  initTheme();
  if (sessionStorage.getItem(SESSION_KEY) === "1") {
    unlockUI();
    fetchConfig();
  }

  // 方便維護者產生新雜湊
  window.sha256Hex = sha256Hex;
})();
