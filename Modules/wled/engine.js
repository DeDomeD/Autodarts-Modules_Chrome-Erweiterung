(function initWledEngine(scope) {
  const AD_SB = scope.AD_SB || (scope.AD_SB = {});

  /**
   * 2 Spieler: nach Leggewinn (`gameshot*`) / Spielstart wieder Preset 1 (Slot 0),
   * danach abwechselnd pro `player_turn`. Nicht im Bull-Off; nur wenn `participantCount === 2`.
   */
  const wledPlayerTurnAlternateState = { matchId: "", slotForNextTurn: 0 };

  function ensureWledAlternateMatch(matchId) {
    const m = String(matchId ?? "").trim() || "_";
    if (m !== wledPlayerTurnAlternateState.matchId) {
      wledPlayerTurnAlternateState.matchId = m;
      wledPlayerTurnAlternateState.slotForNextTurn = 0;
    }
  }

  function resetWledPlayerTurnAlternateAfterLeg(matchId) {
    ensureWledAlternateMatch(matchId);
    wledPlayerTurnAlternateState.slotForNextTurn = 0;
  }

  function consumeWledPlayerTurnAlternateSlot(matchId) {
    ensureWledAlternateMatch(matchId);
    const idx = wledPlayerTurnAlternateState.slotForNextTurn === 0 ? 0 : 1;
    wledPlayerTurnAlternateState.slotForNextTurn = idx === 0 ? 1 : 0;
    return idx;
  }

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

  function normalizeTriggerKey(value) {
    return AD_SB.admTriggerKeys.normalizeTriggerKey(value);
  }

  function normalizeWledSegmentToken(raw) {
    let s = String(raw || "").trim().toLowerCase().replace(/\s+/g, "");
    if (!s) return "";
    if (s === "d25" || s === "dbull" || s === "doublebull") s = "bull";
    return s;
  }

  function isWorkerSegmentDispatchKey(k) {
    const key = normalizeTriggerKey(k);
    if (key === "outside" || key === "bull" || key === "dbull") return true;
    return /^[sdt](?:[1-9]|1[0-9]|20|25)$/.test(key);
  }

  function parseChainTripleFromItem(item) {
    const raw = item?.chainTriple ?? item?.chain_triple;
    if (Array.isArray(raw)) {
      return raw
        .map((x) => normalizeWledSegmentToken(String(x || "")))
        .filter(Boolean);
    }
    return [];
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
          let trigger = String(item?.trigger || "").trim();
          const playerFilter = String(item?.playerFilter || "").trim();
          /** Legacy: Namensfilter galt auf „throw“ — jetzt pro Visit („player_turn“). */
          if (normalizeTriggerKey(trigger) === "throw" && playerFilter) {
            trigger = "player_turn";
          }
          const chainTriple = parseChainTripleFromItem(item);
          const out = {
            ...item,
            trigger,
            presetTargets,
            advancedJson: String(item?.advancedJson || "").trim(),
            playerFilter,
            chainTriple: chainTriple.length === 3 ? chainTriple : []
          };
          delete out.playerTurnIndex;
          return out;
        });
    } catch {
      return [];
    }
  }

  function triggerMatchesRule(rule, emittedKey, payload = {}) {
    return AD_SB.admTriggerKeys.triggerMatchesRule(rule, emittedKey, payload);
  }

  function normalizePlayerFilterCompare(value) {
    let v = String(value || "").trim().toLowerCase();
    try {
      v = v.normalize("NFKD").replace(/\p{M}/gu, "");
    } catch (_) {}
    return v.replace(/\s+/g, " ");
  }

  function collectPayloadPlayerHaystack(args) {
    const parts = [];
    const a = args && typeof args === "object" ? args : {};
    const push = (x) => {
      const t = String(x ?? "").trim();
      if (t) parts.push(t);
    };
    push(a.playerName);
    push(a.__admVisitMeta?.throwerDisplayName);
    push(a.winnerName);
    if (Array.isArray(a.playerNames)) {
      for (const p of a.playerNames) push(typeof p === "string" ? p : p?.name);
    }
    if (Array.isArray(a.players)) {
      for (const p of a.players) {
        if (typeof p === "string") push(p);
        else push(p?.name || p?.displayName || p?.userName);
      }
    }
    const wi = a.winner;
    if (Number.isInteger(wi) && wi >= 0 && Array.isArray(a.playerNames) && wi < a.playerNames.length) {
      const p = a.playerNames[wi];
      push(typeof p === "string" ? p : p?.name);
    }
    return normalizePlayerFilterCompare(parts.join(" "));
  }

  function wledPlayerFilterMatches(filter, args, triggerRule) {
    const f = normalizePlayerFilterCompare(filter);
    if (!f) return true;
    /** Namensfilter nur am Visit-Start (einmal pro Zug), nicht bei jedem Wurf. */
    const tr = normalizeTriggerKey(triggerRule);
    if (tr !== "player_turn" && tr !== "player_turn_alternate") return true;
    const hay = collectPayloadPlayerHaystack(args);
    return !!hay && hay.includes(f);
  }

  function formatWledTriggerHuman(trigger) {
    const t = normalizeTriggerKey(trigger);
    if (!t) return "—";
    if (t === "player_turn") return "Player :";
    if (t === "player_turn_alternate") return "Player Wechsel:";
    if (t === "chain_visit") return "Kette:";
    const combo = t.match(/^(gameshot|matchshot)\+(.+)$/);
    if (combo) {
      const head = combo[1] === "gameshot" ? "Leggew." : "Match";
      return `${head}+${combo[2].toUpperCase()}`;
    }
    const seg = t.match(/^([sdt])(\d+)$/);
    if (seg) return `${seg[1].toUpperCase()}${seg[2]}`;
    if (t === "bull" || t === "double" || t === "triple" || t === "outside") return t.toUpperCase();
    return t;
  }

  function formatWledPresetSummary(targets) {
    const list = Array.isArray(targets) ? targets : [];
    if (!list.length) return "";
    return list
      .map((x) => {
        const pn = String(x?.presetName || "").trim();
        const pid = String(x?.presetId || "").trim();
        const cn = String(x?.controllerName || "").trim();
        const p = pn || (pid ? `Preset ${pid}` : "?");
        return cn ? `${p} (${cn})` : p;
      })
      .join(", ");
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

  function chainVisitMultisetEqual(want, got) {
    if (!Array.isArray(want) || !Array.isArray(got) || want.length !== 3 || got.length !== 3) return false;
    const a = want.map((x) => normalizeWledSegmentToken(x)).filter(Boolean).sort();
    const b = got.map((x) => normalizeWledSegmentToken(x)).filter(Boolean).sort();
    if (a.length !== 3 || b.length !== 3) return false;
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  }

  async function fireChainVisitEffectsIfMatched(effects, key, args, settings) {
    const meta = args?.__admVisitMeta;
    if (!meta || meta.skipped || meta.dartIndexInVisit !== 3) return;
    if (!isWorkerSegmentDispatchKey(key)) return;
    const peek = AD_SB.admThrowVisitTracker?.peekVisitSlotTriggerKeys;
    if (typeof peek !== "function") return;
    const live = peek();
    if (!live || live.length !== 3) return;
    const chainItems = effects.filter((item) => (
      item.enabled !== false &&
      normalizeTriggerKey(item.trigger) === "chain_visit" &&
      Array.isArray(item.chainTriple) &&
      item.chainTriple.length === 3
    ));
    await Promise.allSettled(chainItems.map(async (item) => {
      if (!chainVisitMultisetEqual(item.chainTriple, live)) return;
      try {
        const targets = Array.isArray(item.presetTargets) ? item.presetTargets : [];
        await triggerTargets(targets, settings, item.advancedJson || "");
        const tripleHuman = item.chainTriple.map((x) => String(x || "").toUpperCase()).join(" ");
        AD_SB.triggerWorkerLog?.printAdmWledEffectLine?.({
          effectName: String(item.name || "").trim() || "WLED",
          triggerUnit: `Kette: ${tripleHuman}`.trim(),
          presetSummary: formatWledPresetSummary(targets)
        });
        AD_SB.logger?.info?.("wled", "chain_visit preset triggered", {
          trigger: key,
          chainTriple: item.chainTriple,
          live,
          name: item.name
        });
      } catch (e) {
        AD_SB.logger?.error?.("errors", "wled chain_visit trigger failed", {
          error: String(e?.message || e)
        });
      }
    }));
  }

  async function handleActionTrigger(actionKey, args = {}) {
    const settings = AD_SB.getSettings?.() || {};
    if (!settings.wledEnabled) return;

    const key = normalizeTriggerKey(actionKey);
    if (!key) return;

    if (key === "gameshot" || key.startsWith("gameshot+")) {
      resetWledPlayerTurnAlternateAfterLeg(args?.matchId);
    }
    if (key === "x01_game_start") {
      resetWledPlayerTurnAlternateAfterLeg(args?.matchId);
    }

    const effects = parseWledEffects(settings.wledEffectsJson);
    await fireChainVisitEffectsIfMatched(effects, key, args, settings);

    const matching = effects.filter((item) => (
      item.enabled !== false &&
      normalizeTriggerKey(item.trigger) !== "chain_visit" &&
      triggerMatchesRule(item.trigger, key, args) &&
      wledPlayerFilterMatches(item.playerFilter, args, item.trigger)
    ));
    if (!matching.length) return;

    function wledAlternateEffectIsValid(item) {
      return normalizeTriggerKey(item.trigger) === "player_turn_alternate" &&
        Array.isArray(item.presetTargets) &&
        item.presetTargets.length === 2;
    }

    let playerTurnSharedAltSlot = null;
    if (
      key === "player_turn" &&
      !args?.isBullOffPhase &&
      Number.isFinite(Number(args?.participantCount)) &&
      Number(args.participantCount) === 2 &&
      matching.some(wledAlternateEffectIsValid)
    ) {
      playerTurnSharedAltSlot = consumeWledPlayerTurnAlternateSlot(args?.matchId);
    }

    await Promise.allSettled(matching.map(async (item) => {
      try {
        const rule = normalizeTriggerKey(item.trigger);
        let targets = Array.isArray(item.presetTargets) ? item.presetTargets : [];
        let altSlot = null;
        if (rule === "player_turn_alternate") {
          if (key !== "player_turn") return;
          if (args?.isBullOffPhase) return;
          const pc = Number(args?.participantCount);
          if (!Number.isFinite(pc) || pc !== 2) return;
          if (targets.length !== 2) return;
          if (playerTurnSharedAltSlot === null) return;
          altSlot = playerTurnSharedAltSlot;
          targets = [targets[altSlot]];
        }
        await triggerTargets(targets, settings, item.advancedJson || "");
        const trigHuman = formatWledTriggerHuman(item.trigger);
        let filterNote =
          item.playerFilter && normalizeTriggerKey(item.trigger) === "player_turn"
            ? ` @${normalizePlayerFilterCompare(item.playerFilter)}`
            : "";
        if (rule === "player_turn_alternate" && altSlot != null) {
          filterNote = ` #${altSlot + 1}`;
        }
        AD_SB.triggerWorkerLog?.printAdmWledEffectLine?.({
          effectName: String(item.name || "").trim() || "WLED",
          triggerUnit: `${trigHuman}${filterNote}`.trim(),
          presetSummary: formatWledPresetSummary(targets)
        });
        AD_SB.logger?.info?.("wled", "preset triggered", {
          trigger: key,
          targets,
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
