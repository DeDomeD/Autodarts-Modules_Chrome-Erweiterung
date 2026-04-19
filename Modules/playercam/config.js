(function initPlayercamModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.playercam = {
    id: "playercam",
    /** Nicht automatisch für alle aktivieren (Datenschutz / optionales Feature) */
    autoInstall: false,
    defaults: {
      /** Leer = beim ersten Öffnen des Moduls generieren */
      playercamPeerId: "",
      playercamDisplayName: "",
      /** z. B. ws://127.0.0.1:8766 — eigener Signaling-Server (siehe signaling-server.mjs) */
      playercamSignalingUrl: "",
      /** Optional: gemeinsames Geheimnis, das der Server prüfen kann */
      playercamSignalingToken: ""
    },
    ini: {
      modulesConfigString: {
        playercamDisplayName: "",
        playercamSignalingUrl: "",
        playercamSignalingToken: ""
      }
    }
  };
})(globalThis);
