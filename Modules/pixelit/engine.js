(function initPixelitEngine(scope) {
  const AD_SB = scope.AD_SB || (scope.AD_SB = {});

  let lastSendTs = 0;

  function normalizeEndpoint(raw) {
    let endpoint = String(raw || "").trim();
    if (!endpoint) return "";
    if (!/^https?:\/\//i.test(endpoint)) endpoint = `http://${endpoint}`;
    return endpoint.replace(/\/+$/, "");
  }

  function normalizeTriggerKey(value) {
    return AD_SB.admTriggerKeys.normalizeTriggerKey(value);
  }

  function triggerMatchesRule(ruleTrigger, emittedKey, payload = {}) {
    return AD_SB.admTriggerKeys.triggerMatchesRule(ruleTrigger, emittedKey, payload);
  }

  function normalizePlayerFilterCompare(value) {
    let v = String(value || "").trim().toLowerCase();
    try {
      v = v.normalize("NFKD").replace(/\p{M}/gu, "");
    } catch (_) {}
    return v.replace(/\s+/g, "");
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

  function pixelitPlayerFilterMatches(filter, args, triggerRule) {
    const f = normalizePlayerFilterCompare(filter);
    if (!f) return true;
    const tr = normalizeTriggerKey(triggerRule);
    if (tr !== "player_turn" && tr !== "player_turn_alternate") return true;
    const hay = collectPayloadPlayerHaystack(args);
    return !!hay && hay.includes(f);
  }

  function parsePixelitEffects(raw) {
    try {
      const arr = JSON.parse(String(raw || "[]"));
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          ...item,
          trigger: String(item?.trigger || "").trim(),
          textTemplate: String(item?.textTemplate ?? item?.text ?? "").trim(),
          playerFilter: String(item?.playerFilter || "").trim()
        }));
    } catch {
      return [];
    }
  }

  function applyTextTemplate(template, payload) {
    const tpl = String(template || "");
    const data = payload && typeof payload === "object" ? payload : {};
    const aliases = {
      rawTrigger: data._admRawTrigger,
      admRawTrigger: data._admRawTrigger
    };
    return tpl.replace(/\{([\w]+)\}/g, (_, key) => {
      if (Object.prototype.hasOwnProperty.call(aliases, key)) {
        const v = aliases[key];
        return v == null ? "" : String(v);
      }
      const v = data[key];
      if (v == null) return "";
      if (typeof v === "object") return "";
      return String(v);
    });
  }

  function clampScrollDelay(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 40;
    return Math.max(1, Math.min(9999, Math.trunc(x)));
  }

  function normalizeScrollText(raw) {
    if (raw === true || raw === false) return raw;
    const s = String(raw ?? "auto").trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "auto") return "auto";
    return "auto";
  }

  function buildScreenBody(rule, args) {
    const textStr = applyTextTemplate(rule.textTemplate, args).trim();
    if (!textStr) return null;

    let body = {};
    const extra = String(rule.extraScreenJson || "").trim();
    if (extra) {
      try {
        const parsed = JSON.parse(extra);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          body = { ...parsed };
        }
      } catch (_) {}
    }

    const pos = rule.position && typeof rule.position === "object" ? rule.position : { x: 8, y: 1 };
    const hex = String(rule.hexColor || "#FFFFFF").trim() || "#FFFFFF";

    body.text = {
      textString: textStr.slice(0, 120),
      bigFont: rule.bigFont === true,
      scrollText: normalizeScrollText(rule.scrollText),
      scrollTextDelay: clampScrollDelay(rule.scrollTextDelay),
      centerText: rule.centerText !== false,
      position: {
        x: Number.isFinite(Number(pos.x)) ? Math.trunc(Number(pos.x)) : 8,
        y: Number.isFinite(Number(pos.y)) ? Math.trunc(Number(pos.y)) : 1
      },
      hexColor: hex
    };

    const bri = Number(rule.brightness);
    if (Number.isFinite(bri)) {
      body.brightness = Math.max(0, Math.min(255, Math.trunc(bri)));
    }

    if (rule.switchAnimation && typeof rule.switchAnimation === "object") {
      body.switchAnimation = rule.switchAnimation;
    }

    if (rule.sleepMode === true || rule.sleepMode === false) {
      body.sleepMode = rule.sleepMode;
    }

    return body;
  }

  async function postScreen(rawEndpoint, body) {
    const base = normalizeEndpoint(rawEndpoint);
    if (!base) throw new Error("Missing PixelIt URL");
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid screen body");
    }
    const res = await fetch(`${base}/api/screen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  }

  async function fetchMatrixInfo(rawEndpoint) {
    const base = normalizeEndpoint(rawEndpoint);
    if (!base) throw new Error("Missing PixelIt URL");
    const res = await fetch(`${base}/api/matrixinfo`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function waitForMinInterval(settings) {
    const minMs = Math.max(0, Math.min(60000, Number(settings.pixelitMinIntervalMs) || 500));
    const now = Date.now();
    const wait = lastSendTs + minMs - now;
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  async function sendScreen(settings, body) {
    await waitForMinInterval(settings);
    const base = normalizeEndpoint(settings.pixelitBaseUrl);
    await postScreen(base, body);
    lastSendTs = Date.now();
  }

  async function handleActionTrigger(actionKey, args = {}) {
    const settings = AD_SB.getSettings?.() || {};
    if (!settings.pixelitEnabled) return;

    const key = normalizeTriggerKey(actionKey);
    if (!key) return;

    const base = normalizeEndpoint(settings.pixelitBaseUrl);
    if (!base) return;

    const effects = parsePixelitEffects(settings.pixelitEffectsJson);
    const matching = effects.filter((item) => (
      item.enabled !== false &&
      item.textTemplate &&
      normalizeTriggerKey(item.trigger) !== "chain_visit" &&
      triggerMatchesRule(item.trigger, key, args) &&
      pixelitPlayerFilterMatches(item.playerFilter, args, item.trigger)
    ));
    if (!matching.length) return;

    for (const item of matching) {
      try {
        const body = buildScreenBody(item, args);
        if (!body) continue;
        await sendScreen(settings, body);
        AD_SB.logger?.info?.("pixelit", "screen sent", {
          trigger: key,
          name: String(item.name || "").trim() || "PixelIt"
        });
      } catch (e) {
        AD_SB.logger?.error?.("errors", "pixelit screen failed", {
          trigger: key,
          error: String(e?.message || e)
        });
      }
    }
  }

  AD_SB.pixelit = {
    normalizeEndpoint,
    parsePixelitEffects,
    buildScreenBody,
    postScreen,
    fetchMatrixInfo,
    handleActionTrigger
  };
})(self);
