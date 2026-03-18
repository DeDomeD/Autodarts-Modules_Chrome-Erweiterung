(function initCallerModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.caller = {
    id: "caller",
    defaults: {
      callerEnabled: false,
      callerVoice: "Standard",
      callerLanguage: "de",
      callerVolume: 80
    },
    ini: {
      togglesBool: ["callerEnabled"],
      togglesNumber: { callerVolume: 80 },
      modulesConfigString: {
        callerVoice: "Standard",
        callerLanguage: "de"
      }
    }
  };
})(globalThis);
