/**
 * Structured Debug Logger
 * Responsibility:
 * - collects categorized runtime logs in the service worker
 * - stores logs by day in chrome.storage.local
 * - keeps at most 109 day buckets
 * - returns the latest 10 days by default
 */
(function initLogger(scope) {
  const AD_SB = scope.AD_SB || (scope.AD_SB = {});

  const STORAGE_KEY = "ad_sb_logs_v2";
  const DAYS_TO_KEEP = 109;
  const DEFAULT_DAYS_TO_RETURN = 10;
  const ENTRIES_PER_CHANNEL_PER_DAY = 10;
  const LOCAL_WRITER_ENABLED = true;
  const LOCAL_WRITER_URL = "http://127.0.0.1:8765/log";

  const CHANNELS = [
    "system",
    "events",
    "throws",
    "state",
    "ui",
    "actions",
    "sb",
    "obs",
    "overlay",
    "errors"
  ];

  let logs = { days: {} };
  let saveInFlight = null;
  let saveQueued = false;
  let ready = false;
  let inFlightLoad = null;

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

  function shipToLocalWriter(entry) {
    if (!LOCAL_WRITER_ENABLED) return;
    if (typeof fetch !== "function") return;
    if (!entry || typeof entry !== "object") return;
    fetch(LOCAL_WRITER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    }).catch(() => {
      // keep silent to avoid console noise when local writer is not running
    });
  }

  function makeEmptyDayStore() {
    const out = {};
    for (const c of CHANNELS) out[c] = [];
    return out;
  }

  function ensureRoot() {
    if (!logs || typeof logs !== "object") logs = { days: {} };
    if (!logs.days || typeof logs.days !== "object") logs.days = {};
  }

  function sanitizeData(data) {
    if (data === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(data, (k, v) => {
        if (k === "raw") return "[raw omitted]";
        if (typeof v === "string" && v.length > 500) return `${v.slice(0, 500)}...`;
        return v;
      }));
    } catch {
      return "[unserializable]";
    }
  }

  function dateKeyFromTs(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function getSortedDayKeys() {
    ensureRoot();
    return Object.keys(logs.days).sort();
  }

  function pruneOldDays() {
    const keys = getSortedDayKeys();
    if (keys.length <= DAYS_TO_KEEP) return;
    const removeCount = keys.length - DAYS_TO_KEEP;
    for (let i = 0; i < removeCount; i += 1) {
      delete logs.days[keys[i]];
    }
  }

  function ensureDay(dayKey) {
    ensureRoot();
    if (!logs.days[dayKey] || typeof logs.days[dayKey] !== "object") {
      logs.days[dayKey] = makeEmptyDayStore();
      return;
    }
    for (const c of CHANNELS) {
      if (!Array.isArray(logs.days[dayKey][c])) logs.days[dayKey][c] = [];
    }
  }

  function persistNow() {
    if (saveInFlight) {
      saveQueued = true;
      return;
    }
    saveInFlight = storageSet({ [STORAGE_KEY]: logs })
      .catch((e) => {
        console.error("[Autodarts Modules] logger save failed", e);
      })
      .finally(() => {
        saveInFlight = null;
        if (saveQueued) {
          saveQueued = false;
          persistNow();
        }
      });
  }

  async function init() {
    if (ready) return;
    if (inFlightLoad) {
      await inFlightLoad;
      return;
    }
    inFlightLoad = (async () => {
      logs = { days: {} };
      try {
        const stored = await storageGet(STORAGE_KEY);
        if (stored && typeof stored === "object") {
          logs = { days: {} };
          const days = stored.days && typeof stored.days === "object" ? stored.days : {};
          for (const [dayKey, dayStore] of Object.entries(days)) {
            logs.days[dayKey] = makeEmptyDayStore();
            if (dayStore && typeof dayStore === "object") {
              for (const c of CHANNELS) {
                if (Array.isArray(dayStore[c])) {
                  logs.days[dayKey][c] = dayStore[c].slice(-ENTRIES_PER_CHANNEL_PER_DAY);
                }
              }
            }
          }
          pruneOldDays();
        }
      } catch (e) {
        console.warn("[Autodarts Modules] logger init fallback", e);
      }
      ready = true;
    })();
    await inFlightLoad;
  }

  function write(level, channel, message, data) {
    const ch = CHANNELS.includes(channel) ? channel : "system";
    const now = Date.now();
    const dayKey = dateKeyFromTs(now);
    ensureDay(dayKey);

    const entry = {
      ts: now,
      iso: new Date(now).toISOString(),
      level: String(level || "info"),
      channel: ch,
      message: String(message || ""),
      data: sanitizeData(data)
    };

    const arr = logs.days[dayKey][ch];
    arr.push(entry);
    if (arr.length > ENTRIES_PER_CHANNEL_PER_DAY) {
      logs.days[dayKey][ch] = arr.slice(-ENTRIES_PER_CHANNEL_PER_DAY);
    }

    pruneOldDays();
    persistNow();
    shipToLocalWriter(entry);
    return entry;
  }

  function info(channel, message, data) {
    return write("info", channel, message, data);
  }

  function warn(channel, message, data) {
    return write("warn", channel, message, data);
  }

  function error(channel, message, data) {
    return write("error", channel, message, data);
  }

  function getAll(options = {}) {
    const reqDays = Number(options?.days);
    const daysToReturn = Number.isFinite(reqDays)
      ? Math.max(1, Math.min(DAYS_TO_KEEP, Math.floor(reqDays)))
      : DEFAULT_DAYS_TO_RETURN;

    const sortedKeys = getSortedDayKeys();
    const selectedKeys = sortedKeys.slice(-daysToReturn);
    const out = {};
    for (const dayKey of selectedKeys) {
      out[dayKey] = makeEmptyDayStore();
      for (const c of CHANNELS) {
        out[dayKey][c] = Array.isArray(logs.days[dayKey]?.[c]) ? logs.days[dayKey][c].slice() : [];
      }
    }
    return {
      retentionDays: DAYS_TO_KEEP,
      defaultDaysReturned: DEFAULT_DAYS_TO_RETURN,
      entriesPerChannelPerDay: ENTRIES_PER_CHANNEL_PER_DAY,
      days: out
    };
  }

  async function clearAll() {
    logs = { days: {} };
    saveQueued = false;
    await storageSet({ [STORAGE_KEY]: logs });
  }

  AD_SB.logger = {
    init,
    info,
    warn,
    error,
    getAll,
    clearAll,
    channels: CHANNELS.slice()
  };
})(self);
