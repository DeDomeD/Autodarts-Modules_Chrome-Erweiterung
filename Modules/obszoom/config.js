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
      checkoutTriggerThreshold: 170,
      obsZoomMoveEasingType: 3,
      obsZoomMoveEasingFunction: 2,
      obsZoomIncludeSingles: true,
      obsZoomIncludeDoubles: true,
      obsZoomIncludeTriples: true,
      obsZoomLastTestTrigger: "T20",
      obsZoomPlayerFilterMode: "all",
      obsZoomPlayerNamesList: ""
    },
    actionDefaults: {
      checkout: "Checkout"
    },
    ini: {
      togglesBool: [
        "obsZoomIncludeSingles",
        "obsZoomIncludeDoubles",
        "obsZoomIncludeTriples"
      ],
      togglesNumber: {
        obsZoomDurationMs: 450,
        obsZoomStrength: 150,
        checkoutTriggerThreshold: 170,
        obsZoomMoveEasingType: 3,
        obsZoomMoveEasingFunction: 2
      },
      modulesConfigString: {
        obsZoomSource: "Game Capture",
        obsZoomSceneName: "",
        obsZoomTargetSource: "",
        obsZoomEffectsJson: "[]",
        obsZoomPlayerFilterMode: "all",
        obsZoomPlayerNamesList: ""
      }
    }
  };
})(globalThis);
