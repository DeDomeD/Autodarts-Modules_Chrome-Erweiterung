/**
 * Themes engine (Autodarts play.autodarts.io)
 * Responsibility:
 * - reads theme settings from chrome.storage
 * - resolves theme from Horizontal/Vertical config sets
 * - applies CSS through local style + background scripting API
 */
(() => {
let WEBSITE_THEME_STATE = {
  enabled: false,
  layout: "horizontal",
  theme: "classic",
  arenaPrimaryHue: 210,
  arenaSecondaryHue: 155,
  dartboardGlowEnabled: true,
  backgroundImageData: "",
  backgroundSize: "cover"
};
let WEBSITE_THEME_REAPPLY_TIMER = null;
let SELECTED_MARKER_OBSERVER = null;
let SELECTED_MARKER_TIMER = null;
let lastKnownHref = String(location.href || "");
const WEBSITE_THEME_STYLE_ID = "ad-sb-webdesign-style";
const MENU_TOGGLE_STYLE_ID = "ad-sb-menu-toggle-style";
const MENU_TOGGLE_BUTTON_ID = "ad-sb-menu-toggle-button";
const MENU_STATE_KEY = "ad_sb_left_menu_collapsed";
let LAST_MENU_TARGET = null;
let LAST_LOGO_RECT = null;
const MENU_TARGET_STYLE_BACKUP = new WeakMap();
const MENU_PARENT_STYLE_BACKUP = new WeakMap();
const BUILDER_SAVE_BUTTON_ID = "ad-sb-theme-builder-save";
const BUILDER_PICKER_TOGGLE_BUTTON_ID = "ad-sb-theme-builder-picker-toggle";
const BUILDER_RESET_BUTTON_ID = "ad-sb-theme-builder-reset";
const BUILDER_PIN_BUTTON_ID = "ad-sb-theme-builder-pin-toggle";
const BUILDER_PIN_PANEL_ID = "ad-sb-theme-builder-pin-panel";
const BUILDER_BOX_ID = "ad-sb-theme-builder-box";
const BUILDER_HANDLE_ID = "ad-sb-theme-builder-handle";
const BUILDER_ROTATE_HANDLE_ID = "ad-sb-theme-builder-rotate";
const BUILDER_STYLE_ID = "ad-sb-theme-builder-style";
const BUILDER_DIALOG_ID = "ad-sb-theme-builder-dialog";
const BUILDER_PICKER_ID = "ad-sb-theme-builder-picker";
const BUILDER_HINT_ID = "ad-sb-theme-builder-hint";
const DARTBOARD_GLOW_TARGET_KEY = "dartboard-glow";
let BUILDER_ACTIVE = false;
let BUILDER_SESSION_ACTIVE = false;
let BUILDER_DATA = {};
let BUILDER_SELECTED = null;
let BUILDER_SELECTED_SELECTOR = "";
let BUILDER_DRAG = null;
let BUILDER_RESIZE = null;
let BUILDER_ROTATE_DRAG = null;
let BUILDER_TARGETS = [];
let BUILDER_HISTORY = [];
let BUILDER_HISTORY_INDEX = -1;
let BUILDER_SESSION_SNAPSHOT = {};
let BUILDER_PICKER_OPEN = false;
let BUILDER_PIN_OPEN = false;
const BUILDER_TARGET_KEYS = [
  { key: "dartboard", label: "Dartscheibe" },
  { key: "points-table-left", label: "Punktetafel links" },
  { key: "points-table-right", label: "Punktetafel rechts" },
  { key: "score-value-left", label: "Score Zahl links" },
  { key: "score-value-right", label: "Score Zahl rechts" },
  { key: "player-badge-left", label: "Badge links" },
  { key: "player-badge-right", label: "Badge rechts" },
  { key: "player-meta-left", label: "Spielerzeile links" },
  { key: "player-meta-right", label: "Spielerzeile rechts" },
  { key: "player-stats-left", label: "Stats links" },
  { key: "player-stats-right", label: "Stats rechts" },
  { key: "player-score-left", label: "Score links" },
  { key: "player-score-right", label: "Score rechts" },
  { key: "throw-total", label: "Gesamtpunkte" },
  { key: "throw-track", label: "Wurf-Leiste (BullOff)" },
  { key: "dartboard-animations", label: "Scheibe Animationen" },
  { key: "dartboard-mount", label: "Scheibe Rahmen" },
  { key: "throw-point-1", label: "Punktfeld 1" },
  { key: "throw-point-2", label: "Punktfeld 2" },
  { key: "throw-point-3", label: "Punktfeld 3" },
  { key: "action-undo", label: "Undo" },
  { key: "action-next", label: "Next" }
];
const BUILDER_DEFAULT_ALIGNMENT_THEMES = new Set(["classic", "hue", "minimal"]);

function parseThemeBuilderTargets(raw) {
  try {
    const arr = JSON.parse(String(raw || "[]"));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        key: String(x.key || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "")
          .slice(0, 48),
        label: String(x.label || x.key || "").trim().slice(0, 80) || String(x.key || "").trim(),
        selector: String(x.selector || "").trim()
      }))
      .filter((x) => x.key && x.selector);
  } catch {
    return [];
  }
}

/** Basis-Ziele plus aus Einstellungen (`websiteThemeBuilderTargets`) */
function getEffectiveBuilderTargetKeys() {
  const extra = Array.isArray(WEBSITE_THEME_STATE.themeBuilderTargets) ? WEBSITE_THEME_STATE.themeBuilderTargets : [];
  const byKey = new Map();
  BUILDER_TARGET_KEYS.forEach((t) => byKey.set(t.key, { ...t }));
  extra.forEach((t) => {
    if (!t?.key) return;
    const key = String(t.key).trim().toLowerCase();
    const label = String(t.label || key).trim() || key;
    byKey.set(key, { key, label });
  });
  return Array.from(byKey.values());
}

const MENU_LOGO_INLINE_SVG = `
  <svg viewBox="0 0 500 500" aria-hidden="true" focusable="false">
    <g clip-path="url(#adSbClip)">
      <path d="M181.082 250.02C181.082 311.958 231.472 362.357 293.423 362.357C355.374 362.357 405.784 311.958 405.784 250.02C405.784 188.081 355.374 137.701 293.423 137.701C231.472 137.701 181.082 188.081 181.082 250.02ZM230.071 250.02C230.071 215.076 258.492 186.68 293.423 186.68C328.374 186.68 356.795 215.095 356.795 250.02C356.795 284.963 328.374 313.379 293.423 313.379C258.492 313.379 230.071 284.944 230.071 250.02Z" fill="currentColor"/>
      <path d="M8 250.02C8 261.886 17.621 271.505 29.4889 271.505H96.3368C107.091 370.748 191.356 448.296 293.424 448.296C321.864 448.296 348.846 442.171 373.33 431.343L406.764 489.23C412.698 499.502 425.833 503.034 436.126 497.102C446.4 491.169 449.933 478.036 444 467.745L410.489 409.704C459.651 373.59 491.759 315.53 491.759 250.001C491.759 184.453 459.651 126.431 410.489 90.3166L444.038 32.2182C449.972 21.9463 446.458 8.79445 436.165 2.86173C425.891 -3.07099 412.736 0.442562 406.802 10.7336L373.33 68.6785C348.865 57.8498 321.864 51.7443 293.424 51.7443C191.337 51.7443 107.072 129.273 96.3176 228.536H29.4889C17.621 228.536 8 238.155 8 250.02ZM144.096 250.02C144.096 167.711 211.098 100.742 293.424 100.742C375.769 100.742 442.751 167.73 442.751 250.02C442.751 332.349 375.75 399.337 293.424 399.337C211.098 399.337 144.096 332.349 144.096 250.02Z" fill="currentColor"/>
    </g>
    <defs>
      <clipPath id="adSbClip">
        <rect width="483.74" height="500" transform="translate(8)"/>
      </clipPath>
    </defs>
  </svg>
`;

const FALLBACK_THEME_SETS = {
  horizontal: [
    {
      id: "classic",
      css: `
        body{background:linear-gradient(180deg, #2f3f8d 0%, #2c5fad 55%, #245aa3 100%) !important;}
      `
    }
  ],
  vertical: [
    {
      id: "stack",
      css: `
        body{background:linear-gradient(180deg, #1f2b54 0%, #2e4e89 52%, #2f6aaa 100%) !important;}
      `
    }
  ]
};

function getBaseThemeSets() {
  const src = globalThis.AD_SB_WEBSITE_THEME_SETS || {};
  return {
    horizontal: Array.isArray(src.horizontal) && src.horizontal.length
      ? src.horizontal
      : FALLBACK_THEME_SETS.horizontal,
    vertical: Array.isArray(src.vertical) && src.vertical.length
      ? src.vertical
      : FALLBACK_THEME_SETS.vertical
  };
}

function parseCustomThemes(raw) {
  try {
    const arr = JSON.parse(String(raw || "[]"));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        id: String(x.id || "").toLowerCase(),
        label: String(x.label || x.name || "Custom").trim() || "Custom",
        css: String(x.css || ""),
        builderData: (x.builderData && typeof x.builderData === "object") ? x.builderData : {}
      }))
      .filter((x) => !!x.id);
  } catch {
    return [];
  }
}

function getThemeSetsFromState(state) {
  const base = getBaseThemeSets();
  const horizontal = [...base.horizontal, ...(state?.customThemesHorizontal || [])];
  const vertical = [...base.vertical, ...(state?.customThemesVertical || [])];
  return { horizontal, vertical };
}

function normalizeLayout(raw) {
  return String(raw || "").toLowerCase() === "vertical" ? "vertical" : "horizontal";
}

function clampHue(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(360, Math.round(n)));
}

function normalizeTheme(layout, rawTheme, stateRef = WEBSITE_THEME_STATE) {
  const themes = getThemeSetsFromState(stateRef)[layout] || [];
  let wanted = String(rawTheme || "").toLowerCase();
  if (wanted === "arena") wanted = "hue";
  if (wanted === "tools-glass") wanted = "stream-glass";
  if (themes.some((t) => t.id === wanted)) return wanted;
  return themes[0]?.id || "";
}

function findTheme(layout, theme) {
  const themes = getThemeSetsFromState(WEBSITE_THEME_STATE)[layout] || [];
  return themes.find((t) => t.id === theme) || themes[0] || null;
}

function normalizeWebsiteThemeSettings(settings) {
  const s = settings || {};
  const layout = normalizeLayout(s.websiteLayout);
  const customThemesHorizontal = parseCustomThemes(s.websiteCustomThemesHorizontal);
  const customThemesVertical = parseCustomThemes(s.websiteCustomThemesVertical);
  const tempState = { customThemesHorizontal, customThemesVertical };
  const theme = normalizeTheme(layout, s.websiteTheme, tempState);
  let builderData = {};
  try {
    const raw = String(s.websiteThemeBuilderData || "{}");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") builderData = parsed;
  } catch {}
  const bgSizeRaw = String(s.websiteBackgroundSize || "cover").toLowerCase();
  const backgroundSize =
    bgSizeRaw === "contain" || bgSizeRaw === "auto" ? bgSizeRaw : "cover";
  const themesInstalled =
    Array.isArray(s.installedModules) &&
    s.installedModules.some((id) => {
      const x = String(id || "").toLowerCase();
      return x === "themes" || x === "websitedesign";
    });
  const themesOn =
    s.themesEnabled !== false &&
    (s.themesEnabled === true || s.websiteDesignEnabled === true || themesInstalled);
  return {
    enabled: themesOn,
    layout,
    theme,
    arenaPrimaryHue: clampHue(s.websiteArenaPrimaryHue, 210),
    arenaSecondaryHue: clampHue(s.websiteArenaSecondaryHue, 155),
    dartboardGlowEnabled: s.websiteDartboardGlowEnabled !== false,
    builderEnabled: !!s.websiteThemeBuilderEnabled,
    builderData,
    customThemesHorizontal,
    customThemesVertical,
    themeBuilderTargets: parseThemeBuilderTargets(s.websiteThemeBuilderTargets),
    backgroundImageData: String(s.websiteBackgroundImageData || "").trim(),
    backgroundSize
  };
}

function buildCustomBackgroundCss(cfg) {
  const raw = String(cfg?.backgroundImageData || "").trim();
  if (!raw) return "";
  const dataUrl = raw.startsWith("data:") ? raw : `data:image/jpeg;base64,${raw}`;
  const sizeRaw = String(cfg?.backgroundSize || "cover").toLowerCase();
  const size = sizeRaw === "contain" || sizeRaw === "auto" ? sizeRaw : "cover";
  let urlLit = "";
  try {
    urlLit = JSON.stringify(dataUrl);
  } catch {
    return "";
  }
  return `
    html{min-height:100% !important;}
    body{
      background-image:url(${urlLit}) !important;
      background-size:${size} !important;
      background-position:center center !important;
      background-repeat:no-repeat !important;
      background-attachment:fixed !important;
    }
  `;
}

