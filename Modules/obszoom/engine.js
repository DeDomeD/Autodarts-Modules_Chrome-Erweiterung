(function initObsZoomEngine(scope) {
  const AD_SB = scope.AD_SB || (scope.AD_SB = {});
  const lastAutomaticCheckoutFilterByScene = new Map();

  function normalizeTriggerKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function normalizeManagedFilterKey(value) {
    const raw = normalizeText(value).toUpperCase();
    if (!raw) return "";
    if (raw === "MAIN") return "MAIN";
    if (raw === "BULL" || raw === "25" || raw === "SBULL" || raw === "S-BULL") return "BULL";
    if (raw === "DBULL" || raw === "50" || raw === "D-BULL" || raw === "INNER_BULL") return "DBULL";
    if (raw === "MISS" || raw === "0" || raw === "OUT") return "MISS";
    const match = raw.replace(/\s+/g, "").match(/^([SDT])(\d{1,2})$/);
    if (!match) return "";
    const number = Number(match[2]);
    if (!Number.isFinite(number) || number < 1 || number > 20) return "";
    return `${match[1]}${String(number).padStart(2, "0")}`;
  }

  function isManagedMoveFilter(filter) {
    const filterKind = normalizeText(filter?.filterKind).toLowerCase();
    if (filterKind && filterKind !== "move_source_filter") return false;
    return !!normalizeManagedFilterKey(filter?.filterName);
  }

  function isAutomaticCheckoutTrigger(key) {
    return normalizeTriggerKey(key).startsWith("checkout_");
  }

  function findFilterByManagedKey(filters, managedKey) {
    if (!managedKey) return null;
    return filters.find((filter) => normalizeManagedFilterKey(filter?.filterName) === managedKey) || null;
  }

  async function getManagedFiltersForSource(sourceName) {
    const target = normalizeText(sourceName);
    if (!target) return [];
    const response = await AD_SB.sendObsRequestAwait?.("GetSourceFilterList", { sourceName: target }, 5000);
    return (Array.isArray(response?.responseData?.filters) ? response.responseData.filters : [])
      .filter(isManagedMoveFilter);
  }

  async function setSceneFilterEnabled(sceneName, filterName, filterEnabled) {
    await AD_SB.sendObsRequestAwait?.("SetSourceFilterEnabled", {
      sourceName: sceneName,
      filterName,
      filterEnabled: !!filterEnabled
    }, 5000);
  }

  async function applyAutomaticCheckoutFilter(triggerKey, payload = {}) {
    const settings = AD_SB.getSettings?.() || {};
    const sceneName = normalizeText(settings.obsZoomSceneName);
    const targetSourceName = normalizeText(settings.obsZoomTargetSource);
    const targetSegment = normalizeManagedFilterKey(
      payload?.recommendedSegment ||
      payload?.recommendedSegments?.[0] ||
      triggerKey.replace(/^checkout_/i, "")
    );
    if ((!sceneName && !targetSourceName) || !targetSegment) {
      if (settings?.debugAllLogs) {
        console.log("[Autodarts Modules] checkout auto zoom skipped", {
          reason: "missing_scene_or_target",
          sceneName,
          targetSourceName,
          targetSegment,
          trigger: triggerKey
        });
      }
      return false;
    }

    const sourceCandidates = Array.from(new Set([sceneName, targetSourceName].filter(Boolean)));
    let activeSourceName = "";
    let filters = [];
    let targetFilter = null;

    for (const candidate of sourceCandidates) {
      try {
        const candidateFilters = await getManagedFiltersForSource(candidate);
        const candidateTargetFilter = findFilterByManagedKey(candidateFilters, targetSegment);
        if (!candidateTargetFilter) continue;
        activeSourceName = candidate;
        filters = candidateFilters;
        targetFilter = candidateTargetFilter;
        break;
      } catch {}
    }

    if (!activeSourceName || !targetFilter) {
      if (settings?.debugAllLogs) {
        console.log("[Autodarts Modules] checkout auto zoom skipped", {
          reason: "filter_not_found",
          sceneName,
          targetSourceName,
          targetSegment,
          trigger: triggerKey
        });
      }
      return false;
    }

    const previousFilterName = lastAutomaticCheckoutFilterByScene.get(activeSourceName) || "";
    let changed = false;
    for (const filter of filters) {
      const filterName = normalizeText(filter?.filterName);
      if (!filterName) continue;
      const managedKey = normalizeManagedFilterKey(filterName);
      if (!managedKey || managedKey === "MAIN") continue;
      const shouldEnable = filterName === targetFilter.filterName;
      const currentlyEnabled = !!filter?.filterEnabled;
      if (currentlyEnabled !== shouldEnable || filterName === previousFilterName || shouldEnable) {
        await setSceneFilterEnabled(activeSourceName, filterName, shouldEnable);
        changed = true;
      }
    }

    const verifyResponse = await AD_SB.sendObsRequestAwait?.("GetSourceFilter", {
      sourceName: activeSourceName,
      filterName: targetFilter.filterName
    }, 5000);
    const verifiedEnabled = verifyResponse?.responseData?.filterEnabled === true;
    if (!verifiedEnabled && !changed) {
      await setSceneFilterEnabled(activeSourceName, targetFilter.filterName, true);
    }

    const verifiedTargetResponse = await AD_SB.sendObsRequestAwait?.("GetSourceFilter", {
      sourceName: activeSourceName,
      filterName: targetFilter.filterName
    }, 5000);
    if (verifiedTargetResponse?.responseData?.filterEnabled !== true) {
      if (settings?.debugAllLogs) {
        console.log("[Autodarts Modules] checkout auto zoom failed", {
          reason: "verify_not_enabled",
          sourceName: activeSourceName,
          filterName: targetFilter.filterName,
          targetSegment,
          trigger: triggerKey
        });
      }
      return false;
    }

    lastAutomaticCheckoutFilterByScene.set(activeSourceName, targetFilter.filterName);

    try {
      if (settings?.debugGameEvents || settings?.debugObs || settings?.debugAllLogs) {
        console.log(`[Autodarts Modules = Zoom] AD-Trigger ${targetSegment} | OBS Filter ${targetFilter.filterName}`);
      }
    } catch {}
    try {
      AD_SB.logger?.info?.("obs", "checkout auto zoom applied", {
        sceneName: activeSourceName,
        filterName: targetFilter.filterName,
        targetSegment,
        trigger: triggerKey,
        checkoutGuide: payload?.checkoutGuide ?? null,
        remaining: payload?.remaining ?? null
      });
    } catch {}
    return true;
  }

  function triggerMatchesRule(rule, emittedKey, payload = {}) {
    const trigger = normalizeTriggerKey(rule);
    const key = normalizeTriggerKey(emittedKey);
    if (!trigger || !key) return false;
    if (trigger === key) return true;

    const rangeMatch = trigger.match(/^range_(\d+)_(\d+)$/);
    if (!rangeMatch) return false;
    const sum = Number(payload?.sum);
    if (!Number.isFinite(sum)) return false;
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    return sum >= Math.min(min, max) && sum <= Math.max(min, max);
  }

  function parseObsZoomEffects(raw) {
    try {
      const arr = JSON.parse(String(raw || "[]"));
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          id: String(item.id || "").trim(),
          name: String(item.name || "").trim(),
          trigger: normalizeTriggerKey(item.trigger),
          sourceName: String(item.sourceName || "").trim(),
          filterName: String(item.filterName || "").trim(),
          filterAction: String(item.filterAction || "enable").trim().toLowerCase(),
          enabled: item.enabled !== false
        }))
        .filter((item) => !!item.id && !!item.trigger && !!item.sourceName && !!item.filterName);
    } catch {
      return [];
    }
  }

  function isModuleActive() {
    const settings = AD_SB.getSettings?.() || {};
    const installed = Array.isArray(settings.installedModules) ? settings.installedModules : [];
    return installed.map((item) => String(item || "").trim().toLowerCase()).includes("obszoom");
  }

  function applyFilterEffect(item, payload = {}) {
    const filterEnabled = item.filterAction !== "disable";
    const requestData = {
      sourceName: item.sourceName,
      filterName: item.filterName,
      filterEnabled
    };
    const ok = AD_SB.sendObsRequest?.("SetSourceFilterEnabled", requestData);
    if (!ok) return false;
    try {
      if (AD_SB.getSettings?.()?.debugObs || AD_SB.getSettings?.()?.debugAllLogs) {
        console.log("[Autodarts Modules] OBS zoom trigger", {
          trigger: item.trigger,
          sourceName: item.sourceName,
          filterName: item.filterName,
          filterAction: item.filterAction
        });
      }
    } catch {}
    AD_SB.logger?.info?.("obs", "zoom filter triggered", {
      trigger: item.trigger,
      effectId: item.id,
      effectName: item.name,
      sourceName: item.sourceName,
      filterName: item.filterName,
      filterAction: item.filterAction,
      payload
    });
    return true;
  }

  function handleActionTrigger(triggerKey, payload = {}) {
    if (!isModuleActive()) return;
    const settings = AD_SB.getSettings?.() || {};
    const items = parseObsZoomEffects(settings.obsZoomEffectsJson);
    const key = normalizeTriggerKey(triggerKey);
    if (!key) return;
    let matchedRule = false;
    for (const item of items) {
      if (item.enabled === false) continue;
      if (!triggerMatchesRule(item.trigger, key, payload)) continue;
      matchedRule = true;
      applyFilterEffect(item, payload);
    }
    if (!matchedRule && isAutomaticCheckoutTrigger(key)) {
      void applyAutomaticCheckoutFilter(key, payload).catch((error) => {
        if (AD_SB.getSettings?.()?.debugAllLogs) {
          console.warn("[Autodarts Modules] checkout auto zoom failed", {
            trigger: key,
            error: String(error?.message || error || "unknown_error")
          });
        }
        AD_SB.logger?.warn?.("obs", "checkout auto zoom failed", {
          trigger: key,
          error: String(error?.message || error || "unknown_error")
        });
      });
    }
  }

  AD_SB.obsZoom = {
    handleActionTrigger,
    parseEffects: parseObsZoomEffects
  };
})(self);
