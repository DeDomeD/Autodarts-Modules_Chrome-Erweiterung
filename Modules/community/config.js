(function initCommunityModuleConfig(scope) {
  const configs = scope.AD_SB_MODULE_CONFIGS || (scope.AD_SB_MODULE_CONFIGS = {});
  configs.community = {
    id: "community",
    autoInstall: true,
    defaults: {
      communityWebsiteUploadsJson: "[]",
      communityWebsitePushQueueJson: "[]"
    },
    ini: {
      modulesConfigString: {
        communityWebsiteUploadsJson: "[]",
        communityWebsitePushQueueJson: "[]"
      }
    }
  };
})(globalThis);
