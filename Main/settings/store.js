/**
 * Settings Store (chrome.storage.local)
 * Verantwortung:
 * - laden/speichern der Settings
 * - Normalisierung (Prefix, Action-Defaults)
 * - Bereitstellung über `getSettings()`
 */
(function initStore(scope) {
  const AD_SB = scope.AD_SB || (scope.AD_SB = {});

  let SETTINGS = structuredClone(AD_SB.DEFAULTS);

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome?.storage?.local) return reject(new Error("chrome.storage.local not available"));
        chrome.storage.local.get(keys, (items) => {
          const err = chrome.runtime?.lastError;
          if (err) reject(err);
          else resolve(items);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageSet(items) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome?.storage?.local) return reject(new Error("chrome.storage.local not available"));
        chrome.storage.local.set(items, () => {
          const err = chrome.runtime?.lastError;
          if (err) reject(err);
          else resolve(true);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function normalizePrefix(p) {
    const t = String(p || "").trim();
    return t.endsWith(" ") ? t : (t + " ");
  }

  function normalizeInstalledModules(raw) {
    if (!Array.isArray(raw)) return [...AD_SB.DEFAULTS.installedModules];
    const required = [...AD_SB.DEFAULTS.installedModules];
    const allow = new Set((AD_SB.DEFAULTS.installedModules || []).map((x) => String(x || "").toLowerCase()));
    for (const key of Object.keys(scope.AD_SB_MODULE_CONFIGS || {})) allow.add(String(key || "").toLowerCase());
    const out = [];
    for (const entry of raw) {
      const id = String(entry || "").trim().toLowerCase();
      if (!id) continue;
      if (!allow.has(id)) continue;
      if (out.includes(id)) continue;
      out.push(id);
    }
    const hadLegacyBase =
      out.includes("effects") &&
      out.includes("overlay");
    const hasAnyNewModule =
      out.includes("wled") ||
      out.includes("caller") ||
      out.includes("obszoom") ||
      out.includes("websitedesign");
    if (hadLegacyBase && !hasAnyNewModule) {
      out.push("wled", "caller", "obszoom", "websitedesign");
    }
    for (const id of required) {
      if (!out.includes(id)) out.push(id);
    }
    return out;
  }

  function normalizeSettings(next) {
    const merged = { ...structuredClone(AD_SB.DEFAULTS), ...(next || {}) };
    merged.actionPrefix = normalizePrefix(merged.actionPrefix);
    if (!Array.isArray(merged.installedModules) && Array.isArray(merged.installedAddons)) {
      merged.installedModules = merged.installedAddons;
    }
    delete merged.installedAddons;
    merged.installedModules = normalizeInstalledModules(merged.installedModules);
    merged.actions = { ...structuredClone(AD_SB.DEFAULTS.actions), ...(merged.actions || {}) };
    // Legacy cleanup: removed action key.
    if (merged.actions && Object.prototype.hasOwnProperty.call(merged.actions, "overlayUpdate")) {
      delete merged.actions.overlayUpdate;
    }
    // Legacy cleanup: removed pressure feature keys.
    if (Object.prototype.hasOwnProperty.call(merged, "enablePressureMoments")) {
      delete merged.enablePressureMoments;
    }
    if (Object.prototype.hasOwnProperty.call(merged, "pressureThreshold")) {
      delete merged.pressureThreshold;
    }
    if (merged.actions && Object.prototype.hasOwnProperty.call(merged.actions, "pressureMoment")) {
      delete merged.actions.pressureMoment;
    }
    // Legacy cleanup: removed turn end feature keys.
    if (Object.prototype.hasOwnProperty.call(merged, "enableTurnEnd")) {
      delete merged.enableTurnEnd;
    }
    if (Object.prototype.hasOwnProperty.call(merged, "turnEndDelayAfterWaschmaschineMs")) {
      delete merged.turnEndDelayAfterWaschmaschineMs;
    }
    if (merged.actions && Object.prototype.hasOwnProperty.call(merged.actions, "turnEnd")) {
      delete merged.actions.turnEnd;
    }
    if (merged.actions && Object.prototype.hasOwnProperty.call(merged.actions, "playerTurnStart")) {
      delete merged.actions.playerTurnStart;
    }
    if (!Object.prototype.hasOwnProperty.call(merged, "wledControllersJson")) {
      const controllers = [];
      const primaryEndpoint = String(merged.wledPrimaryEndpoint || merged.wledEndpoint || "").trim();
      const secondaryEndpoint = String(merged.wledSecondaryEndpoint || "").trim();
      controllers.push({
        id: "ctrl_1",
        name: "",
        endpoint: primaryEndpoint || "http://127.0.0.1"
      });
      if (secondaryEndpoint) {
        controllers.push({
          id: "ctrl_2",
          name: "",
          endpoint: secondaryEndpoint
        });
      }
      merged.wledControllersJson = JSON.stringify(controllers);
    }
    if (!Object.prototype.hasOwnProperty.call(merged, "wledEffectsJson")) {
      merged.wledEffectsJson = "[]";
    }
    delete merged.wledEndpoint;
    delete merged.wledPrimaryEndpoint;
    delete merged.wledHitEffect;
    delete merged.wledMissEffect;
    delete merged.wledSecondaryEnabled;
    delete merged.wledSecondaryEndpoint;
    return merged;
  }

  async function loadSettings() {
    try {
      const stored = await storageGet(["settings"]);
      SETTINGS = normalizeSettings(stored?.settings);
      await storageSet({ settings: SETTINGS });
      console.log("[Autodarts Modules] settings loaded OK");
    } catch (e) {
      console.error("[Autodarts Modules] loadSettings failed -> using defaults", e);
      SETTINGS = normalizeSettings(AD_SB.DEFAULTS);
    }
    return SETTINGS;
  }

  async function setSettings(partial) {
    SETTINGS = normalizeSettings({ ...SETTINGS, ...(partial || {}) });
    await storageSet({ settings: SETTINGS });
    return SETTINGS;
  }

  function getSettings() {
    return SETTINGS;
  }

  AD_SB.loadSettings = loadSettings;
  AD_SB.setSettings = setSettings;
  AD_SB.getSettings = getSettings;
})(self);
