(function initWledModule(scope) {
  scope.AD_SB_MODULES = scope.AD_SB_MODULES || {};

  scope.AD_SB_MODULES.wled = {
    id: "wled",
    icon: "W",
    navLabelKey: "nav_wled",
    needs: { streamerbot: false, obs: false },
    render() {
      return `
        <h2 class="title" data-i18n="title_wled">WLED</h2>
        <div class="card">
          <div class="list">
            <div class="listToggle">
              <div class="liText">
                <div class="liTitle">WLED aktiv</div>
                <div class="liSub">Aktiviert WLED Trigger für Treffer/Events</div>
              </div>
              <label class="switch">
                <input id="wledEnabled" type="checkbox" />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="formRow">
            <label class="label" for="wledEndpoint">Endpoint</label>
            <input class="input" id="wledEndpoint" type="text" placeholder="http://127.0.0.1" />
            <div class="hint">HTTP Endpoint deines WLED Controllers.</div>
          </div>

          <div class="formRow">
            <label class="label" for="wledHitEffect">Hit Effect</label>
            <input class="input" id="wledHitEffect" type="text" placeholder="Rainbow" />
          </div>

          <div class="formRow">
            <label class="label" for="wledMissEffect">Miss Effect</label>
            <input class="input" id="wledMissEffect" type="text" placeholder="Blink Red" />
          </div>
        </div>
        <div class="spacer"></div>
      `;
    },
    bind(api) {
      const root = api.root;
      api.bindAuto(root, "wledEnabled", "wledEnabled");
      api.bindAuto(root, "wledEndpoint", "wledEndpoint", "text");
      api.bindAuto(root, "wledHitEffect", "wledHitEffect", "text");
      api.bindAuto(root, "wledMissEffect", "wledMissEffect", "text");
    },
    sync(api, settings) {
      const root = api.root;
      const s = settings || {};
      api.setChecked(root, "wledEnabled", !!s.wledEnabled);
      api.setValue(root, "wledEndpoint", s.wledEndpoint || "http://127.0.0.1");
      api.setValue(root, "wledHitEffect", s.wledHitEffect || "Rainbow");
      api.setValue(root, "wledMissEffect", s.wledMissEffect || "Blink Red");
    }
  };
})(window);
