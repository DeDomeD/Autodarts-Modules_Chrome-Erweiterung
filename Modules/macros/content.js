(() => {
  console.log("[Autodarts Modules] macros content loaded");

  const STYLE_ID = "ad-sb-macros-style";
  const PANEL_ID = "ad-sb-macros-panel";
  const STATUS_ID = "ad-sb-macros-status";
  const PRESETS_ID = "ad-sb-macros-presets";
  let MACROS_STATE = {
    enabled: false,
    teamModeEnabled: true
  };
  let TEAM_MODE_ACTIVE = false;
  let TEAM_PRESET = "";
  let LAST_ROUTE = String(location.href || "");

  function isMatchPage() {
    return String(location.pathname || "").toLowerCase().includes("/matches");
  }

  function normalizeSettings(settings) {
    const s = settings || {};
    return {
      enabled: !!s.macrosEnabled,
      teamModeEnabled: s.macrosTeamModeEnabled !== false
    };
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 999999;
        width: min(320px, calc(100vw - 24px));
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,.12);
        background:
          radial-gradient(circle at top right, rgba(25,199,255,.18), transparent 28%),
          linear-gradient(180deg, rgba(8,14,22,.96), rgba(12,18,28,.94));
        color: #edf4ff;
        box-shadow: 0 24px 70px rgba(0,0,0,.38);
        backdrop-filter: blur(18px);
        font-family: "Segoe UI", sans-serif;
      }
      #${PANEL_ID}[hidden] { display: none !important; }
      #${PANEL_ID} .ad-sb-macros-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 14px 10px;
      }
      #${PANEL_ID} .ad-sb-macros-kicker {
        display: block;
        font-size: 10px;
        letter-spacing: .14em;
        text-transform: uppercase;
        color: rgba(237,244,255,.58);
        margin-bottom: 4px;
      }
      #${PANEL_ID} .ad-sb-macros-title {
        font-size: 15px;
        font-weight: 700;
      }
      #${PANEL_ID} .ad-sb-macros-body {
        padding: 0 14px 14px;
      }
      #${PANEL_ID} .ad-sb-macros-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      #${PANEL_ID} .ad-sb-macros-btn,
      #${PANEL_ID} .ad-sb-macros-preset {
        appearance: none;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 12px;
        background: rgba(255,255,255,.06);
        color: #edf4ff;
        padding: 10px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: .16s ease;
      }
      #${PANEL_ID} .ad-sb-macros-btn:hover,
      #${PANEL_ID} .ad-sb-macros-preset:hover {
        filter: brightness(1.08);
      }
      #${PANEL_ID} .ad-sb-macros-btn.is-active,
      #${PANEL_ID} .ad-sb-macros-preset.is-active {
        background: linear-gradient(135deg, rgba(25,199,255,.28), rgba(109,75,255,.18));
        border-color: rgba(25,199,255,.32);
      }
      #${PANEL_ID} .ad-sb-macros-status {
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.08);
        color: rgba(237,244,255,.82);
        font-size: 12px;
        line-height: 1.45;
      }
      #${PANEL_ID} .ad-sb-macros-presets {
        margin-top: 10px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      #${PANEL_ID} .ad-sb-macros-presets[hidden] {
        display: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function getStatusText() {
    if (!TEAM_MODE_ACTIVE) {
      return "Makros aktiv. Teammodus ist aktuell ausgeschaltet.";
    }
    if (TEAM_PRESET === "13v24") {
      return "Teammodus aktiv: Team Rot spielt 1+3 gegen Team Blau 2+4.";
    }
    if (TEAM_PRESET === "12v34") {
      return "Teammodus aktiv: Team Rot spielt 1+2 gegen Team Blau 3+4.";
    }
    return "Teammodus aktiv. Wähle ein Preset für die Teamaufteilung.";
  }

  function updatePanelUi(panel) {
    if (!panel) return;
    const toggleBtn = panel.querySelector('[data-macro-action="toggle-team-mode"]');
    const presets = panel.querySelector(`#${PRESETS_ID}`);
    const status = panel.querySelector(`#${STATUS_ID}`);
    if (toggleBtn) toggleBtn.classList.toggle("is-active", TEAM_MODE_ACTIVE);
    if (presets) presets.hidden = !MACROS_STATE.teamModeEnabled || !TEAM_MODE_ACTIVE;
    panel.querySelectorAll(".ad-sb-macros-preset").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.preset === TEAM_PRESET);
    });
    if (status) status.textContent = getStatusText();
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = PANEL_ID;
      panel.innerHTML = `
        <div class="ad-sb-macros-head">
          <div>
            <span class="ad-sb-macros-kicker">Autodarts Website</span>
            <div class="ad-sb-macros-title">Macros</div>
          </div>
        </div>
        <div class="ad-sb-macros-body">
          <div class="ad-sb-macros-row">
            <button type="button" class="ad-sb-macros-btn" data-macro-action="toggle-team-mode">Teammodus</button>
            <button type="button" class="ad-sb-macros-btn" data-macro-action="reset-team-mode">Reset</button>
          </div>
          <div id="${PRESETS_ID}" class="ad-sb-macros-presets" hidden>
            <button type="button" class="ad-sb-macros-preset" data-preset="13v24">1+3 vs 2+4</button>
            <button type="button" class="ad-sb-macros-preset" data-preset="12v34">1+2 vs 3+4</button>
          </div>
          <div id="${STATUS_ID}" class="ad-sb-macros-status"></div>
        </div>
      `;
      panel.addEventListener("click", (ev) => {
        const target = ev.target;
        if (!target || !target.closest) return;

        const macroBtn = target.closest("[data-macro-action]");
        if (macroBtn) {
          const action = String(macroBtn.dataset.macroAction || "");
          if (action === "toggle-team-mode") {
            TEAM_MODE_ACTIVE = !TEAM_MODE_ACTIVE;
            if (!TEAM_MODE_ACTIVE) TEAM_PRESET = "";
            updatePanelUi(panel);
            return;
          }
          if (action === "reset-team-mode") {
            TEAM_MODE_ACTIVE = false;
            TEAM_PRESET = "";
            updatePanelUi(panel);
          }
          return;
        }

        const presetBtn = target.closest("[data-preset]");
        if (presetBtn) {
          TEAM_MODE_ACTIVE = true;
          TEAM_PRESET = String(presetBtn.dataset.preset || "");
          updatePanelUi(panel);
        }
      });
      (document.body || document.documentElement).appendChild(panel);
    }

    const shouldShow = MACROS_STATE.enabled && isMatchPage();
    panel.hidden = !shouldShow;
    updatePanelUi(panel);
    return panel;
  }

  function applyMacros() {
    ensureStyle();
    ensurePanel();
  }

  function loadMacrosFromStorage() {
    try {
      if (!chrome?.storage?.local) return;
      chrome.storage.local.get(["settings"], (items) => {
        MACROS_STATE = normalizeSettings(items?.settings || {});
        applyMacros();
      });
    } catch {}
  }

  function bindMacrosWatcher() {
    if (!chrome?.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      const next = changes?.settings?.newValue;
      if (!next || typeof next !== "object") return;
      MACROS_STATE = normalizeSettings(next);
      applyMacros();
    });
  }

  function onRouteChange() {
    const href = String(location.href || "");
    if (href === LAST_ROUTE) return;
    LAST_ROUTE = href;
    applyMacros();
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
  window.addEventListener("pageshow", onRouteChange);

  loadMacrosFromStorage();
  bindMacrosWatcher();
  applyMacros();
})();
