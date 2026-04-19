(function initLobbyFilterModule(scope) {
  scope.AD_SB_MODULES = scope.AD_SB_MODULES || {};

  scope.AD_SB_MODULES.lobbyfilter = {
    id: "lobbyfilter",
    icon: "L",
    navLabelKey: "nav_lobbyfilter",
    needs: { streamerbot: false, obs: false },
    render() {
      return `
        <h2 class="title"><span data-i18n="title_lobbyfilter">Lobby-Filter</span><span class="titleMeta">play.autodarts.io</span></h2>
        <div class="card">
          <div class="formRow">
            <div class="sectionTitle" style="margin:0;" data-i18n="lobbyfilter_intro_title">Namensuche & Blacklist</div>
            <div class="hint" data-i18n="lobbyfilter_intro_hint">
              Auf der Seite „Lobbys“ blendet die Erweiterung Einträge aus oder markiert Namen.
              Orientierung am bekannten Userscript (Chakra-Karten, Spielernamen).
            </div>
          </div>

          <div class="formRow">
            <label class="label" for="lobbyFilterSearchText" data-i18n="lobbyfilter_search_label">Standardsuche (optional)</label>
            <input class="input" id="lobbyFilterSearchText" type="text" autocomplete="off" placeholder="z. B. Spielername" />
            <div class="hint" data-i18n="lobbyfilter_search_hint">Wird auf der Lobby-Seite in die Suchzeile übernommen; leer = keine Vorauswahl.</div>
          </div>

          <div class="formRow">
            <label class="label" for="lobbyFilterBlacklistJson" data-i18n="lobbyfilter_bl_label">Blacklist (eine Zeile pro Begriff)</label>
            <textarea class="input" id="lobbyFilterBlacklistJson" rows="6" style="min-height:120px;font-family:ui-monospace,monospace;font-size:12px;" placeholder="Spielername&#10;anderername"></textarea>
            <div class="hint" data-i18n="lobbyfilter_bl_hint">
              Wenn ein sichtbarer Spielername einen Eintrag als Teilstring enthält (Groß/Klein egal), wird die Lobby ausgeblendet.
            </div>
          </div>

          <div class="list" style="margin-top:12px;">
            <div class="listToggle">
              <div class="liText">
                <div class="liTitle" data-i18n="lobbyfilter_highlight_title">Blacklist-Namen rot markieren</div>
                <div class="liSub" data-i18n="lobbyfilter_highlight_sub">Entspricht der roten Kennzeichnung im Userscript (auf der Lobby-Seite).</div>
              </div>
              <label class="switch">
                <input id="lobbyFilterHighlightBlacklist" type="checkbox" />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>
        <div class="spacer"></div>
      `;
    },
    bind(api) {
      const root = api.root;
      api.bindAutoImmediate(
        root,
        "lobbyFilterSearchText",
        "lobbyFilterSearchText",
        (v) => String(v || "").trim(),
        320
      );
      api.bindAuto(root, "lobbyFilterHighlightBlacklist", "lobbyFilterHighlightBlacklist");

      const ta = root.querySelector("#lobbyFilterBlacklistJson");
      const saveBl = async () => {
        const lines = String(ta?.value || "")
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        await api.savePartial({ lobbyFilterBlacklistJson: JSON.stringify(lines) });
      };
      if (ta) {
        ta.addEventListener("change", () => void saveBl());
        ta.addEventListener("blur", () => void saveBl());
      }
    },
    sync(api, settings) {
      const root = api.root;
      const s = settings || {};
      api.setValue(root, "lobbyFilterSearchText", String(s.lobbyFilterSearchText || ""));
      api.setChecked(root, "lobbyFilterHighlightBlacklist", s.lobbyFilterHighlightBlacklist !== false);

      const ta = root.querySelector("#lobbyFilterBlacklistJson");
      if (ta) {
        let lines = [];
        try {
          const raw = JSON.parse(String(s.lobbyFilterBlacklistJson || "[]"));
          if (Array.isArray(raw)) lines = raw.map((x) => String(x || "").trim()).filter(Boolean);
        } catch {
          lines = [];
        }
        ta.value = lines.join("\n");
      }
    }
  };
})(window);
