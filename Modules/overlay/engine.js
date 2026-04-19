/**
 * Overlay State + Feed
 * Verantwortung:
 * - hält den aktuellen Overlay-Zustand im Worker
 * - versorgt Overlay-Clients über `chrome.runtime.connect("overlay-feed")`
 * - liefert Snapshot für `GET_OVERLAY_STATE`
 */
(function initOverlay(scope) {
  const AD_SB = scope.AD_SB || (scope.AD_SB = {});

  const ports = new Set();
  let portsBound = false;
  /** Ein Broadcast mit visitClear, damit das Overlay Wurf-Bubbles leeren kann */
  let visitClearPulse = false;

  const runtime = {
    leftName: "PLAYER 1",
    rightName: "PLAYER 2",
    leftScore: 501,
    rightScore: 501,
    leftSets: 0,
    rightSets: 0,
    leftLegs: 0,
    rightLegs: 0,
    leftCheckout: "",
    rightCheckout: "",
    /** Sets zum Sieg (Mitte: FIRST TO n) */
    firstTo: 3,
    /** Turnierzeile unten (Streamer.bot / Payload); leer = Zeile ausblenden */
    footerLine: "",
    /** 0 = links am Zug, 1 = rechts; null = keine Anzeige */
    activePlayer: null,
    leftFlagUrl: "",
    rightFlagUrl: "",
    /** pdcOfficial | blueOrange | blueRed | redBlue — siehe Overlay-OBS */
    nameScheme: "pdcOfficial",
    nameBarFollowTurn: true,
    showCheckout: true,
    checkoutSide: "auto",
    /** PDC-Official Glow (aus Settings, siehe syncGlowFromSettings) */
    pdcGlowHue: 172,
    pdcGlowIntensity: 100
  };

  function clampPdcGlowHue(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 172;
    const x = Math.round(n) % 360;
    return x < 0 ? x + 360 : x;
  }

  function clampPdcGlowIntensity(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 100;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function syncGlowFromSettings() {
    const s = AD_SB.getSettings?.() || {};
    runtime.pdcGlowHue = clampPdcGlowHue(s.pdcGlowHue ?? runtime.pdcGlowHue ?? 172);
    runtime.pdcGlowIntensity = clampPdcGlowIntensity(s.pdcGlowIntensity ?? runtime.pdcGlowIntensity ?? 100);
  }

  function asFiniteInt(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.floor(n) : fallback;
  }

  function asPlayerIndex01(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    const i = Math.floor(n);
    if (i === 0 || i === 1) return i;
    return null;
  }

  /** Aktueller Wurfspieler aus Game-State (heuristisch, wie ADM-Trigger) */
  function readActivePlayerFromState(stateLike) {
    if (!stateLike || typeof stateLike !== "object") return null;
    const direct = asPlayerIndex01(stateLike.player);
    if (direct !== null) return direct;
    const roots = [stateLike.raw?.state, stateLike.raw, stateLike].filter((x) => x && typeof x === "object");
    for (const root of roots) {
      const cand = [
        root.throwingPlayerIndex,
        root.currentPlayerIndex,
        root.activePlayerIndex,
        root.dartThrowerIndex,
        root.throwerIndex,
        root.nextPlayerIndex,
        root.nextPlayer,
        root.playerIndex,
        root.player
      ];
      for (const c of cand) {
        const idx = asPlayerIndex01(c);
        if (idx !== null) return idx;
      }
    }
    return null;
  }

  function readFirstToSets(stateLike) {
    if (!stateLike || typeof stateLike !== "object") return null;
    const roots = [stateLike.raw?.state, stateLike.raw, stateLike].filter((x) => x && typeof x === "object");
    for (const root of roots) {
      const m = root.match || root.game || root.settings || root.rules || root;
      const n = Number(
        m?.setsToWin ??
          m?.firstToSets ??
          m?.setsFirstTo ??
          root.firstToSets ??
          root.setsToWin
      );
      if (Number.isFinite(n) && n > 0 && n < 50) return Math.floor(n);
    }
    return null;
  }

  function readNameFromPlayer(p, fallback) {
    if (!p) return fallback;
    if (typeof p === "string" && p.trim()) return p.trim();
    if (typeof p !== "object") return fallback;

    const cand =
      p.name ??
      p.displayName ??
      p.nickname ??
      p.username ??
      p.userName ??
      p.playerName ??
      p?.player?.name ??
      p?.user?.name;

    return typeof cand === "string" && cand.trim() ? cand.trim() : fallback;
  }

  function readScoreFromPlayer(p, fallback) {
    if (typeof p === "number" && Number.isFinite(p)) return p;
    if (!p || typeof p !== "object") return fallback;
    const cand = p.remaining ?? p.score ?? p.points ?? p.left ?? p.rest;
    const num = Number(cand);
    return Number.isFinite(num) ? num : fallback;
  }

  function makeSnapshot(reason = "state") {
    const { leftCheckout, rightCheckout, ...rest } = runtime;
    const payload = {
      effect: "overlay_update",
      reason,
      ts: Date.now(),
      ...rest
    };
    const lc = String(leftCheckout ?? "").trim();
    const rc = String(rightCheckout ?? "").trim();
    if (lc) payload.leftCheckout = lc;
    if (rc) payload.rightCheckout = rc;
    if (visitClearPulse) {
      payload.visitClear = true;
      visitClearPulse = false;
    }
    return payload;
  }

  function broadcast(reason = "state") {
    const payload = makeSnapshot(reason);
    try {
      AD_SB.logger?.info?.("overlay", "overlay broadcast", {
        reason,
        leftScore: payload.leftScore,
        rightScore: payload.rightScore,
        leftName: payload.leftName,
        rightName: payload.rightName
      });
    } catch {}
    for (const port of Array.from(ports)) {
      try {
        port.postMessage({ type: "AD_SB_OVERLAY_UPDATE", payload });
      } catch {
        ports.delete(port);
      }
    }
  }

  // Overlay-Ports einmalig anbinden und Initial-Snapshot senden
  function bindRuntimePorts() {
    if (portsBound) return;
    portsBound = true;

    chrome.runtime.onConnect.addListener((port) => {
      if (!port || port.name !== "overlay-feed") return;

      ports.add(port);
      try { AD_SB.logger?.info?.("overlay", "overlay port connected", { count: ports.size }); } catch {}
      try {
        port.postMessage({
          type: "AD_SB_OVERLAY_UPDATE",
          payload: makeSnapshot("connect")
        });
      } catch {}

      port.onDisconnect.addListener(() => {
        ports.delete(port);
        try { AD_SB.logger?.info?.("overlay", "overlay port disconnected", { count: ports.size }); } catch {}
      });
    });
  }

  function getState() {
    return makeSnapshot("get_state");
  }

  function getAutodartsSnapshot() {
    return AD_SB.admTriggers?.getSnapshot?.() || {};
  }

  const DOM_OVERLAY_SNAPSHOT_MAX_AGE_MS = 5000;

  function applyDomPlaySnapshotToOverlayRuntime(dom, playersFromState) {
    if (!dom || typeof dom !== "object") return;
    const plist = Array.isArray(dom.players) ? dom.players : [];
    if (plist.length < 1) return;
    const p0 = plist[0];
    const p1 = plist[1];
    if (p0 && Number.isFinite(Number(p0.scoreRemaining))) {
      runtime.leftScore = asFiniteInt(Number(p0.scoreRemaining), runtime.leftScore);
    }
    if (p1 && Number.isFinite(Number(p1.scoreRemaining))) {
      runtime.rightScore = asFiniteInt(Number(p1.scoreRemaining), runtime.rightScore);
    }
    const n0 = p0?.displayName != null ? String(p0.displayName).trim() : "";
    const n1 = p1?.displayName != null ? String(p1.displayName).trim() : "";
    if (n0) runtime.leftName = n0;
    if (n1) runtime.rightName = n1;
    const legs0 = Number(p0?.legsWon);
    const legs1 = Number(p1?.legsWon);
    if (Number.isFinite(legs0)) runtime.leftLegs = asFiniteInt(legs0, runtime.leftLegs);
    if (Number.isFinite(legs1)) runtime.rightLegs = asFiniteInt(legs1, runtime.rightLegs);
    const s0 = playersFromState[0];
    const s1 = playersFromState[1];
    if (!Number.isFinite(Number(p0?.scoreRemaining)) && s0) {
      runtime.leftScore = asFiniteInt(readScoreFromPlayer(s0, runtime.leftScore), runtime.leftScore);
    }
    if (!Number.isFinite(Number(p1?.scoreRemaining)) && s1) {
      runtime.rightScore = asFiniteInt(readScoreFromPlayer(s1, runtime.rightScore), runtime.rightScore);
    }
    if (!n0 && s0) runtime.leftName = readNameFromPlayer(s0, runtime.leftName);
    if (!n1 && s1) runtime.rightName = readNameFromPlayer(s1, runtime.rightName);
    if (!Number.isFinite(legs0) && s0) {
      runtime.leftLegs = asFiniteInt(s0?.legsWon ?? s0?.legWins ?? s0?.legs, runtime.leftLegs);
    }
    if (!Number.isFinite(legs1) && s1) {
      runtime.rightLegs = asFiniteInt(s1?.legsWon ?? s1?.legWins ?? s1?.legs, runtime.rightLegs);
    }
    runtime.leftSets = asFiniteInt(s0?.setsWon ?? s0?.setWins ?? s0?.sets, runtime.leftSets);
    runtime.rightSets = asFiniteInt(s1?.setsWon ?? s1?.setWins ?? s1?.sets, runtime.rightSets);
  }

  function handleState(s) {
    const snapshot = getAutodartsSnapshot();
    const state = s || snapshot.lastState;
    if (!state || typeof state !== "object") return;

    const root = state.raw?.state || state.raw || {};
    const players = Array.isArray(root.players) ? root.players : [];

    const dom = snapshot.lastDomPlaySnapshot;
    const domAt = Number(snapshot.lastDomPlaySnapshotAt || 0);
    const domFresh =
      dom &&
      domAt > 0 &&
      Date.now() - domAt <= DOM_OVERLAY_SNAPSHOT_MAX_AGE_MS &&
      Array.isArray(dom.players) &&
      dom.players.length > 0;

    const ft = readFirstToSets(state);
    if (ft !== null) runtime.firstTo = ft;

    const ap = readActivePlayerFromState(state);
    if (ap !== null) runtime.activePlayer = ap;

    if (domFresh) {
      applyDomPlaySnapshotToOverlayRuntime(dom, players);
      const domPi = asPlayerIndex01(dom?.activePlayerIndex);
      if (domPi !== null) runtime.activePlayer = domPi;
    } else {
      runtime.leftScore = asFiniteInt(
        state.playerScores?.[0] ?? readScoreFromPlayer(players[0], runtime.leftScore),
        runtime.leftScore
      );
      runtime.rightScore = asFiniteInt(
        state.playerScores?.[1] ?? readScoreFromPlayer(players[1], runtime.rightScore),
        runtime.rightScore
      );

      runtime.leftName = readNameFromPlayer(players[0], runtime.leftName);
      runtime.rightName = readNameFromPlayer(players[1], runtime.rightName);

      runtime.leftSets = asFiniteInt(players[0]?.setsWon ?? players[0]?.setWins ?? players[0]?.sets, runtime.leftSets);
      runtime.rightSets = asFiniteInt(players[1]?.setsWon ?? players[1]?.setWins ?? players[1]?.sets, runtime.rightSets);
      runtime.leftLegs = asFiniteInt(players[0]?.legsWon ?? players[0]?.legWins ?? players[0]?.legs, runtime.leftLegs);
      runtime.rightLegs = asFiniteInt(players[1]?.legsWon ?? players[1]?.legWins ?? players[1]?.legs, runtime.rightLegs);
    }

    broadcast("state");
  }

  function handleThrow(t) {
    const snapshot = getAutodartsSnapshot();
    const throwEvent = t || snapshot.lastThrow;
    const lastState = snapshot.lastState;
    const score = Number(throwEvent?.score);
    if (!Number.isFinite(score) || score < 0) return;

    const player = Number.isFinite(Number(throwEvent?.player)) ? Number(throwEvent.player) : Number(lastState?.player);
    const pi = asPlayerIndex01(player);
    if (pi !== null) runtime.activePlayer = pi;
    if (player === 0) {
      runtime.leftScore = Math.max(0, asFiniteInt(runtime.leftScore - score, runtime.leftScore));
      broadcast("throw");
    } else if (player === 1) {
      runtime.rightScore = Math.max(0, asFiniteInt(runtime.rightScore - score, runtime.rightScore));
      broadcast("throw");
    }
  }

  function handleGameEvent() {}
  function handleUiEvent() {}

  function looksLikeOverlayPayload(obj) {
    if (!obj || typeof obj !== "object") return false;
    return (
      obj.leftScore !== undefined ||
      obj.rightScore !== undefined ||
      obj.leftName !== undefined ||
      obj.rightName !== undefined ||
      obj.startScore !== undefined ||
      obj.leftSets !== undefined ||
      obj.rightSets !== undefined ||
      obj.firstTo !== undefined ||
      obj.footerLine !== undefined ||
      obj.activePlayer !== undefined ||
      obj.leftFlagUrl !== undefined ||
      obj.rightFlagUrl !== undefined ||
      obj.nameScheme !== undefined ||
      obj.nameBarFollowTurn !== undefined ||
      obj.showCheckout !== undefined ||
      obj.checkoutSide !== undefined ||
      obj.visitClear !== undefined ||
      obj.pdcGlowHue !== undefined ||
      obj.pdcGlowIntensity !== undefined
    );
  }

  function tryParseJsonObject(raw) {
    if (typeof raw !== "string") return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function applyExternalOverlayPayload(rawPayload, reason = "external") {
    if (!rawPayload || typeof rawPayload !== "object") return false;
    const next = { ...rawPayload };
    if (next.visitClear === true) {
      runtime.leftCheckout = "";
      runtime.rightCheckout = "";
      visitClearPulse = true;
    }
    if (next.leftScore !== undefined) runtime.leftScore = asFiniteInt(next.leftScore, runtime.leftScore);
    if (next.rightScore !== undefined) runtime.rightScore = asFiniteInt(next.rightScore, runtime.rightScore);
    if (next.leftSets !== undefined) runtime.leftSets = asFiniteInt(next.leftSets, runtime.leftSets);
    if (next.rightSets !== undefined) runtime.rightSets = asFiniteInt(next.rightSets, runtime.rightSets);
    if (next.leftLegs !== undefined) runtime.leftLegs = asFiniteInt(next.leftLegs, runtime.leftLegs);
    if (next.rightLegs !== undefined) runtime.rightLegs = asFiniteInt(next.rightLegs, runtime.rightLegs);
    if (typeof next.leftName === "string" && next.leftName.trim()) runtime.leftName = next.leftName.trim();
    if (typeof next.rightName === "string" && next.rightName.trim()) runtime.rightName = next.rightName.trim();
    if (typeof next.leftCheckout === "string") runtime.leftCheckout = next.leftCheckout;
    if (typeof next.rightCheckout === "string") runtime.rightCheckout = next.rightCheckout;
    if (next.firstTo !== undefined) runtime.firstTo = asFiniteInt(next.firstTo, runtime.firstTo);
    if (typeof next.footerLine === "string") runtime.footerLine = next.footerLine;
    if (next.activePlayer !== undefined) {
      const ap = asPlayerIndex01(next.activePlayer);
      runtime.activePlayer = ap;
    }
    if (typeof next.leftFlagUrl === "string") runtime.leftFlagUrl = next.leftFlagUrl;
    if (typeof next.rightFlagUrl === "string") runtime.rightFlagUrl = next.rightFlagUrl;
    if (next.nameScheme !== undefined) {
      const s = String(next.nameScheme).toLowerCase();
      if (s === "redblue" || s === "flip" || s === "rl") runtime.nameScheme = "redBlue";
      else if (s === "bluered") runtime.nameScheme = "blueRed";
      else if (s === "blueorange" || s === "pdc" || s === "legacy") runtime.nameScheme = "blueOrange";
      else if (s === "pdcofficial" || s === "official" || s === "pdctv" || s === "itv") runtime.nameScheme = "pdcOfficial";
      else runtime.nameScheme = "pdcOfficial";
    }
    if (next.nameBarFollowTurn !== undefined) {
      runtime.nameBarFollowTurn =
        next.nameBarFollowTurn === true ||
        next.nameBarFollowTurn === 1 ||
        String(next.nameBarFollowTurn).toLowerCase() === "true";
    }
    if (next.showCheckout !== undefined) {
      const sc = next.showCheckout;
      if (sc === false || sc === 0 || String(sc).toLowerCase() === "false") runtime.showCheckout = false;
      else if (sc === true || sc === 1 || String(sc).toLowerCase() === "true") runtime.showCheckout = true;
    }
    if (next.checkoutSide !== undefined) {
      const cs = String(next.checkoutSide).toLowerCase();
      if (cs === "left" || cs === "l") runtime.checkoutSide = "left";
      else if (cs === "right" || cs === "r") runtime.checkoutSide = "right";
      else runtime.checkoutSide = "auto";
    }
    if (next.pdcGlowHue !== undefined) runtime.pdcGlowHue = clampPdcGlowHue(next.pdcGlowHue);
    if (next.pdcGlowIntensity !== undefined) runtime.pdcGlowIntensity = clampPdcGlowIntensity(next.pdcGlowIntensity);
    broadcast(reason);
    return true;
  }

  function bindStreamerbotOverlaySubscription() {
    AD_SB.subscribeSBCustomEvent?.("Custom", "Event");
    AD_SB.subscribeSBMessages?.((msg) => {
      const eventSource = String(msg?.event?.source || "");
      const eventType = String(msg?.event?.type || "");
      const isCustomEvent = eventSource === "Custom" && eventType === "Event";
      if (!isCustomEvent && !looksLikeOverlayPayload(msg?.data) && !looksLikeOverlayPayload(msg?.data?.args)) return;

      const data = msg?.data;
      const eventName = String(
        data?.eventName ||
        data?.name ||
        msg?.event?.name ||
        ""
      ).trim().toUpperCase();
      const hasNamedOverlayEvent = eventName === "AD_SB_OVERLAY_UPDATE";
      const hasDirectOverlayPayload =
        looksLikeOverlayPayload(data?.payload) ||
        looksLikeOverlayPayload(data?.args?.payload) ||
        looksLikeOverlayPayload(data?.args) ||
        looksLikeOverlayPayload(data);
      if (!hasNamedOverlayEvent && !hasDirectOverlayPayload) return;

      if (applyExternalOverlayPayload(data?.payload, "sb_custom_event")) return;
      const payloadFromJson = tryParseJsonObject(data?.payloadJson);
      if (applyExternalOverlayPayload(payloadFromJson, "sb_custom_event")) return;
      const argsPayloadFromJson = tryParseJsonObject(data?.args?.payloadJson);
      if (applyExternalOverlayPayload(argsPayloadFromJson, "sb_custom_event")) return;
      if (applyExternalOverlayPayload(data?.args, "sb_custom_event")) return;
      applyExternalOverlayPayload(data, "sb_custom_event");
    });
  }

  function afterSettingsSaved() {
    syncGlowFromSettings();
    broadcast("settings");
  }

  AD_SB.overlay = {
    bindRuntimePorts,
    getState,
    handleThrow,
    handleState,
    handleGameEvent,
    handleUiEvent,
    applyExternalOverlayPayload,
    afterSettingsSaved,
    syncGlowFromSettings
  };

  bindStreamerbotOverlaySubscription();
  syncGlowFromSettings();
})(self);