function buildThemeCss(cfg) {
  const accent = "#19c7ff";
  const accentSoft = "rgba(25,199,255,.25)";

  const shared = `
    :root{
      --ad-sb-accent:${accent};
      --ad-sb-accent-soft:${accentSoft};
      --ad-sb-border:rgba(255,255,255,.14);
      --ad-sb-text:#eaf1ff;
      --ad-sb-arena-primary-h:${cfg.arenaPrimaryHue};
      --ad-sb-arena-secondary-h:${cfg.arenaSecondaryHue};
    }
    body{
      color:var(--ad-sb-text) !important;
    }
    button,[role="button"],input,select,textarea{
      border-radius:8px !important;
    }
    .MuiToggleButton-root,
    [class*="toggle"],
    [class*="Toggle"]{
      border-radius:10px !important;
    }
    .Mui-selected,
    button[aria-pressed="true"],
    [role="button"][aria-pressed="true"],
    [role="radio"][aria-checked="true"],
    [aria-selected="true"],
    [aria-current="true"],
    [data-selected="true"],
    [data-active="true"],
    [data-state="active"],
    [data-state="on"],
    button:has(input[type="radio"]:checked),
    button:has(input[type="checkbox"]:checked),
    label:has(input[type="radio"]:checked),
    label:has(input[type="checkbox"]:checked),
    .ad-sb-selected-marker{
      background:linear-gradient(180deg, rgba(194,216,255,.84), rgba(165,193,247,.72)) !important;
      border-color:rgba(232,242,255,.98) !important;
      color:#ffffff !important;
      box-shadow:0 0 0 1px rgba(232,242,255,.55) inset, 0 0 14px rgba(170,206,255,.35) !important;
      font-weight:700 !important;
    }
    .ad-sb-unselected-marker{
      filter:saturate(.9);
      opacity:.94;
    }
    [class*="score"],[data-testid*="score"],[class*="player"],[class*="Player"]{
      border-radius:10px !important;
    }
    /* Remove box/outline around throw total number field */
    [class*="throw"] [class*="MuiOutlinedInput-root"],
    [class*="score"] [class*="MuiOutlinedInput-root"],
    [data-testid*="score"] [class*="MuiOutlinedInput-root"],
    [class*="visit"] [class*="MuiOutlinedInput-root"],
    [class*="throw"] input,
    [class*="visit"] input{
      background:transparent !important;
      border:none !important;
      box-shadow:none !important;
      outline:none !important;
    }
    [class*="throw"] .MuiOutlinedInput-notchedOutline,
    [class*="score"] .MuiOutlinedInput-notchedOutline,
    [data-testid*="score"] .MuiOutlinedInput-notchedOutline,
    [class*="visit"] .MuiOutlinedInput-notchedOutline,
    [class*="throw"] fieldset,
    [class*="visit"] fieldset{
      border:none !important;
      outline:none !important;
      box-shadow:none !important;
    }
    [class*="MuiPaper-root"],[class*="card"],[class*="panel"],[class*="board"]{
      border-color:var(--ad-sb-border) !important;
    }
    ${cfg.dartboardGlowEnabled ? "" : `
      [data-ad-sb-dartboard-glow="1"]{
        display:none !important;
        opacity:0 !important;
      }
    `}
  `;

  const verticalLayout = `
    [class*="scoreboard"],[class*="players"],[class*="player-list"],[class*="matchHeader"]{
      display:grid !important;
      grid-template-columns:1fr !important;
      gap:10px !important;
    }
  `;

  const horizontalLayout = `
    [class*="scoreboard"],[class*="players"]{
      gap:8px !important;
    }
  `;

  const themeCfg = findTheme(cfg.layout, cfg.theme);
  const layoutCss = cfg.layout === "vertical" ? verticalLayout : horizontalLayout;
  const themeCss = String(themeCfg?.css || "");
  const customBg = buildCustomBackgroundCss(cfg);

  return `
    ${shared}
    ${layoutCss}
    ${themeCss}
    ${customBg}
  `;
}

function getStoredMenuCollapsed() {
  try {
    const raw = localStorage.getItem(MENU_STATE_KEY);
    if (raw === "0") return false;
    return true;
  } catch {
    return true;
  }
}

function setStoredMenuCollapsed(collapsed) {
  try {
    localStorage.setItem(MENU_STATE_KEY, collapsed ? "1" : "0");
  } catch {}
}

function getOrCreateMenuToggleStyle() {
  let style = document.getElementById(MENU_TOGGLE_STYLE_ID);
  if (style) return style;
  style = document.createElement("style");
  style.id = MENU_TOGGLE_STYLE_ID;
  style.textContent = `
    #${MENU_TOGGLE_BUTTON_ID}{
      position:fixed;
      top:10px;
      left:10px;
      width:44px;
      height:44px;
      border-radius:10px;
      border:none;
      background:transparent;
      display:flex;
      align-items:center;
      justify-content:center;
      cursor:pointer;
      z-index:2147483647;
      padding:0;
    }
    #${MENU_TOGGLE_BUTTON_ID} .adSbLogoMark{
      width:100%;
      height:100%;
      display:flex;
      color:#ffffff;
      filter:drop-shadow(0 1px 3px rgba(0,0,0,.35));
      transform:scale(1);
      transform-origin:center;
    }
    #${MENU_TOGGLE_BUTTON_ID} .adSbLogoMark svg{
      width:100%;
      height:100%;
      display:block;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
  return style;
}

function scoreLeftMenuCandidate(el) {
  if (!el) return -1;
  const r = el.getBoundingClientRect();
  if (r.width < 120 || r.width > 420) return -1;
  if (r.height < (window.innerHeight * 0.60)) return -1;
  if (r.left > 40) return -1;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return -1;
  let score = 0;
  if (style.position === "fixed") score += 20;
  if (style.position === "sticky") score += 12;
  if (style.position === "absolute") score += 8;
  if (r.left <= 2) score += 12;
  if (r.width >= 180 && r.width <= 340) score += 18;
  const hint = `${el.className || ""} ${el.id || ""}`.toLowerCase();
  if (hint.includes("side")) score += 12;
  if (hint.includes("menu")) score += 10;
  if (hint.includes("nav")) score += 8;
  if (hint.includes("drawer")) score += 8;
  const text = String(el.innerText || "").toLowerCase();
  if (text.includes("autodarts")) score += 32;
  const navItems = el.querySelectorAll("a,button,[role='button'],li").length;
  if (navItems >= 6) score += 10;
  return score;
}

function findLeftMenuTarget() {
  // Strong anchor: element containing the brand text "AUTODARTS"
  const brandNode = Array.from(document.querySelectorAll("a,div,span,h1,h2"))
    .find((el) => String(el.textContent || "").trim().toUpperCase() === "AUTODARTS");
  if (brandNode) {
    const chain = [];
    let cur = brandNode;
    for (let i = 0; i < 8 && cur; i += 1) {
      if (cur instanceof HTMLElement) chain.push(cur);
      cur = cur.parentElement;
    }
    let best = null;
    let bestScore = -1;
    chain.forEach((el) => {
      const s = scoreLeftMenuCandidate(el);
      if (s > bestScore) {
        bestScore = s;
        best = el;
      }
    });
    if (best) return best;
  }

  const selectors = [
    "aside",
    "nav",
    "[class*='sidebar']",
    "[class*='sideBar']",
    "[class*='drawer']",
    "[class*='menu']",
    "[id*='sidebar']",
    "[id*='menu']",
    "[id*='drawer']"
  ];
  const nodes = document.querySelectorAll(selectors.join(","));
  let best = null;
  let bestScore = -1;
  nodes.forEach((el) => {
    const s = scoreLeftMenuCandidate(el);
    if (s > bestScore) {
      bestScore = s;
      best = el;
    }
  });
  if (bestScore >= 0) return best;

  // Fallback: sample elements from the left viewport edge.
  for (let y = 60; y < window.innerHeight - 40; y += 90) {
    const stack = document.elementsFromPoint(8, y);
    for (const el of stack) {
      let cur = el;
      for (let i = 0; i < 8 && cur; i += 1) {
        if (cur instanceof HTMLElement) {
          const s = scoreLeftMenuCandidate(cur);
          if (s > bestScore) {
            bestScore = s;
            best = cur;
          }
        }
        cur = cur.parentElement;
      }
    }
  }
  return bestScore >= 0 ? best : null;
}

function backupTargetStyles(target) {
  if (!target || MENU_TARGET_STYLE_BACKUP.has(target)) return;
  MENU_TARGET_STYLE_BACKUP.set(target, {
    display: target.style.display || "",
    width: target.style.width || "",
    minWidth: target.style.minWidth || "",
    maxWidth: target.style.maxWidth || "",
    overflow: target.style.overflow || "",
    opacity: target.style.opacity || "",
    pointerEvents: target.style.pointerEvents || ""
  });
}

function restoreTargetStyles(target) {
  if (!target) return;
  const prev = MENU_TARGET_STYLE_BACKUP.get(target);
  if (!prev) return;
  target.style.display = prev.display;
  target.style.width = prev.width;
  target.style.minWidth = prev.minWidth;
  target.style.maxWidth = prev.maxWidth;
  target.style.overflow = prev.overflow;
  target.style.opacity = prev.opacity;
  target.style.pointerEvents = prev.pointerEvents;
}

function backupParentStyles(parent) {
  if (!parent || MENU_PARENT_STYLE_BACKUP.has(parent)) return;
  MENU_PARENT_STYLE_BACKUP.set(parent, {
    gridTemplateColumns: parent.style.gridTemplateColumns || ""
  });
}

function restoreParentStyles(parent) {
  if (!parent) return;
  const prev = MENU_PARENT_STYLE_BACKUP.get(parent);
  if (!prev) return;
  parent.style.gridTemplateColumns = prev.gridTemplateColumns;
}

function setMenuCollapsedState(collapsed) {
  const target = findLeftMenuTarget() || LAST_MENU_TARGET;
  if (!target) return;
  LAST_MENU_TARGET = target;
  target.setAttribute("data-ad-sb-left-menu-target", "1");

  const parent = target.parentElement;
  backupTargetStyles(target);
  if (parent) backupParentStyles(parent);

  if (collapsed) {
    target.style.setProperty("display", "none", "important");
    target.style.setProperty("width", "0", "important");
    target.style.setProperty("min-width", "0", "important");
    target.style.setProperty("max-width", "0", "important");
    target.style.setProperty("overflow", "hidden", "important");
    target.style.setProperty("opacity", "0", "important");
    target.style.setProperty("pointer-events", "none", "important");

    if (parent) {
      const parentStyle = getComputedStyle(parent);
      if (parentStyle.display === "grid") {
        const cols = parentStyle.gridTemplateColumns || "";
        if (cols && cols.trim().split(/\s+/).length >= 2) {
          parent.style.setProperty("grid-template-columns", "0px 1fr", "important");
        }
      }
    }
    return;
  }

  restoreTargetStyles(target);
  if (parent) restoreParentStyles(parent);
}

function ensureMenuToggleButton() {
  getOrCreateMenuToggleStyle();
  let btn = document.getElementById(MENU_TOGGLE_BUTTON_ID);
  const target = findLeftMenuTarget();
  if (target) {
    target.setAttribute("data-ad-sb-left-menu-target", "1");
    if (LAST_MENU_TARGET && LAST_MENU_TARGET !== target) {
      LAST_MENU_TARGET.removeAttribute("data-ad-sb-left-menu-target");
    }
    LAST_MENU_TARGET = target;
  }
  if (!btn) {
    btn = document.createElement("button");
    btn.id = MENU_TOGGLE_BUTTON_ID;
    btn.type = "button";
    btn.title = "Autodarts Menu";
    btn.setAttribute("aria-label", "Autodarts Menu");
    btn.addEventListener("click", () => {
      const collapsed = document.documentElement.getAttribute("data-ad-sb-left-menu-collapsed") !== "1";
      document.documentElement.setAttribute("data-ad-sb-left-menu-collapsed", collapsed ? "1" : "0");
      setStoredMenuCollapsed(collapsed);
      setMenuCollapsedState(collapsed);
      const currentTarget = findLeftMenuTarget() || LAST_MENU_TARGET;
      positionMenuToggleButton(btn, currentTarget, collapsed);
    });
    (document.body || document.documentElement).appendChild(btn);
  }

  btn.textContent = "";
  const mark = document.createElement("span");
  mark.className = "adSbLogoMark";
  mark.innerHTML = MENU_LOGO_INLINE_SVG;
  btn.appendChild(mark);
  const collapsed = getStoredMenuCollapsed();
  document.documentElement.setAttribute("data-ad-sb-left-menu-collapsed", collapsed ? "1" : "0");
  positionMenuToggleButton(btn, target, collapsed);
  setMenuCollapsedState(collapsed);
}

function findMenuLogoAnchor(target) {
  if (!target) return null;

  const iconNodes = Array.from(target.querySelectorAll("svg,img"));
  const candidates = [];
  iconNodes.forEach((node) => {
    const rect = node.getBoundingClientRect();
    if (rect.width < 12 || rect.height < 12) return;
    if (rect.width > 90 || rect.height > 90) return;
    if (rect.left > 120) return;
    if (rect.top > 180) return;

    const host = node.closest("a,button,div,span,header,nav,section");
    const hostText = String(host?.textContent || "").toUpperCase();
    const hasAutodartsText = hostText.includes("AUTODARTS");

    let score = 0;
    if (hasAutodartsText) score += 80;
    score += Math.max(0, 120 - rect.left);
    score += Math.max(0, 180 - rect.top);
    score += Math.max(0, 70 - Math.abs(rect.width - 32) - Math.abs(rect.height - 32));
    candidates.push({ node, score });
  });

  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length > 0) return candidates[0].node;

  const brandNode = Array.from(target.querySelectorAll("a,div,span,h1,h2"))
    .find((el) => String(el.textContent || "").trim().toUpperCase().includes("AUTODARTS"));
  if (brandNode) {
    const icon = brandNode.querySelector("svg,img") || brandNode.previousElementSibling?.querySelector?.("svg,img");
    if (icon) return icon;
    return brandNode;
  }

  return target.querySelector("svg,img") || null;
}

function positionMenuToggleButton(btn, target, collapsed) {
  if (!btn) return;

  if (!collapsed) {
    const anchor = findMenuLogoAnchor(target);
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      if (r.width > 10 && r.height > 10) {
        LAST_LOGO_RECT = { left: r.left, top: r.top, width: r.width, height: r.height };
      }
    }
  }

  const rect = LAST_LOGO_RECT || { left: 10, top: 10, width: 44, height: 44 };
  const side = Math.max(34, Math.min(58, Math.min(rect.width, rect.height)));
  btn.style.left = `${Math.max(6, Math.round(rect.left))}px`;
  btn.style.top = `${Math.max(6, Math.round(rect.top))}px`;
  btn.style.width = `${side}px`;
  btn.style.height = `${side}px`;
}

function removeMenuToggleButton() {
  const btn = document.getElementById(MENU_TOGGLE_BUTTON_ID);
  if (btn) btn.remove();
  const style = document.getElementById(MENU_TOGGLE_STYLE_ID);
  if (style) style.remove();
  setMenuCollapsedState(false);
  document.documentElement.removeAttribute("data-ad-sb-left-menu-collapsed");
  if (LAST_MENU_TARGET) {
    LAST_MENU_TARGET.removeAttribute("data-ad-sb-left-menu-target");
    LAST_MENU_TARGET = null;
  }
}

function getOrCreateBuilderStyle() {
  let style = document.getElementById(BUILDER_STYLE_ID);
  if (style) return style;
  style = document.createElement("style");
  style.id = BUILDER_STYLE_ID;
  style.textContent = `
    #${BUILDER_SAVE_BUTTON_ID}{
      position:fixed;
      top:12px;
      right:12px;
      z-index:2147483647;
      border:1px solid rgba(255,255,255,.24);
      background:rgba(8,14,24,.88);
      color:#fff;
      border-radius:10px;
      padding:8px 12px;
      font-weight:700;
      cursor:pointer;
    }
    #${BUILDER_PICKER_TOGGLE_BUTTON_ID}{
      position:fixed;
      top:56px;
      right:12px;
      z-index:2147483647;
      border:1px solid rgba(255,255,255,.24);
      background:rgba(8,14,24,.88);
      color:#fff;
      border-radius:10px;
      padding:8px 12px;
      font-weight:700;
      cursor:pointer;
    }
    #${BUILDER_RESET_BUTTON_ID}{
      position:fixed;
      top:100px;
      right:12px;
      z-index:2147483647;
      border:1px solid rgba(255,255,255,.24);
      background:rgba(8,14,24,.88);
      color:#fff;
      border-radius:10px;
      padding:8px 12px;
      font-weight:700;
      cursor:pointer;
    }
    #${BUILDER_PIN_BUTTON_ID}{
      position:fixed;
      top:144px;
      right:12px;
      z-index:2147483647;
      border:1px solid rgba(255,255,255,.24);
      background:rgba(8,14,24,.88);
      color:#fff;
      border-radius:10px;
      padding:8px 10px;
      font-weight:700;
      cursor:pointer;
      max-width:calc(100vw - 24px);
    }
    #${BUILDER_HINT_ID}{
      position:fixed;
      left:12px;
      bottom:12px;
      z-index:2147483646;
      max-width:min(360px, calc(100vw - 24px));
      padding:10px 12px;
      border-radius:10px;
      border:1px solid rgba(255,255,255,.2);
      background:rgba(8,14,24,.9);
      color:rgba(255,255,255,.88);
      font-size:11px;
      line-height:1.45;
      pointer-events:none;
      white-space:pre-line;
      box-shadow:0 4px 18px rgba(0,0,0,.35);
    }
    #${BUILDER_BOX_ID}{
      position:fixed;
      z-index:2147483646;
      border:2px dashed rgba(120,220,255,.95);
      background:rgba(27,197,255,.08);
      pointer-events:none;
      box-sizing:border-box;
      display:none;
    }
    #${BUILDER_HANDLE_ID}{
      position:absolute;
      right:-6px;
      bottom:-6px;
      width:12px;
      height:12px;
      border-radius:3px;
      border:1px solid rgba(255,255,255,.9);
      background:#19c7ff;
      pointer-events:auto;
      cursor:nwse-resize;
    }
    #${BUILDER_ROTATE_HANDLE_ID}{
      position:absolute;
      left:-6px;
      top:-6px;
      width:12px;
      height:12px;
      border-radius:50%;
      border:1px solid rgba(255,255,255,.9);
      background:#ffb020;
      pointer-events:auto;
      cursor:grab;
    }
    [data-ad-sb-builder-hit="1"]{
      outline:1px dashed rgba(140,230,255,.55) !important;
      outline-offset:0 !important;
      cursor:move !important;
    }
    #${BUILDER_DIALOG_ID}{
      position:fixed;
      right:12px;
      top:56px;
      z-index:2147483647;
      width:280px;
      border:1px solid rgba(255,255,255,.22);
      border-radius:12px;
      background:rgba(8,14,24,.96);
      color:#fff;
      padding:12px;
      display:none;
    }
    #${BUILDER_DIALOG_ID} .row{
      margin-top:8px;
    }
    #${BUILDER_DIALOG_ID} .lbl{
      font-size:12px;
      opacity:.86;
      margin-bottom:4px;
      display:block;
    }
    #${BUILDER_DIALOG_ID} input[type="text"]{
      width:100%;
      border-radius:8px;
      border:1px solid rgba(255,255,255,.2);
      background:rgba(255,255,255,.06);
      color:#fff;
      padding:8px;
      outline:none;
    }
    #${BUILDER_DIALOG_ID} .checks{
      display:flex;
      gap:12px;
      align-items:center;
      margin-top:4px;
      font-size:12px;
    }
    #${BUILDER_DIALOG_ID} .actions{
      display:flex;
      justify-content:flex-end;
      gap:8px;
      margin-top:12px;
    }
    #${BUILDER_DIALOG_ID} button{
      border:1px solid rgba(255,255,255,.24);
      background:rgba(255,255,255,.08);
      color:#fff;
      border-radius:8px;
      padding:6px 10px;
      cursor:pointer;
      font-weight:700;
    }
    #${BUILDER_DIALOG_ID} button.primary{
      border-color:rgba(25,199,255,.45);
      background:rgba(25,199,255,.22);
    }
    #${BUILDER_PICKER_ID}{
      position:fixed;
      right:12px;
      top:188px;
      z-index:2147483647;
      width:260px;
      max-height:55vh;
      overflow:auto;
      border:1px solid rgba(255,255,255,.22);
      border-radius:12px;
      background:rgba(8,14,24,.92);
      color:#fff;
      padding:10px;
      display:none;
      box-shadow:0 18px 48px rgba(0,0,0,.34);
    }
    #${BUILDER_PICKER_ID}[data-open="1"]{
      display:block;
    }
    #${BUILDER_PICKER_ID} .ttl{
      font-weight:800;
      font-size:12px;
      margin:0;
      opacity:.92;
    }
    #${BUILDER_PICKER_ID} .head{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      margin-bottom:8px;
    }
    #${BUILDER_PICKER_ID} .close{
      border:1px solid rgba(255,255,255,.16);
      background:rgba(255,255,255,.06);
      color:#fff;
      border-radius:8px;
      width:28px;
      height:28px;
      cursor:pointer;
      font-weight:700;
      padding:0;
    }
    #${BUILDER_PICKER_ID} .row{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      margin-top:6px;
    }
    #${BUILDER_PICKER_ID} .name{
      font-size:11px;
      opacity:.9;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }
    #${BUILDER_PICKER_ID} .pickState{
      border:1px solid rgba(255,255,255,.18);
      background:rgba(255,255,255,.06);
      color:#d9e8ff;
      border-radius:8px;
      padding:4px 8px;
      font-size:11px;
      min-width:70px;
      text-align:center;
    }
    #${BUILDER_PICKER_ID} .ok{
      color:#7dffb0;
      font-size:11px;
      margin-left:6px;
    }
    #${BUILDER_PIN_PANEL_ID}{
      position:fixed;
      right:12px;
      top:188px;
      z-index:2147483647;
      width:280px;
      max-height:50vh;
      overflow:auto;
      border:1px solid rgba(255,255,255,.22);
      border-radius:12px;
      background:rgba(8,14,24,.94);
      color:#fff;
      padding:10px;
      display:none;
      box-shadow:0 18px 48px rgba(0,0,0,.34);
    }
    #${BUILDER_PIN_PANEL_ID}[data-open="1"]{
      display:block;
    }
    #${BUILDER_PIN_PANEL_ID} .pinHead{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      margin-bottom:8px;
    }
    #${BUILDER_PIN_PANEL_ID} .pinTtl{
      font-weight:800;
      font-size:12px;
      margin:0;
      opacity:.92;
    }
    #${BUILDER_PIN_PANEL_ID} .pinClose{
      border:1px solid rgba(255,255,255,.16);
      background:rgba(255,255,255,.06);
      color:#fff;
      border-radius:8px;
      width:28px;
      height:28px;
      cursor:pointer;
      font-weight:700;
      padding:0;
    }
    #${BUILDER_PIN_PANEL_ID} .pinRow{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      width:100%;
      margin-top:6px;
      padding:8px 10px;
      border-radius:10px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.04);
      color:#fff;
      cursor:pointer;
      text-align:left;
      font-size:12px;
      box-sizing:border-box;
    }
    #${BUILDER_PIN_PANEL_ID} .pinRow:hover{
      background:rgba(255,255,255,.08);
    }
    #${BUILDER_PIN_PANEL_ID} .pinCb{
      width:16px;
      height:16px;
      flex-shrink:0;
      accent-color:#19c7ff;
      cursor:pointer;
    }
    #${BUILDER_PIN_PANEL_ID} .pinLabel{
      flex:1;
      min-width:0;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    #${BUILDER_PIN_PANEL_ID} .pinLock{
      font-size:20px;
      line-height:1;
      flex-shrink:0;
    }
    #${BUILDER_PIN_PANEL_ID} .pinLock.on{
      opacity:1;
      filter:none;
    }
    #${BUILDER_PIN_PANEL_ID} .pinLock.off{
      opacity:0.4;
      filter:grayscale(1);
    }
    html[data-ad-sb-builder-freeze="1"]{
      scroll-behavior:auto !important;
    }
    html[data-ad-sb-builder-freeze="1"] *{
      animation:none !important;
      transition:none !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
  return style;
}

