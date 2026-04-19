/**
 * Service-Worker Bootstrap
 * - erstellt den globalen Namespace `AD_SB`
 * - lädt alle Module (Settings, Effects, Overlay, Routing)
 * - startet danach die Initialisierung über `AD_SB.init()`
 */

self.AD_SB = self.AD_SB || {};

const extUrl = (path) => chrome.runtime.getURL(path);

if (chrome?.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

importScripts(
  extUrl("Modules/effects/config.js"),
  extUrl("Modules/overlay/config.js"),
  extUrl("Modules/wled/config.js"),
  extUrl("Modules/pixelit/config.js"),
  extUrl("Modules/caller/config.js"),
  extUrl("Modules/obszoom/config.js"),
  extUrl("Modules/macros/config.js"),
  extUrl("Modules/lobbyfilter/config.js"),
  extUrl("Modules/themes/config.js"),
  extUrl("Modules/community/config.js"),
  extUrl("Modules/liga/config.js"),
  extUrl("Modules/games/config.js"),
  extUrl("Modules/playercam/config.js"),
  extUrl("Main/settings/defaults.js"),
  extUrl("Main/settings/store.js"),
  extUrl("Main/core/logger.js"),
  extUrl("Main/core/worker-mirror-log.js"),
  extUrl("Main/core/worker-status-log.js"),
  extUrl("Main/core/data-capture.js"),
  extUrl("Main/bridge/adm-trigger-foundation.js"),
  extUrl("Main/bridge/adm-throw-visit-tracker.js"),
  extUrl("Main/bridge/adm-trigger-worker.js"),
  extUrl("Main/bridge/adm-trigger-sources.js"),
  extUrl("Main/bridge/adm-trigger-engine.js"),
  extUrl("Modules/wled/engine.js"),
  extUrl("Modules/pixelit/engine.js"),
  extUrl("Main/core/sb-client.js"),
  extUrl("Main/core/obs-client.js"),
  extUrl("Modules/overlay/engine.js"),
  extUrl("Modules/obszoom/engine.js"),
  extUrl("Main/core/messages.js")
);

(async () => {
  try {
    await self.AD_SB.init();
  } catch (error) {
    console.error(
      "[Autodart Modules / ADM] Bei der Extension ist ein Fehler aufgetreten. Fehlerlog: Debug Logs (Einstellungen).",
      error
    );
  }
})();
