(function initLobbyFilterModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.lobbyfilter = {
    id: "lobbyfilter",
    autoInstall: true,
    defaults: {
      /** Teilstring-Suche auf Spielernamen (Lobby-Liste) */
      lobbyFilterSearchText: "",
      /** JSON-Array von Strings: wenn ein Name der Lobby einen Eintrag als Teilstring enthält → ausblenden */
      lobbyFilterBlacklistJson: "[]",
      /** Namen von Blacklist-Spielern auf der Seite rot markieren (wie Userscript) */
      lobbyFilterHighlightBlacklist: true
    },
    ini: {
      modulesConfigString: {
        lobbyFilterSearchText: "",
        lobbyFilterBlacklistJson: "[]"
      },
      togglesBool: ["lobbyFilterHighlightBlacklist"]
    }
  };
})(globalThis);