function cssEscapeSafe(v) {
  if (globalThis.CSS && CSS.escape) return CSS.escape(String(v || ""));
  return String(v || "").replace(/[^\w-]/g, "");
}

function cloneBuilderData(data) {
  try { return JSON.parse(JSON.stringify(data || {})); } catch { return {}; }
}

/** Glow folgt der Scheibe — nicht als eigenes Layout-Objekt speichern */
function stripDartboardGlowFromBuilderData(data) {
  const c = cloneBuilderData(data);
  delete c[DARTBOARD_GLOW_TARGET_KEY];
  return c;
}

function commitBuilderHistorySnapshot() {
  const snap = cloneBuilderData(BUILDER_DATA);
  const asJson = JSON.stringify(snap);
  const current = BUILDER_HISTORY[BUILDER_HISTORY_INDEX];
  if (current && JSON.stringify(current) === asJson) return;
  BUILDER_HISTORY = BUILDER_HISTORY.slice(0, BUILDER_HISTORY_INDEX + 1);
  BUILDER_HISTORY.push(snap);
  BUILDER_HISTORY_INDEX = BUILDER_HISTORY.length - 1;
}

function undoBuilderStep() {
  if (!BUILDER_ACTIVE) return;
  if (BUILDER_HISTORY_INDEX <= 0) return;
  BUILDER_HISTORY_INDEX -= 1;
  BUILDER_DATA = cloneBuilderData(BUILDER_HISTORY[BUILDER_HISTORY_INDEX]);
  applyBuilderDataToDom();
  refreshBuilderSelectionBox();
}

function isRectVisible(r) {
  return !!r && r.width > 10 && r.height > 10 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

function isBuilderElement(node) {
  return !!node && node instanceof Element;
}

function getElementClassName(el) {
  if (!el) return "";
  const raw = el.className;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw.baseVal === "string") return raw.baseVal;
  return "";
}

function getElementHint(el) {
  if (!el) return "";
  return `${getElementClassName(el)} ${el.id || ""}`.toLowerCase();
}

function normalizeBuilderPickElement(node) {
  if (!isBuilderElement(node)) return null;
  let chosen = node;
  const tinySvgTags = new Set(["path", "circle", "ellipse", "line", "polyline", "polygon", "g", "text", "tspan", "use"]);
  const tag = String(chosen.tagName || "").toLowerCase();
  if (tinySvgTags.has(tag)) {
    const svgRoot = chosen.closest("svg");
    if (svgRoot) chosen = svgRoot;
  }

  // If user clicked a tiny inner node, climb to a more useful movable container.
  let best = chosen;
  let cur = chosen;
  for (let i = 0; i < 8 && cur; i += 1) {
    if (isBuilderElement(cur)) {
      const r = cur.getBoundingClientRect();
      if (isRectVisible(r) && r.width >= 24 && r.height >= 24) {
        best = cur;
        if (r.width >= 90 && r.height >= 44) break;
      }
    }
    cur = cur.parentElement;
  }
  return best;
}

function isBuilderUiTarget(node) {
  if (!isBuilderElement(node)) return false;
  if (node.id === BUILDER_SAVE_BUTTON_ID || node.id === BUILDER_PICKER_TOGGLE_BUTTON_ID || node.id === BUILDER_RESET_BUTTON_ID || node.id === BUILDER_PIN_BUTTON_ID || node.id === BUILDER_BOX_ID || node.id === BUILDER_HANDLE_ID || node.id === BUILDER_ROTATE_HANDLE_ID) return true;
  if (node.closest(`#${BUILDER_SAVE_BUTTON_ID}`)) return true;
  if (node.closest(`#${BUILDER_PICKER_TOGGLE_BUTTON_ID}`)) return true;
  if (node.closest(`#${BUILDER_RESET_BUTTON_ID}`)) return true;
  if (node.closest(`#${BUILDER_PIN_BUTTON_ID}`)) return true;
  if (node.closest(`#${BUILDER_BOX_ID}`)) return true;
  if (node.closest(`#${BUILDER_DIALOG_ID}`)) return true;
  if (node.closest(`#${BUILDER_PICKER_ID}`)) return true;
  if (node.closest(`#${BUILDER_PIN_PANEL_ID}`)) return true;
  if (node.closest(`#${MENU_TOGGLE_BUTTON_ID}`)) return true;
  return false;
}

function blockBuilderEvent(ev) {
  if (!ev) return;
  ev.preventDefault();
  ev.stopPropagation();
  if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
}

function clearBuilderTargetMarks() {
  document.querySelectorAll("[data-ad-sb-builder-target='1']").forEach((el) => {
    delete el.dataset.adSbBuilderTarget;
    delete el.dataset.adSbBuilderKey;
  });
  document.querySelectorAll("[data-ad-sb-builder-companion-for]").forEach((el) => {
    delete el.dataset.adSbBuilderCompanionFor;
  });
}

function ensureBuilderPickerPanel() {
  let panel = document.getElementById(BUILDER_PICKER_ID);
  if (!panel) {
    panel = document.createElement("div");
    panel.id = BUILDER_PICKER_ID;
    (document.body || document.documentElement).appendChild(panel);
  }
  const rows = getEffectiveBuilderTargetKeys().map((t) => {
    const has = BUILDER_TARGETS.some((x) => x.key === t.key) || !!BUILDER_DATA?.[t.key]?.sel;
    return `
      <div class="row">
        <div class="name">${t.label}${has ? '<span class="ok">OK</span>' : ""}</div>
        <div class="pickState">${has ? "Erkannt" : "Auto"}</div>
      </div>
    `;
  }).join("");
  panel.dataset.open = BUILDER_PICKER_OPEN ? "1" : "0";
  panel.innerHTML = `
    <div class="head">
      <div class="ttl">Ziele festlegen</div>
      <button type="button" class="close" data-builder-picker-close="1" aria-label="Popup schliessen">X</button>
    </div>
    ${rows}
  `;
  panel.querySelector("[data-builder-picker-close='1']")?.addEventListener("click", () => {
    BUILDER_PICKER_OPEN = false;
    updateBuilderPickerVisibility();
  });
}

