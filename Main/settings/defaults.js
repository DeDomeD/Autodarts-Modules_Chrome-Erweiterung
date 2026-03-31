/**
 * Zentrale Default-Konfiguration
 * - wird beim ersten Start gespeichert
 * - dient als Fallback bei unvollständigen/alten Settings
 */
(function initDefaults(scope) {
  const AD_SB = scope.AD_SB || (scope.AD_SB = {});
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
    sbUrl: "ws://127.0.0.1:8080/",
    obsUrl: "ws://127.0.0.1:4455/",
    websiteApiUrl: "http://127.0.0.1:8080",
    actionPrefix: "AD-SB ",
    uiLanguage: "de",
    accountToken: "",
    accountUserJson: "",
    installedModules,

    enabled: true,

    onlyMyThrows: false,
    myPlayerIndex: 0,

    // Debug
    debugActions: true,
    debugGameEvents: true,
    ...moduleDefaults,

    // Action suffix mapping (final action = prefix + suffix)
    actions: actionDefaults
  };
})(self);
