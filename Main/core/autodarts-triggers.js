(function initAutodartsTriggers(scope) {
  const AD_SB = scope.AD_SB || (scope.AD_SB = {});

  let lastCheckoutSignature = "";
  let lastStateProgressSignature = "";

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeTriggerKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function findNestedValueByKeys(root, keys, maxDepth = 4) {
    if (!root || typeof root !== "object") return null;
    const wanted = new Set((Array.isArray(keys) ? keys : [keys]).map((key) => String(key || "").toLowerCase()));
    const queue = [{ value: root, depth: 0 }];
    const seen = new Set();

    while (queue.length > 0) {
      const current = queue.shift();
      const value = current?.value;
      const depth = Number(current?.depth || 0);
      if (!value || typeof value !== "object" || depth > maxDepth) continue;
      if (seen.has(value)) continue;
      seen.add(value);

      for (const [key, child] of Object.entries(value)) {
        const normalizedKey = String(key || "").toLowerCase();
        if (wanted.has(normalizedKey) && child !== undefined && child !== null && child !== "") {
          return child;
        }
        if (child && typeof child === "object") {
          queue.push({ value: child, depth: depth + 1 });
        }
      }
    }
    return null;
  }

  function buildStateProgressSignature(stateLike) {
    const roots = [stateLike?.raw?.state, stateLike?.raw?.observed, stateLike?.raw, stateLike]
      .filter((value) => value && typeof value === "object");
    let turnScore = null;
    let dartsThrown = null;
    let turnsValue = null;

    for (const root of roots) {
      if (turnScore === null) {
        const rawTurnScore = findNestedValueByKeys(root, ["turnScore", "currentTurnScore"]);
        const parsedTurnScore = Number(rawTurnScore);
        if (Number.isFinite(parsedTurnScore)) turnScore = parsedTurnScore;
      }
      if (dartsThrown === null) {
        const rawDartsThrown = findNestedValueByKeys(root, ["dartsThrown", "dartCount", "throwCount"]);
        const parsedDartsThrown = Number(rawDartsThrown);
        if (Number.isFinite(parsedDartsThrown)) dartsThrown = parsedDartsThrown;
      }
      if (turnsValue === null) {
        const rawTurns = findNestedValueByKeys(root, ["turns", "history", "throws"]);
        if (Array.isArray(rawTurns)) turnsValue = rawTurns.length;
        else if (rawTurns && typeof rawTurns === "object") {
          try { turnsValue = JSON.stringify(rawTurns).slice(0, 600); } catch {}
        }
      }
      if (turnScore !== null && dartsThrown !== null && turnsValue !== null) break;
    }

    return JSON.stringify({
      matchId: stateLike?.matchId ?? null,
      set: stateLike?.set ?? null,
      leg: stateLike?.leg ?? null,
      round: stateLike?.round ?? null,
      player: stateLike?.player ?? null,
      playerScores: Array.isArray(stateLike?.playerScores) ? stateLike.playerScores : null,
      turnScore,
      dartsThrown,
      turnsValue,
      turnBusted: !!stateLike?.turnBusted,
      gameFinished: !!stateLike?.gameFinished,
      winner: stateLike?.winner ?? null
    });
  }

  function buildCheckoutSignature(payload) {
    if (!payload || typeof payload !== "object") return "";
    return JSON.stringify({
      matchId: payload.matchId ?? null,
      set: payload.set ?? null,
      leg: payload.leg ?? null,
      player: payload.player ?? null,
      remaining: Number.isFinite(payload.remaining) ? payload.remaining : null,
      checkoutGuide: normalizeText(payload.checkoutGuide ?? ""),
      recommendedThrow: payload.recommendedThrow ?? "",
      recommendedThrowIndex: Number.isFinite(payload.recommendedThrowIndex) ? payload.recommendedThrowIndex : 0,
      recommendedSegments: Array.isArray(payload.recommendedSegments) ? payload.recommendedSegments : []
    });
  }

  function normalizeRecommendedSegment(value) {
    const raw = normalizeText(value).toUpperCase();
    if (!raw) return "";
    if (raw === "25" || raw === "SBULL" || raw === "OUTER_BULL" || raw === "S-BULL" || raw === "BULL") return "BULL";
    if (raw === "50" || raw === "DBULL" || raw === "INNER_BULL" || raw === "D-BULL") return "DBULL";
    const compact = raw.replace(/\s+/g, "");
    const match = compact.match(/^([SDT])(\d{1,2})$/);
    if (!match) return "";
    const number = Number(match[2]);
    if (!Number.isFinite(number) || number < 1 || number > 20) return "";
    return `${match[1]}${number}`;
  }

  function extractRecommendedSegments(checkoutGuide) {
    if (!checkoutGuide) return [];
    if (typeof checkoutGuide === "string") {
      return checkoutGuide
        .split(/[^A-Za-z0-9]+/)
        .map((item) => normalizeRecommendedSegment(item))
        .filter(Boolean)
        .slice(0, 3);
    }
    if (Array.isArray(checkoutGuide)) {
      return checkoutGuide
        .map((item) => {
          if (typeof item === "string") return normalizeRecommendedSegment(item);
          if (item && typeof item === "object") {
            return normalizeRecommendedSegment(
              item.segment ??
              item.target ??
              item.throw ??
              item.value ??
              item.suggestion ??
              item.name
            );
          }
          return "";
        })
        .filter(Boolean)
        .slice(0, 3);
    }
    if (checkoutGuide && typeof checkoutGuide === "object") {
      const direct = normalizeRecommendedSegment(
        checkoutGuide.segment ??
        checkoutGuide.target ??
        checkoutGuide.throw ??
        checkoutGuide.value ??
        checkoutGuide.suggestion ??
        checkoutGuide.name
      );
      if (direct) return [direct];
      for (const key of ["path", "throws", "targets", "segments", "recommendation"]) {
        const nested = extractRecommendedSegments(checkoutGuide?.[key]);
        if (nested.length) return nested;
      }
    }
    return [];
  }

  function getThrowTriggerNameFromSegment(segment) {
    const segUpper = String(segment || "").trim().toUpperCase();
    if (!segUpper) return "";
    if (segUpper === "BULL") return "bull";
    if (segUpper === "DBULL") return "dbull";
    const segMatch = segUpper.match(/^([SDT])(\d{1,2})$/);
    if (!segMatch) return "";
    return `${segMatch[1].toLowerCase()}${Number(segMatch[2])}`;
  }

  function getPlayerScoreFromState(stateLike, idx) {
    const directRemaining = Number(stateLike?.remainingScore);
    if (Number.isFinite(directRemaining)) return directRemaining;
    const index = Number(idx);
    const scores = Array.isArray(stateLike?.playerScores) ? stateLike.playerScores : null;
    if (!scores || !Number.isInteger(index) || index < 0 || index >= scores.length) return null;
    const raw = scores[index];
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function getDartsThrownFromState(stateLike) {
    const roots = [stateLike?.raw?.state, stateLike?.raw?.observed, stateLike?.raw, stateLike]
      .filter((value) => value && typeof value === "object");
    for (const root of roots) {
      const raw = findNestedValueByKeys(root, ["dartsThrown", "dartCount", "throwCount"]);
      const value = Number(raw);
      if (Number.isFinite(value)) return Math.max(0, Math.min(2, Math.trunc(value)));
    }
    return 0;
  }

  function readPlayerNameByIndex(stateLike, idx) {
    const index = Number(idx);
    if (!Number.isInteger(index) || index < 0) return "";
    const roots = [stateLike?.raw?.state, stateLike?.raw?.observed, stateLike?.raw, stateLike].filter((x) => x && typeof x === "object");
    for (const root of roots) {
      const collections = [
        Array.isArray(root?.players) ? root.players : null,
        Array.isArray(root?.participants) ? root.participants : null,
        Array.isArray(root?.competitors) ? root.competitors : null
      ].filter(Array.isArray);
      for (const players of collections) {
        const player = players[index];
        if (!player || typeof player !== "object") continue;
        const name = String(
          player.name ??
          player.displayName ??
          player.nickname ??
          player.username ??
          player.playerName ??
          player?.user?.name ??
          ""
        ).trim();
        if (name) return name;
      }
    }
    return "";
  }

  function dispatchExternal(triggerKey, payload) {
    const key = normalizeTriggerKey(triggerKey);
    if (!key) return;
    try { AD_SB.wled?.handleActionTrigger?.(key, payload); } catch {}
    try { AD_SB.obsZoom?.handleActionTrigger?.(key, payload); } catch {}
  }

  function dispatchCheckoutTrigger(key, payload) {
    dispatchExternal(key, payload);
    try {
      const settings = AD_SB.getSettings?.() || {};
      if (settings.debugAllLogs) {
        console.log("[Autodarts Modules] checkout trigger", {
          trigger: key,
          remaining: payload?.remaining ?? null,
          threshold: payload?.checkoutThreshold ?? null,
          recommendedSegments: payload?.recommendedSegments ?? [],
          recommendedThrow: payload?.recommendedThrow ?? "",
          recommendedThrowIndex: payload?.recommendedThrowIndex ?? 0,
          checkoutGuide: payload?.checkoutGuide ?? null
        });
      }
    } catch {}
    try {
      AD_SB.logger?.info?.("actions", "checkout trigger fired", {
        trigger: key,
        remaining: payload?.remaining ?? null,
        threshold: payload?.checkoutThreshold ?? null,
        recommendedSegments: payload?.recommendedSegments ?? [],
        recommendedThrow: payload?.recommendedThrow ?? "",
        recommendedThrowIndex: payload?.recommendedThrowIndex ?? 0,
        matchId: payload?.matchId ?? null,
        player: payload?.player ?? null
      });
    } catch {}
    try {
      AD_SB.fireActionByKey?.(key, { ...payload, __skipExternalModules: true });
    } catch {}
  }

  function buildCheckoutPayload(stateLike) {
    const checkoutGuide = stateLike?.checkoutGuide ?? null;
    const segments = extractRecommendedSegments(checkoutGuide);
    if (!segments.length) {
      try {
        AD_SB.logger?.info?.("state", "checkout skipped: no segments", {
          checkoutGuide: checkoutGuide ?? null,
          matchId: stateLike?.matchId ?? null,
          player: stateLike?.player ?? null
        });
      } catch {}
      return null;
    }

    const settings = AD_SB.getSettings?.() || {};
    const playerIndex = Number(stateLike?.player);
    let remaining = getPlayerScoreFromState(stateLike, playerIndex);
    const threshold = Math.max(2, Math.min(170, Number(settings?.checkoutTriggerThreshold) || 170));
    if (!Number.isFinite(remaining) || remaining > threshold) {
      try {
        AD_SB.logger?.info?.("state", "checkout skipped: threshold", {
          checkoutGuide: checkoutGuide ?? null,
          remaining: Number.isFinite(remaining) ? remaining : null,
          threshold,
          matchId: stateLike?.matchId ?? null,
          player: stateLike?.player ?? null
        });
      } catch {}
      return null;
    }

    const dartsThrown = getDartsThrownFromState(stateLike);
    const segmentIndex = Math.max(0, Math.min(segments.length - 1, dartsThrown));
    const activeSegment = segments[segmentIndex] || segments[0] || "";
    const payload = {
      effect: "checkout",
      player: Number.isInteger(playerIndex) ? playerIndex : null,
      playerIndex: Number.isInteger(playerIndex) ? playerIndex : null,
      playerName: readPlayerNameByIndex(stateLike, playerIndex) || (Number.isInteger(playerIndex) ? `Player ${playerIndex + 1}` : ""),
      matchId: stateLike?.matchId ?? null,
      set: stateLike?.set ?? null,
      leg: stateLike?.leg ?? null,
      round: stateLike?.round ?? null,
      remaining,
      checkoutThreshold: threshold,
      checkoutGuide,
      dartsThrown,
      recommendedSegments: segments,
      recommendedThrowIndex: segmentIndex,
      recommendedSegment: activeSegment,
      recommendedThrow: getThrowTriggerNameFromSegment(activeSegment),
      state: stateLike
    };
    try {
      const settings = AD_SB.getSettings?.() || {};
      if (settings.debugAllLogs) {
        console.log("[Autodarts Modules] checkout payload built", {
          checkoutGuide: payload.checkoutGuide,
          remaining: payload.remaining,
          threshold: payload.checkoutThreshold,
          dartsThrown: payload.dartsThrown,
          recommendedSegments: payload.recommendedSegments,
          recommendedThrowIndex: payload.recommendedThrowIndex,
          recommendedThrow: payload.recommendedThrow,
          matchId: payload.matchId,
          player: payload.player
        });
      }
    } catch {}
    try {
      AD_SB.logger?.info?.("state", "checkout payload built", {
        checkoutGuide: payload.checkoutGuide,
        remaining: payload.remaining,
        threshold: payload.checkoutThreshold,
        dartsThrown: payload.dartsThrown,
        recommendedSegments: payload.recommendedSegments,
        recommendedThrowIndex: payload.recommendedThrowIndex,
        recommendedThrow: payload.recommendedThrow,
        matchId: payload.matchId,
        player: payload.player
      });
    } catch {}
    return payload;
  }

  function handleState(stateLike) {
    const progressSignature = buildStateProgressSignature(stateLike);
    if (progressSignature === lastStateProgressSignature) return;
    lastStateProgressSignature = progressSignature;

    const payload = buildCheckoutPayload(stateLike);
    if (!payload) return;
    const signature = buildCheckoutSignature(payload);
    if (signature === lastCheckoutSignature) {
      try {
        const settings = AD_SB.getSettings?.() || {};
        if (settings.debugAllLogs) {
          console.log("[Autodarts Modules] checkout skipped: duplicate", {
            matchId: payload.matchId ?? null,
            player: payload.player ?? null,
            remaining: payload.remaining ?? null,
            dartsThrown: payload.dartsThrown ?? 0,
            recommendedThrowIndex: payload.recommendedThrowIndex ?? 0,
            recommendedThrow: payload.recommendedThrow ?? "",
            checkoutGuide: payload.checkoutGuide ?? null
          });
        }
      } catch {}
      return;
    }
    lastCheckoutSignature = signature;

    dispatchCheckoutTrigger("checkout", payload);
    if (payload.recommendedThrow) {
      dispatchCheckoutTrigger(`checkout_${payload.recommendedThrow}`, payload);
    }
  }

  AD_SB.autodartsTriggers = {
    handleState
  };
})(self);