function updateBuilderPickerVisibility() {
  const panel = document.getElementById(BUILDER_PICKER_ID);
  if (panel) panel.dataset.open = BUILDER_PICKER_OPEN ? "1" : "0";
  const btn = document.getElementById(BUILDER_PICKER_TOGGLE_BUTTON_ID);
  if (btn) btn.textContent = BUILDER_PICKER_OPEN ? "Ziele schliessen" : "Ziele festlegen";
}

function updateBuilderPinVisibility() {
  const panel = document.getElementById(BUILDER_PIN_PANEL_ID);
  if (panel) panel.dataset.open = BUILDER_PIN_OPEN ? "1" : "0";
  const btn = document.getElementById(BUILDER_PIN_BUTTON_ID);
  if (btn) btn.textContent = BUILDER_PIN_OPEN ? "Feststellen ▴" : "Feststellen ▾";
}

function isBuilderTargetLocked(key) {
  const k = String(key || "");
  if (!k) return false;
  return !!getBuilderEntry(k)?.locked;
}

function escapeHtmlAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function ensureBuilderPinPanel() {
  let panel = document.getElementById(BUILDER_PIN_PANEL_ID);
  if (!panel) {
    panel = document.createElement("div");
    panel.id = BUILDER_PIN_PANEL_ID;
    (document.body || document.documentElement).appendChild(panel);
    panel.addEventListener("change", (ev) => {
      const inp = ev.target;
      if (!inp || !inp.matches || !inp.matches("input.pinCb")) return;
      const k = String(inp.getAttribute("data-builder-pin-key") || "").trim();
      if (!k) return;
      const entry = getBuilderEntry(k);
      entry.locked = !!inp.checked;
      commitBuilderHistorySnapshot();
      ensureBuilderPinPanel();
      updateBuilderPinVisibility();
      if (BUILDER_SELECTED_SELECTOR === k) refreshBuilderSelectionBox();
      try {
        saveBuilderDataToSettings();
      } catch {}
    });
  }
  const rows = getEffectiveBuilderTargetKeys()
    .map((t) => {
      const locked = isBuilderTargetLocked(t.key);
      const ico = locked ? "🔒" : "🔓";
      const cls = locked ? "pinLock on" : "pinLock off";
      const lab = escapeHtmlAttr(t.label);
      return `
      <label class="pinRow" title="Sperrt Verschieben, Größe, Drehen und Tasten-Anpassungen">
        <input type="checkbox" class="pinCb" data-builder-pin-key="${t.key}" ${locked ? "checked" : ""} />
        <span class="pinLabel">${lab}</span>
        <span class="${cls}" aria-hidden="true">${ico}</span>
      </label>`;
    })
    .join("");
  panel.dataset.open = BUILDER_PIN_OPEN ? "1" : "0";
  panel.innerHTML = `
    <div class="pinHead">
      <div class="pinTtl">Elemente sperren</div>
      <button type="button" class="pinClose" data-builder-pin-close="1" aria-label="Schliessen">X</button>
    </div>
    ${rows}
  `;
  panel.querySelector("[data-builder-pin-close='1']")?.addEventListener("click", () => {
    BUILDER_PIN_OPEN = false;
    updateBuilderPinVisibility();
  });
}

function registerBuilderTarget(key, el, kind) {
  if (!key || !isBuilderElement(el)) return;
  if (BUILDER_TARGETS.some((t) => t.key === key)) return;
  el.dataset.adSbBuilderTarget = "1";
  el.dataset.adSbBuilderKey = key;
  BUILDER_TARGETS.push({ key, el, kind: kind || "generic" });
}

/** Gleiche BUILDER_TARGETS-Liste, aber kein Klick-Ziel (Klicks landen auf `masterKey`) */
function registerBuilderCompanionTarget(key, el, masterKey, kind) {
  if (!key || !masterKey || !isBuilderElement(el)) return;
  if (BUILDER_TARGETS.some((t) => t.key === key)) return;
  el.dataset.adSbBuilderCompanionFor = masterKey;
  BUILDER_TARGETS.push({ key, el, kind: kind || "companion", masterKey });
}

function buildElementSelector(el) {
  if (!el || !el.tagName) return "";
  if (el.id) {
    const escaped = cssEscapeSafe(el.id);
    if (escaped && document.querySelectorAll(`#${escaped}`).length === 1) return `#${escaped}`;
  }
  const parts = [];
  let cur = el;
  while (cur && cur.nodeType === 1 && cur !== document.body && cur !== document.documentElement) {
    const tag = cur.tagName.toLowerCase();
    let idx = 1;
    let sib = cur;
    while ((sib = sib.previousElementSibling)) {
      if (sib.tagName.toLowerCase() === tag) idx += 1;
    }
    parts.unshift(`${tag}:nth-of-type(${idx})`);
    cur = cur.parentElement;
    if (parts.length >= 7) break;
  }
  return parts.length ? `body > ${parts.join(" > ")}` : "";
}

function normalizeTargetElementForKey(key, el) {
  if (!key || !isBuilderElement(el)) return el;
  if (key !== "player-score-left" && key !== "player-score-right") return el;

  // BullOff / ext: beide Spieler liegen unter #ad-ext-player-display — nicht zum gemeinsamen Parent hochklettern
  const extWrap = document.querySelector("#ad-ext-player-display");
  if (isBuilderElement(extWrap) && extWrap.contains(el)) {
    let cur = el;
    while (cur && cur !== extWrap && cur.parentElement) {
      if (cur.parentElement === extWrap) return cur;
      cur = cur.parentElement;
    }
  }

  let best = el;
  let cur = el;
  for (let i = 0; i < 7 && cur; i += 1) {
    const r = cur.getBoundingClientRect();
    if (isRectVisible(r) && r.top < window.innerHeight * 0.50 && r.width >= 230 && r.width <= window.innerWidth * 0.60 && r.height >= 90 && r.height <= 360) {
      best = cur;
    }
    cur = cur.parentElement;
  }
  return best;
}

function detectDartboardGlowCompanion(boardEl) {
  if (!isBuilderElement(boardEl)) return null;
  const b = boardEl.getBoundingClientRect();
  if (!isRectVisible(b)) return null;
  let best = null;
  let bestScore = -1;
  const nodes = document.querySelectorAll("div,section,article,canvas,img,svg");
  for (const node of nodes) {
    if (!isBuilderElement(node) || node === boardEl) continue;
    if (boardEl.contains(node) || node.contains(boardEl)) continue;
    const r = node.getBoundingClientRect();
    if (!isRectVisible(r)) continue;
    if (r.width < b.width * 0.84 || r.height < b.height * 0.84) continue;
    if (r.width > b.width * 2.35 || r.height > b.height * 2.35) continue;
    const cdx = Math.abs((r.left + r.width / 2) - (b.left + b.width / 2));
    const cdy = Math.abs((r.top + r.height / 2) - (b.top + b.height / 2));
    if (cdx > Math.max(54, b.width * 0.18) || cdy > Math.max(54, b.height * 0.18)) continue;
    const hint = getElementHint(node);
    const style = getComputedStyle(node);
    const hasGlowHint = hint.includes("glow") || hint.includes("halo") || hint.includes("aura") || hint.includes("shadow");
    const hasGlowStyle = String(style.filter || "").includes("blur")
      || String(style.boxShadow || "").toLowerCase() !== "none"
      || String(style.backgroundImage || "").toLowerCase().includes("gradient");
    const likelyGlowShape = Math.abs(r.width - r.height) <= Math.max(28, b.width * 0.14);
    if (!hasGlowHint && !hasGlowStyle && !likelyGlowShape) continue;
    const txt = String(node.textContent || "").replace(/\s+/g, " ").trim();
    if (txt.length > 40) continue;

    let score = (r.width * r.height) - (cdx * 160) - (cdy * 160);
    if (hasGlowHint) score += 30000;
    if (hasGlowStyle) score += 22000;
    if (likelyGlowShape) score += 12000;
    if (String(style.pointerEvents || "").toLowerCase() === "none") score += 6000;
    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }
  return best;
}

function findButtonByText(keywords, keyName) {
  const nodes = document.querySelectorAll("button,[role='button']");
  for (const node of nodes) {
    const txt = String(node.textContent || "").trim().toLowerCase();
    if (!txt) continue;
    if (!keywords.some((k) => txt.includes(k))) continue;
    const r = node.getBoundingClientRect();
    if (!isRectVisible(r)) continue;
    registerBuilderTarget(keyName, node, "button");
    return;
  }
}

function detectDartboardTarget() {
  const nodes = document.querySelectorAll(
    "canvas,video,img,svg,[class*='board'],[id*='board'],[class*='dart'],[id*='dart']"
  );
  let best = null;
  let bestScore = -1;
  for (const node of nodes) {
    if (!isBuilderElement(node)) continue;
    const r = node.getBoundingClientRect();
    if (!isRectVisible(r)) continue;
    if (r.width < 140 || r.height < 140) continue;
    if (r.width > Math.min(window.innerWidth, window.innerHeight) * 0.68) continue;
    const ratio = r.width / Math.max(1, r.height);
    if (ratio < 0.84 || ratio > 1.16) continue;
    if (r.top < window.innerHeight * 0.30) continue;

    const txt = String(node.textContent || "").replace(/\s+/g, " ").trim();
    if (txt.length > 80) continue;
    const tag = String(node.tagName || "").toLowerCase();
    const isMediaTag = tag === "canvas" || tag === "video" || tag === "img" || tag === "svg";
    const cls = getElementHint(node);
    const mediaChildren = node.querySelectorAll("canvas,video,img,svg").length;
    if (!cls.includes("board") && !cls.includes("dart") && mediaChildren === 0 && !isMediaTag) continue;

    const area = r.width * r.height;
    const centerX = r.left + (r.width / 2);
    const centerY = r.top + (r.height / 2);
    const dx = Math.abs(centerX - (window.innerWidth / 2));
    const dy = Math.abs(centerY - (window.innerHeight * 0.68));
    let score = area - (dx * 80) - (dy * 40);
    if (cls.includes("board")) score += 50000;
    if (cls.includes("dart")) score += 30000;
    if (node.tagName.toLowerCase() === "canvas" || node.tagName.toLowerCase() === "video") score += 25000;
    if (node.tagName.toLowerCase() === "img" || node.tagName.toLowerCase() === "svg") score += 18000;
    if (mediaChildren > 0) score += 12000;
    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }
  if (best) {
    registerBuilderTarget("dartboard", best, "board");
    const glow = detectDartboardGlowCompanion(best);
    if (glow) {
      registerBuilderCompanionTarget(DARTBOARD_GLOW_TARGET_KEY, glow, "dartboard", "board-glow");
      glow.dataset.adSbDartboardGlow = "1";
    }
  }
  registerDartboardShellTargets();
}

/** BullOff / ähnlich: Animations-Wrapper und äußerer Rahmen um die registrierte Scheibe */
function registerDartboardShellTargets() {
  const board = getTargetByKey("dartboard")?.el;
  if (!isBuilderElement(board)) return;

  if (!getTargetByKey("dartboard-animations")) {
    const shell = board.closest(".showAnimations");
    if (isBuilderElement(shell) && shell !== board) {
      registerBuilderTarget("dartboard-animations", shell, "dartboard-fx");
    }
  }

  if (!getTargetByKey("dartboard-mount")) {
    const inner = getTargetByKey("dartboard-animations")?.el || board;
    const par = inner.parentElement;
    if (isBuilderElement(par) && par !== document.body && par.contains(board)) {
      const r = par.getBoundingClientRect();
      if (isRectVisible(r) && r.width >= 120 && r.width <= window.innerWidth * 0.98 && r.height >= 100) {
        registerBuilderTarget("dartboard-mount", par, "dartboard-mount");
      }
    }
  }
}

/**
 * BullOff: horizontale Leiste mit Dart-Grafik (`div.score` laut DOM).
 * Nur wenn noch kein throw-track existiert.
 */
function registerBullOffThrowTrack() {
  if (getTargetByKey("throw-track")) return;
  const candidates = Array.from(document.querySelectorAll("div.score"));
  let best = null;
  let bestScore = -1;
  for (const node of candidates) {
    if (!isBuilderElement(node)) continue;
    const r = node.getBoundingClientRect();
    if (!isRectVisible(r)) continue;
    if (r.width < 100 || r.width > window.innerWidth * 0.94) continue;
    if (r.height < 20 || r.height > 160) continue;
    const midY = r.top + r.height / 2;
    if (midY < window.innerHeight * 0.12 || midY > window.innerHeight * 0.65) continue;
    const dartImg = node.querySelector('img[alt="Dart"], img[alt*="dart" i]');
    const hasSvg = !!node.querySelector("svg");
    if (!dartImg && !hasSvg) continue;
    let score = r.width * r.height;
    if (dartImg) score += 25_000;
    if (hasSvg) score += 8000;
    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }
  if (best) registerBuilderTarget("throw-track", best, "throw-track-bulloff");
}

function isAncestor(a, b) {
  if (!a || !b || a === b) return false;
  let cur = b.parentElement;
  while (cur) {
    if (cur === a) return true;
    cur = cur.parentElement;
  }
  return false;
}

function detectScoreCards() {
  const extWrap = document.querySelector("#ad-ext-player-display");
  if (isBuilderElement(extWrap)) {
    const children = Array.from(extWrap.children || []).filter((n) => isBuilderElement(n));
    const visible = children
      .map((n) => ({ node: n, r: n.getBoundingClientRect() }))
      .filter((x) => isRectVisible(x.r) && x.r.width > 180 && x.r.height > 90);
    const leftExt = visible
      .filter((x) => (x.r.left + x.r.width / 2) < (window.innerWidth / 2))
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0];
    const rightExt = visible
      .filter((x) => (x.r.left + x.r.width / 2) >= (window.innerWidth / 2))
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0];
    if (leftExt) registerBuilderTarget("player-score-left", normalizeTargetElementForKey("player-score-left", leftExt.node), "score-card-ext");
    if (rightExt) registerBuilderTarget("player-score-right", normalizeTargetElementForKey("player-score-right", rightExt.node), "score-card-ext");
    if (leftExt && rightExt) return;
  }

  const nodes = document.querySelectorAll("div,section,article");
  const picks = [];
  for (const node of nodes) {
    if (!isBuilderElement(node)) continue;
    const r = node.getBoundingClientRect();
    if (!isRectVisible(r)) continue;
    if (r.top > window.innerHeight * 0.40) continue;
    if (r.width < 220 || r.height < 100) continue;
    if (r.width > window.innerWidth * 0.56) continue;
    const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
    if (!/\b\d{2,4}\b/.test(text)) continue;
    if (text.length > 220) continue;
    const cls = getElementHint(node);
    if (cls.includes("overlay") || cls.includes("dialog")) continue;
    let score = (r.width * r.height);
    if (cls.includes("score")) score += 30000;
    if (cls.includes("player")) score += 18000;
    if (r.top < 170) score += 10000;
    picks.push({ node, r, score });
  }
  // Prefer the smallest matching card element, not an ancestor that wraps both players.
  const reduced = picks.filter((p) => !picks.some((q) => q !== p && isAncestor(p.node, q.node) && q.score > (p.score * 0.5)));

  const left = reduced
    .filter((p) => (p.r.left + p.r.width / 2) < (window.innerWidth / 2))
    .sort((a, b) => b.score - a.score)[0];
  const right = reduced
    .filter((p) => (p.r.left + p.r.width / 2) >= (window.innerWidth / 2))
    .sort((a, b) => b.score - a.score)[0];

  if (left) registerBuilderTarget("player-score-left", normalizeTargetElementForKey("player-score-left", left.node), "player-score");
  if (right) registerBuilderTarget("player-score-right", normalizeTargetElementForKey("player-score-right", right.node), "player-score");
}

