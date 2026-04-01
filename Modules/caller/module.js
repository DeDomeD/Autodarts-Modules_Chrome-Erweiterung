(function initCallerModule(scope) {
  scope.AD_SB_MODULES = scope.AD_SB_MODULES || {};

  scope.AD_SB_MODULES.caller = {
    id: "caller",
    icon: "C",
    navLabelKey: "nav_caller",
    needs: { streamerbot: false, obs: false },
    render() {
      return `
        <h2 class="title" data-i18n="title_caller">Caller</h2>
        <div class="card">
          <div class="formRow">
            <label class="label" for="callerVoice">Voice</label>
            <input class="input" id="callerVoice" type="text" placeholder="Standard" />
          </div>

          <div class="formRow">
            <label class="label" for="callerLanguage">Language</label>
            <select class="input" id="callerLanguage">
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </div>

          <div class="formRow">
            <label class="label" for="callerVolume">Volume (0-100)</label>
            <input class="input" id="callerVolume" type="number" min="0" max="100" step="1" />
          </div>
        </div>
        <div class="spacer"></div>
      `;
    },
    bind(api) {
      const root = api.root;
      api.bindAuto(root, "callerVoice", "callerVoice", "text");
      api.bindAuto(root, "callerLanguage", "callerLanguage", "text");
      api.bindAuto(root, "callerVolume", "callerVolume", "number");
    },
    sync(api, settings) {
      const root = api.root;
      const s = settings || {};
      api.setValue(root, "callerVoice", s.callerVoice || "Standard");
      api.setValue(root, "callerLanguage", s.callerLanguage || "de");
      api.setValue(root, "callerVolume", Number.isFinite(s.callerVolume) ? s.callerVolume : 80);
    }
  };
})(window);
