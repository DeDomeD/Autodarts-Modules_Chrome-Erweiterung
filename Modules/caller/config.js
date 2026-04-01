(function initCallerModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.caller = {
    id: "caller",
    defaults: {
      callerVoice: "Standard",
      callerLanguage: "de",
      callerVolume: 80
    },
    ini: {
      togglesNumber: { callerVolume: 80 },
      modulesConfigString: {
        callerVoice: "Standard",
        callerLanguage: "de"
      }
    }
  };
})(globalThis);
