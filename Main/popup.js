const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

let SETTINGS = null;
let CURRENT_PAGE = "";
let SEARCH = "";
let ACTIVE_MODULES = [];
let SB_STATUS_TIMER = null;
const WEBSITE_URL = "http://127.0.0.1:8080/";

const MODULE_ORDER = ["effects", "overlay", "wled", "caller", "obszoom", "macros", "websitedesign", "community", "liga"];
const WEBSITE_ICON_COLOR = "assets/ICON.png";
const WEBSITE_ICON_GRAY = "assets/ICON_grau.png";
const LAST_PAGE_STORAGE_KEY = "ad_sb_last_popup_page";

function currentLang() {
  const lang = String(SETTINGS?.uiLanguage || "de").toLowerCase();
  return lang === "en" ? "en" : "de";
}

function t(key, vars = {}) {
  const dict = (window.AD_SB_I18N && window.AD_SB_I18N[currentLang()]) || {};
  const fallback = (window.AD_SB_I18N && window.AD_SB_I18N.en) || {};
  let out = dict[key] || fallback[key] || key;
  for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
  return out;
}

function normalizePrefix(p) {
  const txt = String(p || "").trim();
  return txt.endsWith(" ") ? txt : `${txt} `;
}

function normalizeWebsiteApiUrl(url) {
  return String(url || "http://127.0.0.1:8080").trim().replace(/\/+$/, "");
}

function getWebsiteAccountUrl() {
  return `${normalizeWebsiteApiUrl(SETTINGS?.websiteApiUrl)}/account.html`;
}

async function callWebsiteApi(path, options = {}) {
  const baseUrl = normalizeWebsiteApiUrl(options.baseUrl || SETTINGS?.websiteApiUrl);
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  const token = String(options.token || SETTINGS?.accountToken || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(String(data?.error || `HTTP ${res.status}`));
  }
  return data;
}

function normalizeInstalledModules(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const id = String(item || "").trim().toLowerCase();
    if (!id) continue;
    if (out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

function getInstalledModuleSet(raw) {
  return new Set(normalizeInstalledModules(raw));
}

function getModuleConfigList() {
  return Object.values(window.AD_SB_MODULE_CONFIGS || {});
}

function collectModuleIniSpec() {
  const spec = {
    togglesBool: [],
    togglesNumber: {},
    modulesConfigString: {}
  };
  for (const cfg of getModuleConfigList()) {
    const ini = cfg?.ini || {};
    for (const key of ini.togglesBool || []) {
      if (!spec.togglesBool.includes(key)) spec.togglesBool.push(key);
    }
    Object.assign(spec.togglesNumber, ini.togglesNumber || {});
    Object.assign(spec.modulesConfigString, ini.modulesConfigString || {});
  }
  return spec;
}

function clearOverflowMarquee() {
  const nodes = $$(".liTitle, .liSub, .cardTitle, .sectionTitle");
  nodes.forEach((el) => {
    if (el.dataset.plainText) el.textContent = el.dataset.plainText;
    el.classList.remove("marqueeOn");
    el.style.removeProperty("--marquee-duration");
  });
}

function applyOverflowMarquee() {
  const nodes = $$(".liTitle, .liSub, .cardTitle, .sectionTitle");
  nodes.forEach((el) => {
    if (el.querySelector(":scope > .marqueeTrack")) el.textContent = el.dataset.plainText || "";
    const plain = (el.textContent || "").trim();
    el.dataset.plainText = plain;
    el.classList.remove("marqueeOn");
    el.style.removeProperty("--marquee-duration");

    if (!plain || !el.offsetParent || el.scrollWidth <= el.clientWidth + 2) return;

    const track = document.createElement("span");
    track.className = "marqueeTrack";
    const a = document.createElement("span");
    const b = document.createElement("span");
    a.className = "marqueeItem";
    b.className = "marqueeItem";
    a.textContent = plain;
    b.textContent = plain;
    track.append(a, b);
    el.textContent = "";
    el.appendChild(track);

    const seconds = Math.max(6, Math.min(16, plain.length * 0.22));
    el.style.setProperty("--marquee-duration", `${seconds}s`);
    el.classList.add("marqueeOn");
  });
}

function applyI18n() {
  clearOverflowMarquee();

  $$("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    el.textContent = t(key);
  });
  $$("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (!key) return;
    el.setAttribute("placeholder", t(key));
  });
  $$("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (!key) return;
    el.setAttribute("title", t(key));
  });
  $$("[data-i18n-aria-label]").forEach((el) => {
    const key = el.dataset.i18nAriaLabel;
    if (!key) return;
    el.setAttribute("aria-label", t(key));
  });

  requestAnimationFrame(applyOverflowMarquee);
}

