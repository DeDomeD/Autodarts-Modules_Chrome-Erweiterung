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

function ensureConnectionBadge() {
  if (connectionBadge) return connectionBadge;
  const el = document.createElement("div");
  el.id = "connectionBadge";
  el.className = "connBadge disconnected";
  el.textContent = "Extension Disconnected";
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

function connectExtensionOverlayFeed() {
  if (typeof chrome === "undefined" || !chrome.runtime?.connect) return;

  let port;
  try {
    port = chrome.runtime.connect({ name: "overlay-feed" });
  } catch {
    return;
  }
  if (!port) return;
  setConnectionBadge("connected", "Extension Connected");

  port.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "AD_SB_OVERLAY_UPDATE" || typeof msg.payload !== "object") return;
    applyData(msg.payload);
  });

  port.onDisconnect.addListener(() => {
    setConnectionBadge("disconnected", "Extension Disconnected");
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
window.addEventListener("resize", () => {
  fitName("leftName");
  fitName("rightName");
});
