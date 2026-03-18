(function initObsZoomModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.obszoom = {
    id: "obszoom",
    defaults: {
      obsZoomEnabled: false,
      obsZoomSource: "Game Capture",
      obsZoomDurationMs: 450,
      obsZoomStrength: 150
    },
    ini: {
      togglesBool: ["obsZoomEnabled"],
      togglesNumber: {
        obsZoomDurationMs: 450,
        obsZoomStrength: 150
      },
      modulesConfigString: {
        obsZoomSource: "Game Capture"
      }
    }
  };
})(globalThis);
