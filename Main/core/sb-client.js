/**
 * Streamer.bot WebSocket Client
 * Verantwortung:
 * - Verbindungsaufbau + Reconnect/Queue
 * - Action-Ausloesung ueber `fireActionByKey`
 * - Verbindungs-Schnelltest (`connectOnceForTest`) fuer Popup
 */
(function initSBClient(scope) {
  const AD_SB = scope.AD_SB || (scope.AD_SB = {});
  const SB_ICON_URL = chrome.runtime.getURL("Modules/overlay/streamerbot-logo.png");
  const SB_ICON_LOG_STYLE =
    `background: url("${SB_ICON_URL}") no-repeat left center / 14px 14px; ` +
    "padding-left: 18px; line-height: 14px;";

  let sbSocket = null;
  let sbConnecting = false;
  let sbHandshakeDone = false;
  let sbAuthRequestId = "";
  const actionQueue = [];
  let reconnectTimer = null;
  const RECONNECT_DELAY_MS = 2000;
  const MAX_AUTO_RETRIES = 5;
  let sbOutageActive = false;
  let sbRetryAttempts = 0;
  let sbRetryExhausted = false;
  const sbStatus = {
    state: "unknown",
    url: "",
    lastChangeTs: 0,
    lastError: "",
    attempts: 0,
    exhausted: false
  };
  const sbMessageListeners = new Set();
  const sbCustomEventSubscriptions = new Set();

  function setSBStatus(next) {
    sbStatus.state = String(next?.state || sbStatus.state || "unknown");
    sbStatus.url = String(next?.url ?? sbStatus.url ?? "");
    sbStatus.lastError = String(next?.lastError ?? sbStatus.lastError ?? "");
    sbStatus.attempts = Number.isFinite(next?.attempts) ? next.attempts : sbRetryAttempts;
    sbStatus.exhausted = typeof next?.exhausted === "boolean" ? next.exhausted : sbRetryExhausted;
    sbStatus.lastChangeTs = Date.now();
  }

  function getSBStatus() {
    return { ...sbStatus };
  }

  function makeId() {
    return "ad-sb-" + Date.now() + "-" + Math.floor(Math.random() * 999999);
  }

  function makeSubscriptionKey(source, type) {
    return `${String(source || "").trim()}:${String(type || "").trim()}`;
  }

  function clearReconnectTimer() {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function base64EncodeBytes(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  async function sha256Base64(text) {
    const data = new TextEncoder().encode(String(text || ""));
    const digest = await crypto.subtle.digest("SHA-256", data);
    return base64EncodeBytes(new Uint8Array(digest));
  }

  async function buildStreamerbotAuthentication(password, salt, challenge) {
    const secret = await sha256Base64(`${password}${salt}`);
    return sha256Base64(`${secret}${challenge}`);
  }

  function normalizeInstalledModules(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  }

  function shouldUseStreamerbot(settings = AD_SB.getSettings()) {
    if (settings?.sbEnabled === false) return false;
    const installed = new Set(normalizeInstalledModules(settings?.installedModules));
    return installed.has("effects") || installed.has("overlay") || installed.has("obszoom");
  }

  function resetRetryState() {
    sbRetryAttempts = 0;
    sbRetryExhausted = false;
  }

  function flushActionQueue() {
    while (actionQueue.length > 0) {
      const item = actionQueue.shift();
      sendDoActionNow(item.actionName, item.args);
    }
  }

  function markSBConnected(url) {
    resetRetryState();
    sbHandshakeDone = true;
    sbAuthRequestId = "";
    setSBStatus({ state: "connected", url, lastError: "" });
    const settings = AD_SB.getSettings?.() || {};
    if (settings.debugActions || settings.debugAllLogs) {
      console.log(`[Autodarts Modules] Streamer.bot connected (${url})`);
    }
    try { AD_SB.logger?.info?.("sb", "streamerbot ws ready", { queued: actionQueue.length }); } catch {}
    sbConnecting = false;
    sbOutageActive = false;
    clearReconnectTimer();
    sendSubscriptionRequest();
    flushActionQueue();
  }

  function disconnectSBConnection(reason = "manual") {
    clearReconnectTimer();
    sbConnecting = false;
    sbHandshakeDone = false;
    sbAuthRequestId = "";
    actionQueue.length = 0;
    if (sbSocket) {
      try {
        sbSocket.onopen = null;
        sbSocket.onmessage = null;
        sbSocket.onclose = null;
        sbSocket.onerror = null;
        sbSocket.close();
      } catch {}
      sbSocket = null;
    }
    sbOutageActive = false;
    if (reason === "manual" || reason === "disabled") resetRetryState();
    setSBStatus({ state: "disconnected", lastError: reason });
  }

  function notifySBMessageListeners(message) {
    for (const listener of Array.from(sbMessageListeners)) {
      try { listener(message); } catch {}
    }
  }

  function buildSubscriptionEventsObject() {
    const events = {};
    for (const key of sbCustomEventSubscriptions) {
      const splitIndex = key.indexOf(":");
      if (splitIndex < 0) continue;
      const source = key.slice(0, splitIndex);
      const type = key.slice(splitIndex + 1);
      if (!source || !type) continue;
      if (!Array.isArray(events[source])) events[source] = [];
      if (!events[source].includes(type)) events[source].push(type);
    }
    return events;
  }

  function sendSubscriptionRequest() {
    if (!sbSocket || sbSocket.readyState !== WebSocket.OPEN || !sbHandshakeDone) return false;
    const events = buildSubscriptionEventsObject();
    if (!Object.keys(events).length) return true;
    try {
      sbSocket.send(JSON.stringify({
        request: "Subscribe",
        id: makeId(),
        events
      }));
      return true;
    } catch {
      return false;
    }
  }

  function scheduleReconnect(reason = "unknown") {
    if (!shouldUseStreamerbot()) return;
    if (reconnectTimer) return;
    if (sbRetryAttempts >= MAX_AUTO_RETRIES) {
      sbRetryExhausted = true;
      setSBStatus({ state: "disconnected", lastError: reason, exhausted: true });
      return;
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      ensureSBConnection();
    }, RECONNECT_DELAY_MS);
    try { AD_SB.logger?.warn?.("sb", "reconnect scheduled", { reason, delayMs: RECONNECT_DELAY_MS }); } catch {}
  }

  function ensureSBConnection() {
    const settings = AD_SB.getSettings();
    const url = String(settings?.sbUrl || "").trim();
    const password = String(settings?.sbPassword || "");

    if (!shouldUseStreamerbot(settings)) {
      disconnectSBConnection("disabled");
      return;
    }

    if (sbSocket && (sbSocket.readyState === WebSocket.OPEN || sbSocket.readyState === WebSocket.CONNECTING)) return;
    if (sbConnecting) return;

    sbConnecting = true;
    sbHandshakeDone = false;
    sbAuthRequestId = "";
    clearReconnectTimer();
    sbRetryAttempts += 1;
    sbRetryExhausted = false;
    setSBStatus({ state: "connecting", url, lastError: "" });
    try { AD_SB.logger?.info?.("sb", "connecting to streamerbot", { url }); } catch {}

    try {
      sbSocket = new WebSocket(url);
    } catch (e) {
      setSBStatus({ state: "disconnected", url, lastError: String(e?.message || e) });
      if (!sbOutageActive) {
        sbOutageActive = true;
        console.warn("[Autodarts Modules] Streamer.bot disconnected, reconnecting...");
      }
      try { AD_SB.logger?.error?.("errors", "failed to create streamerbot ws", { error: String(e?.message || e), url }); } catch {}
      sbConnecting = false;
      sbSocket = null;
      scheduleReconnect("create_failed");
      return;
    }

    sbSocket.onopen = () => {
      setSBStatus({ state: "connecting", url, lastError: "" });
      try { AD_SB.logger?.info?.("sb", "streamerbot ws open", { queued: actionQueue.length }); } catch {}
    };

    sbSocket.onmessage = async (event) => {
      let data = null;
      try {
        data = JSON.parse(String(event?.data || ""));
      } catch {
        return;
      }

      if (String(data?.request || "") === "Hello") {
        const auth = data?.authentication;
        if (!auth?.salt || !auth?.challenge) {
          markSBConnected(url);
          return;
        }
        if (!password) {
          setSBStatus({ state: "disconnected", url, lastError: "auth_required" });
          try { sbSocket?.close(); } catch {}
          return;
        }
        try {
          sbAuthRequestId = makeId();
          const authentication = await buildStreamerbotAuthentication(password, auth.salt, auth.challenge);
          sbSocket?.send(JSON.stringify({
            request: "Authenticate",
            id: sbAuthRequestId,
            authentication
          }));
        } catch (error) {
          setSBStatus({ state: "disconnected", url, lastError: String(error?.message || error) });
          try { sbSocket?.close(); } catch {}
        }
        return;
      }

      if (sbAuthRequestId && String(data?.id || "") === sbAuthRequestId) {
        if (String(data?.status || "").toLowerCase() === "ok") {
          markSBConnected(url);
          return;
        }
        setSBStatus({ state: "disconnected", url, lastError: String(data?.error || "auth_failed") });
        try { sbSocket?.close(); } catch {}
        return;
      }

      notifySBMessageListeners(data);
    };

    sbSocket.onerror = (e) => {
      setSBStatus({ state: "disconnected", url, lastError: String(e?.message || e) });
      try { AD_SB.logger?.error?.("errors", "streamerbot ws error", { error: String(e?.message || e) }); } catch {}
    };

    sbSocket.onclose = () => {
      setSBStatus({ state: "disconnected", url, lastError: "" });
      if (!sbOutageActive) {
        sbOutageActive = true;
        console.warn("[Autodarts Modules] Streamer.bot disconnected, reconnecting...");
      }
      try { AD_SB.logger?.warn?.("sb", "streamerbot ws closed", {}); } catch {}
      sbConnecting = false;
      sbHandshakeDone = false;
      sbSocket = null;
      scheduleReconnect("ws_close");
    };
  }

  function logAction(key, actionName, args) {
    const settings = AD_SB.getSettings();
    if (!settings.debugActions && !settings.debugAllLogs) return;
    const normalizedKey = String(key || "").trim().toLowerCase();
    if (!settings.debugAllLogs && (normalizedKey === "checkout" || normalizedKey.startsWith("checkout_"))) return;
    const triggerLabel = formatActionTriggerLabel(key, args);
    const actionLabel = formatActionNameLabel(actionName, settings.actionPrefix);
    console.log(`[Autodarts Modules = Effekte] AD Trigger ${triggerLabel} | SB Action = ${actionLabel}`);
  }

  function formatActionNameLabel(actionName, prefix) {
    const full = String(actionName || "").trim();
    const normalizedPrefix = String(prefix || "").trim();
    if (!normalizedPrefix) return full;
    const withSpace = `${normalizedPrefix} `;
    if (full.startsWith(withSpace)) return full.slice(withSpace.length).trim();
    if (full.startsWith(normalizedPrefix)) return full.slice(normalizedPrefix.length).trim();
    return full;
  }

  function formatComboLabel(combo) {
    if (!Array.isArray(combo) || !combo.length) return "";
    return combo
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)
      .join(",");
  }

  function formatDartsLabel(darts) {
    if (!Array.isArray(darts) || !darts.length) return "";
    const names = darts
      .map((dart) => String(dart?.segment || "").trim().toUpperCase())
      .filter(Boolean);
    return names.join(",");
  }

  function formatActionTriggerLabel(key, args = {}) {
    const normalizedKey = String(key || "").trim().toLowerCase();
    if (normalizedKey === "correction" || args?.effect === "undo_click") return "Undo";
    if (normalizedKey === "waschmaschine") {
      return formatComboLabel(args?.combo) || formatDartsLabel(args?.darts) || "Waschmaschine";
    }
    if (Array.isArray(args?.combo) && args.combo.length) {
      return formatComboLabel(args.combo) || String(key || "").trim();
    }
    if (typeof args?.segment === "string" && args.segment.trim()) {
      return args.segment.trim().toUpperCase();
    }
    if (typeof args?.recommendedSegment === "string" && args.recommendedSegment.trim()) {
      return args.recommendedSegment.trim().toUpperCase();
    }
    if (typeof args?.recommendedThrow === "string" && args.recommendedThrow.trim()) {
      return args.recommendedThrow.trim().toUpperCase();
    }
    if (typeof args?.event === "string" && args.event.trim()) {
      return args.event.trim();
    }
    if (typeof args?.effect === "string" && args.effect.trim()) {
      return args.effect.trim();
    }
    return String(key || "").trim();
  }

  function sendDoActionNow(actionName, args = {}) {
    if (!sbSocket || sbSocket.readyState !== WebSocket.OPEN || !sbHandshakeDone) {
      actionQueue.push({ actionName, args });
      try { AD_SB.logger?.warn?.("actions", "action queued (ws not ready)", { actionName, queued: actionQueue.length }); } catch {}
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
      if (args?.__skipExternalModules !== true) {
        AD_SB.wled?.handleActionTrigger?.(key, args);
      }
    } catch {}
    if (!suffix) return;
    if (!shouldUseStreamerbot(settings)) return;

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

    if (!sbSocket || sbSocket.readyState !== WebSocket.OPEN || !sbHandshakeDone) {
      actionQueue.push({ actionName, args });
      return;
    }

    sendDoActionNow(actionName, args);
  }

  function connectOnceForTest(url, password = "", timeoutMs = 1200) {
    return new Promise((resolve) => {
      let done = false;
      try {
        const ws = new WebSocket(url);
        let authRequestId = "";
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          try { ws.close(); } catch {}
          resolve(false);
        }, timeoutMs);

        function finish(ok) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          try { ws.close(); } catch {}
          resolve(!!ok);
        }

        ws.onopen = () => {};
        ws.onmessage = async (event) => {
          let data = null;
          try {
            data = JSON.parse(String(event?.data || ""));
          } catch {
            return;
          }

          if (String(data?.request || "") === "Hello") {
            const auth = data?.authentication;
            if (!auth?.salt || !auth?.challenge) {
              finish(true);
              return;
            }
            if (!password) {
              finish(false);
              return;
            }
            try {
              authRequestId = makeId();
              const authentication = await buildStreamerbotAuthentication(password, auth.salt, auth.challenge);
              ws.send(JSON.stringify({
                request: "Authenticate",
                id: authRequestId,
                authentication
              }));
            } catch {
              finish(false);
            }
            return;
          }

          if (authRequestId && String(data?.id || "") === authRequestId) {
            finish(String(data?.status || "").toLowerCase() === "ok");
          }
        };
        ws.onerror = () => finish(false);
      } catch {
        resolve(false);
      }
    });
  }

  function subscribeSBMessages(listener) {
    if (typeof listener !== "function") return () => {};
    sbMessageListeners.add(listener);
    return () => {
      sbMessageListeners.delete(listener);
    };
  }

  function subscribeCustomEvent(source, type) {
    const eventSource = String(source || "").trim();
    const eventType = String(type || "").trim();
    if (!eventSource || !eventType) return false;
    sbCustomEventSubscriptions.add(makeSubscriptionKey(eventSource, eventType));
    sendSubscriptionRequest();
    return true;
  }

  AD_SB.fireActionByKey = fireActionByKey;
  AD_SB.connectOnceForTest = connectOnceForTest;
  AD_SB.ensureSBConnection = ensureSBConnection;
  AD_SB.subscribeSBMessages = subscribeSBMessages;
  AD_SB.subscribeSBCustomEvent = subscribeCustomEvent;
  AD_SB.disconnectSBConnection = disconnectSBConnection;
  AD_SB.retrySBConnection = () => {
    resetRetryState();
    clearReconnectTimer();
    if (sbSocket) {
      try {
        sbSocket.onopen = null;
        sbSocket.onmessage = null;
        sbSocket.onclose = null;
        sbSocket.onerror = null;
        sbSocket.close();
      } catch {}
      sbSocket = null;
    }
    sbConnecting = false;
    sbHandshakeDone = false;
    ensureSBConnection();
  };
  AD_SB.refreshRuntimeConnections = () => {
    if (shouldUseStreamerbot()) ensureSBConnection();
    else disconnectSBConnection("disabled");
    try { AD_SB.refreshObsConnection?.(); } catch {}
  };
  AD_SB.getSBStatus = getSBStatus;
  AD_SB.sha256Base64 = sha256Base64;
})(self);
