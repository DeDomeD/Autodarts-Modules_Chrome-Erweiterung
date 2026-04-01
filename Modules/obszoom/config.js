(function initObsZoomModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.obszoom = {
    id: "obszoom",
    defaults: {
      obsZoomSource: "Game Capture",
      obsZoomSceneName: "",
      obsZoomTargetSource: "",
      obsZoomDurationMs: 450,
      obsZoomStrength: 150,
      obsZoomEffectsJson: "[]",
      checkoutTriggerThreshold: 170
    },
    actionDefaults: {
      checkout: "Checkout"
    },
    ini: {
      togglesNumber: {
        obsZoomDurationMs: 450,
        obsZoomStrength: 150,
        checkoutTriggerThreshold: 170
      },
      modulesConfigString: {
        obsZoomSource: "Game Capture",
        obsZoomSceneName: "",
        obsZoomTargetSource: "",
        obsZoomEffectsJson: "[]"
      }
    }
  };
})(globalThis);
