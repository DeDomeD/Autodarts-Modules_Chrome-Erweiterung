(function initWledModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.wled = {
    id: "wled",
    defaults: {
      wledControllersJson: "[{\"id\":\"ctrl_1\",\"name\":\"\",\"endpoint\":\"http://127.0.0.1\"}]",
      wledEffectsJson: "[]"
    },
    ini: {
      modulesConfigString: {
        wledControllersJson: "[{\"id\":\"ctrl_1\",\"name\":\"\",\"endpoint\":\"http://127.0.0.1\"}]",
        wledEffectsJson: "[]"
      }
    }
  };
})(globalThis);
