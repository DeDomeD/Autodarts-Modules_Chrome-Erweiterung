(function initPixelitModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.pixelit = {
    id: "pixelit",
    autoInstall: true,
    defaults: {
      pixelitBaseUrl: "http://192.168.178.2",
      pixelitMinIntervalMs: 600,
      pixelitEffectsJson: "[]",
      pixelitTestText: "ADM"
    },
    ini: {
      togglesNumber: {
        pixelitMinIntervalMs: 600
      },
      modulesConfigString: {
        pixelitBaseUrl: "http://192.168.178.2",
        pixelitEffectsJson: "[]",
        pixelitTestText: "ADM"
      }
    }
  };
})(globalThis);
