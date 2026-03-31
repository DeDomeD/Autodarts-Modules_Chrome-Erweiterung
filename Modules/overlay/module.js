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
        <h2 class="title"><span data-i18n="title_overlay">Overlay</span><span class="titleMeta">OBS/Web</span> <button type="button" class="miniChevronBtn${CONNECTIONS_OPEN ? " active" : ""}" id="overlayConnectionToggle" aria-label="Overlay Verbindungen" title="Overlay Verbindungen"><span class="ddArrow">${CONNECTIONS_OPEN ? "^" : "v"}</span></button></h2>

        <div class="card">
          <div class="cardHeader">
            <div class="cardTitle">Streamer.bot fuer Overlay</div>
            <div class="pill" id="overlaySbStatus" data-i18n="status_unknown">Unknown</div>
          </div>
          <div class="hint">Die Overlay-Seite nutzt dieselbe Streamer.bot Verbindung wie deine Effects.</div>
          <div class="inlinePopupWrap${CONNECTIONS_OPEN ? " open" : ""}" id="overlayConnectionWrap" style="padding:0; border-top:none; background:transparent;">
            <div class="formRow">
              <label class="label" for="overlaySbUrl" data-i18n="label_ws_url">WS URL</label>
              <input class="input" id="overlaySbUrl" type="text" placeholder="ws://127.0.0.1:8080/" />
              <div class="hint" data-i18n="hint_sb_ws">Streamer.bot WebSocket Server</div>
            </div>
            <div class="rowSplit">
              <button id="btnSaveOverlayConn" class="btn" type="button">Speichern</button>
              <button id="btnTestOverlayWS" class="btnPrimary" type="button" data-i18n="btn_test_streamerbot">Test Streamer.bot</button>
            </div>
          </div>

          <div class="divider"></div>
          <div class="cardHeader">
            <div class="cardTitle" data-i18n="card_overlay_endpoint">Overlay Endpoint</div>
            <div class="pill pillSoft" data-i18n="status_coming">Coming</div>
          </div>

          <div class="list">
            <div class="listToggle">
              <div class="liText">
                <div class="liTitle" data-i18n="enable_overlay_title">Enable Overlay</div>
                <div class="liSub" data-i18n="enable_overlay_sub">Serve overlay data later</div>
              </div>
              <label class="switch">
                <input id="overlayEnabled" type="checkbox" />
                <span class="slider"></span>
              </label>
            </div>

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
      api.bindAuto(root, "overlayEnabled", "overlayEnabled");
      api.bindAuto(root, "overlayWsPort", "overlayWsPort", "number");
      root.querySelector("#btnSaveOverlayConn")?.addEventListener("click", async () => {
        await api.savePartial({
          sbUrl: root.querySelector("#overlaySbUrl")?.value?.trim() || ""
        });
      });
      root.querySelector("#btnTestOverlayWS")?.addEventListener("click", async () => {
        await api.send({ type: "SB_TEST" });
        setTimeout(api.refreshSbStatus, 150);
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
      api.setValue(root, "overlaySbUrl", s.sbUrl || "");
      api.setChecked(root, "overlayEnabled", !!s.overlayEnabled);
      api.setValue(root, "overlayWsPort", Number.isFinite(s.overlayWsPort) ? s.overlayWsPort : 4455);
      const connectionWrap = root.querySelector("#overlayConnectionWrap");
      if (connectionWrap) connectionWrap.classList.toggle("open", CONNECTIONS_OPEN);
      const connectionToggle = root.querySelector("#overlayConnectionToggle");
      if (connectionToggle) {
        connectionToggle.classList.toggle("active", CONNECTIONS_OPEN);
        connectionToggle.innerHTML = `<span class="ddArrow">${CONNECTIONS_OPEN ? "^" : "v"}</span>`;
      }
      api.refreshSbStatus?.();
    }
  };
})(window);
