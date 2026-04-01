/**
 * Zentrale Default-Konfiguration
 * - wird beim ersten Start gespeichert
 * - dient als Fallback bei unvollständigen/alten Settings
 */
(function initDefaults(scope) {
  const AD_SB = scope.AD_SB || (scope.AD_SB = {});
  const DEFAULT_WEBSITE_API_URL = "https://autodarts-modules-production.up.railway.app";
  const moduleConfigs = scope.AD_SB_MODULE_CONFIGS || {};
  const installedModules = Object.values(moduleConfigs)
    .filter((cfg) => cfg?.autoInstall !== false)
    .map((cfg) => String(cfg.id || "").trim().toLowerCase())
    .filter(Boolean);
  const moduleDefaults = {};
  const actionDefaults = {};
  for (const cfg of Object.values(moduleConfigs)) {
    Object.assign(moduleDefaults, cfg?.defaults || {});
    Object.assign(actionDefaults, cfg?.actionDefaults || {});
  }

  AD_SB.DEFAULTS = {
    sbEnabled: true,
    sbUrl: "ws://127.0.0.1:8080/",
    sbPassword: "",
    obsEnabled: true,
    obsUrl: "ws://127.0.0.1:4455/",
    obsPassword: "",
    websiteApiUrl: DEFAULT_WEBSITE_API_URL,
    actionPrefix: "AD-SB ",
    uiLanguage: "de",
    accountToken: "",
    accountUserJson: "",
    installedModules,

    onlyMyThrows: false,
    myPlayerIndex: 0,

    // Debug
    debugAllLogs: false,
    debugActions: true,
    debugObs: false,
    debugGameEvents: true,
    ...moduleDefaults,

    // Action suffix mapping (final action = prefix + suffix)
    actions: actionDefaults
  };
})(self);
