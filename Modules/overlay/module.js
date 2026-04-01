(function initOverlayModule(scope) {
  scope.AD_SB_MODULES = scope.AD_SB_MODULES || {};
  let CONNECTIONS_OPEN = false;

  scope.AD_SB_MODULES.overlay = {
    id: "overlay",
    icon: "O",
    navLabelKey: "nav_overlay",
    needs: { streamerbot: false, obs: false },
    render() {
      return `
        <h2 class="title"><span data-i18n="title_overlay">Overlay</span><span class="titleMeta">OBS/Web</span></h2>

        <div class="card">
          <div class="sectionHead">
            <div class="sectionTitle" style="margin:0;" data-i18n="section_connections">Verbindungen</div>
            <button type="button" class="miniChevronBtn${CONNECTIONS_OPEN ? " active" : ""}" id="overlayConnectionToggle" aria-label="Overlay Verbindungen" title="Overlay Verbindungen"><span class="ddArrow">${CONNECTIONS_OPEN ? "^" : "v"}</span></button>
          </div>
          <div class="connectionStatusGrid">
            <button type="button" class="connectionStatusBtn" data-obs-status data-connection-retry="obs">
              <div class="connectionStatusLabel">
                <span>OBS</span>
                <span class="connectionStatusText" data-connection-status-text></span>
                <span class="connectionStatusAttempts" data-connection-attempts></span>
              </div>
            </button>
            <button type="button" class="connectionStatusBtn" data-sb-status data-connection-retry="sb">
              <div class="connectionStatusLabel">
                <span>Streamer.bot</span>
                <span class="connectionStatusText" data-connection-status-text></span>
                <span class="connectionStatusAttempts" data-connection-attempts></span>
              </div>
            </button>
          </div>
          <div class="inlinePopupWrap${CONNECTIONS_OPEN ? " open" : ""}" id="overlayConnectionWrap" style="padding:0; border-top:none; background:transparent;">
            <div class="formRow">
              <label class="label" for="overlayObsUrl">OBS WS URL</label>
              <input class="input" id="overlayObsUrl" type="text" placeholder="ws://127.0.0.1:4455/" />
              <div class="hint" data-i18n="hint_obs_ws">OBS WebSocket Server</div>
            </div>
            <div class="formRow">
              <label class="label" for="overlayObsPassword">OBS Passwort</label>
              <input class="input" id="overlayObsPassword" type="password" placeholder="optional" />
            </div>
            <div class="divider"></div>
            <div class="formRow">
              <label class="label" for="overlaySbUrl">Streamer.bot WS URL</label>
              <input class="input" id="overlaySbUrl" type="text" placeholder="ws://127.0.0.1:8080/" />
              <div class="hint" data-i18n="hint_sb_ws">Streamer.bot WebSocket Server</div>
            </div>
            <div class="formRow">
              <label class="label" for="overlaySbPassword">Streamer.bot Passwort</label>
              <input class="input" id="overlaySbPassword" type="password" placeholder="optional" />
            </div>
            <div class="formRow">
              <label class="label" for="overlayActionPrefix" data-i18n="label_action_prefix">Action Prefix</label>
              <input class="input" id="overlayActionPrefix" type="text" placeholder="AD-SB " />
              <div class="hint" data-i18n="hint_action_prefix">Actions run as Prefix + Suffix.</div>
            </div>
          </div>

          <div class="divider"></div>
          <div class="cardHeader">
            <div class="cardTitle" data-i18n="card_overlay_endpoint">Overlay Endpoint</div>
            <div class="pill pillSoft" data-i18n="status_coming">Coming</div>
          </div>

          <div class="list">
            <div class="formRow">
              <label class="label" for="overlayWsPort" data-i18n="label_port">Port</label>
              <input class="input" id="overlayWsPort" type="number" min="1" max="65535" step="1" />
              <div class="hint" data-i18n="hint_overlay_port">Used later to provide overlay data.</div>
            </div>

            <div class="rowSplit" style="margin-top:10px;">
              <button id="btnOpenOverlay" class="btnPrimary" data-i18n="btn_open_overlay">Open Overlay</button>
            </div>
          </div>
        </div>

        <div class="spacer"></div>
      `;
    },
    bind(api) {
      const root = api.root;
      root.querySelector("#overlayConnectionToggle")?.addEventListener("click", () => {
        CONNECTIONS_OPEN = !CONNECTIONS_OPEN;
        scope.AD_SB_MODULES.overlay.sync(api, api.getSettings?.() || {});
      });
      api.bindAuto(root, "overlayWsPort", "overlayWsPort", "number");
      api.bindAutoImmediate(root, "overlayObsUrl", "obsUrl", (value) => String(value || "").trim());
      api.bindAutoImmediate(root, "overlayObsPassword", "obsPassword", (value) => String(value || ""));
      api.bindAutoImmediate(root, "overlaySbUrl", "sbUrl", (value) => String(value || "").trim());
      api.bindAutoImmediate(root, "overlaySbPassword", "sbPassword", (value) => String(value || ""));
      api.bindAutoImmediate(root, "overlayActionPrefix", "actionPrefix", (value) => api.normalizePrefix(value || ""));
      root.querySelectorAll("[data-connection-retry]").forEach((button) => {
        button.addEventListener("click", async () => {
          const kind = String(button.dataset.connectionRetry || "");
          if (kind === "sb") await api.send({ type: "SB_RETRY" });
          if (kind === "obs") await api.send({ type: "OBS_RETRY" });
          setTimeout(() => api.refreshConnectionStatuses?.(), 150);
        });
      });
      root.querySelector("#btnOpenOverlay")?.addEventListener("click", () => {
        const sbws = encodeURIComponent(String(api.getSettings()?.sbUrl || "ws://127.0.0.1:8080/").trim());
        const url = chrome.runtime.getURL(`Modules/overlay/OBS/index.html?sbws=${sbws}`);
        if (chrome?.tabs?.create) {
          chrome.tabs.create({ url });
          return;
        }
        window.open(url, "_blank");
      });
    },
    sync(api, settings) {
      const root = api.root;
      const s = settings || {};
      api.setValue(root, "overlayObsUrl", s.obsUrl || "");
      api.setValue(root, "overlayObsPassword", s.obsPassword || "");
      api.setValue(root, "overlaySbUrl", s.sbUrl || "");
      api.setValue(root, "overlaySbPassword", s.sbPassword || "");
      api.setValue(root, "overlayActionPrefix", String(s.actionPrefix || "").trim());
      api.setValue(root, "overlayWsPort", Number.isFinite(s.overlayWsPort) ? s.overlayWsPort : 4455);
      const connectionWrap = root.querySelector("#overlayConnectionWrap");
      if (connectionWrap) connectionWrap.classList.toggle("open", CONNECTIONS_OPEN);
      const connectionToggle = root.querySelector("#overlayConnectionToggle");
      if (connectionToggle) {
        connectionToggle.classList.toggle("active", CONNECTIONS_OPEN);
        connectionToggle.innerHTML = `<span class="ddArrow">${CONNECTIONS_OPEN ? "^" : "v"}</span>`;
      }
      api.refreshConnectionStatuses?.();
    }
  };
})(window);
