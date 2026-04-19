/**
 * PDC-Style Overlay — Extension-Port, URL, postMessage.
 * nameScheme: pdcOfficial (Standard, PDC-TV-Petrol) | blueOrange | blueRed | redBlue
 * pdcOfficial: Glow über Einstellungen pdcGlowHue (0–360), pdcGlowIntensity (0–100).
 * showCheckout, leftCheckout / rightCheckout (aktiver Spieler für Checkout-Säule).
 */
const state = {
  leftName: "PLAYER 1",
  rightName: "PLAYER 2",
  leftScore: 220,
  rightScore: 265,
  firstTo: 3,
  leftSets: 0,
  rightSets: 0,
  leftLegs: 0,
  rightLegs: 0,
  footerLine: "PDC WORLD SERIES",
  activePlayer: 1,
  leftCheckout: "",
  rightCheckout: "T20 / T19 / D18",
  leftFlagUrl: "",
  rightFlagUrl: "",
  /** pdcOfficial = aktuelles PDC-TV-Paket (Petrol/Teal); legacy: blueOrange | blueRed | redBlue */
  nameScheme: "pdcOfficial",
  nameBarFollowTurn: true,
  showCheckout: true,
  /** auto: Bubbles zur Seite des Spielers am Zug | left | right */
  checkoutSide: "auto",
  /** Nur data-name-scheme=pdcOfficial: Glow-Farbton 0–360 */
  pdcGlowHue: 172,
  /** 0–100: Glow-Intensität */
  pdcGlowIntensity: 100
};

const STATE_KEYS = [
  "leftName",
  "rightName",
  "leftScore",
  "rightScore",
  "firstTo",
  "leftSets",
  "rightSets",
  "leftLegs",
  "rightLegs",
  "footerLine",
  "activePlayer",
  "leftCheckout",
  "rightCheckout",
  "leftFlagUrl",
  "rightFlagUrl",
  "nameScheme",
  "nameBarFollowTurn",
  "showCheckout",
  "checkoutSide",
  "pdcGlowHue",
  "pdcGlowIntensity"
];

let connectionBadge = null;
let connectionHideTimer = null;

/** Für TV-Animationen (Score-Tick, Zug-Puls) — nicht im State serialisiert */
let lastScore = { left: NaN, right: NaN };
let lastActivePlayer = null;

function pulseScore(elId) {
  const el = $(elId);
  if (!el) return;
  el.classList.remove("pdcScoreVal--tick");
  void el.offsetWidth;
  el.classList.add("pdcScoreVal--tick");
  clearTimeout(el._pdcScoreTickT);
  el._pdcScoreTickT = setTimeout(() => el.classList.remove("pdcScoreVal--tick"), 460);
}

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function asInt(v, fallback) {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function asBool(v, fallback) {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return fallback;
}

function clampHue(v, fallback = 172) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const x = Math.round(n) % 360;
  return x < 0 ? x + 360 : x;
}

function clampIntensity(v, fallback = 100) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Setzt --pdc-glow-h / --pdc-glow-k für Petrol-Glow (nur pdcOfficial) */
function applyPdcGlowCssVars(scheme) {
  const card = $("liveOverlay");
  if (!card) return;
  if (scheme !== "pdcOfficial") {
    card.style.removeProperty("--pdc-glow-h");
    card.style.removeProperty("--pdc-glow-k");
    return;
  }
  const h = clampHue(state.pdcGlowHue, 172);
  const k = clampIntensity(state.pdcGlowIntensity, 100) / 100;
  card.style.setProperty("--pdc-glow-h", String(h));
  card.style.setProperty("--pdc-glow-k", String(k));
}

