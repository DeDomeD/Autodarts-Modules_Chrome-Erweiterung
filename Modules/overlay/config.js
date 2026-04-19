(function initOverlayModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.overlay = {
    id: "overlay",
    defaults: {
      overlayWsPort: 4455,
      /** PDC-Official: Glow-Farbton 0–360 (HSV-Farbkreis) */
      pdcGlowHue: 172,
      /** PDC-Official: Glow-Stärke 0–100 % */
      pdcGlowIntensity: 100
    },
    ini: {
      togglesNumber: { overlayWsPort: 4455, pdcGlowHue: 172, pdcGlowIntensity: 100 }
    }
  };
})(globalThis);
