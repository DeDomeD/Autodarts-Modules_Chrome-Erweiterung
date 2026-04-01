(function initGamesModule(scope) {
  scope.AD_SB_MODULES = scope.AD_SB_MODULES || {};

  scope.AD_SB_MODULES.games = {
    id: "games",
    icon: "G",
    navLabelKey: "nav_games",
    needs: { streamerbot: false, obs: false },
    render() {
      return `
        <h2 class="title"><span data-i18n="title_games">Games</span><span class="titleMeta">Beta</span></h2>
        <div class="card">
          <p class="hint" data-i18n="games_intro_hint">
            Platzhalter fuer dartnahe Spiele und Challenges. Hier kommen spaeter Optionen und Aktionen hin.
          </p>
          <div class="formRow">
            <label class="label" for="gamesNotes" data-i18n="games_notes_label">Notizen</label>
            <textarea class="input" id="gamesNotes" rows="4" placeholder="Ideen, Regeln, Wuensche..."></textarea>
          </div>
        </div>
        <div class="spacer"></div>
      `;
    },
    bind(api) {
      const root = api.root;
      api.bindAutoImmediate(root, "gamesNotes", "gamesNotes", (v) => String(v || ""));
    },
    sync(api, settings) {
      const root = api.root;
      const s = settings || {};
      api.setValue(root, "gamesNotes", s.gamesNotes || "");
    }
  };
})(window);