function setPage(name) {
  const pageName = String(name || "settings");
  const exists = !!document.querySelector(`.page[data-page="${pageName}"]`);
  if (!exists) return;

  CURRENT_PAGE = pageName;
  try {
    localStorage.setItem(LAST_PAGE_STORAGE_KEY, pageName);
  } catch {}

  $$(".page").forEach((p) => p.classList.toggle("active", p.dataset.page === pageName));
  $$(".navItem").forEach((b) => b.classList.toggle("active", b.dataset.nav === pageName));
  applySearchFilter(SEARCH);
}

function getLastPageOrDefault() {
  try {
    const saved = String(localStorage.getItem(LAST_PAGE_STORAGE_KEY) || "").trim().toLowerCase();
    if (!saved) return "settings";
    const exists = !!document.querySelector(`.page[data-page="${saved}"]`);
    return exists ? saved : "settings";
  } catch {
    return "settings";
  }
}

function clearInvalidLastPageIfNeeded(installedModules) {
  try {
    const saved = String(localStorage.getItem(LAST_PAGE_STORAGE_KEY) || "").trim().toLowerCase();
    if (!saved || saved === "settings") return;
    const installed = normalizeInstalledModules(installedModules);
    if (!installed.includes(saved)) {
      localStorage.setItem(LAST_PAGE_STORAGE_KEY, "settings");
    }
  } catch {}
}

function applySearchFilter(query) {
  SEARCH = String(query || "").trim().toLowerCase();
  const activePage = document.querySelector(".page.active");
  if (!activePage) return;
  const rows = $$(".listItem, .listToggle, .tile, .card", activePage);
  rows.forEach((el) => {
    if (!SEARCH) {
      el.style.display = "";
      return;
    }
    el.style.display = (el.innerText || "").toLowerCase().includes(SEARCH) ? "" : "none";
  });
}

async function send(msg) {
  return chrome.runtime.sendMessage(msg);
}

function setChecked(root, id, value) {
  const el = root.querySelector(`#${id}`);
  if (!el) return;
  el.checked = !!value;
}

function setValue(root, id, value) {
  const el = root.querySelector(`#${id}`);
  if (!el) return;
  el.value = value;
}

function bindAuto(root, id, key, type = "checkbox") {
  const el = root.querySelector(`#${id}`);
  if (!el) return;
  el.addEventListener("change", async () => {
    const value = type === "checkbox"
      ? !!el.checked
      : type === "number"
        ? parseInt(el.value || "0", 10)
        : el.value;
    await savePartial({ [key]: value });
  });
}

function applyStatusToPill(pill, status) {
  if (!pill) return;
  const state = String(status?.state || "unknown").toLowerCase();
  pill.classList.remove("connected", "disconnected");
  if (state === "connected") {
    pill.textContent = t("status_connected");
    pill.classList.add("connected");
    return;
  }
  if (state === "connecting") {
    pill.textContent = t("status_connecting");
    return;
  }
  if (state === "disconnected") {
    pill.textContent = t("status_disconnected");
    pill.classList.add("disconnected");
    return;
  }
  pill.textContent = t("status_unknown");
}

function applySbStatus(status, id = "wsStatus") {
  applyStatusToPill($(id), status);
}

async function refreshSbStatus() {
  const ids = ["wsStatus", "overlaySbStatus"];
  if (!ids.some((id) => !!$(id))) return;
  try {
    const res = await send({ type: "GET_SB_STATUS" });
    const status = res?.ok ? res.status : { state: "unknown" };
    ids.forEach((id) => applySbStatus(status, id));
  } catch {
    ids.forEach((id) => applySbStatus({ state: "unknown" }, id));
  }
}

