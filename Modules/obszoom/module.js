(function initObsZoomModule(scope) {
  scope.AD_SB_MODULES = scope.AD_SB_MODULES || {};
  let CONNECTIONS_OPEN = false;

  scope.AD_SB_MODULES.obszoom = {
    id: "obszoom",
    icon: "Z",
    navLabelKey: "nav_obszoom",
    needs: { streamerbot: false, obs: true },
    render() {
      return `
        <h2 class="title"><span data-i18n="title_obszoom">OBS Zoom</span><span class="titleMeta">OBS</span> <button type="button" class="miniChevronBtn${CONNECTIONS_OPEN ? " active" : ""}" id="obsZoomConnectionToggle" aria-label="OBS Zoom Verbindungen" title="OBS Zoom Verbindungen"><span class="ddArrow">${CONNECTIONS_OPEN ? "^" : "v"}</span></button></h2>
        <div class="card">
          <div class="cardHeader">
            <div class="cardTitle">OBS Verbindung</div>
            <div class="pill pillSoft" id="obsZoomStatus">Manuell</div>
          </div>
          <div class="hint">OBS wird nur gebraucht, wenn OBS Zoom aktiv ist.</div>
          <div class="inlinePopupWrap${CONNECTIONS_OPEN ? " open" : ""}" id="obsZoomConnectionWrap" style="padding:0; border-top:none; background:transparent;">
            <div class="formRow">
              <label class="label" for="obsUrl" data-i18n="label_ws_url">WS URL</label>
              <input class="input" id="obsUrl" type="text" placeholder="ws://127.0.0.1:4455/" />
              <div class="hint" data-i18n="hint_obs_ws">OBS WebSocket Server</div>
            </div>
            <div class="rowSplit">
              <button id="btnSaveObsConn" class="btn" type="button">Speichern</button>
              <button id="btnTestObs" class="btnPrimary" type="button">OBS testen</button>
            </div>
          </div>

          <div class="divider"></div>
          <div class="list">
            <div class="listToggle">
              <div class="liText">
                <div class="liTitle">OBS Zoom aktiv</div>
                <div class="liSub">Zoom-Impuls bei Treffern/Events</div>
              </div>
              <label class="switch">
                <input id="obsZoomEnabled" type="checkbox" />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="formRow">
            <label class="label" for="obsZoomSource">Scene Source</label>
            <input class="input" id="obsZoomSource" type="text" placeholder="Game Capture" />
          </div>

          <div class="formRow">
            <label class="label" for="obsZoomDurationMs">Duration (ms)</label>
            <input class="input" id="obsZoomDurationMs" type="number" min="50" max="5000" step="10" />
          </div>

          <div class="formRow">
            <label class="label" for="obsZoomStrength">Strength (%)</label>
            <input class="input" id="obsZoomStrength" type="number" min="100" max="400" step="1" />
          </div>
        </div>
        <div class="spacer"></div>
      `;
    },
    bind(api) {
      const root = api.root;
      root.querySelector("#obsZoomConnectionToggle")?.addEventListener("click", () => {
        CONNECTIONS_OPEN = !CONNECTIONS_OPEN;
        scope.AD_SB_MODULES.obszoom.sync(api, api.getSettings?.() || {});
      });
      api.bindAuto(root, "obsZoomEnabled", "obsZoomEnabled");
      api.bindAuto(root, "obsZoomSource", "obsZoomSource", "text");
      api.bindAuto(root, "obsZoomDurationMs", "obsZoomDurationMs", "number");
      api.bindAuto(root, "obsZoomStrength", "obsZoomStrength", "number");
      root.querySelector("#btnSaveObsConn")?.addEventListener("click", async () => {
        await api.savePartial({
          obsUrl: root.querySelector("#obsUrl")?.value?.trim() || ""
        });
      });
      root.querySelector("#btnTestObs")?.addEventListener("click", async () => {
        const status = root.querySelector("#obsZoomStatus");
        if (status) status.textContent = "Teste...";
        const res = await api.send({ type: "OBS_TEST" });
        if (status) {
          status.textContent = res?.ok ? "Erreichbar" : "Nicht erreichbar";
          status.classList.toggle("connected", !!res?.ok);
          status.classList.toggle("disconnected", !res?.ok);
          status.classList.remove("pillSoft");
        }
      });
    },
    sync(api, settings) {
      const root = api.root;
      const s = settings || {};
      api.setValue(root, "obsUrl", s.obsUrl || "");
      api.setChecked(root, "obsZoomEnabled", !!s.obsZoomEnabled);
      api.setValue(root, "obsZoomSource", s.obsZoomSource || "Game Capture");
      api.setValue(root, "obsZoomDurationMs", Number.isFinite(s.obsZoomDurationMs) ? s.obsZoomDurationMs : 450);
      api.setValue(root, "obsZoomStrength", Number.isFinite(s.obsZoomStrength) ? s.obsZoomStrength : 150);
      const connectionWrap = root.querySelector("#obsZoomConnectionWrap");
      if (connectionWrap) connectionWrap.classList.toggle("open", CONNECTIONS_OPEN);
      const connectionToggle = root.querySelector("#obsZoomConnectionToggle");
      if (connectionToggle) {
        connectionToggle.classList.toggle("active", CONNECTIONS_OPEN);
        connectionToggle.innerHTML = `<span class="ddArrow">${CONNECTIONS_OPEN ? "^" : "v"}</span>`;
      }
      const status = root.querySelector("#obsZoomStatus");
      if (status && status.classList.contains("pillSoft")) status.textContent = "Manuell";
    }
  };
})(window);
