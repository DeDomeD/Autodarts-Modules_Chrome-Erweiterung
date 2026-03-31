/**
 * Effekt-Engine
 * Verantwortung:
 * - verarbeitet Throw/State/UI/Game Events
 * - steuert Trigger-Logik (Miss, Triple, Highscore, Bust, Winner, etc.)
 * - verwaltet Visit-Tracking und Korrektur-Verhalten
 */
(function initEffects(scope) {
  const AD_SB = scope.AD_SB || (scope.AD_SB = {});

  let lastThrowSig = null;
  let lastThrowSigAt = 0;

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
    fireCustomEffects(key, payload);
    if (getSettings().actions?.[key]) {
      AD_SB.fireActionByKey(key, payload);
      return;
    }
    AD_SB.wled?.handleActionTrigger?.(key, payload);
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

  function getSettings() {
    return AD_SB.getSettings();
  }

  function isDuplicateThrow(t) {
    const sig = JSON.stringify({
      player: t.player,
      segment: t.segment,
      score: t.score,
      x: t.coords?.x,
      y: t.coords?.y
    });
    const now = Date.now();
    if (sig === lastThrowSig && now - lastThrowSigAt < 200) return true;
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

    const settings = getSettings();
    if (!settings.enabled) return;
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
      if (settings.enableNoScore && potentialSum === 0) {
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
      if (settings.enableSpecialMiss) {
        AD_SB.fireActionByKey("specialMiss", { ...t, effect: "special_miss", remaining });
      }
    }
    if (t.score === 0 && !(settings.missGuardOnDoubleOut && inDoubleOutRange)) {
      fireCustomEffects("miss", t);
    }
    if (settings.enableMiss && t.score === 0 && !(settings.missGuardOnDoubleOut && inDoubleOutRange)) {
      AD_SB.fireActionByKey("miss", t);
    }
    if (t.score === 25) fireCustomEffects("bull", t);
    if (settings.enableBull && t.score === 25) AD_SB.fireActionByKey("bull", t);
    if (t.score === 50) fireCustomEffects("dbull", t);
    if (settings.enableDBull && t.score === 50) AD_SB.fireActionByKey("dbull", t);

    const isDoubleBull = t.score === 50
      || (t.multiplier === 2 && Number(t.number) === 25)
      || String(t.segment || "").toUpperCase() === "DBULL";
    if (settings.enableDouble && t.multiplier === 2 && t.score > 0 && !isDoubleBull) {
      AD_SB.fireActionByKey("dbl", t);
    }
    if (t.multiplier === 2 && t.score > 0 && !isDoubleBull) {
      fireCustomEffects("dbl", t);
    }

    if (t.multiplier === 3) {
      const isSpecial = SPECIAL_TRIPLES.has(segUpper) && hasSpecificTripleAction(segUpper);
      if (isSpecial) {
        const k = segmentToKey(segUpper);
        const toggleId = "enable" + segUpper;
        fireCustomEffects(k, t);
        if (settings[toggleId] !== false) {
          AD_SB.fireActionByKey(k, t);
        }
      } else {
        fireCustomEffects("tpl", t);
        if (settings.enableTriple) {
          AD_SB.fireActionByKey("tpl", t);
        }
      }
    }
  }

  // Game-Events
  function handleGameEvent(e) {
    if (isDuplicateGameEvent(e)) return;
    AD_SB.overlay.handleGameEvent(e, lastState);
    const settings = getSettings();
    if (!settings.enabled) return;

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
    const prevState = lastState;
    const prevPlayer = asValidPlayerIndex(lastKnownActivePlayer);
    const currPlayer = resolveActivePlayerFromState(s);
    if (currPlayer !== null) lastKnownActivePlayer = currPlayer;
    lastState = s;
    AD_SB.overlay.handleState(s);

    const settings = getSettings();
    if (!settings.enabled) return;

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
        if (settings.enableMyTurnStart !== false) {
          AD_SB.fireActionByKey("myTurnStart", payload);
        }
      } else {
        fireCustomEffects("opponentTurnStart", payload);
        if (settings.enableOpponentTurnStart !== false) {
          AD_SB.fireActionByKey("opponentTurnStart", payload);
        }
      }

      // New active player means previous visit ended.
      resetVisit();
    }

    if (isMyTurn() && s.turnBusted) {
      fireCustomEffects("bust", { ...s, effect: "bust" });
      if (settings.enableBust) {
        AD_SB.fireActionByKey("bust", { ...s, effect: "bust" });
      }
      dispatchTrigger("busted", { ...s, effect: "bust" });
      resetVisit();
    }

    if (s.gameFinished && typeof s.winner === "number" && s.winner >= 0) {
      const winnerName = getPlayerNameByIndex(s, s.winner, `Player ${Number(s.winner) + 1}`);
      const winnerPayload = { ...s, effect: "winner", winnerName };
      fireCustomEffects("winner", winnerPayload);
      if (settings.enableWinner) {
        AD_SB.fireActionByKey("winner", winnerPayload);
      }
      dispatchTrigger("gameshot", winnerPayload);
      dispatchPlayerNamedTriggers("gameshot", winnerName, winnerPayload);
      if (lastThrowEvent) {
        const winningThrow = getThrowTriggerName(lastThrowEvent);
        if (winningThrow) dispatchTrigger(`gameshot+${winningThrow}`, { ...winnerPayload, throw: lastThrowEvent });
      }
    }

  }

  // UI-Events aus content.js (z.B. undo_click)
  function handleUiEvent(p) {
    AD_SB.overlay.handleUiEvent(p, lastState);

    const settings = getSettings();
    if (!settings.enabled) return;

    if (p?.kind === "undo_click") {
      fireCustomEffects("correction", { effect: "undo_click", ts: p.ts ?? Date.now() });
      if (settings.enableCorrection) {
        AD_SB.fireActionByKey("correction", { effect: "undo_click", ts: p.ts ?? Date.now() });
      }
      resetVisit();
    }
  }

  AD_SB.effects = {
    handleThrow,
    handleGameEvent,
    handleState,
    handleUiEvent
  };
})(self);