function parseIniBoolean(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  return null;
}

function parseIniNumber(raw, fallback = 0) {
  const n = parseInt(String(raw || "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseIniSettings(text) {
  const sections = {};
  let current = "";
  const lines = String(text || "").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) {
      current = sec[1].trim().toLowerCase();
      if (!sections[current]) sections[current] = {};
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!sections[current]) sections[current] = {};
    sections[current][key] = value;
  }

  const partial = {};
  const sb = sections.streamerbot || {};
  const toggles = sections.toggles || {};
  const actions = sections.actions || {};
  const modules = sections.modules || sections.addons || {};

  if (sb.sbUrl) partial.sbUrl = sb.sbUrl;
  if (sb.obsUrl) partial.obsUrl = sb.obsUrl;
  if (sb.actionPrefix !== undefined) partial.actionPrefix = normalizePrefix(sb.actionPrefix);
  if (toggles.uiLanguage !== undefined) partial.uiLanguage = String(toggles.uiLanguage).toLowerCase() === "en" ? "en" : "de";

  if (modules.installed !== undefined) {
    partial.installedModules = normalizeInstalledModules(String(modules.installed).split(","));
  }

  const boolKeys = [
    "enabled",
    "onlyMyThrows",
    "debugActions",
    "debugGameEvents"
  ];
  const moduleIniSpec = collectModuleIniSpec();
  for (const key of moduleIniSpec.togglesBool) {
    if (!boolKeys.includes(key)) boolKeys.push(key);
  }
  for (const key of boolKeys) {
    if (toggles[key] === undefined) continue;
    const parsed = parseIniBoolean(toggles[key]);
    if (parsed !== null) partial[key] = parsed;
  }

  if (toggles.myPlayerIndex !== undefined) partial.myPlayerIndex = parseIniNumber(toggles.myPlayerIndex, 0);
  for (const [key, fallback] of Object.entries(moduleIniSpec.togglesNumber)) {
    if (toggles[key] === undefined) continue;
    partial[key] = parseIniNumber(toggles[key], fallback);
  }

  const moduleCfg = sections.modules_config || sections.addons_config || {};
  for (const [key, fallback] of Object.entries(moduleIniSpec.modulesConfigString)) {
    if (moduleCfg[key] === undefined) continue;
    partial[key] = String(moduleCfg[key] || fallback || "");
  }
  if (Object.keys(actions).length > 0) partial.actions = actions;

  return partial;
}

function toIniText(s) {
  const settings = s || {};
  const asBool = (v) => (v ? "true" : "false");
  const actions = settings.actions || {};
  const installedModules = normalizeInstalledModules(settings.installedModules);
  const moduleIniSpec = collectModuleIniSpec();
  const moduleToggleBoolLines = moduleIniSpec.togglesBool.map((key) => `${key}=${asBool(settings[key])}`);
  const moduleToggleNumberLines = Object.entries(moduleIniSpec.togglesNumber).map(
    ([key, fallback]) => `${key}=${Number.isFinite(settings[key]) ? settings[key] : fallback}`
  );
  const moduleConfigLines = Object.entries(moduleIniSpec.modulesConfigString).map(
    ([key, fallback]) => `${key}=${settings[key] || fallback || ""}`
  );

  const lines = [
    "[modules]",
    `installed=${installedModules.join(",")}`,
    "",
    "[streamerbot]",
    `sbUrl=${settings.sbUrl || "ws://127.0.0.1:8080/"}`,
    `obsUrl=${settings.obsUrl || "ws://127.0.0.1:4455/"}`,
    `actionPrefix=${(settings.actionPrefix || "AD-SB ").trim()}`,
    "",
    "[toggles]",
    `enabled=${asBool(settings.enabled)}`,
    `onlyMyThrows=${asBool(settings.onlyMyThrows)}`,
    `myPlayerIndex=${Number.isFinite(settings.myPlayerIndex) ? settings.myPlayerIndex : 0}`,
    `uiLanguage=${String(settings.uiLanguage || "de").toLowerCase() === "en" ? "en" : "de"}`,
    "",
    ...moduleToggleBoolLines,
    ...moduleToggleNumberLines,
    "",
    `debugActions=${asBool(settings.debugActions)}`,
    `debugGameEvents=${asBool(settings.debugGameEvents)}`,
    "",
    "[modules_config]",
    ...moduleConfigLines,
    "",
    "[actions]",
    ...Object.keys(actions)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => `${k}=${actions[k]}`)
  ];
  return `${lines.join("\n")}\n`;
}

