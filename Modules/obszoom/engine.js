(function initObsZoomEngine(scope) {
  const AD_SB = scope.AD_SB || (scope.AD_SB = {});
  const lastAutomaticCheckoutFilterByScene = new Map();
  /** Gleiches Checkout-Segment kurz hintereinander (checkout + checkout_t19) — nur ein OBS-Lauf. */
  let lastAutomaticCheckoutDedupeKey = "";
  let lastAutomaticCheckoutDedupeAt = 0;
  const AUTO_CHECKOUT_OBS_DEDUPE_MS = 340;
  /** Dedupe: gleicher Guide-Pfad wie Worker (`onCheckoutGuideLogged`). */
  let lastCheckoutGuideObsZoomFp = "";
  let lastCheckoutGuideObsZoomAt = 0;
  /** Nur bei „OBS debug“ / „Alle Logs“ — nicht an „Spiel-Events“ koppeln (sonst Zoom trotz aus UI). */
  function obsZoomWorkerDiagEnabled() {
    return true;
  }

  function normalizeTriggerKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function isGenericObsZoomPlayerPlaceholder(name) {
    const t = normalizeText(name).toLowerCase();
    if (!t) return true;
    if (/^player\s*\d+$/.test(t)) return true;
    if (/^spieler\s*\d+$/.test(t)) return true;
    if (/^p\d{1,2}$/.test(t)) return true;
    return false;
  }

  /** Entfernt typische AD-Dekorationen, damit Liste und Live-Name zusammenpassen. */
  function stripObsZoomNameDecorations(raw) {
    let t = normalizeText(raw);
    try {
      t = t.normalize("NFKC");
    } catch {}
    t = t.replace(/\s*#\d{1,8}\s*$/u, "").trim();
    t = t.replace(/\s*@\S+$/, "").trim();
    t = t.replace(/\s*\([^)]{0,48}\)\s*$/, "").trim();
    return t.trim();
  }

  function normalizeObsZoomComparableName(value) {
    return stripObsZoomNameDecorations(value).toLowerCase().replace(/\s+/g, " ").trim();
  }

  function obsZoomNameMatchesConfigured(playerNorm, entryNorm) {
    if (!playerNorm || !entryNorm) return false;
    if (playerNorm === entryNorm) return true;
    if (playerNorm.startsWith(entryNorm + " ")) return true;
    if (entryNorm.length >= 2 && playerNorm.startsWith(entryNorm)) return true;
    const pt = playerNorm.split(" ").filter(Boolean);
    const et = entryNorm.split(" ").filter(Boolean);
    if (pt[0] && et[0] && pt[0] === et[0]) return true;
    if (entryNorm.length >= 3 && playerNorm.includes(entryNorm)) return true;
    return false;
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

  function getThrowTriggerNameFromDartLike(t) {
    if (!t || typeof t !== "object") return "";
    const segUpper = String(t.segment || "").trim().toUpperCase();
    if (segUpper === "BULL" || segUpper === "DBULL") return segUpper.toLowerCase();
    const mult = Number(t.multiplier);
    const num = Number(t.number);
    if (Number.isFinite(mult) && Number.isFinite(num)) {
      if (mult === 3) return `t${num}`;
      if (mult === 2) return num === 25 ? "bull" : `d${num}`;
      if (mult === 1) return `s${num}`;
    }
    const segMatch = segUpper.match(/^([SDT])(\d{1,2})$/);
    if (segMatch) return `${segMatch[1].toLowerCase()}${Number(segMatch[2])}`;
    if (/^M(?:ISS)?/.test(segUpper) || segUpper === "OUTSIDE") return "outside";
    return "";
  }

  function extractThrowNameFromGameOrThrowPayload(payload) {
    if (!payload || typeof payload !== "object") return "";
    const dart =
      payload.raw?.data?.body?.dart ??
      payload.raw?.body?.dart ??
      payload.raw?.data?.body ??
      payload.raw?.body ??
      null;
    return (
      getThrowTriggerNameFromDartLike(dart) ||
      getThrowTriggerNameFromDartLike(payload) ||
      ""
    );
  }

  function throwTriggerNameToManagedKey(throwName) {
    const k = normalizeTriggerKey(throwName);
    if (!k || k === "outside") return "";
    if (k === "bull") return "BULL";
    if (k === "dbull") return "DBULL";
    const m = k.match(/^([tsd])(\d{1,2})$/);
    if (!m) return "";
    const letter = m[1].toUpperCase();
    const n = Number(m[2]);
    if (!Number.isFinite(n) || n < 1 || n > 20) return "";
    return normalizeManagedFilterKey(`${letter}${n}`);
  }

  function resolveManagedSegmentForCheckoutObs(payload) {
    const rec =
      payload?.recommendedSegment ||
      (Array.isArray(payload?.recommendedSegments) ? payload.recommendedSegments[0] : null);
    let mk = normalizeManagedFilterKey(rec || "");
    if (mk) return mk;

    const fromThrow = extractThrowNameFromGameOrThrowPayload(payload);
    mk = throwTriggerNameToManagedKey(fromThrow);
    if (mk) return mk;

    return "";
  }

  function runCheckoutAutoZoom(triggerKeyForLog, payload, managedKey) {
    const mk = normalizeManagedFilterKey(managedKey);
    if (!mk) return;
    void applyAutomaticCheckoutFilter(`checkout_${mk.toLowerCase()}`, {
      ...payload,
      recommendedSegment: mk
    }).catch((error) => {
      if (obsZoomWorkerDiagEnabled()) {
        try {
          AD_SB.logger?.warn?.("obs", "checkout auto zoom failed", {
            trigger: triggerKeyForLog,
            error: String(error?.message || error || "unknown_error")
          });
        } catch {}
      }
    });
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
      try {
        AD_SB.logger?.info?.("obs", "managed zoom skipped", { reason: "filter_not_found", targetSegment });
      } catch {}
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
    if (obsZoomWorkerDiagEnabled()) {
      AD_SB.logger?.info?.("obs", "managed zoom applied", {
        sceneName: resolved.sourceName,
        filterName: resolved.targetFilter.filterName,
        targetSegment,
        payload
      });
    }
    try {
      AD_SB.triggerWorkerLog?.printObsZoomLine?.(resolved.targetFilter.filterName || targetSegment);
    } catch {}
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
      try {
        AD_SB.logger?.info?.("obs", "checkout auto zoom skipped", {
          reason: "missing_scene_or_target",
          sceneName,
          targetSourceName,
          targetSegment,
          trigger: triggerKey
        });
      } catch {}
      return false;
    }

    const resolved = await resolveManagedFilterSource(settings, targetSegment);
    if (!resolved?.sourceName || !resolved?.targetFilter) {
      try {
        AD_SB.logger?.info?.("obs", "checkout auto zoom skipped", {
          reason: "filter_not_found",
          sceneName,
          targetSourceName,
          targetSegment,
          trigger: triggerKey
        });
      } catch {}
      return false;
    }
    const activeSourceName = resolved.sourceName;
    const filters = resolved.filters;
    const targetFilter = resolved.targetFilter;

    const obsDedupeKey = `${activeSourceName}|${targetFilter.filterName}|${targetSegment}`;
    const nowObsDedupe = Date.now();
    if (
      obsDedupeKey === lastAutomaticCheckoutDedupeKey &&
      nowObsDedupe - lastAutomaticCheckoutDedupeAt < AUTO_CHECKOUT_OBS_DEDUPE_MS
    ) {
      return true;
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

    const verifyResponse = await AD_SB.getObsSourceFilter?.(activeSourceName, targetFilter.filterName);
    const verifiedEnabled = verifyResponse?.filterEnabled === true;
    if (!verifiedEnabled && !changed) {
      await setSceneFilterEnabled(activeSourceName, targetFilter.filterName, true);
    }

    const verifiedTargetResponse = await AD_SB.getObsSourceFilter?.(activeSourceName, targetFilter.filterName);
    if (verifiedTargetResponse?.filterEnabled !== true) {
      try {
        AD_SB.logger?.info?.("obs", "checkout auto zoom failed", {
          reason: "verify_not_enabled",
          sourceName: activeSourceName,
          filterName: targetFilter.filterName,
          targetSegment,
          trigger: triggerKey
        });
      } catch {}
      return false;
    }

    lastAutomaticCheckoutFilterByScene.set(activeSourceName, targetFilter.filterName);
    lastAutomaticCheckoutDedupeKey = obsDedupeKey;
    lastAutomaticCheckoutDedupeAt = Date.now();

    try {
      if (obsZoomWorkerDiagEnabled()) {
        AD_SB.logger?.info?.("obs", "checkout auto zoom applied", {
          sceneName: activeSourceName,
          filterName: targetFilter.filterName,
          targetSegment,
          trigger: triggerKey,
          checkoutGuide: payload?.checkoutGuide ?? null,
          remaining: payload?.remaining ?? null
        });
      }
    } catch {}
    if (!payload?._admSkipWorkerZoomLog) {
      try {
        AD_SB.triggerWorkerLog?.printObsZoomLine?.(targetFilter.filterName || targetSegment);
      } catch {}
    }
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
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split(/[\n,;]+/)
      .map((s) => normalizeObsZoomComparableName(s))
      .filter(Boolean);
  }

  function readPlayerDisplayNameFromObj(obj) {
    if (!obj || typeof obj !== "object") return "";
    const cand =
      obj.name ??
      obj.displayName ??
      obj.nickname ??
      obj.username ??
      obj.userName ??
      obj.playerName ??
      obj.liveName ??
      obj.publicName ??
      obj.tagLine ??
      obj?.player?.name ??
      obj?.user?.name ??
      obj?.user?.displayName ??
      obj?.profile?.name ??
      "";
    return stripObsZoomNameDecorations(normalizeText(cand));
  }

  /** Liste leer = alle Spieler; sonst nur eingetragene Namen (Vergleich lowercase). */
  function normalizeObsZoomPlayerFilterMode(settings) {
    const names = parseObsZoomPlayerNamesList(settings?.obsZoomPlayerNamesList);
    return names.length > 0 ? "names" : "all";
  }

  function resolvePlayerForObsZoomFilter(payload) {
    if (!payload || typeof payload !== "object") {
      return { index: NaN, nameComparable: "" };
    }
    let idx = Number(payload.player ?? payload.playerIndex);

    const st = payload.state && typeof payload.state === "object" ? payload.state : null;
    if (!Number.isFinite(idx) && st) {
      const sp = st.player;
      if (Number.isFinite(Number(sp))) idx = Number(sp);
    }

    if (Array.isArray(payload.darts) && payload.darts.length) {
      const last = payload.darts[payload.darts.length - 1];
      if (last && typeof last === "object") {
        if (!Number.isFinite(idx) && Number.isFinite(Number(last.player))) idx = Number(last.player);
      }
    }

    let name = "";
    const fromWorker = AD_SB.admTriggers?.resolveDisplayNameForObsZoom?.(payload);
    if (fromWorker && !isGenericObsZoomPlayerPlaceholder(fromWorker)) {
      name = stripObsZoomNameDecorations(normalizeText(fromWorker));
    }
    if (!name || isGenericObsZoomPlayerPlaceholder(name)) {
      name = normalizeText(
        payload.playerName ??
          payload.winnerName ??
          ""
      );
    }
    if (!name || isGenericObsZoomPlayerPlaceholder(name)) {
      if (Array.isArray(payload.darts) && payload.darts.length) {
        const last = payload.darts[payload.darts.length - 1];
        if (last && typeof last === "object" && last.playerName) {
          name = stripObsZoomNameDecorations(normalizeText(last.playerName));
        }
      }
    }
    if (!name || isGenericObsZoomPlayerPlaceholder(name)) {
      if (Number.isFinite(idx) && idx >= 0 && st && Array.isArray(st.players)) {
        const pl = st.players[idx];
        const fromPl = readPlayerDisplayNameFromObj(pl);
        if (fromPl) name = fromPl;
      }
    }
    if (!name || isGenericObsZoomPlayerPlaceholder(name)) {
      name = stripObsZoomNameDecorations(normalizeText(payload.previousPlayerName || ""));
    }

    return { index: idx, nameComparable: normalizeObsZoomComparableName(name) };
  }

  function obsZoomPlayerFilterAllows(settings, payload) {
    if (!payload || typeof payload !== "object") return true;
    if (payload.effect === "manual_test") return true;
    const mode = normalizeObsZoomPlayerFilterMode(settings);
    if (mode === "all") return true;

    const names = parseObsZoomPlayerNamesList(settings?.obsZoomPlayerNamesList);
    if (!names.length) return false;

    const { nameComparable: pNorm } = resolvePlayerForObsZoomFilter(payload);
    if (!pNorm) {
      if (obsZoomWorkerDiagEnabled()) {
        try {
          AD_SB.logger?.info?.("obs", "zoom player filter: no resolved name", {
            triggerEffect: payload?.effect ?? "",
            player: payload?.player ?? payload?.playerIndex ?? null
          });
        } catch {}
      }
      return false;
    }
    for (let i = 0; i < names.length; i += 1) {
      if (obsZoomNameMatchesConfigured(pNorm, names[i])) return true;
    }
    return false;
  }

  function applyFilterEffect(item, payload = {}) {
    const filterEnabled = item.filterAction !== "disable";
    void AD_SB.setObsSourceFilterEnabled?.(item.sourceName, item.filterName, filterEnabled).catch(() => {});
    if (obsZoomWorkerDiagEnabled()) {
      AD_SB.logger?.info?.("obs", "zoom filter triggered", {
        trigger: item.trigger,
        effectId: item.id,
        effectName: item.name,
        sourceName: item.sourceName,
        filterName: item.filterName,
        filterAction: item.filterAction,
        payload
      });
    }
    return true;
  }

  function handleActionTrigger(triggerKey, payload = {}) {
    if (!isModuleActive()) return;
    const key = normalizeTriggerKey(triggerKey);
    /**
     * `takeout` vom Bus trifft oft zusammen mit dem manuellen Checkout-Guide-Pfad —
     * Filter kommen nur über Worker-Zeile + `onCheckoutGuideLogged`.
     */
    if (key === "takeout" && payload?.effect === "checkout_suggestion") return;
    const settings = AD_SB.getSettings?.() || {};
    if (!obsZoomPlayerFilterAllows(settings, payload)) return;
    const items = parseObsZoomEffects(settings.obsZoomEffectsJson);
    if (!key) return;
    let matchedRule = false;
    for (const item of items) {
      if (item.enabled === false) continue;
      if (!triggerMatchesRule(item.trigger, key, payload)) continue;
      matchedRule = true;
      applyFilterEffect(item, payload);
    }
    const rawNorm = normalizeTriggerKey(payload._admRawTrigger || "");
    if (!matchedRule && rawNorm.startsWith("checkout_")) {
      runCheckoutAutoZoom(rawNorm, payload, rawNorm.replace(/^checkout_/i, ""));
      return;
    }
    if (!matchedRule && isAutomaticCheckoutTrigger(key)) {
      runCheckoutAutoZoom(key, payload, key.replace(/^checkout_/i, ""));
      return;
    }
    if (!matchedRule && key === "takeout_finished") {
      const mk = resolveManagedSegmentForCheckoutObs(payload);
      if (mk) runCheckoutAutoZoom(key, payload, mk);
    }
  }

  /**
   * Nach Worker-Zeile „Checkout Guide …“ + Konsolen-Zoom — OBS-Filter wie `checkout_t20`.
   */
  async function onCheckoutGuideLogged(info) {
    if (!isModuleActive()) return;
    const displaySeg = String(info?.displaySegment || "").trim();
    if (!displaySeg) return;
    const mk = normalizeManagedFilterKey(displaySeg);
    if (!mk || mk === "MAIN") return;
    const fp = String(info?.dedupeKey || displaySeg);
    const now = Date.now();
    if (fp === lastCheckoutGuideObsZoomFp && now - lastCheckoutGuideObsZoomAt < 480) return;
    lastCheckoutGuideObsZoomFp = fp;
    lastCheckoutGuideObsZoomAt = now;

    const st = AD_SB.admTriggers?.getState?.() ?? null;
    const settings = AD_SB.getSettings?.() || {};
    const domIdxRaw = info?.domActivePlayerIndex;
    let hasDomCol = false;
    let domIdx = NaN;
    if (domIdxRaw != null && domIdxRaw !== "") {
      const n = Number(domIdxRaw);
      if (Number.isInteger(n) && n >= 0 && n <= 15) {
        hasDomCol = true;
        domIdx = n;
      }
    }
    const domStripName = String(info?.checkoutDomPlayerName || "").trim();
    const payload = {
      effect: "checkout_suggestion",
      checkoutGuide: String(info?.guideRaw || displaySeg).trim(),
      recommendedSegment: mk,
      recommendedSegments: [mk],
      recommendedThrow: mk.toLowerCase(),
      nextThrow: info?.nextThrow,
      state: st,
      matchId: st && String(st.matchId || "").trim() ? String(st.matchId).trim() : null,
      _admSkipWorkerZoomLog: true,
      _obsZoomRequireDomPlayerColumn: true,
      ...(hasDomCol ? { player: domIdx } : {}),
      ...(domStripName ? { playerName: domStripName } : {})
    };
    if (!obsZoomPlayerFilterAllows(settings, payload)) return;
    try {
      await applyAutomaticCheckoutFilter(`checkout_${mk.toLowerCase()}`, payload);
    } catch (error) {
      if (obsZoomWorkerDiagEnabled()) {
        try {
          AD_SB.logger?.warn?.("obs", "checkout guide zoom failed", {
            segment: displaySeg,
            error: String(error?.message || error || "unknown_error")
          });
        } catch (_) {}
      }
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
    onCheckoutGuideLogged,
    parseEffects: parseObsZoomEffects,
    triggerTestInput
  };
})(self);
