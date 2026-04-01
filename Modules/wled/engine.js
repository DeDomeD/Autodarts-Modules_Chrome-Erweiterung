(function initWledEngine(scope) {
  const AD_SB = scope.AD_SB || (scope.AD_SB = {});

  function normalizeEndpoint(raw) {
    let endpoint = String(raw || "").trim();
    if (!endpoint) return "";
    if (!/^https?:\/\//i.test(endpoint)) endpoint = `http://${endpoint}`;
    return endpoint.replace(/\/+$/, "");
  }

  function parsePresetId(value) {
    const n = parseInt(String(value || "").trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function parseWledEffects(raw) {
    try {
      const arr = JSON.parse(String(raw || "[]"));
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const presetTargets = Array.isArray(item.presetTargets)
            ? item.presetTargets
            : (item.controllerId && item.presetId
              ? [{
                  controllerId: String(item.controllerId || item.controller || "").trim(),
                  presetId: String(item.presetId || "").trim(),
                  presetName: String(item.presetName || "").trim(),
                  controllerName: String(item.controllerName || "").trim()
                }]
              : []);
          return {
            ...item,
            presetTargets,
            advancedJson: String(item?.advancedJson || "").trim()
          };
        });
    } catch {
      return [];
    }
  }

  function normalizeTriggerKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function triggerMatchesRule(rule, emittedKey, payload = {}) {
    const trigger = normalizeTriggerKey(rule);
    const key = normalizeTriggerKey(emittedKey);
    if (!trigger || !key) return false;
    if (trigger === key) return true;

    const rangeMatch = trigger.match(/^range_(\d+)_(\d+)$/);
    if (rangeMatch) {
      const sum = Number(payload?.sum);
      if (!Number.isFinite(sum)) return false;
      const min = Number(rangeMatch[1]);
      const max = Number(rangeMatch[2]);
      return sum >= Math.min(min, max) && sum <= Math.max(min, max);
    }

    return false;
  }

  function parseControllers(raw) {
    try {
      const arr = JSON.parse(String(raw || "[]"));
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((item) => item && typeof item === "object")
        .map((item, index) => ({
          id: String(item.id || `ctrl_${index + 1}`).trim(),
          endpoint: String(item.endpoint || "").trim()
        }))
        .filter((item) => !!item.id);
    } catch {
      return [];
    }
  }

  function normalizePresetCollection(raw) {
    if (!raw) return [];

    if (Array.isArray(raw)) {
      return raw
        .map((item, index) => {
          const parsedId = parsePresetId(item?.id ?? item?.ps ?? item?.presetId ?? index + 1);
          if (parsedId === null) return null;
          const name = String(item?.n || item?.name || item?.label || "").trim() || `Preset ${parsedId}`;
          return { id: String(parsedId), name };
        })
        .filter(Boolean)
        .sort((a, b) => Number(a.id) - Number(b.id));
    }

    if (typeof raw === "object") {
      return Object.entries(raw)
        .map(([id, data]) => {
          const parsedId = parsePresetId(id);
          if (parsedId === null) return null;
          const name = String(data?.n || data?.name || data?.label || "").trim() || `Preset ${parsedId}`;
          return { id: String(parsedId), name };
        })
        .filter(Boolean)
        .sort((a, b) => Number(a.id) - Number(b.id));
    }

    return [];
  }

  async function fetchJson(url, init) {
    const res = await fetch(url, {
      cache: "no-store",
      ...init
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function fetchPresets(endpoint) {
    const normalized = normalizeEndpoint(endpoint);
    if (!normalized) throw new Error("Missing WLED endpoint");

    const candidates = [
      `${normalized}/presets.json`,
      `${normalized}/json`,
      `${normalized}/json/presets`,
      `${normalized}/json/presets.json`
    ];

    let lastError = null;
    for (const url of candidates) {
      try {
        const payload = await fetchJson(url);
        const presets = normalizePresetCollection(
          payload?.presets ??
          payload?.ps ??
          payload?.playlist ??
          payload
        );
        if (presets.length) return presets;
      } catch (e) {
        lastError = e;
      }
    }

    if (lastError) throw lastError;
    return [];
  }

  async function triggerPreset(endpoint, presetId) {
    const normalized = normalizeEndpoint(endpoint);
    const parsedPresetId = parsePresetId(presetId);
    if (!normalized) throw new Error("Missing WLED endpoint");
    if (parsedPresetId === null) throw new Error("Invalid preset id");

    const res = await fetch(`${normalized}/json/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ps: parsedPresetId })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  }

  function parseAdvancedJsonPayload(raw) {
    const src = String(raw || "").trim();
    if (!src) return null;
    const parsed = JSON.parse(src);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Advanced Json must be a JSON object");
    }
    return parsed;
  }

  async function triggerJsonState(endpoint, payload) {
    const normalized = normalizeEndpoint(endpoint);
    if (!normalized) throw new Error("Missing WLED endpoint");
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid Advanced Json payload");
    }
    const res = await fetch(`${normalized}/json/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  }

  function getControllerEndpoint(settings, controllerId) {
    const controllers = parseControllers(settings?.wledControllersJson);
    const match = controllers.find((item) => item.id === controllerId);
    return normalizeEndpoint(match?.endpoint);
  }

  async function triggerTargets(targets, settings = null, advancedJson = "") {
    const currentSettings = settings || (AD_SB.getSettings?.() || {});
    const safeTargets = Array.isArray(targets) ? targets : [];
    const advancedPayload = parseAdvancedJsonPayload(advancedJson);
    const processedControllers = new Set();
    await Promise.allSettled(safeTargets.map(async (target) => {
      const controllerId = String(target?.controllerId || "").trim();
      const presetId = String(target?.presetId || "").trim();
      const endpoint = getControllerEndpoint(currentSettings, controllerId);
      if (!endpoint) return;
      if (presetId) {
        await triggerPreset(endpoint, presetId);
      }
      if (advancedPayload && !processedControllers.has(controllerId)) {
        processedControllers.add(controllerId);
        await triggerJsonState(endpoint, advancedPayload);
      }
    }));
  }

  async function handleActionTrigger(actionKey, args = {}) {
    const settings = AD_SB.getSettings?.() || {};
    if (!settings.wledEnabled) return;

    const key = normalizeTriggerKey(actionKey);
    if (!key) return;

    const effects = parseWledEffects(settings.wledEffectsJson);
    const matching = effects.filter((item) => item.enabled !== false && triggerMatchesRule(item.trigger, key, args));
    if (!matching.length) return;

    await Promise.allSettled(matching.map(async (item) => {
      try {
        await triggerTargets(item.presetTargets, settings, item.advancedJson || "");
        AD_SB.logger?.info?.("wled", "preset triggered", {
          trigger: key,
          targets: item.presetTargets,
          advancedJson: !!item.advancedJson,
          name: item.name,
          effect: args?.effect ?? null
        });
      } catch (e) {
        AD_SB.logger?.error?.("errors", "wled preset trigger failed", {
          trigger: key,
          targets: item.presetTargets,
          error: String(e?.message || e)
        });
      }
    }));
  }

  AD_SB.wled = {
    normalizeEndpoint,
    fetchPresets,
    triggerPreset,
    triggerJsonState,
    triggerTargets,
    handleActionTrigger
  };
})(self);
