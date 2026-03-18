const state = {
  leftName: "DOBEY",
  rightName: "WATTIMENA",
  leftScore: 501,
  rightScore: 501,
  firstTo: 3,
  leftSets: 0,
  rightSets: 0,
  leftLegs: 0,
  rightLegs: 0,
  leftCheckout: "T20 / T19 / D18",
  rightCheckout: "T20 / T19 / D18"
};

let connectionBadge = null;
let connectionHideTimer = null;

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function asInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseFromUrl() {
  const p = new URLSearchParams(window.location.search);
  const out = {};
  for (const [k, v] of p.entries()) out[k] = v;
  return out;
}

function checkoutParts(v) {
  const parts = String(v || "")
    .replace(/\s*[\u2022|,]\s*/g, " / ")
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 3);
  while (parts.length < 3) parts.push("");
  return parts;
}

function fitName(id) {
  const el = $(id);
  if (!el) return;
  const max = 24;
  const min = 12;
  let size = max;
  el.style.fontSize = `${size}px`;
  while (size > min && el.scrollWidth > el.clientWidth) {
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
}

function render() {
  setText("leftName", state.leftName);
  setText("rightName", state.rightName);
  setText("leftScore", state.leftScore);
  setText("rightScore", state.rightScore);

  const left = checkoutParts(state.leftCheckout);
  const right = checkoutParts(state.rightCheckout);
  setText("leftC1", left[0]);
  setText("leftC2", left[1]);
  setText("leftC3", left[2]);
  setText("rightC1", right[0]);
  setText("rightC2", right[1]);
  setText("rightC3", right[2]);

  setText("leftSetsCorner", state.leftSets);
  setText("rightSetsCorner", state.rightSets);
  fitName("leftName");
  fitName("rightName");
}

function applyData(raw) {
  const data = { ...raw };
  if (data.leftScore !== undefined) data.leftScore = asInt(data.leftScore, state.leftScore);
  if (data.rightScore !== undefined) data.rightScore = asInt(data.rightScore, state.rightScore);
  if (data.firstTo !== undefined) data.firstTo = asInt(data.firstTo, state.firstTo);
  if (data.leftSets !== undefined) data.leftSets = asInt(data.leftSets, state.leftSets);
  if (data.rightSets !== undefined) data.rightSets = asInt(data.rightSets, state.rightSets);
  if (data.leftLegs !== undefined) data.leftLegs = asInt(data.leftLegs, state.leftLegs);
  if (data.rightLegs !== undefined) data.rightLegs = asInt(data.rightLegs, state.rightLegs);

  Object.assign(state, data);
  render();
}

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

function ensureConnectionBadge() {
  if (connectionBadge) return connectionBadge;
  const el = document.createElement("div");
  el.id = "connectionBadge";
  el.className = "connBadge disconnected";
  el.textContent = "SB Disconnected";
  document.body.appendChild(el);
  connectionBadge = el;
  return connectionBadge;
}

function setConnectionBadge(kind, text) {
  const el = ensureConnectionBadge();
  if (connectionHideTimer) {
    clearTimeout(connectionHideTimer);
    connectionHideTimer = null;
  }
  el.classList.remove("connected", "disconnected", "hidden");
  el.classList.add(kind === "connected" ? "connected" : "disconnected");
  el.textContent = text;

  if (kind === "connected") {
    connectionHideTimer = setTimeout(() => {
      el.classList.add("hidden");
    }, 5000);
  }
}

window.updateObsOverlay = applyData;

window.addEventListener("message", (ev) => {
  const msg = ev.data;
  if (!msg || msg.type !== "AD_SB_OVERLAY_UPDATE" || typeof msg.payload !== "object") return;
  applyData(msg.payload);
});

function getExtensionSbUrl() {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      resolve("");
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (res) => {
        const url = String(res?.settings?.sbUrl || "").trim();
        resolve(url);
      });
    } catch {
      resolve("");
    }
  });
}

async function resolveStreamerbotWsUrl() {
  const extUrl = await getExtensionSbUrl();
  if (extUrl) return extUrl;

  const p = new URLSearchParams(window.location.search);
  const direct = String(p.get("sbws") || p.get("ws") || "").trim();
  if (direct) return direct;
  return "ws://127.0.0.1:8080/";
}

async function connectStreamerbotOverlayFeed() {
  const wsUrl = await resolveStreamerbotWsUrl();
  if (!wsUrl) return;
  setConnectionBadge("disconnected", "SB Disconnected");

  let ws;
  try {
    ws = new WebSocket(wsUrl);
  } catch {
    setTimeout(connectStreamerbotOverlayFeed, 1500);
    return;
  }

  ws.onopen = () => {
    setConnectionBadge("connected", "SB Connected");
    try {
      ws.send(JSON.stringify({
        request: "Subscribe",
        id: "ad-sb-overlay-sub",
        events: {
          Custom: ["Event"]
        }
      }));
    } catch {}
  };

  ws.onmessage = (ev) => {
    let msg = null;
    try {
      msg = JSON.parse(String(ev.data || ""));
    } catch {
      return;
    }

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

    if (data?.payload && typeof data.payload === "object") {
      applyData(data.payload);
      return;
    }
    const payloadFromJson = tryParseJsonObject(data?.payloadJson);
    if (payloadFromJson && looksLikeOverlayPayload(payloadFromJson)) {
      applyData(payloadFromJson);
      return;
    }
    const argsPayloadFromJson = tryParseJsonObject(data?.args?.payloadJson);
    if (argsPayloadFromJson && looksLikeOverlayPayload(argsPayloadFromJson)) {
      applyData(argsPayloadFromJson);
      return;
    }
    if (data?.args && typeof data.args === "object") {
      applyData(data.args);
      return;
    }
    if (data && typeof data === "object") {
      applyData(data);
    }
  };

  ws.onclose = () => {
    setConnectionBadge("disconnected", "SB Disconnected");
    setTimeout(connectStreamerbotOverlayFeed, 1500);
  };

  ws.onerror = () => {
    setConnectionBadge("disconnected", "SB Disconnected");
  };
}

function connectExtensionOverlayFeed() {
  if (typeof chrome === "undefined" || !chrome.runtime?.connect) return;

  let port;
  try {
    port = chrome.runtime.connect({ name: "overlay-feed" });
  } catch {
    return;
  }
  if (!port) return;

  port.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "AD_SB_OVERLAY_UPDATE" || typeof msg.payload !== "object") return;
    applyData(msg.payload);
  });

  port.onDisconnect.addListener(() => {
    setTimeout(connectExtensionOverlayFeed, 1200);
  });

  try {
    chrome.runtime.sendMessage({ type: "GET_OVERLAY_STATE" }, (res) => {
      const payload = res?.payload;
      if (res?.ok && payload && typeof payload === "object") {
        applyData(payload);
      }
    });
  } catch {}
}

applyData(parseFromUrl());
connectExtensionOverlayFeed();
connectStreamerbotOverlayFeed();
window.addEventListener("resize", () => {
  fitName("leftName");
  fitName("rightName");
});
