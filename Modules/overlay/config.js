(function initOverlayModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.overlay = {
    id: "overlay",
    defaults: {
      overlayWsPort: 4455
    },
    ini: {
      togglesNumber: { overlayWsPort: 4455 }
    }
  };
})(globalThis);