function toModuleIniText(settings, moduleConfig) {
  const cfg = moduleConfig || {};
  const ini = cfg.ini || {};
  const asBool = (v) => (v ? "true" : "false");
  const lines = [
    "[module]",
    `id=${String(cfg.id || "")}`,
    ""
  ];

  const boolKeys = Array.isArray(ini.togglesBool) ? ini.togglesBool : [];
  const numberEntries = Object.entries(ini.togglesNumber || {});
  if (boolKeys.length || numberEntries.length) {
    lines.push("[toggles]");
    for (const key of boolKeys) {
      lines.push(`${key}=${asBool(settings?.[key])}`);
    }
    for (const [key, fallback] of numberEntries) {
      lines.push(`${key}=${Number.isFinite(settings?.[key]) ? settings[key] : fallback}`);
    }
    lines.push("");
  }

  const moduleConfigEntries = Object.entries(ini.modulesConfigString || {});
  if (moduleConfigEntries.length) {
    lines.push("[modules_config]");
    for (const [key, fallback] of moduleConfigEntries) {
      lines.push(`${key}=${settings?.[key] || fallback || ""}`);
    }
    lines.push("");
  }

  const actionKeys = [
    ...Object.keys(cfg.actionDefaults || {}),
    ...Object.keys(settings?.actions || {}).filter((key) => key.startsWith("custom_"))
  ].filter((key, index, arr) => arr.indexOf(key) === index);
  if (actionKeys.length) {
    lines.push("[actions]");
    for (const key of actionKeys.sort((a, b) => a.localeCompare(b))) {
      if (settings?.actions?.[key] !== undefined) {
        lines.push(`${key}=${settings.actions[key]}`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function buildIniFiles(settings) {
  const files = [{
    name: "settings.ini",
    content: toIniText(settings)
  }];
  for (const cfg of getModuleConfigList()) {
    if (!cfg?.id) continue;
    files.push({
      name: `${String(cfg.id || "").toLowerCase()}.ini`,
      content: toModuleIniText(settings, cfg)
    });
  }
  return files;
}

function getModuleList() {
  const registry = window.AD_SB_MODULES || {};
  return MODULE_ORDER
    .map((id) => registry[id])
    .filter((a) => !!a && typeof a.render === "function");
}

function collectFeatureNeeds(modules) {
  const needs = { streamerbot: false, obs: false };
  for (const module of modules || []) {
    if (module?.needs?.streamerbot) needs.streamerbot = true;
    if (module?.needs?.obs) needs.obs = true;
  }
  return needs;
}

function apiFor(root) {
  return {
    root,
    t,
    send,
    getSettings: () => SETTINGS,
    savePartial,
    bindAuto,
    setChecked,
    setValue,
    normalizePrefix,
    parseIniSettings,
    toIniText,
    buildIniFiles,
    refreshSbStatus,
    callWebsiteApi,
    normalizeWebsiteApiUrl,
    getWebsiteAccountUrl,
    normalizeInstalledModules,
    getModuleList
  };
}

function startSbStatusTimer() {
  if (SB_STATUS_TIMER) clearInterval(SB_STATUS_TIMER);
  SB_STATUS_TIMER = null;
  if (!$("wsStatus") && !$("overlaySbStatus")) return;
  refreshSbStatus();
  SB_STATUS_TIMER = setInterval(refreshSbStatus, 1200);
}

function setModuleShellState(hasModules) {
  const header = document.querySelector(".header");
  const nav = $("moduleNav");
  const host = $("moduleHost");
  if (!header || !nav || !host) return;
  header.style.display = hasModules ? "" : "none";
  nav.style.display = hasModules ? "flex" : "none";
  host.style.padding = hasModules ? "" : "0";
}

function navIconSvg(id, fallback = "*") {
  const map = {
    settings: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="M19 12a7 7 0 0 0-.08-1l2-1.55-2-3.45-2.43.75a7.3 7.3 0 0 0-1.73-1l-.38-2.5H9.62l-.38 2.5a7.3 7.3 0 0 0-1.73 1L5.08 5.99l-2 3.45L5.08 11A7 7 0 0 0 5 12c0 .34.03.67.08 1l-2 1.55 2 3.45 2.43-.75c.53.41 1.11.75 1.73 1l.38 2.5h4.76l.38-2.5c.62-.25 1.2-.59 1.73-1l2.43.75 2-3.45-2-1.55c.05-.33.08-.66.08-1Z"/></svg>`,
    effects: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 1.9 4.7L19 9.2l-3.9 3.2 1.2 4.9L12 14.7 7.7 17.3l1.2-4.9L5 9.2l5.1-1.5L12 3Z"/></svg>`,
    overlay: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 10h8M8 14h5"/></svg>`,
    wled: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3a6 6 0 0 0-3.8 10.6c.5.4.8 1 .8 1.6V16h6v-.8c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z"/><path d="M10 19h4M10.5 21h3"/></svg>`,
    caller: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="4" width="6" height="10" rx="3"/><path d="M6.5 11.5a5.5 5.5 0 1 0 11 0M12 17v3M9.5 20h5"/></svg>`,
    obszoom: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4M11 8v6M8 11h6"/></svg>`,
    websitedesign: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 16 8-8 4 4-8 8H4v-4Z"/><path d="m14 6 2-2 4 4-2 2"/></svg>`,
    community: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="8" cy="9" r="3"/><circle cx="16" cy="8" r="2.5"/><path d="M3.5 18a4.5 4.5 0 0 1 9 0"/><path d="M13 18a3.5 3.5 0 0 1 7 0"/></svg>`,
    liga: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 5h10v4a5 5 0 0 1-10 0V5Z"/><path d="M9 19h6M12 14v5"/><path d="M5 5h2M17 5h2"/></svg>`
  };
  return map[id] || `<span>${fallback}</span>`;
}

function appendWebsiteButton(nav) {
  if (!nav) return;
  const btn = document.createElement("button");
  btn.className = "navSiteBtn";
  btn.type = "button";
  btn.title = "Website";
  btn.setAttribute("aria-label", "Website");
  btn.innerHTML = `
    <img src="${WEBSITE_ICON_GRAY}" alt="Website" />
    <div class="navText">Website</div>
  `;
  btn.addEventListener("click", () => {
    const url = String(WEBSITE_URL || "").trim();
    if (!url) return;
    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url });
      return;
    }
    window.open(url, "_blank");
  });
  nav.appendChild(btn);
  refreshWebsiteAccessState(btn);
}

function createNavButton(id, labelKey, iconFallback, onClick) {
  const btn = document.createElement("button");
  btn.className = "navItem";
  btn.dataset.nav = id;
  btn.innerHTML = `
    <div class="navIcon">${navIconSvg(id, iconFallback || "*")}</div>
    <div class="navText" data-i18n="${labelKey || `nav_${id}`}"></div>
  `;
  btn.addEventListener("click", onClick);
  return btn;
}

async function refreshWebsiteAccessState(btn) {
  if (!btn) return;
  const img = btn.querySelector("img");
  btn.classList.remove("noSiteAccess");
  if (img) img.src = WEBSITE_ICON_COLOR;
  btn.title = "Website";
  btn.setAttribute("aria-label", "Website");
}

function buildModuleLayout(settings) {
  const host = $("moduleHost");
  const nav = $("moduleNav");
  if (!host || !nav) return;

  const moduleList = getModuleList();
  const installedSet = getInstalledModuleSet(settings?.installedModules);
  clearInvalidLastPageIfNeeded(settings?.installedModules);
  ACTIVE_MODULES = moduleList.slice();
  const needs = collectFeatureNeeds(moduleList.filter((module) => installedSet.has(module.id)));

  host.innerHTML = "";
  nav.innerHTML = "";
  setModuleShellState(true);

  const navTop = document.createElement("div");
  navTop.className = "navSection navSectionTop";
  const navMiddle = document.createElement("div");
  navMiddle.className = "navSection navSectionMiddle";
  const navBottom = document.createElement("div");
  navBottom.className = "navSection navSectionBottom";
  nav.append(navTop, navMiddle, navBottom);

  const settingsPage = document.createElement("section");
  settingsPage.className = "page";
  settingsPage.dataset.page = "settings";
  settingsPage.innerHTML = window.AD_SB_MAIN_SETTINGS?.render?.({ needs, settings, t }) || "";
  host.appendChild(settingsPage);

  const settingsBtn = createNavButton(
    "settings",
    window.AD_SB_MAIN_SETTINGS?.navLabelKey || "nav_settings",
    window.AD_SB_MAIN_SETTINGS?.icon || "[]",
    () => setPage("settings")
  );
  window.AD_SB_MAIN_SETTINGS?.bind?.(apiFor(settingsPage));

  for (const module of ACTIVE_MODULES) {
    const page = document.createElement("section");
    page.className = "page";
    page.dataset.page = module.id;
    page.classList.toggle("pageDisabled", !installedSet.has(module.id));
    page.innerHTML = module.render({ needs });
    host.appendChild(page);

    const btn = createNavButton(
      module.id,
      module.navLabelKey || `nav_${module.id}`,
      module.icon || "*",
      () => setPage(module.id)
    );
    btn.classList.toggle("disabled", !installedSet.has(module.id));
    if (module.id === "community") navBottom.appendChild(btn);
    else navMiddle.appendChild(btn);

    module.bind?.(apiFor(page));
  }
  navBottom.appendChild(settingsBtn);
  appendWebsiteButton(navTop);

  window.AD_SB_MAIN_SETTINGS?.sync?.(apiFor(settingsPage), settings);
  for (const module of ACTIVE_MODULES) {
    const page = host.querySelector(`.page[data-page="${module.id}"]`);
    module.sync?.(apiFor(page), settings);
  }

  setPage(getLastPageOrDefault());
  applyI18n();
  applySearchFilter($("searchInput")?.value || "");
  startSbStatusTimer();
}

function syncActiveModules(settings) {
  SETTINGS = settings;
  const settingsPage = document.querySelector(`.page[data-page="settings"]`);
  if (settingsPage) {
    window.AD_SB_MAIN_SETTINGS?.sync?.(apiFor(settingsPage), settings);
  }
  for (const module of ACTIVE_MODULES) {
    const page = document.querySelector(`.page[data-page="${module.id}"]`);
    if (!page) continue;
    module.sync?.(apiFor(page), settings);
  }
  applyI18n();
  refreshSbStatus();
}

async function savePartial(partial) {
  const prev = normalizeInstalledModules(SETTINGS?.installedModules).join(",");
  const res = await send({ type: "SET_SETTINGS", settings: partial || {} });
  if (!res?.ok || !res.settings) return;
  const next = normalizeInstalledModules(res.settings.installedModules).join(",");
  SETTINGS = res.settings;
  if (prev !== next) {
    buildModuleLayout(SETTINGS);
    return;
  }
  syncActiveModules(SETTINGS);
}

function bindShell() {
  $("searchInput")?.addEventListener("input", (ev) => applySearchFilter(ev.target.value));
  $("clearSearch")?.addEventListener("click", () => {
    if ($("searchInput")) $("searchInput").value = "";
    applySearchFilter("");
  });
}

async function init() {
  bindShell();
  const res = await send({ type: "GET_SETTINGS" });
  SETTINGS = res?.ok ? res.settings : {};
  buildModuleLayout(SETTINGS);
  window.addEventListener("beforeunload", () => {
    if (SB_STATUS_TIMER) clearInterval(SB_STATUS_TIMER);
  }, { once: true });
}

init();
