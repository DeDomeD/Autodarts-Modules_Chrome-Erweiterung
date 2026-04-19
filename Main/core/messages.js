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
  /** Verhindert wiederholtes `setIcon` (Netzwerk/Devtools-Spam), wenn sich der Zustand pro Tab nicht ändert. */
  const lastToolbarIconColorByTabId = new Map();
  const ACTION_ICON_GRAY = {
    16: "Main/assets/ICON_grau_16.png",
    32: "Main/assets/ICON_grau_32.png"
  };
  const ACTION_ICON_COLOR = {
    16: "Main/assets/ICON_16.png",
    32: "Main/assets/ICON_32.png"
  };

  /** GET_WLED_PRESETS wird oft gepollt — Mirror nicht bei jedem erfolgreichen Fetch fluten. */
  const lastWledPresetMirrorLogByEndpoint = new Map();

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
    const raw = String(url || "").trim();
    if (!raw || raw.startsWith("chrome://") || raw.startsWith("edge://")) return false;
    try {
      const u = new URL(raw);
      if (u.protocol !== "https:") return false;
      const host = u.hostname.toLowerCase();
      /** z. B. play.autodarts.io oder *.play.autodarts.io (Staging); nicht nur strikter String-Prefix. */
      return host === "play.autodarts.io" || host.endsWith(".play.autodarts.io");
    } catch {
      return /^https:\/\/play\.autodarts\.io\b/i.test(raw);
    }
  }

  const DEFAULT_WEBSITE_API_URL = "https://autodarts-modules-production.up.railway.app";

  function normalizeWebsiteApiUrl(url) {
    return String(url || DEFAULT_WEBSITE_API_URL).trim().replace(/\/+$/, "");
  }

  async function startGoogleAuthFlow(baseUrlRaw) {
    const baseUrl = normalizeWebsiteApiUrl(baseUrlRaw);
    const startUrl = `${baseUrl}/api/auth/google/start?returnTo=${encodeURIComponent("/account.html")}`;
    const accountPrefix = `${baseUrl}/account.html`;

    return new Promise((resolve, reject) => {
      if (!chrome?.tabs?.create || !chrome?.tabs?.onUpdated?.addListener || !chrome?.tabs?.onRemoved?.addListener) {
        reject(new Error("tabs api not available"));
        return;
      }

      let authTabId = null;
      let done = false;

      function finishError(error) {
        if (done) return;
        done = true;
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error || "Google login failed")));
      }

      function finishOk(result) {
        if (done) return;
        done = true;
        cleanup();
        resolve(result);
      }

      function cleanup() {
        try { chrome.tabs.onUpdated.removeListener(handleUpdated); } catch {}
        try { chrome.tabs.onRemoved.removeListener(handleRemoved); } catch {}
      }

      async function handleUpdated(tabId, changeInfo, tab) {
        if (tabId !== authTabId) return;
        const url = String(changeInfo?.url || tab?.url || "");
        if (!url || !url.startsWith(accountPrefix)) return;

        try {
          const parsed = new URL(url);
          const auth = String(parsed.searchParams.get("auth") || "").trim().toLowerCase();
          if (!auth) return;

          if (auth === "success") {
            const token = String(parsed.searchParams.get("token") || "").trim();
            const rawUser = String(parsed.searchParams.get("user") || "").trim();
            let user = null;
            try {
              user = rawUser ? JSON.parse(rawUser) : null;
            } catch {}
            if (!token || !user) {
              finishError(new Error("Google login returned incomplete account data"));
              return;
            }
            await AD_SB.setSettings({
              websiteApiUrl: baseUrl,
              accountToken: token,
              accountUserJson: JSON.stringify(user)
            });
            try { chrome.tabs.remove(tabId, () => void chrome.runtime?.lastError); } catch {}
            finishOk({ ok: true, token, user });
            return;
          }

          const error = String(parsed.searchParams.get("error") || "Google login failed");
          try { chrome.tabs.remove(tabId, () => void chrome.runtime?.lastError); } catch {}
          finishError(new Error(error));
        } catch (e) {
          finishError(e);
        }
      }

      function handleRemoved(tabId) {
        if (tabId !== authTabId || done) return;
        finishError(new Error("Google login tab was closed"));
      }

      chrome.tabs.onUpdated.addListener(handleUpdated);
      chrome.tabs.onRemoved.addListener(handleRemoved);
      chrome.tabs.create({ url: startUrl, active: true }, (tab) => {
        const err = chrome.runtime?.lastError;
        if (err) {
          finishError(new Error(String(err.message || err)));
          return;
        }
        authTabId = tab?.id ?? null;
        if (!Number.isInteger(authTabId)) {
          finishError(new Error("Could not open Google login tab"));
        }
      });
    });
  }

  function setActionIconForTab(tabId, isColor) {
    try {
      if (!chrome?.action?.setIcon) return;
      if (!Number.isInteger(tabId)) return;
      if (lastToolbarIconColorByTabId.get(tabId) === isColor) return;
      const path = isColor ? ACTION_ICON_COLOR : ACTION_ICON_GRAY;
      const runtimePath = chrome.runtime?.getURL
        ? {
            16: chrome.runtime.getURL(path[16]),
            32: chrome.runtime.getURL(path[32])
          }
        : null;
      const variants = [{ tabId, path }];
      if (runtimePath) variants.push({ tabId, path: runtimePath });

      let idx = 0;
      const tryNext = () => {
        if (idx >= variants.length) {
          lastToolbarIconColorByTabId.delete(tabId);
          return;
        }
        const details = variants[idx];
        idx += 1;
        chrome.action.setIcon(details, () => {
          const err = chrome.runtime?.lastError;
          if (err) {
            tryNext();
            return;
          }
          lastToolbarIconColorByTabId.set(tabId, isColor);
        });
      };
      tryNext();
    } catch {}
  }

  function refreshActionIconByTab(tabId, tabObj) {
    const directUrl = String(tabObj?.url || tabObj?.pendingUrl || "");
    if (directUrl) {
      setActionIconForTab(tabId, isAutodartsUrl(directUrl));
      return;
    }
    if (!chrome?.tabs?.get || !Number.isInteger(tabId)) {
      setActionIconForTab(tabId, false);
      return;
    }
    chrome.tabs.get(tabId, (resolvedTab) => {
      const err = chrome.runtime?.lastError;
      if (err) {
        setActionIconForTab(tabId, false);
        return;
      }
      const resolvedUrl = String(resolvedTab?.url || resolvedTab?.pendingUrl || "");
      setActionIconForTab(tabId, isAutodartsUrl(resolvedUrl));
    });
  }

  /**
   * Öffnet DevTools für den eigenen MV3-Service-Worker (Target.openDevTools über Browser-Target).
   * Fallback: chrome://inspect → chrome://extensions (jeweils neuer Tab).
   */
  async function openExtensionServiceWorkerDevTools() {
    const extId = chrome.runtime.id;
    const tryOpenUrl = (url) =>
      new Promise((resolve) => {
        if (!chrome.tabs?.create) {
          resolve(false);
          return;
        }
        chrome.tabs.create({ url, active: true }, () => {
          resolve(!chrome.runtime.lastError);
        });
      });

    let targets = [];
    if (chrome.debugger?.getTargets) {
      try {
        targets = await chrome.debugger.getTargets();
      } catch {
        targets = [];
      }
    }

    const prefix = `chrome-extension://${extId}/`;
    const swTarget =
      targets.find(
        (t) =>
          typeof t.url === "string" &&
          t.url.startsWith(prefix) &&
          (String(t.type || "").toLowerCase() === "service_worker" ||
            t.type === "worker" ||
            t.type === "background_page")
      ) || targets.find((t) => typeof t.url === "string" && t.url.startsWith(prefix));

    let browserTarget = targets.find((t) => String(t.type || "").toLowerCase() === "browser");
    if (!browserTarget) {
      browserTarget = targets.find(
        (t) => String(t.type || "").toLowerCase() === "tab" && String(t.url || "").startsWith("chrome://")
      );
    }

    if (swTarget?.id && browserTarget?.id && chrome.debugger?.attach && chrome.debugger?.sendCommand) {
      try {
        await chrome.debugger.attach({ targetId: browserTarget.id }, "1.3");
        try {
          await chrome.debugger.sendCommand(
            { targetId: browserTarget.id },
            "Target.openDevTools",
            { targetId: swTarget.id, panelId: "console" }
          );
          return { ok: true, method: "openDevTools" };
        } catch (e) {
          logInfo("system", "Target.openDevTools failed", { error: String(e?.message || e) });
        } finally {
          try {
            await chrome.debugger.detach({ targetId: browserTarget.id });
          } catch {}
        }
      } catch (e) {
        logInfo("system", "debugger attach (browser) failed", { error: String(e?.message || e) });
      }
    }

    if (await tryOpenUrl("chrome://inspect/#workers")) {
      return { ok: true, method: "inspect_workers" };
    }
    if (await tryOpenUrl("chrome://inspect/#service-workers")) {
      return { ok: true, method: "inspect_service_workers" };
    }
    if (await tryOpenUrl(`chrome://extensions/?id=${encodeURIComponent(extId)}`)) {
      return { ok: true, method: "extensions" };
    }
    return { ok: false, error: "no_tab_opened" };
  }

  function bindMessageListener() {
    if (listenersBound) return;
    listenersBound = true;

    if (chrome?.tabs?.onRemoved?.addListener) {
      chrome.tabs.onRemoved.addListener((tabId) => {
        websiteThemeCssByTabId.delete(tabId);
        lastToolbarIconColorByTabId.delete(tabId);
      });
    }
    if (chrome?.tabs?.onUpdated?.addListener) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo?.status === "loading") {
          websiteThemeCssByTabId.delete(tabId);
        }
        // Nur bei URL-Wechsel oder abgeschlossenem Load — nicht bei jedem `loading`-Tick (weniger setIcon-Aufrufe).
        if (changeInfo?.url || changeInfo?.status === "complete") {
          const tabLike = (changeInfo?.url || tab?.url || tab?.pendingUrl)
            ? { ...(tab || {}), url: changeInfo?.url || tab?.url || tab?.pendingUrl }
            : tab;
          refreshActionIconByTab(tabId, tabLike);
        }
      });
    }
    if (chrome?.tabs?.onCreated?.addListener) {
      chrome.tabs.onCreated.addListener((tab) => {
        const tabId = tab?.id;
        if (!Number.isInteger(tabId)) return;
        refreshActionIconByTab(tabId, tab);
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
      const refreshFocusedTabIcon = () => {
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
      };
      refreshFocusedTabIcon();
      /** Nach TAB/Fenster-Wechsel (MV3-SW neu): Icon neu an aktive URL koppeln. */
      if (chrome?.windows?.onFocusChanged?.addListener) {
        chrome.windows.onFocusChanged.addListener((windowId) => {
          if (windowId === chrome.windows.WINDOW_ID_NONE) return;
          refreshFocusedTabIcon();
        });
      }
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
          const settings = AD_SB.getSettings();

          if (msg?.type === "OPEN_SERVICE_WORKER_DEVTOOLS") {
            const result = await openExtensionServiceWorkerDevTools();
            sendResponse(result);
            return;
          }

          if (msg?.type === "GET_WORKER_MIRROR_DELTA") {
            const afterId = Number(msg?.afterId);
            const snap = AD_SB.workerMirrorLog?.getSince?.(Number.isFinite(afterId) ? afterId : -1);
            sendResponse({ ok: true, ...(snap || { lines: [], lastId: -1, truncated: false }) });
            return;
          }

          if (msg?.type === "CLEAR_WORKER_MIRROR_LOG") {
            AD_SB.workerMirrorLog?.clear?.();
            sendResponse({ ok: true });
            return;
          }

          if (msg?.type === "GET_SETTINGS") {
            sendResponse({ ok: true, settings });
            return;
          }

          if (msg?.type === "SET_SETTINGS") {
            const updated = await AD_SB.setSettings(msg.settings || {});
            AD_SB.refreshRuntimeConnections?.();
            try {
              AD_SB.overlay?.afterSettingsSaved?.();
            } catch {}
            logInfo("system", "settings updated", {
              keys: Object.keys(msg.settings || {})
            });
            sendResponse({ ok: true, settings: updated });
            return;
          }

          if (msg?.type === "SB_TEST") {
            const ok = await AD_SB.connectOnceForTest(settings.sbUrl, settings.sbPassword);
            logInfo("sb", "connection test", { url: settings.sbUrl, ok });
            sendResponse({ ok });
            return;
          }

          if (msg?.type === "GET_SB_STATUS") {
            sendResponse({ ok: true, status: AD_SB.getSBStatus?.() || { state: "unknown" } });
            return;
          }

          if (msg?.type === "SB_GET_ACTIONS") {
            const r = await AD_SB.requestGetActions?.(Number(msg?.timeoutMs) || 4000);
            if (r?.ok) {
              sendResponse({ ok: true, actions: Array.isArray(r.actions) ? r.actions : [] });
            } else {
              sendResponse({ ok: false, error: String(r?.error || "sb_get_actions_failed"), actions: [] });
            }
            return;
          }

          if (msg?.type === "GET_OBS_STATUS") {
            sendResponse({ ok: true, status: AD_SB.getObsStatus?.() || { state: "unknown" } });
            return;
          }

          if (msg?.type === "START_GOOGLE_AUTH") {
            const result = await startGoogleAuthFlow(msg?.baseUrl || settings.websiteApiUrl);
            sendResponse({ ok: true, ...result, settings: AD_SB.getSettings() });
            return;
          }

          if (msg?.type === "OBS_TEST") {
            const ok = await AD_SB.retryObsConnection?.();
            logInfo("system", "obs test", { url: settings.obsUrl, ok });
            sendResponse({ ok });
            return;
          }

          if (msg?.type === "SB_RETRY") {
            AD_SB.retrySBConnection?.();
            sendResponse({ ok: true });
            return;
          }

          if (msg?.type === "OBS_RETRY") {
            const ok = await AD_SB.retryObsConnection?.();
            sendResponse({ ok: !!ok });
            return;
          }

          if (msg?.type === "OBS_GET_SCENES") {
            const scenes = await AD_SB.getObsScenes?.();
            sendResponse({ ok: true, scenes });
            return;
          }

          if (msg?.type === "OBS_GET_SCENE_SOURCES") {
            const sources = await AD_SB.getObsSceneSources?.(msg?.sceneName);
            sendResponse({ ok: true, sources });
            return;
          }

          if (msg?.type === "OBS_CREATE_MOVE_FILTERS") {
            const result = await AD_SB.createObsMoveFilters?.(msg?.sceneName, msg?.sourceName, {
              mode: msg?.mode,
              duration: msg?.duration,
              easing: msg?.easing,
              easingFunction: msg?.easingFunction,
              includeSingles: msg?.includeSingles,
              includeDoubles: msg?.includeDoubles,
              includeTriples: msg?.includeTriples
            });
            sendResponse({ ok: true, ...result });
            return;
          }

          if (msg?.type === "OBS_GET_SOURCE_SCREENSHOT") {
            try {
              const prog = msg?.mode === "program" || msg?.canvas === true;
              const shot = prog
                ? await AD_SB.getObsProgramCanvasScreenshot?.({
                    ...msg?.options,
                    fallbackSceneName: settings?.obsZoomSceneName
                  })
                : await AD_SB.getObsSourceScreenshot?.(msg?.sourceName, msg?.options || {});
              sendResponse({ ok: true, ...shot });
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e || "obs_get_source_screenshot_failed") });
            }
            return;
          }

          if (msg?.type === "OBS_GET_VIDEO_BASE") {
            try {
              const dims = await AD_SB.getObsVideoBaseResolution?.();
              sendResponse({ ok: true, ...dims });
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e || "obs_get_video_base_failed") });
            }
            return;
          }

          if (msg?.type === "OBS_GET_ZOOM_CALIB_PLACEMENT") {
            try {
              const placement = await AD_SB.getObsZoomCalibPlacement?.(msg?.payload || {});
              sendResponse({ ok: true, ...placement });
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e || "obs_get_zoom_calib_placement_failed") });
            }
            return;
          }

          if (msg?.type === "OBS_APPLY_ZOOM_CALIBRATION") {
            try {
              const result = await AD_SB.applyObsZoomCalibration?.(msg?.payload || {});
              sendResponse({ ok: true, ...result });
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e || "obs_apply_zoom_calibration_failed") });
            }
            return;
          }

          if (msg?.type === "OBS_DELETE_MOVE_FILTERS") {
            const result = await AD_SB.deleteObsMoveFilters?.(msg?.sceneName, {
              includeSingles: msg?.includeSingles,
              includeDoubles: msg?.includeDoubles,
              includeTriples: msg?.includeTriples
            });
            sendResponse({ ok: true, ...result });
            return;
          }

          if (msg?.type === "OBS_EXPORT_MOVE_FILTER_BACKUP") {
            const result = await AD_SB.getObsMoveFilterBackup?.(msg?.sceneName);
            sendResponse({ ok: true, ...result });
            return;
          }

          if (msg?.type === "OBS_IMPORT_MOVE_FILTER_BACKUP") {
            const result = await AD_SB.importObsMoveFilterBackup?.(msg?.backup);
            sendResponse({ ok: true, ...result });
            return;
          }

          if (msg?.type === "OBS_ZOOM_TRIGGER_TEST") {
            const result = await AD_SB.obsZoom?.triggerTestInput?.(msg?.trigger, msg?.payload || {});
            sendResponse({ ok: !!result?.ok, ...(result || {}) });
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

          if (msg?.type === "GET_WLED_PRESETS") {
            try {
              const presets = await AD_SB.wled?.fetchPresets?.(msg?.endpoint);
              const epKey = String(msg?.endpoint || "").trim() || "?";
              const cnt = Array.isArray(presets) ? presets.length : 0;
              const now = Date.now();
              const prevLog = lastWledPresetMirrorLogByEndpoint.get(epKey);
              const shouldMirrorLog = !prevLog || prevLog.count !== cnt || (now - prevLog.ts) > 60000;
              if (shouldMirrorLog) {
                logInfo("wled", "presets loaded", {
                  endpoint: msg?.endpoint || "",
                  count: cnt
                });
                lastWledPresetMirrorLogByEndpoint.set(epKey, { ts: now, count: cnt });
                try {
                  AD_SB.workerModuleStatusLog?.wled?.(true, msg?.endpoint);
                } catch {
                  // ignore
                }
              }
              sendResponse({ ok: true, presets: Array.isArray(presets) ? presets : [] });
              return;
            } catch (e) {
              try {
                AD_SB.workerModuleStatusLog?.wled?.(false, msg?.endpoint);
              } catch {
                // ignore
              }
              logError("wled", "presets fetch failed", {
                endpoint: msg?.endpoint || "",
                error: String(e?.message || e)
              });
              sendResponse({ ok: false, error: String(e?.message || e), presets: [] });
              return;
            }
          }

          if (msg?.type === "TRIGGER_WLED_PRESET") {
            try {
              await AD_SB.wled?.triggerPreset?.(msg?.endpoint, msg?.presetId);
              logInfo("wled", "preset trigger requested", {
                endpoint: msg?.endpoint || "",
                presetId: msg?.presetId ?? null
              });
              sendResponse({ ok: true });
              return;
            } catch (e) {
              try {
                AD_SB.workerModuleStatusLog?.wled?.(false, msg?.endpoint);
              } catch {
                // ignore
              }
              logError("wled", "preset trigger failed", {
                endpoint: msg?.endpoint || "",
                presetId: msg?.presetId ?? null,
                error: String(e?.message || e)
              });
              sendResponse({ ok: false, error: String(e?.message || e) });
              return;
            }
          }

          if (msg?.type === "TRIGGER_WLED_TARGETS") {
            try {
              await AD_SB.wled?.triggerTargets?.(msg?.targets, settings, msg?.advancedJson || "");
              const lm = msg?.wledLogMeta;
              if (lm && typeof lm === "object") {
                try {
                  AD_SB.triggerWorkerLog?.printAdmWledEffectLine?.({
                    effectName: String(lm.effectName || "").trim() || "WLED",
                    triggerUnit: String(lm.triggerUnit || "").trim() || "Test",
                    presetSummary: String(lm.presetSummary || "").trim() || "—"
                  });
                } catch {
                  // ignore
                }
              }
              sendResponse({ ok: true });
              return;
            } catch (e) {
              logError("wled", "wled targets trigger failed", {
                error: String(e?.message || e)
              });
              sendResponse({ ok: false, error: String(e?.message || e) });
              return;
            }
          }

          if (msg?.type === "GET_PIXELIT_MATRIXINFO") {
            try {
              const info = await AD_SB.pixelit?.fetchMatrixInfo?.(msg?.endpoint || settings?.pixelitBaseUrl);
              logInfo("pixelit", "matrixinfo ok", {
                endpoint: String(msg?.endpoint || settings?.pixelitBaseUrl || "").trim()
              });
              sendResponse({ ok: true, info: info && typeof info === "object" ? info : {} });
              return;
            } catch (e) {
              logError("pixelit", "matrixinfo failed", {
                endpoint: String(msg?.endpoint || settings?.pixelitBaseUrl || "").trim(),
                error: String(e?.message || e)
              });
              sendResponse({ ok: false, error: String(e?.message || e), info: null });
              return;
            }
          }

          if (msg?.type === "TRIGGER_PIXELIT_TEST") {
            try {
              const endpoint = String(msg?.endpoint || settings?.pixelitBaseUrl || "").trim();
              const text = String(msg?.text || "ADM").trim().slice(0, 120) || "ADM";
              const body = {
                switchAnimation: { aktiv: true, animation: "fade" },
                text: {
                  textString: text,
                  bigFont: text.length <= 6,
                  scrollText: text.length > 6 ? "auto" : false,
                  scrollTextDelay: 45,
                  centerText: true,
                  position: { x: 8, y: 1 },
                  hexColor: "#FFFFFF"
                }
              };
              await AD_SB.pixelit?.postScreen?.(endpoint, body);
              logInfo("pixelit", "test screen sent", { endpoint });
              sendResponse({ ok: true });
              return;
            } catch (e) {
              logError("pixelit", "test screen failed", {
                error: String(e?.message || e)
              });
              sendResponse({ ok: false, error: String(e?.message || e) });
              return;
            }
          }

          if (msg?.type === "AUTODARTS_TAB_ACTIVE") {
            const tabId = sender?.tab?.id;
            /**
             * Content-Script ist nur auf https://play.autodarts.io/* registriert — keine URL-Prüfung:
             * `sender.tab.url` ist während Laden oft `about:blank` / veraltet, dann blieb das Icon grau.
             */
            if (Number.isInteger(tabId)) {
              setActionIconForTab(tabId, true);
            }
            sendResponse({ ok: true });
            return;
          }

          if (msg?.type === "AUTODARTS_NAVIGATION") {
            AD_SB.admTriggers?.handleNavigation?.(msg.payload);
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
            if (e?.type === "match_context") {
              AD_SB.applyMatchContextFromPage?.(e);
              sendResponse({ ok: true });
              return;
            }
            if (!e?.type) {
              sendResponse({ ok: true, skipped: true });
              return;
            }
            AD_SB.capture?.ingestEvent?.(e);

            const logGame = true;
            const logThrow = logGame;
            const logState = logGame;
            const logBoardEv = logGame;
            if (e.type === "throw") {
              if (logThrow) {
                logInfo("throws", "throw event", {
                  player: e.player ?? null,
                  playerName: e.playerName ?? null,
                  score: e.score ?? null,
                  segment: e.segment ?? null,
                  multiplier: e.multiplier ?? null,
                  number: e.number ?? null
                });
              }
            } else if (e.type === "state") {
              updatePlayerNameCacheFromState(e);
              const stateIdx = asValidPlayerIndex(e.player);
              if (stateIdx !== null) lastActivePlayerIndex = stateIdx;
              if (logState) {
                logInfo("state", "state event", {
                  matchId: e.matchId ?? null,
                  player: e.player ?? null,
                  round: e.round ?? null,
                  set: e.set ?? null,
                  leg: e.leg ?? null,
                  turnBusted: !!e.turnBusted,
                  gameFinished: !!e.gameFinished,
                  winner: e.winner ?? null,
                  checkoutGuide: e.checkoutGuide ?? null,
                  playerScores: Array.isArray(e.playerScores) ? e.playerScores : null
                });
              }
            } else if (e.type === "event") {
              if (logBoardEv) {
                logInfo("events", "game event", {
                  event: e.event ?? "unknown",
                  matchId: e.matchId ?? null,
                  set: e.set ?? null,
                  leg: e.leg ?? null,
                  player: e.player ?? null
                });
              }
            }

            if (e.type === "throw") AD_SB.admTriggers?.handleThrow?.(e);
            else if (e.type === "state") AD_SB.admTriggers?.handleState?.(e);
            else if (e.type === "event") AD_SB.admTriggers?.handleGameEvent?.(e);

            sendResponse({ ok: true });
            return;
          }

          if (msg?.type === "AUTODARTS_UI_EVENT") {
            logInfo("ui", "ui event", {
              kind: msg?.payload?.kind ?? "unknown"
            });
            AD_SB.capture?.ingestUi?.(msg.payload);

            AD_SB.admTriggers?.handleUiEvent?.(msg.payload);
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
      AD_SB.refreshRuntimeConnections?.();
    } catch (e) {
      logError("errors", "initial connection refresh failed", { error: String(e?.message || e) });
    }
    logInfo("system", "service worker initialized", {});
    try {
      AD_SB.workerModuleStatusLog?.extensionReady?.();
    } catch {
      // ignore
    }
  };
})(self);
