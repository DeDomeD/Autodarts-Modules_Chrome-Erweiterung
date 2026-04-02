/**
 * Content Bridge (Autodarts Seite -> Extension)
 * Verantwortung:
 * - injiziert `Main/core/pageScript.js` auf Match-Seiten
 * - leitet normalisierte Events ans Background-Script weiter
 * - erkennt Undo-Klicks als UI-Event fuer Korrektur-Trigger
 */
console.log("[Autodarts Modules] content.js loaded");

let pageScriptInjected = false;
let lastKnownHref = String(location.href || "");

function isMatchPage() {
  const path = String(location.pathname || "").toLowerCase();
  return path.includes("/matches");
}

function safeSend(msg) {
  try {
    chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError);
  } catch {
    // ignore when extension context is unavailable
  }
}

function pingAutodartsTabActive() {
  safeSend({ type: "AUTODARTS_TAB_ACTIVE" });
}

function injectPageScriptOnce() {
  if (pageScriptInjected) return;
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("Main/core/pageScript.js");
    s.type = "text/javascript";
    (document.documentElement || document.head).appendChild(s);
    s.onload = () => s.remove();
    pageScriptInjected = true;
    console.log("[Autodarts Modules] pageScript injected");
  } catch (e) {
    console.error("[Autodarts Modules] inject failed", e);
  }
}

function ensureBridge() {
  // Always inject as early as possible so we never miss early WS/app init.
  injectPageScriptOnce();
}

function checkRouteChangeAndBridge() {
  const href = String(location.href || "");
  if (href === lastKnownHref) return;
  let previousPathname = "";
  try {
    previousPathname = new URL(lastKnownHref).pathname || "";
  } catch {
    previousPathname = "";
  }
  const pathname = String(location.pathname || "");
  lastKnownHref = href;
  ensureBridge();
  pingAutodartsTabActive();
  safeSend({
    type: "AUTODARTS_NAVIGATION",
    payload: {
      href,
      pathname,
      previousPathname,
      ts: Date.now()
    }
  });
}

function isUndoButton(btn) {
  if (!btn) return false;

  const text = (btn.innerText || "").trim().toLowerCase();
  const aria = (btn.getAttribute("aria-label") || "").trim().toLowerCase();
  const title = (btn.getAttribute("title") || "").trim().toLowerCase();
  const dataTest = (btn.getAttribute("data-testid") || "").trim().toLowerCase();
  const name = (btn.getAttribute("name") || "").trim().toLowerCase();
  const hay = [text, aria, title, dataTest, name].join(" | ");

  if (
    hay.includes("undo") ||
    hay.includes("rueckgaengig") ||
    hay.includes("rueck") ||
    hay.includes("zurueck") ||
    hay.includes("ruckgangig") ||
    hay.includes("zuruck") ||
    hay.includes("revert") ||
    hay.includes("back")
  ) return true;

  const cls = (btn.className || "").toString().toLowerCase();
  return !!(btn.querySelector("svg") && (cls.includes("undo") || cls.includes("revert") || cls.includes("back")));
}

function getButtonLabel(btn) {
  if (!btn) return "";
  const candidates = [
    btn.getAttribute?.("data-testid"),
    btn.getAttribute?.("aria-label"),
    btn.getAttribute?.("title"),
    btn.getAttribute?.("name"),
    btn.innerText,
    btn.textContent
  ];
  for (const value of candidates) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return "";
}

window.addEventListener("click", (ev) => {
  if (!isMatchPage()) return;

  const target = ev.target;
  if (!target?.closest) return;
  const btn = target.closest("button, [role='button']");
  if (!btn) return;

  const buttonLabel = getButtonLabel(btn);
  safeSend({
    type: "AUTODARTS_UI_EVENT",
    payload: { kind: "button_press", label: buttonLabel, ts: Date.now() }
  });

  if (isUndoButton(btn)) {
    safeSend({
      type: "AUTODARTS_UI_EVENT",
      payload: { kind: "undo_click", label: buttonLabel || "Undo", ts: Date.now() }
    });
  }
}, true);

window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  const msg = event.data;
  if (!msg || msg.__AD_SB__ !== true) return;

  safeSend({
    type: "AUTODARTS_EVENT",
    payload: msg.payload
  });
});

// SPA-Navigation in Autodarts abfangen, damit die Bridge bei Route-Wechseln aktiv bleibt
const nativePushState = history.pushState.bind(history);
history.pushState = function patchedPushState() {
  const out = nativePushState.apply(history, arguments);
  checkRouteChangeAndBridge();
  ensureBridge();
  return out;
};

const nativeReplaceState = history.replaceState.bind(history);
history.replaceState = function patchedReplaceState() {
  const out = nativeReplaceState.apply(history, arguments);
  checkRouteChangeAndBridge();
  ensureBridge();
  return out;
};

window.addEventListener("popstate", () => {
  checkRouteChangeAndBridge();
  ensureBridge();
});
window.addEventListener("hashchange", () => {
  checkRouteChangeAndBridge();
  ensureBridge();
});
window.addEventListener("focus", () => {
  checkRouteChangeAndBridge();
  ensureBridge();
  pingAutodartsTabActive();
});
window.addEventListener("pageshow", () => {
  checkRouteChangeAndBridge();
  ensureBridge();
  pingAutodartsTabActive();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") pingAutodartsTabActive();
});

setInterval(checkRouteChangeAndBridge, 700);

ensureBridge();
pingAutodartsTabActive();
