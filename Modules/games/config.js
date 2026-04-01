(function initGamesModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.games = {
    id: "games",
    autoInstall: true,
    defaults: {
      gamesNotes: ""
    },
    ini: {
      modulesConfigString: {
        gamesNotes: ""
      }
    }
  };
})(globalThis);