function detectPointsTables() {
  const totalCells = Array.from(document.querySelectorAll(".ad-total-cell,.ad-total-overlay"))
    .filter((n) => isBuilderElement(n))
    .map((n) => ({ node: n, r: n.getBoundingClientRect() }))
    .filter((x) => isRectVisible(x.r) && x.r.width >= 36 && x.r.width <= 220 && x.r.height >= 90 && x.r.height <= 420);
  if (totalCells.length) {
    const leftCell = totalCells
      .filter((x) => (x.r.left + x.r.width / 2) < (window.innerWidth / 2))
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0];
    const rightCell = totalCells
      .filter((x) => (x.r.left + x.r.width / 2) >= (window.innerWidth / 2))
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0];
    if (leftCell) registerBuilderTarget("points-table-left", leftCell.node, "points-table-ext");
    if (rightCell) registerBuilderTarget("points-table-right", rightCell.node, "points-table-ext");
    if (leftCell && rightCell) return;
  }

  const nodes = document.querySelectorAll("div,section,article,aside,span");
  const picks = [];
  for (const node of nodes) {
    if (!isBuilderElement(node)) continue;
    const r = node.getBoundingClientRect();
    if (!isRectVisible(r)) continue;
    if (r.top > window.innerHeight * 0.44) continue;
    if (r.width < 44 || r.width > 210 || r.height < 100 || r.height > 380) continue;
    const ratio = r.height / Math.max(1, r.width);
    if (ratio < 1.1 || ratio > 6.0) continue;
    const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
    const nums = text.match(/\b\d{1,4}\b/g) || [];
    if (nums.length < 2) continue;
    const hint = getElementHint(node);
    let score = (r.width * r.height) + (nums.length * 8000);
    if (hint.includes("score") || hint.includes("table") || hint.includes("leg") || hint.includes("visit")) score += 18000;
    if (String(getComputedStyle(node).borderStyle || "").toLowerCase() !== "none") score += 5000;
    picks.push({ node, r, score });
  }
  if (!picks.length) return;
  picks.sort((a, b) => b.score - a.score);
  const left = picks
    .filter((p) => (p.r.left + p.r.width / 2) < (window.innerWidth / 2))
    .sort((a, b) => b.score - a.score)[0];
  const right = picks
    .filter((p) => (p.r.left + p.r.width / 2) >= (window.innerWidth / 2))
    .sort((a, b) => b.score - a.score)[0];
  if (left) registerBuilderTarget("points-table-left", left.node, "points-table");
  if (right) registerBuilderTarget("points-table-right", right.node, "points-table");
}

function detectScoreSubparts() {
  const map = [
    { card: "player-score-left", value: "score-value-left", badge: "player-badge-left", meta: "player-meta-left", stats: "player-stats-left" },
    { card: "player-score-right", value: "score-value-right", badge: "player-badge-right", meta: "player-meta-right", stats: "player-stats-right" }
  ];
  map.forEach((cfg) => {
    const card = getTargetByKey(cfg.card)?.el || null;
    if (!isBuilderElement(card)) return;
    const cardRect = card.getBoundingClientRect();
    if (!isRectVisible(cardRect)) return;
    const nodes = card.querySelectorAll("div,section,article,span,p,h1,h2,h3,h4");
    let bestValue = null;
    let valueScore = -1;
    let bestMeta = null;
    let metaScore = -1;
    let bestStats = null;
    let statsScore = -1;
    let bestBadge = null;
    let badgeScore = -1;
    for (const node of nodes) {
      if (!isBuilderElement(node)) continue;
      const r = node.getBoundingClientRect();
      if (!isRectVisible(r)) continue;
      if (r.left < (cardRect.left - 6) || r.right > (cardRect.right + 6)) continue;
      if (r.top < (cardRect.top - 10) || r.bottom > (cardRect.bottom + 10)) continue;
      const txt = String(node.textContent || "").replace(/\s+/g, " ").trim();
      if (!txt || txt.length > 80) continue;
      const hint = getElementHint(node);

      if (/^\d{2,4}$/.test(txt) && r.height >= 46 && r.width >= 120) {
        const fs = parseFloat(String(getComputedStyle(node).fontSize || "0")) || 0;
        let score = (r.width * r.height) + (fs * 900);
        if (r.top < cardRect.top + cardRect.height * 0.55) score += 12000;
        if (score > valueScore) {
          valueScore = score;
          bestValue = node;
        }
      }

      const hasPlayerText = /bot|lvl|level|ttv|cpu|player/i.test(txt) || hint.includes("player");
      if (hasPlayerText && r.height >= 22 && r.height <= 88 && r.width >= 120) {
        let score = (r.width * r.height) + 9000;
        if (r.top > cardRect.top + cardRect.height * 0.35) score += 4500;
        if (score > metaScore) {
          metaScore = score;
          bestMeta = node;
        }
      }

      const hasStatsText = txt.includes("#") || txt.includes("/") || txt.includes("ø");
      if (hasStatsText && r.height >= 18 && r.height <= 70 && r.width >= 90) {
        let score = (r.width * r.height) + 8000;
        if (r.top > cardRect.top + cardRect.height * 0.48) score += 5000;
        if (score > statsScore) {
          statsScore = score;
          bestStats = node;
        }
      }

      const isBadge = /^\d{1,2}$/.test(txt) && r.width >= 24 && r.width <= 90 && r.height >= 20 && r.height <= 70;
      if (isBadge) {
        let score = (r.width * r.height) + 6000;
        if (r.top > cardRect.top + cardRect.height * 0.40) score += 5000;
        if (r.left < cardRect.left + cardRect.width * 0.45) score += 4500;
        if (score > badgeScore) {
          badgeScore = score;
          bestBadge = node;
        }
      }
    }
    if (bestValue) registerBuilderTarget(cfg.value, bestValue, "score-part");
    if (bestBadge) registerBuilderTarget(cfg.badge, bestBadge, "score-part");
    if (bestMeta) registerBuilderTarget(cfg.meta, bestMeta, "score-part");
    if (bestStats) registerBuilderTarget(cfg.stats, bestStats, "score-part");
  });
}

function detectThrowPointTracks() {
  const extThrows = Array.from(document.querySelectorAll(".ad-ext-turn-throw,.ad-ext-turn-points"))
    .filter((n) => isBuilderElement(n))
    .map((n) => ({ node: n, r: n.getBoundingClientRect() }))
    .filter((x) => isRectVisible(x.r));
  if (extThrows.length >= 3) {
    extThrows
      .sort((a, b) => a.r.left - b.r.left)
      .slice(0, 3)
      .forEach((x, i) => registerBuilderTarget(`throw-point-${i + 1}`, x.node, "throw-point-ext"));
    return;
  }

  const nodes = document.querySelectorAll("div,section,article,button,[role='button'],span");
  const picks = [];
  const fieldToken = /^(?:[SDT]\d{1,2}|M\d{1,2}|BULL|25)$/i;
  for (const node of nodes) {
    if (!isBuilderElement(node)) continue;
    const r = node.getBoundingClientRect();
    if (!isRectVisible(r)) continue;
    if (r.width < 110 || r.width > 620 || r.height < 34 || r.height > 190) continue;
    if (r.top < window.innerHeight * 0.10 || r.top > window.innerHeight * 0.55) continue;
    const txt = String(node.textContent || "").replace(/\s+/g, " ").trim();
    const hint = getElementHint(node);
    const directMatch = fieldToken.test(txt);
    const hasChildMatch = Array.from(node.querySelectorAll("span,div,p")).some((n) => fieldToken.test(String(n.textContent || "").trim()));
    const isLikelyField = directMatch || hasChildMatch || hint.includes("throw") || hint.includes("dart");
    if (!isLikelyField) continue;
    let score = (r.width * r.height);
    if (directMatch) score += 24000;
    if (hasChildMatch) score += 16000;
    if (hint.includes("throw") || hint.includes("dart")) score += 9000;
    const yBandCenter = window.innerHeight * 0.30;
    score -= Math.abs((r.top + r.height / 2) - yBandCenter) * 36;
    picks.push({ node, r, score });
  }
  if (!picks.length) return;

  // Prefer one horizontal row with at least 3 boxes.
  let bestBand = null;
  for (const p of picks) {
    const group = picks.filter((q) => Math.abs((q.r.top + q.r.height / 2) - (p.r.top + p.r.height / 2)) <= 36);
    if (group.length < 3) continue;
    const bandScore = group.reduce((sum, x) => sum + x.score, 0);
    if (!bestBand || bandScore > bestBand.score) bestBand = { score: bandScore, group };
  }
  const chosen = bestBand ? bestBand.group : picks;
  const unique = [];
  chosen
    .sort((a, b) => b.score - a.score)
    .forEach((p) => {
      if (unique.some((u) => Math.abs(u.r.left - p.r.left) < 22 && Math.abs(u.r.top - p.r.top) < 22)) return;
      unique.push(p);
    });
  unique
    .sort((a, b) => a.r.left - b.r.left)
    .slice(0, 3)
    .forEach((p, i) => registerBuilderTarget(`throw-point-${i + 1}`, p.node, "throw-point"));
}

function detectThrowBoxes() {
  const nodes = document.querySelectorAll("div,section,article,button,[role='button']");
  const total = [];
  const darts = [];
  for (const node of nodes) {
    if (!isBuilderElement(node)) continue;
    const r = node.getBoundingClientRect();
    if (!isRectVisible(r)) continue;
    const text = String(node.textContent || "").trim();
    const cls = getElementHint(node);
    if (r.width >= 70 && r.width <= 240 && r.height >= 70 && r.height <= 220) {
      if (/^\d{1,3}$/.test(text) || cls.includes("visit") || cls.includes("throw")) {
        total.push({ node, r, score: (r.height * r.width) + (cls.includes("throw") ? 9000 : 0) });
      }
    }
    if (r.width >= 90 && r.width <= 620 && r.height >= 28 && r.height <= 190) {
      if (cls.includes("dart") || cls.includes("throw") || /\b[SDT]\d{1,2}\b/i.test(text)) {
        darts.push({ node, r, score: (r.width * r.height) + (cls.includes("dart") ? 10000 : 0) });
      }
    }
  }
  total.sort((a, b) => b.score - a.score);
  if (total[0]) registerBuilderTarget("throw-total", total[0].node, "throw-total");
  darts.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const d of darts) {
    if (kept.some((k) => Math.abs(k.r.left - d.r.left) < 20 && Math.abs(k.r.top - d.r.top) < 20)) continue;
    kept.push(d);
    if (kept.length >= 3) break;
  }
  kept.sort((a, b) => a.r.left - b.r.left).forEach((d, i) => registerBuilderTarget(`throw-point-${i + 1}`, d.node, "throw-point"));
  if (!getTargetByKey("throw-point-1") || !getTargetByKey("throw-point-2") || !getTargetByKey("throw-point-3")) {
    detectThrowPointTracks();
  }
}

function refreshBuilderTargets() {
  clearBuilderTargetMarks();
  BUILDER_TARGETS = [];

  // 1) Restore from saved selector binding first (deterministic)
  const keys = Object.keys(BUILDER_DATA || {});
  keys.forEach((key) => {
    if (key === DARTBOARD_GLOW_TARGET_KEY) return;
    const sel = String(BUILDER_DATA?.[key]?.sel || "");
    if (!sel) return;
    let el = null;
    try { el = document.querySelector(sel); } catch {}
    if (!isBuilderElement(el)) return;
    registerBuilderTarget(key, el, "saved");
  });

  // 2) Fill only missing keys via heuristics
  findButtonByText(["undo", "zur", "rÃ¼ck", "rueck"], "action-undo");
  findButtonByText(["next", "weiter"], "action-next");
  detectDartboardTarget();
  detectScoreCards();
  detectPointsTables();
  detectScoreSubparts();
  detectThrowBoxes();
  registerBullOffThrowTrack();
  fillMissingPairedTargets();

  // 3) Zusätzliche Ziele aus Einstellungen (nur Keys, die noch nicht gebunden sind)
  const extras = Array.isArray(WEBSITE_THEME_STATE.themeBuilderTargets) ? WEBSITE_THEME_STATE.themeBuilderTargets : [];
  extras.forEach((row) => {
    const key = String(row?.key || "").trim().toLowerCase();
    if (!key || BUILDER_TARGETS.some((t) => t.key === key)) return;
    const sel = String(row?.selector || "").trim();
    if (!sel) return;
    let el = null;
    try {
      el = document.querySelector(sel);
    } catch {
      el = null;
    }
    if (!isBuilderElement(el)) return;
    registerBuilderTarget(key, el, "custom");
  });

  if (BUILDER_ACTIVE) {
    ensureBuilderPickerPanel();
    ensureBuilderPinPanel();
  }
}

function getBuilderTargetFromNode(node) {
  if (!isBuilderElement(node)) return null;
  const holder = node.closest("[data-ad-sb-builder-target='1']");
  if (holder) {
    const key = holder.dataset.adSbBuilderKey || "";
    if (!key) return null;
    return BUILDER_TARGETS.find((t) => t.key === key) || null;
  }
  const comp = node.closest("[data-ad-sb-builder-companion-for]");
  if (comp) {
    const masterKey = String(comp.dataset.adSbBuilderCompanionFor || "").trim();
    if (!masterKey) return null;
    return BUILDER_TARGETS.find((t) => t.key === masterKey) || null;
  }
  return null;
}

