(function initObsZoomModule(scope) {
  scope.AD_SB_MODULES = scope.AD_SB_MODULES || {};

  scope.AD_SB_MODULES.obszoom = {
    id: "obszoom",
    icon: "Z",
    navLabelKey: "nav_obszoom",
    needs: { streamerbot: false, obs: true },
    render() {
      return `
        <h2 class="title"><span data-i18n="title_obszoom">OBS Zoom</span><span class="titleMeta">OBS</span></h2>
        <div class="card">
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
      api.bindAuto(root, "obsZoomEnabled", "obsZoomEnabled");
      api.bindAuto(root, "obsZoomSource", "obsZoomSource", "text");
      api.bindAuto(root, "obsZoomDurationMs", "obsZoomDurationMs", "number");
      api.bindAuto(root, "obsZoomStrength", "obsZoomStrength", "number");
    },
    sync(api, settings) {
      const root = api.root;
      const s = settings || {};
      api.setChecked(root, "obsZoomEnabled", !!s.obsZoomEnabled);
      api.setValue(root, "obsZoomSource", s.obsZoomSource || "Game Capture");
      api.setValue(root, "obsZoomDurationMs", Number.isFinite(s.obsZoomDurationMs) ? s.obsZoomDurationMs : 450);
      api.setValue(root, "obsZoomStrength", Number.isFinite(s.obsZoomStrength) ? s.obsZoomStrength : 150);
    }
  };
})(window);
