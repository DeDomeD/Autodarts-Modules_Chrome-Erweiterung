(function initMacrosModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.macros = {
    id: "macros",
    defaults: {
      macrosEnabled: false,
      macrosTeamModeEnabled: true
    },
    ini: {
      togglesBool: ["macrosEnabled", "macrosTeamModeEnabled"]
    }
  };
})(globalThis);