function getBuilderEntry(selector) {
  const key = String(selector || "");
  if (!key) return null;
  if (!BUILDER_DATA[key]) {
    BUILDER_DATA[key] = { x: 0, y: 0, w: 0, h: 0, r: 0, rot: 0, rx: 0, ry: 0, persp: 0, sx: 1, sy: 1, locked: false };
  }
  return BUILDER_DATA[key];
}

function getTargetByKey(key) {
  return BUILDER_TARGETS.find((t) => t.key === key) || null;
}

function findSymmetricPartnerFor(sourceEl, wantRightSide) {
  if (!isBuilderElement(sourceEl)) return null;
  const srcRect = sourceEl.getBoundingClientRect();
  if (!isRectVisible(srcRect)) return null;
  const centerX = srcRect.left + (srcRect.width / 2);
  const centerY = srcRect.top + (srcRect.height / 2);
  const tag = String(sourceEl.tagName || "").toLowerCase();
  const srcHint = getElementHint(sourceEl);
  const classTokens = srcHint.split(/\s+/).filter((x) => x && x.length >= 4).slice(0, 8);
  const nodes = document.querySelectorAll(tag || "div");
  let best = null;
  let bestScore = -1;
  for (const node of nodes) {
    if (!isBuilderElement(node) || node === sourceEl) continue;
    const r = node.getBoundingClientRect();
    if (!isRectVisible(r)) continue;
    const cX = r.left + (r.width / 2);
    const cY = r.top + (r.height / 2);
    if (wantRightSide && cX <= (window.innerWidth / 2)) continue;
    if (!wantRightSide && cX >= (window.innerWidth / 2)) continue;
    if (Math.abs(cY - centerY) > Math.max(70, srcRect.height * 1.1)) continue;
    const wRatio = r.width / Math.max(1, srcRect.width);
    const hRatio = r.height / Math.max(1, srcRect.height);
    if (wRatio < 0.45 || wRatio > 2.25 || hRatio < 0.45 || hRatio > 2.25) continue;
    const hint = getElementHint(node);
    let sharedTokens = 0;
    classTokens.forEach((t) => { if (hint.includes(t)) sharedTokens += 1; });
    const xSymmetry = Math.abs((window.innerWidth - centerX) - cX);
    let score = (r.width * r.height) - (xSymmetry * 45) - (Math.abs(cY - centerY) * 80);
    score += (sharedTokens * 9000);
    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }
  return best;
}

function fillMissingPairedTargets() {
  const pairs = [
    ["player-score-left", "player-score-right"],
    ["points-table-left", "points-table-right"],
    ["score-value-left", "score-value-right"],
    ["player-badge-left", "player-badge-right"],
    ["player-meta-left", "player-meta-right"],
    ["player-stats-left", "player-stats-right"]
  ];
  pairs.forEach(([leftKey, rightKey]) => {
    const left = getTargetByKey(leftKey)?.el || null;
    const right = getTargetByKey(rightKey)?.el || null;
    if (left && !right) {
      const partner = findSymmetricPartnerFor(left, true);
      if (partner) registerBuilderTarget(rightKey, partner, "paired-fallback");
    } else if (!left && right) {
      const partner = findSymmetricPartnerFor(right, false);
      if (partner) registerBuilderTarget(leftKey, partner, "paired-fallback");
    }
  });
}

function getMinSizeForTarget(key) {
  const target = getTargetByKey(key);
  const r = target?.el?.getBoundingClientRect?.();
  const baseW = r && r.width > 0 ? r.width : 120;
  const baseH = r && r.height > 0 ? r.height : 80;
  return {
    w: Math.max(36, Math.round(baseW * 0.28)),
    h: Math.max(30, Math.round(baseH * 0.28))
  };
}

function applyBuilderEntryToElement(el, entry) {
  if (!el || !entry) return;
  if (!el.dataset.adSbBuilderOriginalStyle) {
    el.dataset.adSbBuilderOriginalStyle = el.getAttribute("style") || "";
  }
  el.dataset.adSbBuilderApplied = "1";
  el.style.setProperty("position", "relative", "important");
  el.style.setProperty("left", `${Math.round(entry.x || 0)}px`, "important");
  el.style.setProperty("top", `${Math.round(entry.y || 0)}px`, "important");
  const sx = Number(entry.sx || 1);
  const sy = Number(entry.sy || 1);
  const safeSx = Number.isFinite(sx) ? Math.max(0.25, Math.min(4.0, sx)) : 1;
  const safeSy = Number.isFinite(sy) ? Math.max(0.25, Math.min(4.0, sy)) : 1;
  // Immer gleichmäßig skalieren (Scheibe rund, keine unabhängigen X/Y-Streckungen)
  const uScale = Math.sqrt(Math.max(0.0625, safeSx * safeSy));
  const rot = Number(entry.rot || 0);
  const safeRot = Number.isFinite(rot) ? rot : 0;
  const rx = Number(entry.rx || 0);
  const ry = Number(entry.ry || 0);
  const safeRx = Number.isFinite(rx) ? Math.max(-42, Math.min(42, rx)) : 0;
  const safeRy = Number.isFinite(ry) ? Math.max(-42, Math.min(42, ry)) : 0;
  let persp = Number(entry.persp || 0);
  if (!Number.isFinite(persp) || persp <= 0) persp = 1000;
  persp = Math.round(Math.max(220, Math.min(2800, persp)));
  const has3d = Math.abs(safeRx) > 0.04 || Math.abs(safeRy) > 0.04;
  el.style.setProperty("transform-origin", has3d ? "center center" : "top left", "important");
  if (has3d) {
    el.style.setProperty("transform-style", "preserve-3d", "important");
    el.style.setProperty(
      "transform",
      `perspective(${persp}px) rotateX(${safeRx}deg) rotateY(${safeRy}deg) rotate(${safeRot}deg) scale(${uScale}, ${uScale})`,
      "important"
    );
  } else {
    el.style.removeProperty("transform-style");
    el.style.setProperty("transform", `rotate(${safeRot}deg) scale(${uScale}, ${uScale})`, "important");
  }
  if ((entry.r || 0) >= 0) el.style.setProperty("border-radius", `${Math.round(entry.r)}px`, "important");
  // Keep moved elements above overlapping siblings so large score numbers stay visible while editing.
  el.style.setProperty("z-index", "42", "important");

  const boardEl = getTargetByKey("dartboard")?.el;
  if (boardEl && el === boardEl) {
    const glowEl = getTargetByKey(DARTBOARD_GLOW_TARGET_KEY)?.el;
    if (isBuilderElement(glowEl) && glowEl !== el) {
      applyBuilderEntryToElement(glowEl, entry);
    }
  }
}

function clearBuilderAppliedStyles() {
  const nodes = document.querySelectorAll("[data-ad-sb-builder-applied='1']");
  nodes.forEach((el) => {
    const orig = el.dataset.adSbBuilderOriginalStyle;
    if (orig !== undefined) {
      if (orig) el.setAttribute("style", orig);
      else el.removeAttribute("style");
    }
    delete el.dataset.adSbBuilderApplied;
    delete el.dataset.adSbBuilderOriginalStyle;
    delete el.dataset.adSbBuilderHit;
  });
}

function cleanupOrphanBuilderAppliedStyles() {
  const nodes = document.querySelectorAll("[data-ad-sb-builder-applied='1']");
  nodes.forEach((el) => {
    let key = String(el.dataset.adSbBuilderKey || "");
    if (!key && el.dataset.adSbDartboardGlow === "1") key = "dartboard";
    if (!key || !BUILDER_DATA?.[key]) {
      const orig = el.dataset.adSbBuilderOriginalStyle;
      if (orig !== undefined) {
        if (orig) el.setAttribute("style", orig);
        else el.removeAttribute("style");
      }
      delete el.dataset.adSbBuilderApplied;
      delete el.dataset.adSbBuilderOriginalStyle;
      delete el.dataset.adSbBuilderHit;
    }
  });
}

function applyBuilderDataToDom() {
  refreshBuilderTargets();
  cleanupOrphanBuilderAppliedStyles();
  const entries = BUILDER_DATA || {};
  Object.keys(entries).forEach((key) => {
    if (key === DARTBOARD_GLOW_TARGET_KEY) return;
    const entry = entries[key];
    if (!entry || typeof entry !== "object") return;
    const target = BUILDER_TARGETS.find((t) => t.key === key);
    const el = target?.el || null;
    if (!el) return;
    if (!entry.sel) entry.sel = buildElementSelector(el);
    applyBuilderEntryToElement(el, entry);
    if (key === "player-score-left" || key === "player-score-right") {
      el.style.setProperty("overflow", "visible", "important");
      if (el.parentElement) el.parentElement.style.setProperty("overflow", "visible", "important");
    }
  });

  const boardEntry = entries?.dartboard;
  let glowTarget = getTargetByKey(DARTBOARD_GLOW_TARGET_KEY);
  if (!glowTarget?.el) {
    const boardEl = getTargetByKey("dartboard")?.el || null;
    const foundGlow = boardEl ? detectDartboardGlowCompanion(boardEl) : null;
    if (foundGlow) {
      registerBuilderCompanionTarget(DARTBOARD_GLOW_TARGET_KEY, foundGlow, "dartboard", "board-glow");
      foundGlow.dataset.adSbDartboardGlow = "1";
      glowTarget = getTargetByKey(DARTBOARD_GLOW_TARGET_KEY);
    }
  }
  if (glowTarget?.el) {
    glowTarget.el.style.setProperty("pointer-events", "none", "important");
    glowTarget.el.dataset.adSbDartboardGlow = "1";
    if (WEBSITE_THEME_STATE?.dartboardGlowEnabled === false) {
      glowTarget.el.style.setProperty("display", "none", "important");
      glowTarget.el.style.setProperty("opacity", "0", "important");
    } else {
      glowTarget.el.style.removeProperty("display");
      glowTarget.el.style.removeProperty("opacity");
    }
  }
}

function ensureBuilderOverlay() {
  getOrCreateBuilderStyle();
  let box = document.getElementById(BUILDER_BOX_ID);
  if (!box) {
    box = document.createElement("div");
    box.id = BUILDER_BOX_ID;
    const rotHandle = document.createElement("div");
    rotHandle.id = BUILDER_ROTATE_HANDLE_ID;
    box.appendChild(rotHandle);
    const handle = document.createElement("div");
    handle.id = BUILDER_HANDLE_ID;
    box.appendChild(handle);
    (document.body || document.documentElement).appendChild(box);
  } else if (!box.querySelector(`#${BUILDER_ROTATE_HANDLE_ID}`)) {
    const rotHandle = document.createElement("div");
    rotHandle.id = BUILDER_ROTATE_HANDLE_ID;
    box.insertBefore(rotHandle, box.firstChild);
  }
  return box;
}

function refreshBuilderSelectionBox() {
  const box = ensureBuilderOverlay();
  if (!BUILDER_ACTIVE || !BUILDER_SELECTED || !document.contains(BUILDER_SELECTED)) {
    box.style.display = "none";
    box.style.removeProperty("border-color");
    box.style.removeProperty("border-style");
    return;
  }
  const r = BUILDER_SELECTED.getBoundingClientRect();
  box.style.display = "block";
  box.style.left = `${Math.round(r.left)}px`;
  box.style.top = `${Math.round(r.top)}px`;
  box.style.width = `${Math.max(10, Math.round(r.width))}px`;
  box.style.height = `${Math.max(10, Math.round(r.height))}px`;
  if (isBuilderTargetLocked(BUILDER_SELECTED_SELECTOR)) {
    box.style.setProperty("border-color", "rgba(255, 186, 120, 0.98)", "important");
    box.style.setProperty("border-style", "solid", "important");
  } else {
    box.style.removeProperty("border-color");
    box.style.removeProperty("border-style");
  }
}

function saveBuilderDataToSettings() {
  try {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.get(["settings"], (items) => {
      const settings = items?.settings || {};
      settings.websiteThemeBuilderData = JSON.stringify(stripDartboardGlowFromBuilderData(BUILDER_DATA || {}));
      chrome.storage.local.set({ settings });
    });
  } catch {}
}

function resetBuilderToDefaults() {
  BUILDER_DATA = {};
  BUILDER_SELECTED = null;
  BUILDER_SELECTED_SELECTOR = "";
  BUILDER_DRAG = null;
  BUILDER_RESIZE = null;
  BUILDER_ROTATE_DRAG = null;
  clearBuilderAppliedStyles();
  refreshBuilderTargets();
  ensureBuilderPickerPanel();
  ensureBuilderPinPanel();
  commitBuilderHistorySnapshot();
  refreshBuilderSelectionBox();
}

function slugifyThemeName(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "custom";
}

function upsertCustomThemeList(list, nextTheme) {
  const out = Array.isArray(list) ? [...list] : [];
  const idx = out.findIndex((t) => String(t?.id || "") === String(nextTheme.id || ""));
  if (idx >= 0) out[idx] = nextTheme;
  else out.push(nextTheme);
  return out;
}

