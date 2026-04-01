(function initMacrosModule(scope) {
  scope.AD_SB_MODULES = scope.AD_SB_MODULES || {};

  scope.AD_SB_MODULES.macros = {
    id: "macros",
    icon: "M",
    navLabelKey: "nav_macros",
    needs: { streamerbot: false, obs: false },
    render() {
      return `
        <h2 class="title"><span data-i18n="title_macros">Macros</span><span class="titleMeta">Autodarts Web</span></h2>

        <div class="card">
          <div class="list">
            <div class="listToggle">
              <div class="liText">
                <div class="liTitle" data-i18n="macros_team_mode_title">Teammodus anzeigen</div>
                <div class="liSub" data-i18n="macros_team_mode_sub">Zeigt Team-Presets wie 1+3 gegen 2+4 direkt in der Makro-Leiste</div>
              </div>
              <label class="switch">
                <input id="macrosTeamModeEnabled" type="checkbox" />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="formRow">
            <div class="sectionTitle" style="margin:0;" data-i18n="macros_buttons_title">Verfügbare Buttons</div>
            <div class="hint" data-i18n="macros_buttons_hint">Die erste Version ergänzt eine kleine Website-Leiste mit Teammodus, Presets und Reset direkt auf Match-Seiten.</div>
          </div>

          <div class="list" style="margin-top:12px;">
            <div class="listItem">
              <div class="liText">
                <div class="liTitle">Teammodus</div>
                <div class="liSub" data-i18n="macros_teammode_button_sub">Schaltet die Teamansicht in der Makro-Leiste ein oder aus</div>
              </div>
            </div>
            <div class="listItem">
              <div class="liText">
                <div class="liTitle">1+3 vs 2+4</div>
                <div class="liSub" data-i18n="macros_preset_a_sub">Klassisches 2v2 Preset für vier Spieler</div>
              </div>
            </div>
            <div class="listItem">
              <div class="liText">
                <div class="liTitle">1+2 vs 3+4</div>
                <div class="liSub" data-i18n="macros_preset_b_sub">Alternative Teamverteilung mit zwei Blöcken</div>
              </div>
            </div>
            <div class="listItem">
              <div class="liText">
                <div class="liTitle" data-i18n="macros_reset_title">Reset</div>
                <div class="liSub" data-i18n="macros_reset_sub">Setzt die Teamanzeige in der Website-Leiste wieder zurück</div>
              </div>
            </div>
          </div>
        </div>
        <div class="spacer"></div>
      `;
    },
    bind(api) {
      const root = api.root;
      api.bindAuto(root, "macrosTeamModeEnabled", "macrosTeamModeEnabled");
    },
    sync(api, settings) {
      const root = api.root;
      const s = settings || {};
      api.setChecked(root, "macrosTeamModeEnabled", s.macrosTeamModeEnabled !== false);
    }
  };
})(window);
