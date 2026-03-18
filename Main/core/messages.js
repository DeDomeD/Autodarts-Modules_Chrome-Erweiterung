/**
 * Runtime Message Router
 * Responsibility:
 * - handles popup/API messages (GET/SET settings, tests)
 * - receives Autodarts bridge events
 * - forwards events to Effects/Overlay modules
 */
(function initMessages(scope) {
  const AD_SB = scope.AD_SB || (scope.AD_SB = {});

  let listenersBound = false;
  const lastPlayerNamesByIndex = {};
  let lastActivePlayerIndex = null;
  const websiteThemeCssByTabId = new Map();
  const ACTION_ICON_GRAY = "Main/assets/ICON_grau_16.png";
  const ACTION_ICON_COLOR = "Main/assets/ICON_16.png";

  function logInfo(channel, message, data) {
    try { AD_SB.logger?.info?.(channel, message, data); } catch {}
  }

  function logError(channel, message, data) {
    try { AD_SB.logger?.error?.(channel, message, data); } catch {}
  }

  function readNameFromPlayer(playerObj) {
    if (!playerObj || typeof playerObj !== "object") return "";
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
    return String(cand || "").trim();
  }

  function updatePlayerNameCacheFromState(e) {
    const roots = [e?.raw?.state, e?.raw, e].filter((x) => x && typeof x === "object");
    for (const root of roots) {
      const players = Array.isArray(root?.players) ? root.players : null;
      if (!players) continue;
      for (let i = 0; i < players.length; i += 1) {
        const n = readNameFromPlayer(players[i]);
        if (n) lastPlayerNamesByIndex[i] = n;
      }
    }
  }

  function asValidPlayerIndex(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
    if (n < 0 || n > 15) return null;
    return n;
  }

  function isAutodartsUrl(url) {
    return /^https:\/\/play\.autodarts\.io\/?/i.test(String(url || ""));
  }

  function setActionIconForTab(tabId, isColor) {
    try {
      if (!chrome?.action?.setIcon) return;
      if (!Number.isInteger(tabId)) return;
      const relPath = isColor ? ACTION_ICON_COLOR : ACTION_ICON_GRAY;
      const path = chrome.runtime?.getURL ? chrome.runtime.getURL(relPath) : relPath;
      const details = { tabId, path };
      chrome.action.setIcon(details, () => {
        // Always read lastError to avoid "Unchecked runtime.lastError"
        void chrome.runtime?.lastError;
      });
    } catch {}
  }

  function refreshActionIconByTab(tabId, tabObj) {
    const url = String(tabObj?.url || tabObj?.pendingUrl || "");
    setActionIconForTab(tabId, isAutodartsUrl(url));
  }

  function bindMessageListener() {
    if (listenersBound) return;
    listenersBound = true;

    if (chrome?.tabs?.onRemoved?.addListener) {
      chrome.tabs.onRemoved.addListener((tabId) => {
        websiteThemeCssByTabId.delete(tabId);
      });
    }
    if (chrome?.tabs?.onUpdated?.addListener) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo?.status === "loading") {
          websiteThemeCssByTabId.delete(tabId);
        }
        if (changeInfo?.url || changeInfo?.status === "complete" || changeInfo?.status === "loading") {
          refreshActionIconByTab(tabId, tab);
        }
      });
    }
    if (chrome?.tabs?.onActivated?.addListener) {
      chrome.tabs.onActivated.addListener((activeInfo) => {
        const tabId = activeInfo?.tabId;
        if (!Number.isInteger(tabId) || !chrome?.tabs?.get) return;
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime?.lastError) {
            setActionIconForTab(tabId, false);
            return;
          }
          refreshActionIconByTab(tabId, tab);
        });
      });
    }
    if (chrome?.tabs?.query) {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (chrome.runtime?.lastError) {
          return;
        }
        const tab = Array.isArray(tabs) ? tabs[0] : null;
        if (!tab || !Number.isInteger(tab.id)) {
          return;
        }
        refreshActionIconByTab(tab.id, tab);
      });
    }

    function removeCss(tabId, css) {
      return new Promise((resolve, reject) => {
        try {
          chrome.scripting.removeCSS(
            { target: { tabId }, css },
            () => {
              const err = chrome.runtime?.lastError;
              if (err) reject(err);
              else resolve(true);
            }
          );
        } catch (e) {
          reject(e);
        }
      });
    }

    function insertCss(tabId, css) {
      return new Promise((resolve, reject) => {
        try {
          chrome.scripting.insertCSS(
            { target: { tabId }, css },
            () => {
              const err = chrome.runtime?.lastError;
              if (err) reject(err);
              else resolve(true);
            }
          );
        } catch (e) {
          reject(e);
        }
      });
    }

    async function applyWebsiteThemeCssForTab(tabId, cssText) {
      const nextCss = String(cssText || "");
      const prevCss = websiteThemeCssByTabId.get(tabId) || "";

      if (prevCss && prevCss !== nextCss) {
        try { await removeCss(tabId, prevCss); } catch {}
      }

      if (!nextCss) {
        websiteThemeCssByTabId.delete(tabId);
        return;
      }

      if (prevCss === nextCss) return;
      await insertCss(tabId, nextCss);
      websiteThemeCssByTabId.set(tabId, nextCss);
    }

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      (async () => {
        try {
          const msgType = String(msg?.type || "unknown");
          logInfo("system", "runtime message received", {
            type: msgType,
            tabId: sender?.tab?.id ?? null
          });

          const settings = AD_SB.getSettings();

          if (msg?.type === "GET_SETTINGS") {
            sendResponse({ ok: true, settings });
            return;
          }

          if (msg?.type === "SET_SETTINGS") {
            const updated = await AD_SB.setSettings(msg.settings || {});
            logInfo("system", "settings updated", {
              keys: Object.keys(msg.settings || {})
            });
            sendResponse({ ok: true, settings: updated });
            return;
          }

          if (msg?.type === "SB_TEST") {
            const ok = await AD_SB.connectOnceForTest(settings.sbUrl);
            logInfo("sb", "connection test", { url: settings.sbUrl, ok });
            sendResponse({ ok });
            return;
          }

          if (msg?.type === "GET_SB_STATUS") {
            sendResponse({ ok: true, status: AD_SB.getSBStatus?.() || { state: "unknown" } });
            return;
          }

          if (msg?.type === "OBS_TEST") {
            const ok = await AD_SB.connectOnceForTest(settings.obsUrl);
            logInfo("system", "obs test", { url: settings.obsUrl, ok });
            sendResponse({ ok });
            return;
          }

          if (msg?.type === "GET_OVERLAY_STATE") {
            sendResponse({ ok: true, payload: AD_SB.overlay.getState() });
            return;
          }

          if (msg?.type === "GET_CAPTURED_DATA") {
            sendResponse({ ok: true, payload: AD_SB.capture?.getSnapshot?.() || null });
            return;
          }

          if (msg?.type === "AUTODARTS_TAB_ACTIVE") {
            const tabId = sender?.tab?.id;
            if (Number.isInteger(tabId)) setActionIconForTab(tabId, true);
            sendResponse({ ok: true });
            return;
          }

          if (msg?.type === "CLEAR_CAPTURED_DATA") {
            await AD_SB.capture?.clear?.();
            sendResponse({ ok: true });
            return;
          }

          if (msg?.type === "GET_DEBUG_LOGS") {
            sendResponse({ ok: true, logs: AD_SB.logger?.getAll?.({ days: msg?.days }) || {} });
            return;
          }

          if (msg?.type === "APPLY_WEBSITE_THEME_CSS") {
            const tabId = sender?.tab?.id;
            if (!Number.isInteger(tabId)) {
              sendResponse({ ok: false, error: "no sender tab id" });
              return;
            }
            await applyWebsiteThemeCssForTab(tabId, msg?.css || "");
            sendResponse({ ok: true });
            return;
          }

          if (msg?.type === "CLEAR_DEBUG_LOGS") {
            await AD_SB.logger?.clearAll?.();
            sendResponse({ ok: true });
            return;
          }

          if (msg?.type === "AUTODARTS_EVENT") {
            const e = msg.payload;
            if (!e?.type) {
              sendResponse({ ok: true, skipped: true });
              return;
            }
            AD_SB.capture?.ingestEvent?.(e);

            if (e.type === "throw") {
              logInfo("throws", "throw event", {
                player: e.player ?? null,
                playerName: e.playerName ?? null,
                score: e.score ?? null,
                segment: e.segment ?? null,
                multiplier: e.multiplier ?? null,
                number: e.number ?? null
              });
            } else if (e.type === "state") {
              updatePlayerNameCacheFromState(e);
              const stateIdx = asValidPlayerIndex(e.player);
              if (stateIdx !== null) lastActivePlayerIndex = stateIdx;
              logInfo("state", "state event", {
                matchId: e.matchId ?? null,
                player: e.player ?? null,
                round: e.round ?? null,
                set: e.set ?? null,
                leg: e.leg ?? null,
                turnBusted: !!e.turnBusted,
                gameFinished: !!e.gameFinished,
                winner: e.winner ?? null,
                playerScores: Array.isArray(e.playerScores) ? e.playerScores : null
              });
            } else if (e.type === "event") {
              logInfo("events", "game event", {
                event: e.event ?? "unknown",
                matchId: e.matchId ?? null,
                set: e.set ?? null,
                leg: e.leg ?? null,
                player: e.player ?? null
              });
            }

            if (settings.debugGameEvents && e.type === "throw") {
              const idxFromThrow = asValidPlayerIndex(e.player);
              const idx = lastActivePlayerIndex !== null ? lastActivePlayerIndex : idxFromThrow;
              const pLabel =
                (idx !== null && lastPlayerNamesByIndex[idx])
                  ? lastPlayerNamesByIndex[idx]
                  : (idx !== null ? `Player ${idx + 1}` : "?");
              console.log(
                `throw player=${pLabel} score=${e.score ?? "?"} segment=${e.segment ?? "?"}`
              );
            }

            if (e.type === "throw") AD_SB.effects.handleThrow(e);
            else if (e.type === "state") AD_SB.effects.handleState(e);
            else if (e.type === "event") AD_SB.effects.handleGameEvent(e);

            sendResponse({ ok: true });
            return;
          }

          if (msg?.type === "AUTODARTS_UI_EVENT") {
            logInfo("ui", "ui event", {
              kind: msg?.payload?.kind ?? "unknown"
            });
            AD_SB.capture?.ingestUi?.(msg.payload);

            if (settings.debugGameEvents) {
              const kind = msg?.payload?.kind || "unknown";
              if (kind === "undo_click") {
                console.log("undo");
              } else {
                console.log(`ui event kind="${kind}"`);
              }
            }
            AD_SB.effects.handleUiEvent(msg.payload);
            sendResponse({ ok: true });
            return;
          }

          sendResponse({ ok: false, error: "unknown message" });
        } catch (e) {
          logError("errors", "message handler error", {
            type: msg?.type || null,
            error: String(e?.message || e)
          });
          sendResponse({ ok: false, error: String(e?.message || e) });
        }
      })();

      return true;
    });
  }

  AD_SB.init = async function init() {
    bindMessageListener();
    await AD_SB.logger?.init?.();
    await AD_SB.capture?.init?.();
    AD_SB.overlay.bindRuntimePorts();
    await AD_SB.loadSettings();
    try {
      AD_SB.ensureSBConnection?.();
    } catch (e) {
      logError("errors", "initial streamerbot connect failed", { error: String(e?.message || e) });
    }
    logInfo("system", "service worker initialized", {});
  };
})(self);