function showBuilderSaveDialog() {
  getOrCreateBuilderStyle();
  let dlg = document.getElementById(BUILDER_DIALOG_ID);
  if (!dlg) {
    dlg = document.createElement("div");
    dlg.id = BUILDER_DIALOG_ID;
    dlg.innerHTML = `
      <div class="row">
        <label class="lbl">Theme-Name</label>
        <input id="adSbThemeName" type="text" placeholder="z. B. Mein Layout" />
      </div>
      <div class="row">
        <label class="lbl">Speichern unter</label>
        <div class="checks">
          <label><input id="adSbSaveHorizontal" type="checkbox" /> Horizontal</label>
          <label><input id="adSbSaveVertical" type="checkbox" /> Vertikal</label>
        </div>
      </div>
      <div class="actions">
        <button id="adSbCancelSave" type="button">Abbrechen</button>
        <button id="adSbConfirmSave" class="primary" type="button">Speichern</button>
      </div>
    `;
    (document.body || document.documentElement).appendChild(dlg);
  }

  const nameInput = dlg.querySelector("#adSbThemeName");
  const chkH = dlg.querySelector("#adSbSaveHorizontal");
  const chkV = dlg.querySelector("#adSbSaveVertical");
  const cancel = dlg.querySelector("#adSbCancelSave");
  const confirm = dlg.querySelector("#adSbConfirmSave");
  if (!nameInput || !chkH || !chkV || !cancel || !confirm) return;

  nameInput.value = "";
  const currentLayout = WEBSITE_THEME_STATE.layout || "horizontal";
  chkH.checked = currentLayout === "horizontal";
  chkV.checked = currentLayout === "vertical";
  dlg.style.display = "block";
  setTimeout(() => { try { nameInput.focus(); } catch {} }, 10);

  const close = () => { dlg.style.display = "none"; };

  cancel.onclick = () => close();
  confirm.onclick = () => {
    const label = String(nameInput.value || "").trim();
    const useH = !!chkH.checked;
    const useV = !!chkV.checked;
    if (!label || (!useH && !useV)) return;

    const idBase = `custom-${slugifyThemeName(label)}`;
    const snapshot = stripDartboardGlowFromBuilderData(BUILDER_DATA || {});

    try {
      chrome.storage.local.get(["settings"], (items) => {
        const settings = items?.settings || {};
        const hList = parseCustomThemes(settings.websiteCustomThemesHorizontal);
        const vList = parseCustomThemes(settings.websiteCustomThemesVertical);

        if (useH) {
          const id = `${idBase}-h`;
          const next = { id, label, css: "", builderData: snapshot };
          settings.websiteCustomThemesHorizontal = JSON.stringify(upsertCustomThemeList(hList, next));
          settings.websiteLayout = "horizontal";
          settings.websiteTheme = id;
        }
        if (useV) {
          const id = `${idBase}-v`;
          const next = { id, label, css: "", builderData: snapshot };
          settings.websiteCustomThemesVertical = JSON.stringify(upsertCustomThemeList(vList, next));
          if (!useH) {
            settings.websiteLayout = "vertical";
            settings.websiteTheme = id;
          }
        }

        settings.websiteThemeBuilderData = JSON.stringify(snapshot);
        chrome.storage.local.set({ settings }, () => {
          const saveBtn = document.getElementById(BUILDER_SAVE_BUTTON_ID);
          if (saveBtn) {
            saveBtn.textContent = "Gespeichert";
            setTimeout(() => { saveBtn.textContent = "Theme speichern"; }, 1200);
          }
          BUILDER_SESSION_ACTIVE = false;
          setBuilderActive(false);
          close();
        });
      });
    } catch {
      close();
    }
  };
}

function setBuilderActive(active) {
  BUILDER_ACTIVE = !!active;
  if (BUILDER_ACTIVE) document.documentElement.setAttribute("data-ad-sb-builder-freeze", "1");
  else document.documentElement.removeAttribute("data-ad-sb-builder-freeze");
  if (!BUILDER_ACTIVE) {
    const resetBtn = document.getElementById(BUILDER_RESET_BUTTON_ID);
    if (resetBtn) resetBtn.remove();
    const pickerToggleBtn = document.getElementById(BUILDER_PICKER_TOGGLE_BUTTON_ID);
    if (pickerToggleBtn) pickerToggleBtn.remove();
    const btn = document.getElementById(BUILDER_SAVE_BUTTON_ID);
    if (btn) btn.remove();
    const box = document.getElementById(BUILDER_BOX_ID);
    if (box) box.remove();
    const dlg = document.getElementById(BUILDER_DIALOG_ID);
    if (dlg) dlg.remove();
    const picker = document.getElementById(BUILDER_PICKER_ID);
    if (picker) picker.remove();
    const pinBtn = document.getElementById(BUILDER_PIN_BUTTON_ID);
    if (pinBtn) pinBtn.remove();
    const pinPanel = document.getElementById(BUILDER_PIN_PANEL_ID);
    if (pinPanel) pinPanel.remove();
    const hintEl = document.getElementById(BUILDER_HINT_ID);
    if (hintEl) hintEl.remove();
    document.querySelectorAll("[data-ad-sb-builder-hit='1']").forEach((el) => delete el.dataset.adSbBuilderHit);
    BUILDER_SELECTED = null;
    BUILDER_SELECTED_SELECTOR = "";
    BUILDER_DRAG = null;
    BUILDER_RESIZE = null;
    BUILDER_ROTATE_DRAG = null;
    BUILDER_HISTORY = [];
    BUILDER_HISTORY_INDEX = -1;
    BUILDER_PICKER_OPEN = false;
    BUILDER_PIN_OPEN = false;
    return;
  }

  getOrCreateBuilderStyle();
  if (!document.getElementById(BUILDER_RESET_BUTTON_ID)) {
    const resetBtn = document.createElement("button");
    resetBtn.id = BUILDER_RESET_BUTTON_ID;
    resetBtn.type = "button";
    resetBtn.textContent = "Alles zurücksetzen";
    resetBtn.addEventListener("click", () => resetBuilderToDefaults());
    (document.body || document.documentElement).appendChild(resetBtn);
  }
  if (!document.getElementById(BUILDER_SAVE_BUTTON_ID)) {
    const btn = document.createElement("button");
    btn.id = BUILDER_SAVE_BUTTON_ID;
    btn.type = "button";
    btn.textContent = "Theme speichern";
    btn.addEventListener("click", () => showBuilderSaveDialog());
    (document.body || document.documentElement).appendChild(btn);
  }
  if (!document.getElementById(BUILDER_HINT_ID)) {
    const hint = document.createElement("div");
    hint.id = BUILDER_HINT_ID;
    hint.textContent =
      "Kurztasten (Element wählen):\n"
      + "[ / ]  Eckenrundung\n"
      + "Alt + Pfeiltasten  3D-Neigung (oben/unten = X, links/rechts = Y)\n"
      + "Alt + Bild↑ / Bild↓  Perspektive (Tiefe)\n"
      + "Shift + Alt + Pfeil  größerer Schritt\n"
      + "Strg+Z Rückgängig · Esc Builder beenden\n"
      + "Oben rechts: Feststellen — Elemente sperren (Checkbox + Schloss)";
    (document.body || document.documentElement).appendChild(hint);
  }
  if (!document.getElementById(BUILDER_PICKER_TOGGLE_BUTTON_ID)) {
    const pickerBtn = document.createElement("button");
    pickerBtn.id = BUILDER_PICKER_TOGGLE_BUTTON_ID;
    pickerBtn.type = "button";
    pickerBtn.addEventListener("click", () => {
      BUILDER_PICKER_OPEN = !BUILDER_PICKER_OPEN;
      if (BUILDER_PICKER_OPEN) BUILDER_PIN_OPEN = false;
      ensureBuilderPickerPanel();
      ensureBuilderPinPanel();
      updateBuilderPickerVisibility();
      updateBuilderPinVisibility();
    });
    (document.body || document.documentElement).appendChild(pickerBtn);
  }
  if (!document.getElementById(BUILDER_PIN_BUTTON_ID)) {
    const pinBtn = document.createElement("button");
    pinBtn.id = BUILDER_PIN_BUTTON_ID;
    pinBtn.type = "button";
    pinBtn.title = "Elemente an Ort und Größe festhalten";
    pinBtn.addEventListener("click", () => {
      BUILDER_PIN_OPEN = !BUILDER_PIN_OPEN;
      if (BUILDER_PIN_OPEN) BUILDER_PICKER_OPEN = false;
      ensureBuilderPickerPanel();
      ensureBuilderPinPanel();
      updateBuilderPickerVisibility();
      updateBuilderPinVisibility();
    });
    (document.body || document.documentElement).appendChild(pinBtn);
  }
  ensureBuilderOverlay();
  ensureBuilderPickerPanel();
  ensureBuilderPinPanel();
  updateBuilderPickerVisibility();
  updateBuilderPinVisibility();
  commitBuilderHistorySnapshot();
  refreshBuilderSelectionBox();
}

function selectBuilderElement(el) {
  if (!isBuilderElement(el)) return;
  if (el.id === BUILDER_SAVE_BUTTON_ID || el.id === BUILDER_PICKER_TOGGLE_BUTTON_ID || el.id === BUILDER_RESET_BUTTON_ID || el.id === BUILDER_PIN_BUTTON_ID || el.id === BUILDER_BOX_ID || el.id === BUILDER_HANDLE_ID || el.id === BUILDER_ROTATE_HANDLE_ID) return;
  if (el.closest(`#${BUILDER_SAVE_BUTTON_ID}`) || el.closest(`#${BUILDER_PICKER_TOGGLE_BUTTON_ID}`) || el.closest(`#${BUILDER_RESET_BUTTON_ID}`) || el.closest(`#${BUILDER_PIN_BUTTON_ID}`) || el.closest(`#${BUILDER_PIN_PANEL_ID}`) || el.closest(`#${BUILDER_BOX_ID}`) || el.closest(`#${MENU_TOGGLE_BUTTON_ID}`)) return;
  refreshBuilderTargets();
  const hit = getBuilderTargetFromNode(el);
  if (!hit || !hit.el) return;
  document.querySelectorAll("[data-ad-sb-builder-hit='1']").forEach((n) => delete n.dataset.adSbBuilderHit);
  BUILDER_SELECTED = hit.el;
  BUILDER_SELECTED_SELECTOR = hit.key;
  hit.el.dataset.adSbBuilderHit = "1";
  getBuilderEntry(BUILDER_SELECTED_SELECTOR);
  refreshBuilderSelectionBox();
}

function onBuilderMouseDown(ev) {
  if (!BUILDER_ACTIVE) return;
  const target = ev.target;
  if (!isBuilderElement(target)) return;
  if (target.id === BUILDER_SAVE_BUTTON_ID || target.id === BUILDER_PICKER_TOGGLE_BUTTON_ID || target.id === BUILDER_RESET_BUTTON_ID || target.id === BUILDER_PIN_BUTTON_ID || target.closest(`#${BUILDER_SAVE_BUTTON_ID}`) || target.closest(`#${BUILDER_PICKER_TOGGLE_BUTTON_ID}`) || target.closest(`#${BUILDER_RESET_BUTTON_ID}`) || target.closest(`#${BUILDER_PIN_BUTTON_ID}`) || target.closest(`#${BUILDER_PIN_PANEL_ID}`) || target.closest(`#${MENU_TOGGLE_BUTTON_ID}`) || target.closest(`#${BUILDER_DIALOG_ID}`)) return;

  const handle = target.id === BUILDER_HANDLE_ID ? target : target.closest(`#${BUILDER_HANDLE_ID}`);
  if (handle && BUILDER_SELECTED) {
    if (isBuilderTargetLocked(BUILDER_SELECTED_SELECTOR)) {
      blockBuilderEvent(ev);
      return;
    }
    const selector = BUILDER_SELECTED_SELECTOR;
    const entry = getBuilderEntry(selector);
    const rect = BUILDER_SELECTED.getBoundingClientRect();
    const startSX = Number(entry.sx || 1);
    const startSY = Number(entry.sy || 1);
    BUILDER_RESIZE = {
      selector,
      startX: ev.clientX,
      startY: ev.clientY,
      startW: Math.max(10, rect.width),
      startH: Math.max(10, rect.height),
      startSX: Number.isFinite(startSX) ? startSX : 1,
      startSY: Number.isFinite(startSY) ? startSY : 1
    };
    blockBuilderEvent(ev);
    return;
  }

  const rotHandle = target.id === BUILDER_ROTATE_HANDLE_ID ? target : target.closest(`#${BUILDER_ROTATE_HANDLE_ID}`);
  if (rotHandle && BUILDER_SELECTED) {
    if (isBuilderTargetLocked(BUILDER_SELECTED_SELECTOR)) {
      blockBuilderEvent(ev);
      return;
    }
    const selector = BUILDER_SELECTED_SELECTOR;
    const rect = BUILDER_SELECTED.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const prevAng = Math.atan2(ev.clientY - cy, ev.clientX - cx);
    BUILDER_ROTATE_DRAG = {
      selector,
      prevAng
    };
    blockBuilderEvent(ev);
    return;
  }

  const chosen = normalizeBuilderPickElement(target.closest("*"));
  if (!chosen) return;

  selectBuilderElement(chosen);
  if (!BUILDER_SELECTED || !BUILDER_SELECTED_SELECTOR) {
    if (!isBuilderUiTarget(target)) blockBuilderEvent(ev);
    return;
  }
  const entry = getBuilderEntry(BUILDER_SELECTED_SELECTOR);
  if (isBuilderTargetLocked(BUILDER_SELECTED_SELECTOR)) return;
  BUILDER_DRAG = {
    selector: BUILDER_SELECTED_SELECTOR,
    startX: ev.clientX,
    startY: ev.clientY,
    startLeft: Number(entry.x || 0),
    startTop: Number(entry.y || 0)
  };
  blockBuilderEvent(ev);
}

function onBuilderClickBlock(ev) {
  if (!BUILDER_ACTIVE) return;
  const target = ev.target;
  if (!isBuilderElement(target)) return;
  if (isBuilderUiTarget(target)) return;
  blockBuilderEvent(ev);
}

function onBuilderMouseMove(ev) {
  if (!BUILDER_ACTIVE) return;
  if (BUILDER_DRAG) {
    const entry = getBuilderEntry(BUILDER_DRAG.selector);
    entry.x = BUILDER_DRAG.startLeft + (ev.clientX - BUILDER_DRAG.startX);
    entry.y = BUILDER_DRAG.startTop + (ev.clientY - BUILDER_DRAG.startY);
    if (BUILDER_SELECTED) applyBuilderEntryToElement(BUILDER_SELECTED, entry);
    refreshBuilderSelectionBox();
    return;
  }
  if (BUILDER_RESIZE) {
    const entry = getBuilderEntry(BUILDER_RESIZE.selector);
    const min = getMinSizeForTarget(BUILDER_RESIZE.selector);
    const sw = Math.max(10, BUILDER_RESIZE.startW);
    const sh = Math.max(10, BUILDER_RESIZE.startH);
    let nextW = Math.max(min.w, BUILDER_RESIZE.startW + (ev.clientX - BUILDER_RESIZE.startX));
    let nextH = Math.max(min.h, BUILDER_RESIZE.startH + (ev.clientY - BUILDER_RESIZE.startY));
    const rw = nextW / sw;
    const rh = nextH / sh;
    const f = Math.max(rw, rh);
    nextW = Math.max(min.w, sw * f);
    nextH = Math.max(min.h, sh * f);
    const startU = Math.sqrt(Math.max(1e-8, BUILDER_RESIZE.startSX * BUILDER_RESIZE.startSY));
    const u = Math.max(0.25, Math.min(4.0, startU * f));
    entry.sx = u;
    entry.sy = u;
    entry.w = nextW;
    entry.h = nextH;
    if (BUILDER_SELECTED) applyBuilderEntryToElement(BUILDER_SELECTED, entry);
    refreshBuilderSelectionBox();
    return;
  }
  if (BUILDER_ROTATE_DRAG && BUILDER_SELECTED) {
    const entry = getBuilderEntry(BUILDER_ROTATE_DRAG.selector);
    const rect = BUILDER_SELECTED.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const ang = Math.atan2(ev.clientY - cy, ev.clientX - cx);
    let d = ang - BUILDER_ROTATE_DRAG.prevAng;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    BUILDER_ROTATE_DRAG.prevAng = ang;
    const nextRot = (Number(entry.rot || 0) || 0) + (d * 180) / Math.PI;
    entry.rot = nextRot;
    if (BUILDER_SELECTED) applyBuilderEntryToElement(BUILDER_SELECTED, entry);
    refreshBuilderSelectionBox();
  }
}

