/**
 * Autodarts Data Capture
 * Responsibility:
 * - stores normalized + raw-capture samples from injected page events
 * - derives reusable field paths
 * - persists snapshot in chrome.storage.local
 */
(function initDataCapture(scope) {
  const AD_SB = scope.AD_SB || (scope.AD_SB = {});

  const STORAGE_KEY = "ad_sb_data_capture_v1";
  const SAMPLE_LIMIT = 30;
  const PATH_LIMIT = 1200;
  const MAX_DEPTH = 6;

  let state = null;
  let saveTimer = null;
  let ready = false;
  let inFlight = null;

  function nowIso() {
    return new Date().toISOString();
  }

  function makeEmpty() {
    return {
      version: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      counters: {
        total: 0,
        throw: 0,
        state: 0,
        event: 0,
        ui: 0,
        capture: 0
      },
      samples: {
        throw: [],
        state: [],
        event: [],
        ui: [],
        capture: []
      },
      fieldPaths: {
        throw: [],
        state: [],
        event: [],
        ui: [],
        capture: [],
        stateRaw: [],
        eventRaw: [],
        captureRaw: []
      }
    };
  }

  function storageGet(key) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome?.storage?.local) return reject(new Error("chrome.storage.local not available"));
        chrome.storage.local.get([key], (items) => {
          const err = chrome.runtime?.lastError;
          if (err) reject(err);
          else resolve(items?.[key]);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageSet(items) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome?.storage?.local) return reject(new Error("chrome.storage.local not available"));
        chrome.storage.local.set(items, () => {
          const err = chrome.runtime?.lastError;
          if (err) reject(err);
          else resolve(true);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function sanitize(obj) {
    if (obj === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(obj, (k, v) => {
        if (typeof v === "string" && v.length > 500) return `${v.slice(0, 500)}...`;
        return v;
      }));
    } catch {
      return "[unserializable]";
    }
  }

  function clipArray(arr, max = SAMPLE_LIMIT) {
    if (!Array.isArray(arr)) return [];
    return arr.length <= max ? arr : arr.slice(arr.length - max);
  }

  function ensure() {
    if (!state || typeof state !== "object") state = makeEmpty();
    if (!state.counters || typeof state.counters !== "object") state.counters = makeEmpty().counters;
    if (!state.samples || typeof state.samples !== "object") state.samples = makeEmpty().samples;
    if (!state.fieldPaths || typeof state.fieldPaths !== "object") state.fieldPaths = makeEmpty().fieldPaths;
  }

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      try {
        await storageSet({ [STORAGE_KEY]: state });
      } catch (e) {
        console.error("[Autodarts Modules] capture save failed", e);
      }
    }, 900);
  }

  async function init() {
    if (ready) return;
    if (inFlight) {
      await inFlight;
      return;
    }
    inFlight = (async () => {
      state = makeEmpty();
      try {
        const stored = await storageGet(STORAGE_KEY);
        if (stored && typeof stored === "object") {
          state = stored;
          ensure();
          for (const k of Object.keys(state.samples)) {
            state.samples[k] = clipArray(state.samples[k]);
          }
          for (const k of Object.keys(state.fieldPaths)) {
            state.fieldPaths[k] = Array.isArray(state.fieldPaths[k])
              ? state.fieldPaths[k].slice(0, PATH_LIMIT)
              : [];
          }
        }
      } catch {}
      ready = true;
    })();
    await inFlight;
  }

  function collectPaths(value, prefix = "", out = new Set(), depth = 0) {
    if (depth > MAX_DEPTH) return out;
    if (value === null || value === undefined) {
      if (prefix) out.add(prefix);
      return out;
    }

    const t = typeof value;
    if (t !== "object") {
      if (prefix) out.add(prefix);
      return out;
    }

    if (Array.isArray(value)) {
      const arrPath = prefix ? `${prefix}[]` : "[]";
      out.add(arrPath);
      if (value.length > 0) {
        collectPaths(value[0], arrPath, out, depth + 1);
      }
      return out;
    }

    const keys = Object.keys(value).slice(0, 120);
    if (keys.length === 0 && prefix) out.add(prefix);
    for (const key of keys) {
      const next = prefix ? `${prefix}.${key}` : key;
      out.add(next);
      collectPaths(value[key], next, out, depth + 1);
    }
    return out;
  }

  function mergePaths(bucketName, obj) {
    const bucket = Array.isArray(state.fieldPaths[bucketName]) ? state.fieldPaths[bucketName] : [];
    const current = new Set(bucket);
    const next = collectPaths(obj);
    for (const p of next) current.add(p);
    state.fieldPaths[bucketName] = Array.from(current).sort().slice(0, PATH_LIMIT);
  }

  function pushSample(kind, payload) {
    if (!Array.isArray(state.samples[kind])) state.samples[kind] = [];
    state.samples[kind].push({
      ts: Date.now(),
      iso: nowIso(),
      data: sanitize(payload)
    });
    state.samples[kind] = clipArray(state.samples[kind], SAMPLE_LIMIT);
  }

  function ingestEvent(evt) {
    ensure();
    if (!evt || typeof evt !== "object") return;

    const type = String(evt.type || "unknown");
    if (!Object.prototype.hasOwnProperty.call(state.counters, type)) {
      state.counters[type] = 0;
    }

    state.counters.total += 1;
    state.counters[type] += 1;
    state.updatedAt = nowIso();

    if (type === "throw") {
      pushSample("throw", evt);
      mergePaths("throw", evt);
    } else if (type === "state") {
      pushSample("state", evt);
      mergePaths("state", evt);
      mergePaths("stateRaw", evt.raw);
    } else if (type === "event") {
      pushSample("event", evt);
      mergePaths("event", evt);
      mergePaths("eventRaw", evt.raw);
    } else if (type === "capture") {
      pushSample("capture", evt);
      mergePaths("capture", evt);
      mergePaths("captureRaw", evt.raw);
    } else if (type === "ui") {
      pushSample("ui", evt);
      mergePaths("ui", evt);
    }

    scheduleSave();
  }

  function ingestUi(payload) {
    ingestEvent({
      type: "ui",
      ts: Date.now(),
      payload: payload || {}
    });
  }

  function getSnapshot() {
    ensure();
    return sanitize(state);
  }

  async function clear() {
    state = makeEmpty();
    await storageSet({ [STORAGE_KEY]: state });
  }

  AD_SB.capture = {
    init,
    ingestEvent,
    ingestUi,
    getSnapshot,
    clear
  };
})(self);
