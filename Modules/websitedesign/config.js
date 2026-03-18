(function initWebsiteDesignModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.websitedesign = {
    id: "websitedesign",
    defaults: {
      websiteDesignEnabled: false,
      websiteLayout: "horizontal",
      websiteTheme: "classic",
      websiteArenaPrimaryHue: 210,
      websiteArenaSecondaryHue: 155,
      websiteDartboardGlowEnabled: true,
      websiteThemeBuilderEnabled: false,
      websiteThemeBuilderData: "{}",
      websiteCustomThemesHorizontal: "[]",
      websiteCustomThemesVertical: "[]",
      websiteCommunityFavorites: "[]"
    },
    ini: {
      togglesBool: ["websiteDesignEnabled", "websiteThemeBuilderEnabled", "websiteDartboardGlowEnabled"],
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
        websiteCommunityFavorites: "[]"
      }
    }
  };
})(globalThis);
