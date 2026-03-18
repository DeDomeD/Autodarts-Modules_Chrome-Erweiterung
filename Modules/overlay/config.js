(function initOverlayModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.overlay = {
    id: "overlay",
    defaults: {
      overlayEnabled: false,
      overlayWsPort: 4455
    },
    ini: {
      togglesBool: ["overlayEnabled"],
      togglesNumber: { overlayWsPort: 4455 }
    }
  };
})(globalThis);
