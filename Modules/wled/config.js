(function initWledModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.wled = {
    id: "wled",
    defaults: {
      wledEnabled: false,
      wledEndpoint: "http://127.0.0.1",
      wledHitEffect: "Rainbow",
      wledMissEffect: "Blink Red"
    },
    ini: {
      togglesBool: ["wledEnabled"],
      modulesConfigString: {
        wledEndpoint: "http://127.0.0.1",
        wledHitEffect: "Rainbow",
        wledMissEffect: "Blink Red"
      }
    }
  };
})(globalThis);