function parseFromUrl() {
  const p = new URLSearchParams(window.location.search);
  const out = {};
  for (const [k, v] of p.entries()) out[k] = v;
  if (out.pdcGlowHue !== undefined) out.pdcGlowHue = Number(out.pdcGlowHue);
  if (out.pdcGlowIntensity !== undefined) out.pdcGlowIntensity = Number(out.pdcGlowIntensity);
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

function renderFlag(elId, value) {
  const el = $(elId);
  if (!el) return;
  const v = String(value || "").trim();
  el.innerHTML = "";
  el.classList.toggle("hidden", !v);
  if (!v) return;
  if (/^https?:\/\//i.test(v) || v.startsWith("//") || v.startsWith("data:")) {
    const img = document.createElement("img");
    img.src = v;
    img.alt = "";
    img.className = "pdcFlagImg";
    img.referrerPolicy = "no-referrer";
    img.decoding = "async";
    el.appendChild(img);
  } else {
    el.textContent = v;
  }
}

function fitName(sel) {
  const el = typeof sel === "string" ? $(sel) : sel;
  if (!el) return;
  const max = 22;
  const min = 11;
  let size = max;
  el.style.fontSize = `${size}px`;
  while (size > min && el.scrollWidth > el.clientWidth) {
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
}

function setTurnIndicators() {
  const ap = state.activePlayer;

  const card = $("liveOverlay");
  if (card) {
    card.classList.toggle("pdcCard--followTurn", !!state.nameBarFollowTurn);
    const cellL = $("nameCellLeft");
    const cellR = $("nameCellRight");
    if (state.nameBarFollowTurn) {
      cellL?.classList.toggle("pdcNameCard--throwing", ap === 0);
      cellR?.classList.toggle("pdcNameCard--throwing", ap === 1);
    } else {
      cellL?.classList.remove("pdcNameCard--throwing");
      cellR?.classList.remove("pdcNameCard--throwing");
    }
  }

  $("leftSets")?.classList.toggle("isActiveTurn", ap === 0);
  $("rightSets")?.classList.toggle("isActiveTurn", ap === 1);
  $("leftLegs")?.classList.toggle("isActiveTurn", ap === 0);
  $("rightLegs")?.classList.toggle("isActiveTurn", ap === 1);

  $("ringGlowLeft")?.classList.toggle("isTurn", ap === 0);
  $("ringGlowRight")?.classList.toggle("isTurn", ap === 1);

  const hadPlayers =
    (lastActivePlayer === 0 || lastActivePlayer === 1) && (ap === 0 || ap === 1);
  const turnSwitched = hadPlayers && lastActivePlayer !== ap;
  if (turnSwitched) {
    const g = ap === 0 ? $("ringGlowLeft") : $("ringGlowRight");
    if (g) {
      g.classList.remove("pdcRingGlow--tick");
      void g.offsetWidth;
      g.classList.add("pdcRingGlow--tick");
      clearTimeout(g._pdcRingTickT);
      g._pdcRingTickT = setTimeout(() => g.classList.remove("pdcRingGlow--tick"), 520);
    }
  }
  lastActivePlayer = ap;
}

function getCheckoutSide() {
  const s = String(state.checkoutSide || "auto").toLowerCase();
  if (s === "left" || s === "l") return "left";
  if (s === "right" || s === "r") return "right";
  if (state.activePlayer === 0) return "left";
  return "right";
}

function renderCheckout() {
  const col = $("checkoutCol");
  if (!col) return;
  const show = asBool(state.showCheckout, true);
  const ap = state.activePlayer;
  const raw =
    ap === 0
      ? state.leftCheckout
      : ap === 1
        ? state.rightCheckout
        : state.rightCheckout || state.leftCheckout;
  const parts = checkoutParts(raw);
  const any = parts.some((p) => p.length > 0);
  if (!show || !any) {
    col.classList.add("hidden");
    return;
  }
  col.classList.remove("hidden");

  const side = getCheckoutSide();
  col.classList.toggle("pdcCheckout--left", side === "left");
  col.classList.toggle("pdcCheckout--right", side !== "left");

  for (let i = 0; i < 3; i += 1) {
    const t = String(parts[i] || "").trim();
    setText(`chk${i + 1}`, t);
    $(`bubble${i + 1}`)?.classList.toggle("hidden", !t);
  }
}

function render() {
  const card = $("liveOverlay");
  let scheme = "pdcOfficial";
  if (card) {
    const s = String(state.nameScheme || "pdcOfficial").toLowerCase();
    if (s === "redblue" || s === "flip" || s === "rl") scheme = "redBlue";
    else if (s === "bluered") scheme = "blueRed";
    else if (s === "blueorange" || s === "pdc" || s === "legacy") scheme = "blueOrange";
    else if (s === "pdcofficial" || s === "official" || s === "pdctv" || s === "itv") scheme = "pdcOfficial";
    card.dataset.nameScheme = scheme;
  }
  applyPdcGlowCssVars(scheme);

  setText("leftName", state.leftName);
  setText("rightName", state.rightName);

  const ls = asInt(state.leftScore, 0);
  const rs = asInt(state.rightScore, 0);
  setText("leftScore", ls);
  setText("rightScore", rs);
  if (Number.isFinite(lastScore.left) && lastScore.left !== ls) pulseScore("leftScore");
  if (Number.isFinite(lastScore.right) && lastScore.right !== rs) pulseScore("rightScore");
  lastScore = { left: ls, right: rs };
  setText("leftSets", state.leftSets);
  setText("rightSets", state.rightSets);
  setText("leftLegs", state.leftLegs);
  setText("rightLegs", state.rightLegs);

  const ft = Math.max(1, asInt(state.firstTo, 3));
  setText("firstToLine", `FIRST TO ${ft}`);

  const foot = $("footerLine");
  if (foot) {
    const t = String(state.footerLine || "").trim();
    foot.textContent = t;
    foot.style.display = t ? "" : "none";
  }

  renderFlag("leftFlagEl", state.leftFlagUrl);
  renderFlag("rightFlagEl", state.rightFlagUrl);

  setTurnIndicators();
  renderCheckout();
  fitName("leftName");
  fitName("rightName");
}

/** URL: ?dock=br (oder pos=br) = unten rechts; ohne Parameter = mittig im Browser/OBS-Quelle */
function applyDockMode() {
  const q = parseFromUrl();
  const root = $("overlayRoot");
  if (!root) return;
  const dock = String(q.dock || q.pos || "").toLowerCase();
  if (dock === "br" || dock === "se" || dock === "bottom-right") {
    root.classList.add("overlayWrap--br");
  } else {
    root.classList.remove("overlayWrap--br");
  }
}

function applyData(raw) {
  if (!raw || typeof raw !== "object") return;

  const next = { ...state };

  if (Object.prototype.hasOwnProperty.call(raw, "visitClear") && raw.visitClear === true) {
    next.leftCheckout = "";
    next.rightCheckout = "";
  }

  const pick = (key, transform) => {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) return;
    const v = raw[key];
    next[key] = transform ? transform(v) : v;
  };

  pick("leftName", (v) => String(v ?? ""));
  pick("rightName", (v) => String(v ?? ""));
  pick("leftScore", (v) => asInt(v, next.leftScore));
  pick("rightScore", (v) => asInt(v, next.rightScore));
  pick("firstTo", (v) => Math.max(1, asInt(v, next.firstTo)));
  pick("leftSets", (v) => asInt(v, next.leftSets));
  pick("rightSets", (v) => asInt(v, next.rightSets));
  pick("leftLegs", (v) => asInt(v, next.leftLegs));
  pick("rightLegs", (v) => asInt(v, next.rightLegs));
  pick("footerLine", (v) => String(v ?? ""));
  pick("leftCheckout", (v) => (typeof v === "string" ? v : next.leftCheckout));
  pick("rightCheckout", (v) => (typeof v === "string" ? v : next.rightCheckout));
  pick("leftFlagUrl", (v) => String(v ?? ""));
  pick("rightFlagUrl", (v) => String(v ?? ""));
  pick("nameScheme", (v) => {
    const s = String(v || "").toLowerCase();
    if (s === "redblue" || s === "flip" || s === "rl") return "redBlue";
    if (s === "bluered") return "blueRed";
    if (s === "blueorange" || s === "pdc" || s === "legacy") return "blueOrange";
    if (s === "pdcofficial" || s === "official" || s === "pdctv" || s === "itv") return "pdcOfficial";
    return "pdcOfficial";
  });
  pick("nameBarFollowTurn", (v) => asBool(v, next.nameBarFollowTurn));
  pick("showCheckout", (v) => asBool(v, next.showCheckout));
  pick("checkoutSide", (v) => {
    const s = String(v ?? "").trim().toLowerCase();
    if (s === "left" || s === "l") return "left";
    if (s === "right" || s === "r") return "right";
    return "auto";
  });
  pick("pdcGlowHue", (v) => clampHue(v, next.pdcGlowHue));
  pick("pdcGlowIntensity", (v) => clampIntensity(v, next.pdcGlowIntensity));

  if (Object.prototype.hasOwnProperty.call(raw, "tournamentLine") && !Object.prototype.hasOwnProperty.call(raw, "footerLine")) {
    next.footerLine = String(raw.tournamentLine ?? "");
  }

  if (Object.prototype.hasOwnProperty.call(raw, "activePlayer")) {
    const n = asInt(raw.activePlayer, -1);
    next.activePlayer = n === 0 || n === 1 ? n : null;
  }

  STATE_KEYS.forEach((k) => {
    state[k] = next[k];
  });

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
  } catch {
    /* ignore */
  }
}

applyDockMode();
applyData(parseFromUrl());
connectExtensionOverlayFeed();
window.addEventListener("resize", () => {
  fitName("leftName");
  fitName("rightName");
});
