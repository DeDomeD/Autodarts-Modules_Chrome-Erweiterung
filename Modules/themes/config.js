(function initThemesModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.themes = {
    id: "themes",
    defaults: {
      websiteLayout: "horizontal",
      websiteTheme: "classic",
      websiteArenaPrimaryHue: 210,
      websiteArenaSecondaryHue: 155,
      websiteDartboardGlowEnabled: true,
      websiteThemeBuilderEnabled: false,
      websiteThemeBuilderData: "{}",
      websiteCustomThemesHorizontal: "[]",
      websiteCustomThemesVertical: "[]",
      websiteCommunityFavorites: "[]",
      /**
       * Zusätzliche Builder-Ziele: JSON-Array
       * [{"key":"header-wrap","label":"Header","selector":"#app > div > header"}]
       * key: nur a-z, 0-9, Bindestrich; selector: gültiger document.querySelector-String
       */
      websiteThemeBuilderTargets: "[]",
      /** data:-URL (JPEG), leer = kein eigenes Hintergrundbild */
      websiteBackgroundImageData: "",
      /** cover | contain | auto */
      websiteBackgroundSize: "cover"
    },
    ini: {
      togglesBool: ["websiteThemeBuilderEnabled", "websiteDartboardGlowEnabled"],
      togglesNumber: {
        websiteArenaPrimaryHue: 210,
        websiteArenaSecondaryHue: 155
      },
      modulesConfigString: {
        websiteLayout: "horizontal",
        websiteTheme: "classic",
        websiteThemeBuilderData: "{}",
        websiteCustomThemesHorizontal: "[]",
        websiteCustomThemesVertical: "[]",
        websiteCommunityFavorites: "[]",
        websiteThemeBuilderTargets: "[]",
        websiteBackgroundImageData: "",
        websiteBackgroundSize: "cover"
      }
    }
  };
})(globalThis);
