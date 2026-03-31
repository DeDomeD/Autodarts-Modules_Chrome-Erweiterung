/**
 * Streamer.bot WebSocket Client
 * Verantwortung:
 * - Verbindungsaufbau + Reconnect/Queue
 * - Action-Auslösung über `fireActionByKey`
 * - Verbindungs-Schnelltest (`connectOnceForTest`) für Popup
 */
(function initSBClient(scope) {
  const AD_SB = scope.AD_SB || (scope.AD_SB = {});
  const SB_ICON_URL = chrome.runtime.getURL("Modules/overlay/streamerbot-logo.png");
  const SB_ICON_LOG_STYLE =
    `background: url("${SB_ICON_URL}") no-repeat left center / 14px 14px; ` +
    "padding-left: 18px; line-height: 14px;";

  let sbSocket = null;
  let sbConnecting = false;
  const actionQueue = [];
  let reconnectTimer = null;
  const RECONNECT_DELAY_MS = 2000;
  let sbOutageActive = false;
  const sbStatus = {
    state: "unknown", // unknown | connecting | connected | disconnected
    url: "",
    lastChangeTs: 0,
    lastError: ""
  };

  function setSBStatus(next) {
    sbStatus.state = String(next?.state || sbStatus.state || "unknown");
    sbStatus.url = String(next?.url ?? sbStatus.url ?? "");
    sbStatus.lastError = String(next?.lastError ?? sbStatus.lastError ?? "");
    sbStatus.lastChangeTs = Date.now();
  }

  function getSBStatus() {
    return { ...sbStatus };
  }

  function makeId() {
    return "ad-sb-" + Date.now() + "-" + Math.floor(Math.random() * 999999);
  }

  function clearReconnectTimer() {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function scheduleReconnect(reason = "unknown") {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      ensureSBConnection();
    }, RECONNECT_DELAY_MS);
    try { AD_SB.logger?.warn?.("sb", "reconnect scheduled", { reason, delayMs: RECONNECT_DELAY_MS }); } catch {}
  }

  function ensureSBConnection() {
    const url = AD_SB.getSettings().sbUrl;

    if (sbSocket && (sbSocket.readyState === WebSocket.OPEN || sbSocket.readyState === WebSocket.CONNECTING)) return;
    if (sbConnecting) return;

    sbConnecting = true;
    clearReconnectTimer();
    setSBStatus({ state: "connecting", url, lastError: "" });
    try { AD_SB.logger?.info?.("sb", "connecting to streamerbot", { url }); } catch {}

    try {
      sbSocket = new WebSocket(url);
    } catch (e) {
      setSBStatus({ state: "disconnected", url, lastError: String(e?.message || e) });
      if (!sbOutageActive) {
        sbOutageActive = true;
        console.warn("[Autodarts Modules] Streamer.bot disconnected ❗ reconnecting...");
      }
      try { AD_SB.logger?.error?.("errors", "failed to create streamerbot ws", { error: String(e?.message || e), url }); } catch {}
      sbConnecting = false;
      sbSocket = null;
      scheduleReconnect("create_failed");
      return;
    }

    sbSocket.onopen = () => {
      setSBStatus({ state: "connected", url, lastError: "" });
      console.log(`[Autodarts Modules] Streamer.bot connected ✅ (${url})`);
      try { AD_SB.logger?.info?.("sb", "streamerbot ws open", { queued: actionQueue.length }); } catch {}
      sbConnecting = false;
      sbOutageActive = false;
      clearReconnectTimer();

      while (actionQueue.length > 0) {
        const item = actionQueue.shift();
        sendDoActionNow(item.actionName, item.args);
      }
    };

    sbSocket.onerror = (e) => {
      setSBStatus({ state: "disconnected", url, lastError: String(e?.message || e) });
      try { AD_SB.logger?.error?.("errors", "streamerbot ws error", { error: String(e?.message || e) }); } catch {}
      // keep console quiet here; onclose handles reconnect notice + schedule
    };

    sbSocket.onclose = () => {
      setSBStatus({ state: "disconnected", url, lastError: "" });
      if (!sbOutageActive) {
        sbOutageActive = true;
        console.warn("[Autodarts Modules] Streamer.bot disconnected ❗ reconnecting...");
      }
      try { AD_SB.logger?.warn?.("sb", "streamerbot ws closed", {}); } catch {}
      sbConnecting = false;
      sbSocket = null;
      scheduleReconnect("ws_close");
    };
  }

  function logAction(key, actionName, args) {
    const settings = AD_SB.getSettings();
    if (!settings.debugActions) return;
    const preview =
      args && typeof args === "object"
        ? JSON.parse(JSON.stringify(args, (k, v) => (k === "raw" ? "[raw omitted]" : v)))
        : args;
    console.log(`%caction -> key="${key}" name="${actionName}"`, SB_ICON_LOG_STYLE, preview);
  }

  function sendDoActionNow(actionName, args = {}) {
    if (!sbSocket || sbSocket.readyState !== WebSocket.OPEN) {
      actionQueue.push({ actionName, args });
      try { AD_SB.logger?.warn?.("actions", "action queued (ws not open)", { actionName, queued: actionQueue.length }); } catch {}
      ensureSBConnection();
      return;
    }

    const payload = {
      request: "DoAction",
      id: makeId(),
      action: { name: actionName },
      args
    };

    try {
      sbSocket.send(JSON.stringify(payload));
      try { AD_SB.logger?.info?.("actions", "action sent", { actionName }); } catch {}
    } catch (e) {
      console.error("[Autodarts Modules] send failed, re-queue:", e);
      try { AD_SB.logger?.error?.("errors", "action send failed", { actionName, error: String(e?.message || e) }); } catch {}
      actionQueue.push({ actionName, args });
    }
  }

  function fireActionByKey(key, args = {}) {
    const settings = AD_SB.getSettings();
    const suffix = settings.actions?.[key];
    try {
      AD_SB.wled?.handleActionTrigger?.(key, args);
    } catch {}
    if (!suffix) return;

    const actionName = settings.actionPrefix + suffix;
    logAction(key, actionName, args);
    try {
      AD_SB.logger?.info?.("actions", "action triggered", {
        key,
        actionName,
        effect: args?.effect ?? null
      });
    } catch {}

    ensureSBConnection();

    if (!sbSocket || sbSocket.readyState !== WebSocket.OPEN) {
      actionQueue.push({ actionName, args });
      return;
    }

    sendDoActionNow(actionName, args);
  }

  function connectOnceForTest(url, timeoutMs = 1200) {
    return new Promise((resolve) => {
      let done = false;
      try {
        const ws = new WebSocket(url);
        const t = setTimeout(() => {
          if (done) return;
          done = true;
          try { ws.close(); } catch {}
          resolve(false);
        }, timeoutMs);

        ws.onopen = () => {
          if (done) return;
          done = true;
          clearTimeout(t);
          try { ws.close(); } catch {}
          resolve(true);
        };
        ws.onerror = () => {
          if (done) return;
          done = true;
          clearTimeout(t);
          try { ws.close(); } catch {}
          resolve(false);
        };
      } catch {
        resolve(false);
      }
    });
  }

  AD_SB.fireActionByKey = fireActionByKey;
  AD_SB.connectOnceForTest = connectOnceForTest;
  AD_SB.ensureSBConnection = ensureSBConnection;
  AD_SB.getSBStatus = getSBStatus;
})(self);