function onBuilderMouseUp(ev) {
  if (!BUILDER_ACTIVE) return;
  if (BUILDER_DRAG || BUILDER_RESIZE || BUILDER_ROTATE_DRAG) {
    BUILDER_DRAG = null;
    BUILDER_RESIZE = null;
    BUILDER_ROTATE_DRAG = null;
    commitBuilderHistorySnapshot();
    refreshBuilderSelectionBox();
  }
  const target = ev?.target;
  if (isBuilderElement(target) && !isBuilderUiTarget(target)) blockBuilderEvent(ev);
}

function onBuilderKeyDown(ev) {
  if (!BUILDER_ACTIVE) return;
  const key = String(ev.key || "").toLowerCase();
  if ((ev.ctrlKey || ev.metaKey) && key === "z") {
    undoBuilderStep();
    ev.preventDefault();
    return;
  }
  if (key === "escape") {
    BUILDER_DATA = cloneBuilderData(BUILDER_SESSION_SNAPSHOT);
    applyBuilderDataToDom();
    BUILDER_SESSION_ACTIVE = false;
    setBuilderActive(false);
    ev.preventDefault();
    return;
  }
  if (!BUILDER_SELECTED || !BUILDER_SELECTED_SELECTOR) return;

  const entry = getBuilderEntry(BUILDER_SELECTED_SELECTOR);
  if (isBuilderTargetLocked(BUILDER_SELECTED_SELECTOR)) return;

  const stepTilt = ev.shiftKey ? 4 : 2;

  if (ev.altKey && !ev.ctrlKey && !ev.metaKey) {
    if (ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
      if (ev.key === "ArrowUp") entry.rx = Math.max(-42, Number(entry.rx || 0) - stepTilt);
      if (ev.key === "ArrowDown") entry.rx = Math.min(42, Number(entry.rx || 0) + stepTilt);
      if (ev.key === "ArrowLeft") entry.ry = Math.max(-42, Number(entry.ry || 0) - stepTilt);
      if (ev.key === "ArrowRight") entry.ry = Math.min(42, Number(entry.ry || 0) + stepTilt);
      applyBuilderEntryToElement(BUILDER_SELECTED, entry);
      commitBuilderHistorySnapshot();
      refreshBuilderSelectionBox();
      ev.preventDefault();
      return;
    }
    if (ev.key === "PageUp" || ev.key === "PageDown") {
      let p = Number(entry.persp || 0);
      if (p <= 0) p = 1000;
      const deltaP = ev.key === "PageUp" ? 140 : -140;
      entry.persp = Math.round(Math.max(220, Math.min(2800, p + deltaP)));
      applyBuilderEntryToElement(BUILDER_SELECTED, entry);
      commitBuilderHistorySnapshot();
      refreshBuilderSelectionBox();
      ev.preventDefault();
      return;
    }
  }

  if (ev.key !== "[" && ev.key !== "]") return;
  if (ev.altKey) return;
  const delta = ev.key === "]" ? 2 : -2;
  entry.r = Math.max(0, Number(entry.r || 0) + delta);
  applyBuilderEntryToElement(BUILDER_SELECTED, entry);
  commitBuilderHistorySnapshot();
  refreshBuilderSelectionBox();
  ev.preventDefault();
}

function sendWebsiteThemeCss(css, attempt = 0) {
  try {
    chrome.runtime.sendMessage(
      { type: "APPLY_WEBSITE_THEME_CSS", css },
      (res) => {
        const err = chrome.runtime?.lastError;
        const ok = !err && !!res?.ok;
        if (ok) return;
        if (attempt >= 8) return;
        const delay = 160 + (attempt * 140);
        setTimeout(() => sendWebsiteThemeCss(css, attempt + 1), delay);
      }
    );
  } catch {
    if (attempt >= 8) return;
    const delay = 160 + (attempt * 140);
    setTimeout(() => sendWebsiteThemeCss(css, attempt + 1), delay);
  }
}

function getOrCreateLocalStyle() {
  let style = document.getElementById(WEBSITE_THEME_STYLE_ID);
  if (style) return style;
  style = document.createElement("style");
  style.id = WEBSITE_THEME_STYLE_ID;
  (document.head || document.documentElement || document.body).appendChild(style);
  return style;
}

function applyWebsiteThemeLocal(css) {
  if (!css) {
    const existing = document.getElementById(WEBSITE_THEME_STYLE_ID);
    if (existing) existing.remove();
    return;
  }
  const style = getOrCreateLocalStyle();
  style.textContent = css;
}

function clearSelectedMarkers() {
  document.querySelectorAll(".ad-sb-selected-marker,.ad-sb-unselected-marker").forEach((el) => {
    el.classList.remove("ad-sb-selected-marker", "ad-sb-unselected-marker");
  });
}

function clearWebsiteThemeDecorations() {
  document.documentElement.removeAttribute("data-ad-sb-webdesign-layout");
  document.documentElement.removeAttribute("data-ad-sb-webdesign-theme");
  clearSelectedMarkers();
  clearBuilderAppliedStyles();
  removeMenuToggleButton();
}

function applyWebsiteTheme() {
  const cfg = WEBSITE_THEME_STATE;
  const activeTheme = findTheme(cfg.layout, cfg.theme);
  const css = cfg.enabled ? buildThemeCss(cfg) : "";
  const activeThemeId = String(cfg.theme || "").toLowerCase();
  const keepDefaultAlignment = BUILDER_DEFAULT_ALIGNMENT_THEMES.has(activeThemeId) && !BUILDER_SESSION_ACTIVE;
  if (cfg.enabled) {
    document.documentElement.setAttribute("data-ad-sb-webdesign-layout", cfg.layout || "horizontal");
    document.documentElement.setAttribute("data-ad-sb-webdesign-theme", cfg.theme || "classic");
  } else {
    clearWebsiteThemeDecorations();
  }
  applyWebsiteThemeLocal(css);
  sendWebsiteThemeCss(css);
  try {
    if (cfg.enabled) ensureMenuToggleButton();
    else removeMenuToggleButton();
  } catch {}

  const themeBuilderData = activeTheme?.builderData && typeof activeTheme.builderData === "object"
    ? activeTheme.builderData
    : null;
  if (keepDefaultAlignment) {
    BUILDER_DATA = {};
  } else {
    BUILDER_DATA = cloneBuilderData(
      themeBuilderData || ((cfg.builderData && typeof cfg.builderData === "object") ? cfg.builderData : {})
    );
    delete BUILDER_DATA[DARTBOARD_GLOW_TARGET_KEY];
  }
  setBuilderActive(cfg.enabled && BUILDER_SESSION_ACTIVE);
  if (cfg.enabled && !keepDefaultAlignment) applyBuilderDataToDom();
  else clearWebsiteThemeDecorations();
  refreshBuilderSelectionBox();
}

function startThemeBuilderSession() {
  if (!WEBSITE_THEME_STATE.enabled) {
    WEBSITE_THEME_STATE.enabled = true;
  }
  delete BUILDER_DATA[DARTBOARD_GLOW_TARGET_KEY];
  BUILDER_SESSION_SNAPSHOT = cloneBuilderData(BUILDER_DATA);
  BUILDER_SESSION_ACTIVE = true;
  applyWebsiteTheme();
}

function isLikelySelected(el) {
  if (!el || !el.getAttribute) return false;
  const className = String(el.className || "").toLowerCase();
  const classTokens = className.split(/\s+/).filter(Boolean);
  const hasSelectedChild = !!el.querySelector?.(
    '.Mui-selected,[aria-pressed="true"],[aria-selected="true"],[aria-checked="true"],input[type="radio"]:checked,input[type="checkbox"]:checked'
  );
  if (el.getAttribute("aria-pressed") === "true") return true;
  if (el.getAttribute("aria-selected") === "true") return true;
  if (el.getAttribute("aria-checked") === "true") return true;
  if (el.getAttribute("data-selected") === "true") return true;
  if (el.getAttribute("data-active") === "true") return true;
  if (el.getAttribute("data-state") === "active") return true;
  if (el.getAttribute("data-state") === "on") return true;
  if (className.includes("mui-selected")) return true;
  if (className.includes("mui-checked")) return true;
  if (classTokens.includes("selected")) return true;
  if (classTokens.includes("is-selected")) return true;
  if (classTokens.includes("is-active")) return true;
  if (/(^|[\s_-])selected($|[\s_-])/.test(className)) return true;
  if (hasSelectedChild) return true;
  return false;
}

function isLikelyOptionControl(el) {
  if (!el || !el.matches) return false;
  if (el.matches(".MuiToggleButton-root")) return true;
  if (el.matches("[aria-pressed],[aria-selected],[aria-checked],[role='radio'],[role='option']")) return true;
  return false;
}

function updateSelectedMarkers() {
  const nodes = document.querySelectorAll(
    ".MuiToggleButton-root,.MuiButtonBase-root,.MuiButton-root,button,[role='button'],[role='radio'],[role='option'],[aria-pressed],[aria-selected],[aria-checked],[data-state]"
  );
  nodes.forEach((el) => {
    const selected = isLikelySelected(el);
    const option = isLikelyOptionControl(el);
    el.classList.toggle("ad-sb-selected-marker", selected);
    el.classList.toggle("ad-sb-unselected-marker", option && !selected);
  });
}

function scheduleSelectedMarkerUpdate() {
  if (SELECTED_MARKER_TIMER) clearTimeout(SELECTED_MARKER_TIMER);
  SELECTED_MARKER_TIMER = setTimeout(() => {
    SELECTED_MARKER_TIMER = null;
    updateSelectedMarkers();
  }, 80);
}

function bindSelectedMarkerObserver() {
  if (SELECTED_MARKER_OBSERVER) return;
  SELECTED_MARKER_OBSERVER = new MutationObserver(() => {
    scheduleSelectedMarkerUpdate();
  });
  SELECTED_MARKER_OBSERVER.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "aria-pressed", "aria-selected", "aria-checked", "data-selected", "data-active"]
  });
}

function scheduleThemeReapplyBurst() {
  if (WEBSITE_THEME_REAPPLY_TIMER) clearInterval(WEBSITE_THEME_REAPPLY_TIMER);
  let remaining = 8;
  WEBSITE_THEME_REAPPLY_TIMER = setInterval(() => {
    applyWebsiteTheme();
    scheduleSelectedMarkerUpdate();
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(WEBSITE_THEME_REAPPLY_TIMER);
      WEBSITE_THEME_REAPPLY_TIMER = null;
    }
  }, 450);
}

function loadWebsiteThemeFromStorage() {
  try {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.get(["settings"], (items) => {
      const settings = items?.settings || {};
      WEBSITE_THEME_STATE = normalizeWebsiteThemeSettings(settings);
      applyWebsiteTheme();
      scheduleThemeReapplyBurst();
      scheduleSelectedMarkerUpdate();
    });
  } catch {}
}

function bindWebsiteThemeWatcher() {
  if (!chrome?.storage?.onChanged) return;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const next = changes?.settings?.newValue;
    if (!next || typeof next !== "object") return;
    WEBSITE_THEME_STATE = normalizeWebsiteThemeSettings(next);
    applyWebsiteTheme();
    scheduleThemeReapplyBurst();
    scheduleSelectedMarkerUpdate();
  });
}

function onRouteChange() {
  const href = String(location.href || "");
  if (href === lastKnownHref) return;
  lastKnownHref = href;
  applyWebsiteTheme();
  scheduleSelectedMarkerUpdate();
}

const nativePushState = history.pushState.bind(history);
history.pushState = function patchedPushState() {
  const out = nativePushState.apply(history, arguments);
  onRouteChange();
  return out;
};

const nativeReplaceState = history.replaceState.bind(history);
history.replaceState = function patchedReplaceState() {
  const out = nativeReplaceState.apply(history, arguments);
  onRouteChange();
  return out;
};

window.addEventListener("popstate", onRouteChange);
window.addEventListener("hashchange", onRouteChange);
window.addEventListener("focus", () => {
  applyWebsiteTheme();
  scheduleSelectedMarkerUpdate();
});
window.addEventListener("resize", () => {
  const btn = document.getElementById(MENU_TOGGLE_BUTTON_ID);
  if (!btn) return;
  const collapsed = document.documentElement.getAttribute("data-ad-sb-left-menu-collapsed") === "1";
  const target = findLeftMenuTarget() || LAST_MENU_TARGET;
  positionMenuToggleButton(btn, target, collapsed);
});
window.addEventListener("scroll", () => {
  const btn = document.getElementById(MENU_TOGGLE_BUTTON_ID);
  if (!btn) return;
  const collapsed = document.documentElement.getAttribute("data-ad-sb-left-menu-collapsed") === "1";
  const target = findLeftMenuTarget() || LAST_MENU_TARGET;
  positionMenuToggleButton(btn, target, collapsed);
  refreshBuilderSelectionBox();
}, true);
window.addEventListener("pageshow", () => {
  applyWebsiteTheme();
  scheduleSelectedMarkerUpdate();
});
window.addEventListener("load", () => {
  applyWebsiteTheme();
  scheduleThemeReapplyBurst();
  scheduleSelectedMarkerUpdate();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    applyWebsiteTheme();
    scheduleSelectedMarkerUpdate();
  }
});

document.addEventListener("mousedown", onBuilderMouseDown, true);
document.addEventListener("mousemove", onBuilderMouseMove, true);
document.addEventListener("mouseup", onBuilderMouseUp, true);
document.addEventListener("keydown", onBuilderKeyDown, true);
document.addEventListener("click", onBuilderClickBlock, true);

if (chrome?.runtime?.onMessage?.addListener) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "AD_SB_START_THEME_BUILDER") {
      startThemeBuilderSession();
      sendResponse?.({ ok: true });
      return true;
    }
    return undefined;
  });
}

setInterval(onRouteChange, 700);

loadWebsiteThemeFromStorage();
bindWebsiteThemeWatcher();
bindSelectedMarkerObserver();
})();
