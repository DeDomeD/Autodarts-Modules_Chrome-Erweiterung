(function initLigaModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.liga = {
    id: "liga",
    autoInstall: true,
    defaults: {
      ligaName: "",
      ligaSeason: "",
      ligaTeamName: "",
      ligaSourceUrl: "",
      ligaMatchesJson: "[]"
    },
    ini: {
      modulesConfigString: {
        ligaName: "",
        ligaSeason: "",
        ligaTeamName: "",
        ligaSourceUrl: "",
        ligaMatchesJson: "[]"
      }
    }
  };
})(globalThis);
