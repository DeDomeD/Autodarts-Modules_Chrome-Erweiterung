/**
 * Lobby-Filter (play.autodarts.io/lobbies)
 * DOM-Logik angelehnt an Greasyfork „Namesuche und Blackliste“ (Chakra-Karten, Spielernamen).
 */
(() => {
  const STYLE_ID = "ad-sb-lobbyfilter-style";
  const BAR_ID = "ad-sb-lobbyfilter-bar";
  const COUNTER_ID = "ad-sb-lobbyfilter-counter";
  const SEARCH_ID = "ad-sb-lobbyfilter-search";

  let STATE = {
    enabled: false,
    searchText: "",
    blacklist: [],
    highlightBlacklist: true
  };

  let debounceTimer = null;
  let mo = null;

  function isLobbyListPage() {
    const p = String(location.pathname || "").replace(/\/+$/, "") || "/";
    return p === "/lobbies";
  }

  function normalizeSettings(settings) {
    const s = settings || {};
    let blacklist = [];
    try {
      const raw = JSON.parse(String(s.lobbyFilterBlacklistJson || "[]"));
      if (Array.isArray(raw)) {
        blacklist = raw
          .map((x) => String(x || "").trim().toLowerCase())
          .filter(Boolean);
      }
    } catch {
      blacklist = [];
    }
    return {
      enabled: !!s.lobbyFilterEnabled,
      searchText: String(s.lobbyFilterSearchText || "").trim(),
      blacklist,
      highlightBlacklist: s.lobbyFilterHighlightBlacklist !== false
    };
  }

  /** Wie im Userscript: echte Spielernamen vs. Badges */
  function isPlayerName(text) {
    const t = String(text || "").trim();
    if (!t || t.length < 2 || t.length > 50) return false;
    if (/^[\d\s.\-+/()°%]+$/.test(t)) return false;
    if (/^\d+\+?$/.test(t)) return false;
    return true;
  }

  function getAllPlayerNameCandidates(root) {
    const base = root || document;
    let els = Array.from(base.querySelectorAll("span.ad-ext-player-name p"));
    if (els.length === 0) {
      els = Array.from(base.querySelectorAll(".chakra-card p.chakra-text"));
    }
    if (els.length === 0) {
      els = Array.from(base.querySelectorAll("span.ad-ext-player-name"));
    }
    return [...new Set(els)].filter((el) => isPlayerName(el.textContent.trim()));
  }

  function cardHasLobbyLink(card) {
    const link = card.querySelector('a[href*="/lobbies/"]');
    if (!link) return false;
    return /\/lobbies\/[a-f0-9-]{36}/i.test(String(link.getAttribute("href") || ""));
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .ad-sb-lf-card-hidden {
        display: none !important;
      }
      span.ad-ext-player-name p.ad-sb-lf-bl,
      .chakra-card p.ad-sb-lf-bl {
        color: #ff5c5c !important;
        font-weight: 700 !important;
      }
      #${BAR_ID} {
        position: sticky;
        top: 0;
        z-index: 2147483000;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        margin: 0 0 12px 0;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,.12);
        background:
          radial-gradient(circle at top right, rgba(25,199,255,.16), transparent 35%),
          linear-gradient(180deg, rgba(10,16,26,.94), rgba(14,20,32,.92));
        color: #eaf1ff;
        font-family: system-ui, "Segoe UI", sans-serif;
        font-size: 13px;
        box-shadow: 0 12px 40px rgba(0,0,0,.28);
        backdrop-filter: blur(14px);
      }
      #${BAR_ID}[hidden] { display: none !important; }
      #${BAR_ID} .ad-sb-lf-kicker {
        font-size: 10px;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: rgba(234,241,255,.55);
        width: 100%;
        margin: 0 0 2px 0;
      }
      #${BAR_ID} input[type="search"] {
        flex: 1;
        min-width: 140px;
        max-width: 420px;
        padding: 8px 12px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.06);
        color: #eaf1ff;
        outline: none;
      }
      #${BAR_ID} input[type="search"]::placeholder {
        color: rgba(234,241,255,.45);
      }
      #${COUNTER_ID} {
        font-variant-numeric: tabular-nums;
        color: rgba(234,241,255,.85);
        white-space: nowrap;
      }
      #${COUNTER_ID} .ad-sb-lf-num { color: #68d391; font-weight: 700; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureBar() {
    if (!isLobbyListPage() || !STATE.enabled) {
      const old = document.getElementById(BAR_ID);
      if (old) old.remove();
      return;
    }
    injectStyle();
    let bar = document.getElementById(BAR_ID);
    if (bar) return;
    const main =
      document.querySelector("main") ||
      document.querySelector('[role="main"]') ||
      document.body;
    if (!main) return;

    bar = document.createElement("div");
    bar.id = BAR_ID;
    bar.setAttribute("data-ad-sb-lobbyfilter", "1");
    bar.innerHTML = `
      <div class="ad-sb-lf-kicker">Autodarts Modules · Lobby-Filter</div>
      <input type="search" id="${SEARCH_ID}" placeholder="Namen suchen …" autocomplete="off" spellcheck="false" />
      <span id="${COUNTER_ID}"></span>
    `;
    const first = main.firstElementChild;
    if (first) main.insertBefore(bar, first);
    else main.appendChild(bar);

    const input = bar.querySelector(`#${SEARCH_ID}`);
    if (input) {
      input.value = STATE.searchText;
      input.addEventListener(
        "input",
        () => {
          STATE.searchText = String(input.value || "").trim();
          try {
            chrome.storage.local.get(["settings"], (items) => {
              const settings = { ...(items?.settings || {}), lobbyFilterSearchText: STATE.searchText };
              chrome.storage.local.set({ settings }, () => void chrome.runtime?.lastError);
            });
          } catch {
            /* ignore */
          }
          scheduleApply();
        },
        { passive: true }
      );
    }
  }

  function nameMatchesBlacklist(playerName, blacklist) {
    const lo = String(playerName || "").trim().toLowerCase();
    if (!lo) return false;
    return blacklist.some((entry) => entry && lo.includes(entry));
  }

  function applyNameHighlights() {
    document.querySelectorAll(".ad-sb-lf-bl").forEach((el) => {
      el.classList.remove("ad-sb-lf-bl");
    });
    if (!STATE.highlightBlacklist || !STATE.blacklist.length) return;

    getAllPlayerNameCandidates(document).forEach((el) => {
      const t = el.textContent.trim();
      if (nameMatchesBlacklist(t, STATE.blacklist)) el.classList.add("ad-sb-lf-bl");
    });
  }

  function applyFilters() {
    if (!isLobbyListPage() || !STATE.enabled) {
      document.querySelectorAll(".ad-sb-lf-card-hidden").forEach((c) => {
        c.classList.remove("ad-sb-lf-card-hidden");
      });
      document.querySelectorAll(".ad-sb-lf-bl").forEach((el) => el.classList.remove("ad-sb-lf-bl"));
      document.getElementById(BAR_ID)?.remove();
      return;
    }

    ensureBar();
    const cards = document.querySelectorAll(".chakra-card");
    const searchLower = STATE.searchText.toLowerCase();
    let shown = 0;
    let total = 0;

    cards.forEach((card) => {
      if (!cardHasLobbyLink(card)) {
        card.classList.remove("ad-sb-lf-card-hidden");
        return;
      }

      const playerList = card.querySelector("ul.css-k1urot");
      if (playerList && playerList.children.length === 0) {
        card.classList.add("ad-sb-lf-card-hidden");
        return;
      }

      total += 1;
      let show = true;

      const nameEls = getAllPlayerNameCandidates(card);
      const names = nameEls.map((el) => el.textContent.trim());

      if (STATE.blacklist.length) {
        if (names.some((n) => nameMatchesBlacklist(n, STATE.blacklist))) show = false;
      }

      if (show && searchLower) {
        let found = names.some((n) => n.toLowerCase().includes(searchLower));
        if (!found) {
          found = card.innerHTML.toLowerCase().includes(searchLower);
        }
        if (!found) show = false;
      }

      card.classList.toggle("ad-sb-lf-card-hidden", !show);
      if (show) shown += 1;
    });

    applyNameHighlights();

    const counter = document.getElementById(COUNTER_ID);
    if (counter) {
      if (total === 0) {
        counter.textContent = "";
      } else {
        counter.innerHTML = `<span class="ad-sb-lf-num">${shown}</span> / ${total} sichtbar`;
      }
    }
  }

  function scheduleApply() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      applyFilters();
    }, 80);
  }

  function syncSearchInputFromState() {
    const inp = document.getElementById(SEARCH_ID);
    if (!inp || document.activeElement === inp) return;
    if (inp.value !== STATE.searchText) inp.value = STATE.searchText;
  }

  function loadFromStorageAndRun() {
    try {
      if (!chrome?.storage?.local) return;
      chrome.storage.local.get(["settings"], (items) => {
        STATE = normalizeSettings(items?.settings);
        syncSearchInputFromState();
        applyFilters();
      });
    } catch {
      /* ignore */
    }
  }

  function bindStorageWatcher() {
    if (!chrome?.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.settings?.newValue) return;
      STATE = normalizeSettings(changes.settings.newValue);
      syncSearchInputFromState();
      scheduleApply();
    });
  }

  function bindObserver() {
    if (mo) return;
    mo = new MutationObserver(() => scheduleApply());
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  function onRoute() {
    scheduleApply();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadFromStorageAndRun, { once: true });
  } else {
    loadFromStorageAndRun();
  }

  bindStorageWatcher();
  bindObserver();

  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      onRoute();
    }
  }, 500);

  window.addEventListener("popstate", onRoute);
  window.addEventListener("pageshow", scheduleApply);
})();
