/**
 * Zentrale AD-Trigger-Engine
 * Verantwortung:
 * - verarbeitet Bridge-Events aus Autodarts zentral im Main/bridge Layer
 * - leitet abgeleitete Trigger an Effects, WLED, OBS Zoom und weitere Consumer weiter
 * - verwaltet Visit-, State-, Checkout- und UI-Trigger an einer Stelle
 */
(function initAutodartsTriggers(scope) {
  const AD_SB = scope.AD_SB || (scope.AD_SB = {});

  let lastThrowSig = null;
  let lastThrowSigAt = 0;
  let lastCheckoutSignature = "";
  let lastStateProgressSignature = "";

  let lastState = null;
  let lastKnownActivePlayer = null;
  let lastGameEventSig = null;
  let lastGameEventAt = 0;
  let lastThrowEvent = null;

  let visitDarts = [];
  let visitThrows = [];
  let visitWaschmaschineFired = false;
  let visitTimer = null;

  const WASHMACHINE_NUMBERS = [20, 1, 5];
  const SPECIAL_TRIPLES = new Set(["T20", "T19", "T18", "T17"]);

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

  function getCustomEffects() {
    try {
      const arr = JSON.parse(String(getSettings()?.customEffectsJson || "[]"));
      if (!Array.isArray(arr)) return [];
      return arr.filter((item) => item && typeof item === "object");
    } catch {
      return [];
    }
  }

  function fireCustomEffects(triggerKey, payload = {}) {
    if (!isModuleActive("effects")) return;
    const key = normalizeTriggerKey(triggerKey);
    if (!key) return;
    for (const item of getCustomEffects()) {
      if (item.enabled === false) continue;
      if (!triggerMatchesRule(item.trigger, key, payload)) continue;
      const actionKey = String(item.key || "").trim();
      if (!actionKey) continue;
      AD_SB.fireActionByKey(actionKey, {
        ...payload,
        effect: "custom_effect",
        customEffectId: String(item.id || ""),
        customEffectName: String(item.name || ""),
        customTrigger: key
      });
    }
  }

  function dispatchTrigger(triggerKey, payload = {}) {
    const key = normalizeTriggerKey(triggerKey);
    if (!key) return;
    const effectsActive = isModuleActive("effects");
    if (effectsActive) fireCustomEffects(key, payload);
    if (effectsActive && getSettings().actions?.[key]) {
      AD_SB.fireActionByKey(key, { ...payload, __skipExternalModules: true });
    }
    dispatchExternalTrigger(key, payload);
  }

  function dispatchExternalTrigger(triggerKey, payload = {}) {
    const key = normalizeTriggerKey(triggerKey);
    if (!key) return;
    AD_SB.wled?.handleActionTrigger?.(key, payload);
    AD_SB.obsZoom?.handleActionTrigger?.(key, payload);
  }

  function dispatchTriggerAliases(triggerKeys, payload = {}) {
    const seen = new Set();
    for (const key of Array.isArray(triggerKeys) ? triggerKeys : [triggerKeys]) {
      const normalized = normalizeTriggerKey(key);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      dispatchTrigger(normalized, payload);
    }
  }

  function normalizePlayerTriggerName(name) {
    const raw = String(name || "").trim().toLowerCase();
    if (!raw) return "";
    return raw.replace(/\s+/g, "_");
  }

  function dispatchPlayerNamedTriggers(prefix, playerName, payload = {}) {
    const exact = String(playerName || "").trim().toLowerCase();
    const normalized = normalizePlayerTriggerName(playerName);
    if (prefix) {
      if (exact) dispatchTrigger(`${prefix}_${exact}`, payload);
      if (normalized && normalized !== exact) dispatchTrigger(`${prefix}_${normalized}`, payload);
      return;
    }
    if (exact) dispatchTrigger(exact, payload);
    if (normalized && normalized !== exact) dispatchTrigger(normalized, payload);
  }

  function dispatchPlayerIndexTriggers(playerIndex, payload = {}) {
    const idx = Number(playerIndex);
    if (!Number.isInteger(idx) || idx < 0) return;
    const number = idx + 1;
    dispatchTriggerAliases([`player_${number}`, `spieler_${number}`], payload);
  }

  function getThrowTriggerName(t) {
    const segUpper = String(t?.segment || "").trim().toUpperCase();
    if (segUpper === "BULL" || segUpper === "DBULL") return segUpper.toLowerCase();
    const mult = Number(t?.multiplier);
    const num = Number(t?.number);
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


  function getEventPlayerName(e) {
    const body = e?.raw?.data?.body && typeof e.raw.data.body === "object"
      ? e.raw.data.body
      : (e?.raw?.body && typeof e.raw.body === "object" ? e.raw.body : e?.raw);
    const rawName =
      body?.playerName ??
      body?.name ??
      body?.displayName ??
      body?.winnerName ??
      body?.player?.name ??
      body?.winner?.name ??
      body?.user?.name ??
      body?.username ??
      e?.winnerName ??
      e?.playerName ??
      "";
    return String(rawName || "").trim();
  }

  function getEventThrowTriggerName(e) {
    return getThrowTriggerName(
      e?.raw?.data?.body?.dart ??
      e?.raw?.body?.dart ??
      e?.raw?.data?.body ??
      e?.raw?.body ??
      e?.raw ??
      e
    );
  }

  function getEventTriggerKeys(e) {
    const rawName = String(e?.event || "").trim();
    const lower = rawName.toLowerCase();
    if (!lower) return [];

    const compact = lower.replace(/[\s-]+/g, "_");
    const keys = new Set([lower, compact]);
    const compactNoUnderscore = compact.replace(/_/g, "");

    if (compact === "bust") keys.add("busted");
    if (compact === "winner") keys.add("gameshot");
    if (compact === "game_shot") keys.add("gameshot");
    if (compact === "match_shot") keys.add("matchshot");
    if (compact === "takeoutfinish" || compact === "takeout_finish") keys.add("takeout_finished");
    if (["leg_won", "leg_finished", "leg_finish", "leg_end"].includes(compact)) keys.add("gameshot");
    if (["match_won", "match_finished", "match_finish", "match_end"].includes(compact)) keys.add("matchshot");
    if (["checkout", "check_out", "finish", "takeout"].includes(compact)) keys.add("takeout");
    if (["checkout_finished", "checkout_finish", "finish_finished", "finish_done"].includes(compact)) {
      keys.add("takeout_finished");
    }
    if (["player_change", "player_changed", "turn_start", "turn_started", "game_on"].includes(compact)) {
      keys.add("gameon");
    }
    if (compactNoUnderscore === "boardstarting") keys.add("board_starting");
    if (compactNoUnderscore === "boardstarted") keys.add("board_started");
    if (compactNoUnderscore === "boardstopping") keys.add("board_stopping");
    if (compactNoUnderscore === "boardstopped") keys.add("board_stopped");
    if (compactNoUnderscore === "calibrationstarted") keys.add("calibration_started");
    if (compactNoUnderscore === "calibrationfinished") keys.add("calibration_finished");
    if (compactNoUnderscore === "manualresetdone") keys.add("manual_reset_done");
    if (compactNoUnderscore === "lobbyin") keys.add("lobby_in");
    if (compactNoUnderscore === "lobbyout") keys.add("lobby_out");
    if (compactNoUnderscore === "tournamentready") keys.add("tournament_ready");
    return Array.from(keys);
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
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

  function buildCheckoutPayload(stateLike) {
    const checkoutGuide = stateLike?.checkoutGuide ?? null;
    const segments = extractRecommendedSegments(checkoutGuide);
    if (!segments.length) return null;

    const settings = AD_SB.getSettings?.() || {};
    const playerIndex = Number(stateLike?.player);
    const remaining = getPlayerScoreFromState(stateLike, playerIndex);
    const threshold = Math.max(2, Math.min(170, Number(settings?.checkoutTriggerThreshold) || 170));
    if (!Number.isFinite(remaining) || remaining > threshold) return null;

    const dartsThrown = getDartsThrownFromState(stateLike);
    const segmentIndex = Math.max(0, Math.min(segments.length - 1, dartsThrown));
    const activeSegment = segments[segmentIndex] || segments[0] || "";

    return {
      effect: "checkout",
      player: Number.isInteger(playerIndex) ? playerIndex : null,
      playerIndex: Number.isInteger(playerIndex) ? playerIndex : null,
      playerName: getPlayerNameByIndex(stateLike, playerIndex, Number.isInteger(playerIndex) ? `Player ${playerIndex + 1}` : ""),
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
  }

  function getSettings() {
    return AD_SB.getSettings();
  }

  function isModuleActive(moduleId) {
    const settings = getSettings();
    const installed = Array.isArray(settings?.installedModules) ? settings.installedModules : [];
    return installed.map((item) => String(item || "").trim().toLowerCase()).includes(String(moduleId || "").trim().toLowerCase());
  }

  function hasAnyTriggerConsumer() {
    return isModuleActive("effects") || isModuleActive("wled") || isModuleActive("obszoom");
  }

  function isDuplicateThrow(t) {
    // Bridge events sometimes arrive twice with slightly different raw coordinates.
    // We dedupe on stable throw identity instead of x/y so special triples only fire once.
    const sig = JSON.stringify({
      player: Number.isFinite(Number(t?.player)) ? Number(t.player) : String(t?.player ?? ""),
      playerName: String(t?.playerName || "").trim().toLowerCase(),
      segment: String(t?.segment || "").trim().toUpperCase(),
      score: Number(t?.score),
      multiplier: Number.isFinite(Number(t?.multiplier)) ? Number(t.multiplier) : null,
      number: Number.isFinite(Number(t?.number)) ? Number(t.number) : null,
      matchId: String(lastState?.matchId || t?.matchId || ""),
      leg: Number.isFinite(Number(lastState?.leg)) ? Number(lastState.leg) : null,
      round: Number.isFinite(Number(lastState?.round)) ? Number(lastState.round) : null
    });
    const now = Date.now();
    if (sig === lastThrowSig && now - lastThrowSigAt < 600) return true;
    lastThrowSig = sig;
    lastThrowSigAt = now;
    return false;
  }

  function resetVisit() {
    visitDarts = [];
    visitThrows = [];
    visitWaschmaschineFired = false;
    if (visitTimer) clearTimeout(visitTimer);
    visitTimer = null;
  }

  function armVisitTimeout() {
    if (visitTimer) clearTimeout(visitTimer);
    visitTimer = setTimeout(() => resetVisit(), 5000);
  }

  function isMyTurn() {
    const settings = getSettings();
    if (!settings.onlyMyThrows) return true;
    if (!lastState) return true;
    return Number(lastState.player) === Number(settings.myPlayerIndex);
  }

  function getNumberOrNull(v) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v.trim());
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function getFromObjScore(obj) {
    if (!obj || typeof obj !== "object") return null;
    return getNumberOrNull(obj.remaining)
      ?? getNumberOrNull(obj.score)
      ?? getNumberOrNull(obj.points)
      ?? getNumberOrNull(obj.left)
      ?? getNumberOrNull(obj.rest);
  }

  function getFromObjScoreDeep(obj, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 6) return null;

    const direct = getFromObjScore(obj);
    if (direct !== null) return direct;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        const v = getFromObjScoreDeep(item, depth + 1);
        if (v !== null) return v;
      }
      return null;
    }

    for (const [k, v] of Object.entries(obj)) {
      if ([
        "remaining",
        "score",
        "points",
        "left",
        "rest",
        "gameScore",
        "currentScore"
      ].includes(k)) {
        const n = getNumberOrNull(v);
        if (n !== null) return n;
      }
      if (v && typeof v === "object") {
        const nested = getFromObjScoreDeep(v, depth + 1);
        if (nested !== null) return nested;
      }
    }
    return null;
  }

  function getPlayerScoreFromState(s, playerIndex) {
    const idx = Number(playerIndex);
    if (!Number.isFinite(idx) || idx < 0) return null;

    if (Array.isArray(s?.playerScores)) {
      const direct = getNumberOrNull(s.playerScores[idx]);
      if (direct !== null) return direct;
    }

    const raw = s?.raw;
    const roots = [raw?.state, raw];
    for (const root of roots) {
      if (!root || typeof root !== "object") continue;

      const players = root.players;
      if (Array.isArray(players)) {
        const val = players[idx];
        if (typeof val === "number" && Number.isFinite(val)) return val;
        const objScore = getFromObjScoreDeep(val);
        if (objScore !== null) return objScore;
      }

      const scores = root.scores;
      if (Array.isArray(scores)) {
        const val = getNumberOrNull(scores[idx]);
        if (val !== null) return val;
      }

      const playerScores = root.playerScores;
      if (Array.isArray(playerScores)) {
        const val = getNumberOrNull(playerScores[idx]);
        if (val !== null) return val;
      }
    }

    return null;
  }

  function getCurrentRemaining() {
    if (!lastState) return null;
    return getPlayerScoreFromState(lastState, Number(lastState.player));
  }

  function isDoubleOutGuardRange(rem) {
    const settings = getSettings();
    const threshold = Math.max(2, Number(settings.missGuardThreshold) || 40);
    return Number.isFinite(rem) && rem <= threshold && rem >= 2;
  }

  function computeVisitSumAfterAdding(score) {
    const safeScore = Number(score);
    if (!Number.isFinite(safeScore)) return null;
    const temp = visitDarts.concat([safeScore]);
    if (temp.length !== 3) return null;
    return temp.reduce((a, b) => a + Number(b || 0), 0);
  }

  function fireHighscoreIfAny(sum, reason = "third-dart") {
    const settings = getSettings();
    const visitSum = Number(sum);
    if (!Number.isFinite(visitSum)) return false;

    if (visitSum === 180) {
      const payload = { effect: "visit", sum: visitSum, darts: visitDarts.slice(), reason, state: lastState };
      fireCustomEffects("oneeighty", payload);
      if (settings.enable180) AD_SB.fireActionByKey("oneeighty", payload);
      return true;
    }
    if (visitSum >= 140 && visitSum < 180) {
      const payload = { effect: "visit", sum: visitSum, darts: visitDarts.slice(), reason, state: lastState };
      fireCustomEffects("high140", payload);
      if (settings.enableHigh140) AD_SB.fireActionByKey("high140", payload);
      return true;
    }
    if (visitSum >= 100 && visitSum < 140) {
      const payload = { effect: "visit", sum: visitSum, darts: visitDarts.slice(), reason, state: lastState };
      fireCustomEffects("high100", payload);
      if (settings.enableHigh100) AD_SB.fireActionByKey("high100", payload);
      return true;
    }
    return false;
  }

  function extractWaschmaschineSingleNumber(d) {
    const seg = String(d?.segment || "").toUpperCase().trim();
    const mult = Number(d?.multiplier);
    const numDirect = Number(d?.number);

    // Explicit non-single multipliers are not allowed for Waschmaschine.
    if (Number.isFinite(mult) && mult !== 1) return null;
    if (seg.startsWith("T") || seg.startsWith("D")) return null;

    if (Number.isFinite(numDirect)) {
      return numDirect;
    }

    const m = seg.match(/(\d{1,2})/);
    if (!m) return null;
    const parsed = Number(m[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function hasWaschmaschineVisit() {
    const nums = new Set(
      visitThrows
        .map((d) => extractWaschmaschineSingleNumber(d))
        .filter((n) => Number.isFinite(n))
    );
    return WASHMACHINE_NUMBERS.every((n) => nums.has(n));
  }

  function maybeFireWaschmaschine() {
    const settings = getSettings();
    if (!settings.enableWaschmaschine) return false;
    if (visitWaschmaschineFired) return false;
    if (!hasWaschmaschineVisit()) return false;

    visitWaschmaschineFired = true;
    fireCustomEffects("waschmaschine", {
      effect: "visit_waschmaschine",
      combo: WASHMACHINE_NUMBERS.slice(),
      darts: visitThrows.slice(),
      state: lastState
    });
    AD_SB.fireActionByKey("waschmaschine", {
      effect: "visit_waschmaschine",
      combo: WASHMACHINE_NUMBERS.slice(),
      darts: visitThrows.slice(),
      state: lastState
    });
    return true;
  }

  function segmentToKey(segUpper) {
    return segUpper ? segUpper.toLowerCase() : "";
  }

  function isDuplicateGameEvent(e) {
    const name = String(e?.event || "unknown").toLowerCase();
    const sig = [
      name,
      e?.matchId ?? lastState?.matchId ?? "m?",
      e?.set ?? lastState?.set ?? "s?",
      e?.leg ?? lastState?.leg ?? "l?",
      e?.player ?? lastState?.player ?? "p?"
    ].join("|");
    const now = Date.now();
    if (sig === lastGameEventSig && (now - lastGameEventAt) < 180) return true;
    lastGameEventSig = sig;
    lastGameEventAt = now;
    return false;
  }

  function hasSpecificTripleAction(segUpper) {
    const key = segmentToKey(segUpper);
    return !!getSettings().actions?.[key];
  }

  function asValidPlayerIndex(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (!Number.isInteger(n)) return null;
    if (n < 0 || n > 15) return null;
    return n;
  }

  function readPlayerName(playerObj, fallback = "") {
    if (!playerObj || typeof playerObj !== "object") return fallback;
    const cand =
      playerObj.name ??
      playerObj.displayName ??
      playerObj.nickname ??
      playerObj.username ??
      playerObj.userName ??
      playerObj.playerName ??
      playerObj?.player?.name ??
      playerObj?.user?.name ??
      "";
    const out = String(cand || "").trim();
    return out || fallback;
  }

  function getPlayerNameByIndex(stateLike, idx, fallback = "") {
    const i = Number(idx);
    if (!Number.isFinite(i) || i < 0) return fallback;
    const roots = [stateLike?.raw?.state, stateLike?.raw, stateLike].filter((x) => x && typeof x === "object");
    for (const root of roots) {
      const players = Array.isArray(root?.players) ? root.players : null;
      if (!players || !players[i]) continue;
      const name = readPlayerName(players[i], "");
      if (name) return name;
    }
    return fallback;
  }

  function resolveActivePlayerFromState(s) {
    const direct = asValidPlayerIndex(s?.player);
    if (direct !== null) return direct;

    const raw = s?.raw;
    const roots = [raw?.state, raw].filter((x) => x && typeof x === "object");
    for (const root of roots) {
      const cand = [
        root?.playerIndex,
        root?.currentPlayerIndex,
        root?.activePlayerIndex,
        root?.player
      ];
      for (const c of cand) {
        const idx = asValidPlayerIndex(c);
        if (idx !== null) return idx;
      }
    }
    return null;
  }

  // Haupteinstieg für Dart-Würfe
  function handleThrow(t) {
    if (isDuplicateThrow(t)) return;
    AD_SB.overlay.handleThrow(t, lastState);
    lastThrowEvent = t;
    if (!hasAnyTriggerConsumer()) return;

    const settings = getSettings();
    const effectsActive = isModuleActive("effects");
    if (!isMyTurn()) return;
    const throwScore = Number(t.score);
    if (!Number.isFinite(throwScore)) return;

    const segUpper = String(t.segment ?? "").toUpperCase();
    const potentialSum = computeVisitSumAfterAdding(throwScore);
    const throwTriggerName = getThrowTriggerName(t);

    dispatchTrigger("throw", { ...t, effect: "throw" });
    if (throwTriggerName) dispatchTrigger(throwTriggerName, { ...t, effect: "throw_named" });
    if (String(t?.playerName || "").trim()) {
      dispatchPlayerNamedTriggers("", String(t.playerName || ""), { ...t, effect: "player_throw" });
      if (/\b(bot|cpu)\b/i.test(String(t.playerName || ""))) {
        dispatchTrigger("bot_throw", { ...t, effect: "bot_throw" });
      }
    }
    if (!throwTriggerName && throwScore === 0) {
      dispatchTrigger("outside", { ...t, effect: "outside" });
    }

    if (potentialSum !== null) {
      visitDarts.push(throwScore);
      visitThrows.push(t);
      dispatchTrigger("last_throw", {
        ...t,
        effect: "last_throw",
        visitSum: potentialSum,
        darts: visitThrows.slice()
      });

      const comboKey = visitThrows
        .map((dart) => getThrowTriggerName(dart))
        .filter(Boolean)
        .join("_");
      if (comboKey && visitThrows.length === 3) {
        dispatchTrigger(comboKey, {
          effect: "visit_combo",
          combo: comboKey,
          darts: visitThrows.slice(),
          sum: potentialSum,
          state: lastState
        });
      }

      dispatchTrigger(String(potentialSum), {
        effect: "visit_total",
        sum: potentialSum,
        darts: visitThrows.slice(),
        state: lastState
      });
      dispatchTrigger(`range_${potentialSum}_${potentialSum}`, {
        effect: "visit_total_range_single",
        sum: potentialSum,
        darts: visitThrows.slice(),
        state: lastState
      });

      const didFireHigh = fireHighscoreIfAny(potentialSum, "third-dart");
      if (effectsActive && settings.enableNoScore && potentialSum === 0) {
        AD_SB.fireActionByKey("noScore", {
          effect: "visit_no_score",
          sum: potentialSum,
          darts: visitThrows.slice(),
          state: lastState
        });
      }
      if (potentialSum === 0) {
        fireCustomEffects("noScore", {
          effect: "visit_no_score",
          sum: potentialSum,
          darts: visitThrows.slice(),
          state: lastState
        });
        dispatchExternalTrigger("noScore", {
          effect: "visit_no_score",
          sum: potentialSum,
          darts: visitThrows.slice(),
          state: lastState
        });
      }
      maybeFireWaschmaschine();
      resetVisit();

      if (didFireHigh) {
        return;
      }
    } else {
      if (visitDarts.length === 0) armVisitTimeout();
      visitDarts.push(throwScore);
      visitThrows.push(t);
      maybeFireWaschmaschine();
      armVisitTimeout();

      if (visitDarts.length > 3) resetVisit();
    }

    const remaining = getCurrentRemaining();
    const inDoubleOutRange = isDoubleOutGuardRange(remaining);
    if (t.score === 0 && inDoubleOutRange) {
      fireCustomEffects("specialMiss", { ...t, effect: "special_miss", remaining });
      dispatchExternalTrigger("specialMiss", { ...t, effect: "special_miss", remaining });
      if (effectsActive && settings.enableSpecialMiss) {
        AD_SB.fireActionByKey("specialMiss", { ...t, effect: "special_miss", remaining });
      }
    }
    if (t.score === 0 && !(settings.missGuardOnDoubleOut && inDoubleOutRange)) {
      fireCustomEffects("miss", t);
      dispatchExternalTrigger("miss", t);
    }
    if (effectsActive && settings.enableMiss && t.score === 0 && !(settings.missGuardOnDoubleOut && inDoubleOutRange)) {
      AD_SB.fireActionByKey("miss", t);
    }
    if (t.score === 25) {
      fireCustomEffects("bull", t);
      dispatchExternalTrigger("bull", t);
    }
    if (effectsActive && settings.enableBull && t.score === 25) AD_SB.fireActionByKey("bull", t);
    if (t.score === 50) {
      fireCustomEffects("dbull", t);
      dispatchExternalTrigger("dbull", t);
    }
    if (effectsActive && settings.enableDBull && t.score === 50) AD_SB.fireActionByKey("dbull", t);

    const isDoubleBull = t.score === 50
      || (t.multiplier === 2 && Number(t.number) === 25)
      || String(t.segment || "").toUpperCase() === "DBULL";
    if (effectsActive && settings.enableDouble && t.multiplier === 2 && t.score > 0 && !isDoubleBull) {
      AD_SB.fireActionByKey("dbl", t);
    }
    if (t.multiplier === 2 && t.score > 0 && !isDoubleBull) {
      fireCustomEffects("dbl", t);
      dispatchExternalTrigger("dbl", t);
    }

    if (t.multiplier === 3) {
      const isSpecial = SPECIAL_TRIPLES.has(segUpper) && hasSpecificTripleAction(segUpper);
      if (isSpecial) {
        const k = segmentToKey(segUpper);
        const toggleId = "enable" + segUpper;
        const alreadyDispatchedNamedThrow = k === throwTriggerName;
        if (!alreadyDispatchedNamedThrow) {
          fireCustomEffects(k, t);
          dispatchExternalTrigger(k, t);
          if (effectsActive && settings[toggleId] !== false) {
            AD_SB.fireActionByKey(k, t);
          }
        }
      } else {
        fireCustomEffects("tpl", t);
        dispatchExternalTrigger("tpl", t);
        if (effectsActive && settings.enableTriple) {
          AD_SB.fireActionByKey("tpl", t);
        }
      }
    }
  }

  // Game-Events
  function handleGameEvent(e) {
    if (isDuplicateGameEvent(e)) return;
    AD_SB.overlay.handleGameEvent(e, lastState);
    if (!hasAnyTriggerConsumer()) return;
    const settings = getSettings();

    const payload = { ...e, effect: "game_event", state: lastState };
    const eventKeys = getEventTriggerKeys(e);
    if (eventKeys.length) dispatchTriggerAliases(eventKeys, payload);

    const playerName = getEventPlayerName(e);
    if (playerName) {
      if (eventKeys.includes("gameshot")) dispatchPlayerNamedTriggers("gameshot", playerName, payload);
      if (eventKeys.includes("matchshot")) dispatchPlayerNamedTriggers("matchshot", playerName, payload);
    }

    const throwName = getEventThrowTriggerName(e);
    if (throwName) {
      if (eventKeys.includes("gameshot")) dispatchTrigger(`gameshot+${throwName}`, { ...payload, throwName });
      if (eventKeys.includes("matchshot")) dispatchTrigger(`matchshot+${throwName}`, { ...payload, throwName });
    }
  }

  // State-Updates (Bust/Winner)
  function handleState(s) {
    const progressSignature = buildStateProgressSignature(s);
    if (progressSignature === lastStateProgressSignature) return;
    lastStateProgressSignature = progressSignature;

    const prevState = lastState;
    const prevPlayer = asValidPlayerIndex(lastKnownActivePlayer);
    const currPlayer = resolveActivePlayerFromState(s);
    if (currPlayer !== null) lastKnownActivePlayer = currPlayer;
    lastState = s;
    AD_SB.overlay.handleState(s);
    if (!hasAnyTriggerConsumer()) return;

    const settings = getSettings();
    const effectsActive = isModuleActive("effects");

    const myIdx = Number(settings.myPlayerIndex);
    const hasPrev = prevPlayer !== null;
    const hasCurr = currPlayer !== null;
    const playerChanged = hasPrev && hasCurr && prevPlayer !== currPlayer;

    if (playerChanged) {
      const currIsMe = currPlayer === myIdx;
      const playerName = getPlayerNameByIndex(s, currPlayer, `Player ${currPlayer + 1}`);
      const previousPlayerName =
        getPlayerNameByIndex(prevState, prevPlayer, "") ||
        getPlayerNameByIndex(s, prevPlayer, `Player ${prevPlayer + 1}`);
      const payload = {
        effect: "turn_start_by_state",
        player: currPlayer,
        playerIndex: currPlayer,
        playerName,
        previousPlayer: prevPlayer,
        previousPlayerName,
        myPlayerIndex: myIdx,
        state: s
      };

      dispatchTrigger("gameon", payload);
      dispatchPlayerNamedTriggers("", playerName, payload);
      dispatchPlayerIndexTriggers(currPlayer, payload);

      // Personal transitions only (prevents opponent->opponent trigger spam in 3+ matches).
      if (currIsMe) {
        fireCustomEffects("myTurnStart", payload);
        dispatchExternalTrigger("myTurnStart", payload);
        if (effectsActive && settings.enableMyTurnStart !== false) {
          AD_SB.fireActionByKey("myTurnStart", payload);
        }
      } else {
        fireCustomEffects("opponentTurnStart", payload);
        dispatchExternalTrigger("opponentTurnStart", payload);
        if (effectsActive && settings.enableOpponentTurnStart !== false) {
          AD_SB.fireActionByKey("opponentTurnStart", payload);
        }
      }

      // New active player means previous visit ended.
      resetVisit();
    }

    if (isMyTurn() && s.turnBusted) {
      fireCustomEffects("bust", { ...s, effect: "bust" });
      dispatchExternalTrigger("bust", { ...s, effect: "bust" });
      if (effectsActive && settings.enableBust) {
        AD_SB.fireActionByKey("bust", { ...s, effect: "bust" });
      }
      dispatchTrigger("busted", { ...s, effect: "bust" });
      resetVisit();
    }

    if (s.gameFinished && typeof s.winner === "number" && s.winner >= 0) {
      const winnerName = getPlayerNameByIndex(s, s.winner, `Player ${Number(s.winner) + 1}`);
      const winnerPayload = { ...s, effect: "winner", winnerName };
      fireCustomEffects("winner", winnerPayload);
      dispatchExternalTrigger("winner", winnerPayload);
      if (effectsActive && settings.enableWinner) {
        AD_SB.fireActionByKey("winner", winnerPayload);
      }
      dispatchTrigger("gameshot", winnerPayload);
      dispatchPlayerNamedTriggers("gameshot", winnerName, winnerPayload);
      if (lastThrowEvent) {
        const winningThrow = getThrowTriggerName(lastThrowEvent);
        if (winningThrow) dispatchTrigger(`gameshot+${winningThrow}`, { ...winnerPayload, throw: lastThrowEvent });
      }
    }

    const checkoutPayload = buildCheckoutPayload(s);
    if (checkoutPayload) {
      const checkoutSignature = buildCheckoutSignature(checkoutPayload);
      if (checkoutSignature !== lastCheckoutSignature) {
        lastCheckoutSignature = checkoutSignature;
        dispatchTrigger("checkout", checkoutPayload);
        if (checkoutPayload.recommendedThrow) {
          dispatchTrigger(`checkout_${checkoutPayload.recommendedThrow}`, checkoutPayload);
        }
      }
    }

  }

  // UI-Events aus content.js (z.B. undo_click)
  function handleUiEvent(p) {
    AD_SB.overlay.handleUiEvent(p, lastState);
    if (!hasAnyTriggerConsumer()) return;

    const settings = getSettings();
    const effectsActive = isModuleActive("effects");

    if (p?.kind === "undo_click") {
      fireCustomEffects("correction", { effect: "undo_click", ts: p.ts ?? Date.now() });
      dispatchExternalTrigger("correction", { effect: "undo_click", ts: p.ts ?? Date.now() });
      if (effectsActive && settings.enableCorrection) {
        AD_SB.fireActionByKey("correction", { effect: "undo_click", ts: p.ts ?? Date.now() });
      }
      resetVisit();
    }
  }

  AD_SB.autodartsTriggers = {
    handleThrow,
    handleGameEvent,
    handleState,
    handleUiEvent
  };

  // Temporary compatibility shim while the old effects module is phased out of routing.
  AD_SB.effects = AD_SB.effects || {};
})(self);
