/**
 * Service-Worker Bootstrap
 * - erstellt den globalen Namespace `AD_SB`
 * - lädt alle Module (Settings, Effects, Overlay, Routing)
 * - startet danach die Initialisierung über `AD_SB.init()`
 */
console.log("[Autodarts Modules] background.js loaded");

self.AD_SB = self.AD_SB || {};

const extUrl = (path) => chrome.runtime.getURL(path);

importScripts(
  extUrl("Modules/effects/config.js"),
  extUrl("Modules/overlay/config.js"),
  extUrl("Modules/wled/config.js"),
  extUrl("Modules/caller/config.js"),
  extUrl("Modules/obszoom/config.js"),
  extUrl("Modules/macros/config.js"),
  extUrl("Modules/websitedesign/config.js"),
  extUrl("Modules/community/config.js"),
  extUrl("Modules/liga/config.js"),
  extUrl("Main/settings/defaults.js"),
  extUrl("Main/settings/store.js"),
  extUrl("Main/core/logger.js"),
  extUrl("Main/core/data-capture.js"),
  extUrl("Main/core/sb-client.js"),
  extUrl("Modules/overlay/engine.js"),
  extUrl("Modules/effects/engine.js"),
  extUrl("Main/core/messages.js")
);

self.AD_SB.init();
