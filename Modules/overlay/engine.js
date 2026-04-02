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
    rightCheckout: ""
  };

  function asFiniteInt(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.floor(n) : fallback;
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
    return {
      effect: "overlay_update",
      reason,
      ts: Date.now(),
      ...runtime
    };
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
    return AD_SB.autodartsTriggers?.getSnapshot?.() || {};
  }

  function handleState(s) {
    const snapshot = getAutodartsSnapshot();
    const state = s || snapshot.lastState;
    if (!state || typeof state !== "object") return;

    const root = state.raw?.state || state.raw || {};
    const players = Array.isArray(root.players) ? root.players : [];

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

    broadcast("state");
  }

  function handleThrow(t) {
    const snapshot = getAutodartsSnapshot();
    const throwEvent = t || snapshot.lastThrow;
    const lastState = snapshot.lastState;
    const score = Number(throwEvent?.score);
    if (!Number.isFinite(score) || score < 0) return;

    const player = Number.isFinite(Number(throwEvent?.player)) ? Number(throwEvent.player) : Number(lastState?.player);
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
      obj.rightSets !== undefined
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

  AD_SB.overlay = {
    bindRuntimePorts,
    getState,
    handleThrow,
    handleState,
    handleGameEvent,
    handleUiEvent,
    applyExternalOverlayPayload
  };

  bindStreamerbotOverlaySubscription();
})(self);
