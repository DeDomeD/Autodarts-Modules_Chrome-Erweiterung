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

  function normalizeManualTestTrigger(value) {
    const text = normalizeText(value);
    if (!text) return { key: "", managedKey: "", checkoutKey: "" };
    const normalizedKey = normalizeTriggerKey(text);
    const managedKey = normalizeManagedFilterKey(text);
    const checkoutKey = managedKey
      ? `checkout_${managedKey.toLowerCase()}`
      : (normalizedKey.startsWith("checkout_") ? normalizedKey : "");
    return { key: normalizedKey, managedKey, checkoutKey };
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

  async function resolveManagedFilterSource(settings, targetSegment) {
    const sceneName = normalizeText(settings?.obsZoomSceneName);
    const targetSourceName = normalizeText(settings?.obsZoomTargetSource);
    const sourceCandidates = Array.from(new Set([sceneName, targetSourceName].filter(Boolean)));
    for (const candidate of sourceCandidates) {
      try {
        const filters = await getManagedFiltersForSource(candidate);
        const targetFilter = findFilterByManagedKey(filters, targetSegment);
        if (!targetFilter) continue;
        return {
          sourceName: candidate,
          filters,
          targetFilter
        };
      } catch {}
    }
    return null;
  }

  async function applyManagedFilterByKey(managedKey, payload = {}) {
    const settings = AD_SB.getSettings?.() || {};
    if (!obsZoomPlayerFilterAllows(settings, payload)) return false;
    const targetSegment = normalizeManagedFilterKey(managedKey);
    if (!targetSegment) return false;

    const resolved = await resolveManagedFilterSource(settings, targetSegment);
    if (!resolved?.sourceName || !resolved?.targetFilter) {
      if (settings?.debugAllLogs) {
        console.log("[Autodarts Modules] managed zoom skipped", {
          reason: "filter_not_found",
          targetSegment
        });
      }
      return false;
    }

    const previousFilterName = lastAutomaticCheckoutFilterByScene.get(resolved.sourceName) || "";
    let changed = false;
    for (const filter of resolved.filters) {
      const filterName = normalizeText(filter?.filterName);
      if (!filterName) continue;
      const shouldEnable = normalizeManagedFilterKey(filterName) === targetSegment;
      const currentlyEnabled = !!filter?.filterEnabled;
      if (currentlyEnabled !== shouldEnable || filterName === previousFilterName || shouldEnable) {
        await setSceneFilterEnabled(resolved.sourceName, filterName, shouldEnable);
        changed = true;
      }
    }

    const verifyResponse = await AD_SB.getObsSourceFilter?.(resolved.sourceName, resolved.targetFilter.filterName);
    if (verifyResponse?.filterEnabled !== true && !changed) {
      await setSceneFilterEnabled(resolved.sourceName, resolved.targetFilter.filterName, true);
    }

    const verifiedTargetResponse = await AD_SB.getObsSourceFilter?.(resolved.sourceName, resolved.targetFilter.filterName);
    if (verifiedTargetResponse?.filterEnabled !== true) {
      return false;
    }

    lastAutomaticCheckoutFilterByScene.set(resolved.sourceName, resolved.targetFilter.filterName);
    AD_SB.logger?.info?.("obs", "managed zoom applied", {
      sceneName: resolved.sourceName,
      filterName: resolved.targetFilter.filterName,
      targetSegment,
      payload
    });
    return true;
  }

  async function getManagedFiltersForSource(sourceName) {
    const target = normalizeText(sourceName);
    if (!target) return [];
    const filters = await AD_SB.getObsSourceFilters?.(target);
    return (Array.isArray(filters) ? filters : []).filter(isManagedMoveFilter);
  }

  async function setSceneFilterEnabled(sceneName, filterName, filterEnabled) {
    await AD_SB.setObsSourceFilterEnabled?.(sceneName, filterName, !!filterEnabled);
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

    const resolved = await resolveManagedFilterSource(settings, targetSegment);
    if (!resolved?.sourceName || !resolved?.targetFilter) {
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
    const activeSourceName = resolved.sourceName;
    const filters = resolved.filters;
    const targetFilter = resolved.targetFilter;

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

    const verifyResponse = await AD_SB.getObsSourceFilter?.(activeSourceName, targetFilter.filterName);
    const verifiedEnabled = verifyResponse?.filterEnabled === true;
    if (!verifiedEnabled && !changed) {
      await setSceneFilterEnabled(activeSourceName, targetFilter.filterName, true);
    }

    const verifiedTargetResponse = await AD_SB.getObsSourceFilter?.(activeSourceName, targetFilter.filterName);
    if (verifiedTargetResponse?.filterEnabled !== true) {
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

  function parseObsZoomPlayerNamesList(raw) {
    return String(raw || "")
      .split(/[\n,;]+/)
      .map((s) => normalizeText(s).toLowerCase())
      .filter(Boolean);
  }

  function resolvePlayerForObsZoomFilter(payload) {
    if (!payload || typeof payload !== "object") {
      return { index: NaN, nameLower: "" };
    }
    let idx = Number(payload.player ?? payload.playerIndex);
    let name = normalizeText(payload.playerName);

    if (!Number.isFinite(idx) && payload.state && typeof payload.state === "object") {
      const sp = payload.state.player;
      if (Number.isFinite(Number(sp))) idx = Number(sp);
    }
    if (!name && Array.isArray(payload.darts) && payload.darts.length) {
      const last = payload.darts[payload.darts.length - 1];
      if (last && typeof last === "object") {
        if (!Number.isFinite(idx) && Number.isFinite(Number(last.player))) idx = Number(last.player);
        if (!name && last.playerName) name = normalizeText(last.playerName);
      }
    }
    return { index: idx, nameLower: name.toLowerCase() };
  }

  function obsZoomPlayerFilterAllows(settings, payload) {
    if (!payload || typeof payload !== "object") return true;
    if (payload.effect === "manual_test") return true;

    const mode = String(settings?.obsZoomPlayerFilterMode || "all").toLowerCase();
    if (mode === "all") return true;

    const { index: pIdx, nameLower: pName } = resolvePlayerForObsZoomFilter(payload);
    const myIdx = Number(settings?.myPlayerIndex);

    const names = parseObsZoomPlayerNamesList(settings?.obsZoomPlayerNamesList);
    const myIndexOk = Number.isFinite(myIdx) && Number.isFinite(pIdx) && pIdx === myIdx;
    const nameOk = names.length > 0 && !!pName && names.includes(pName);

    if (mode === "my_index") return myIndexOk;
    if (mode === "names") {
      if (!names.length) return false;
      return nameOk;
    }
    if (mode === "my_index_or_names") {
      if (!names.length) return myIndexOk;
      return myIndexOk || nameOk;
    }
    return true;
  }

  function applyFilterEffect(item, payload = {}) {
    const filterEnabled = item.filterAction !== "disable";
    void AD_SB.setObsSourceFilterEnabled?.(item.sourceName, item.filterName, filterEnabled).catch(() => {});
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
    if (!obsZoomPlayerFilterAllows(settings, payload)) return;
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

  async function triggerTestInput(rawTrigger, payload = {}) {
    if (!isModuleActive()) return { ok: false, reason: "module_disabled" };

    const parsed = normalizeManualTestTrigger(rawTrigger);
    if (parsed.managedKey) {
      const checkoutKey = parsed.checkoutKey || `checkout_${parsed.managedKey.toLowerCase()}`;
      const manualPayload = {
        ...payload,
        effect: "manual_test",
        recommendedSegment: parsed.managedKey,
        recommendedSegments: [parsed.managedKey],
        recommendedThrow: parsed.managedKey.toLowerCase()
      };
      const ok = await applyManagedFilterByKey(parsed.managedKey, manualPayload);
      return { ok, trigger: checkoutKey, managedKey: parsed.managedKey, mode: "managed_filter" };
    }

    if (!parsed.key) return { ok: false, reason: "missing_trigger" };
    handleActionTrigger(parsed.key, { ...payload, effect: "manual_test" });
    return { ok: true, trigger: parsed.key, managedKey: parsed.managedKey || "", mode: "trigger" };
  }

  AD_SB.obsZoom = {
    handleActionTrigger,
    parseEffects: parseObsZoomEffects,
    triggerTestInput
  };
})(self);
