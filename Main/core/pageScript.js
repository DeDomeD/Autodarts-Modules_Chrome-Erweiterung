/**
 * In-Page Patch für Autodarts WebSocket Events
 * Verantwortung:
 * - hängt sich in WebSocket-Messages ein
 * - normalisiert Rohdaten zu `throw` / `state` / `event`
 * - sendet normalisierte Daten per `window.postMessage` an `content.js`
 */
(() => {
  if (window.__AD_SB_PATCHED__) return;
  window.__AD_SB_PATCHED__ = true;

  console.log("[Autodarts Modules] pageScript patch active");

  const NativeWS = window.WebSocket;
  const NativeFetch = window.fetch ? window.fetch.bind(window) : null;
  const NativeXHR = window.XMLHttpRequest;
  const NativeEventSource = window.EventSource;
  let lastCustomEventSig = "";
  let lastCustomEventAt = 0;
  let lastCaptureSig = "";
  let lastCaptureAt = 0;

  function post(payload) {
    window.postMessage({ __AD_SB__: true, payload }, "*");
  }

  function safeShallowKeys(obj) {
    if (!obj || typeof obj !== "object") return [];
    try {
      return Object.keys(obj).slice(0, 80);
    } catch {
      return [];
    }
  }

  function postCapture(source, payload, meta = {}) {
    const sig = JSON.stringify({
      source,
      t: meta?.topic ?? "",
      u: meta?.url ?? "",
      s: meta?.status ?? "",
      k: meta?.payloadKeys ?? meta?.detailKeys ?? [],
      r: meta?.reason ?? ""
    });
    const now = Date.now();
    if (sig === lastCaptureSig && (now - lastCaptureAt) < 200) return;
    lastCaptureSig = sig;
    lastCaptureAt = now;

    post({
      type: "capture",
      ts: Date.now(),
      source,
      meta,
      raw: payload
    });
  }

  function clipForCapture(value, depth = 0) {
    if (depth > 4) return "[max_depth]";
    if (value === null || value === undefined) return value;
    const t = typeof value;
    if (t === "string") return value.length > 500 ? `${value.slice(0, 500)}...` : value;
    if (t === "number" || t === "boolean") return value;
    if (t !== "object") return String(value);

    if (Array.isArray(value)) {
      return value.slice(0, 20).map((v) => clipForCapture(v, depth + 1));
    }

    const out = {};
    const keys = Object.keys(value).slice(0, 60);
    for (const k of keys) out[k] = clipForCapture(value[k], depth + 1);
    return out;
  }

  function shouldCaptureUrl(urlRaw) {
    const url = String(urlRaw || "").toLowerCase();
    if (!url) return false;
    if (url.includes("autodarts")) return true;
    return (
      url.includes("match") ||
      url.includes("game") ||
      url.includes("state") ||
      url.includes("throw") ||
      url.includes("event")
    );
  }

  function tryParseJsonText(text) {
    if (typeof text !== "string") return null;
    const src = text.trim();
    if (!src) return null;
    try {
      return JSON.parse(src);
    } catch {
      return null;
    }
  }

  function shouldDropCustomDuplicate(kind, payload) {
    const sig = JSON.stringify({
      kind,
      t: payload?.type,
      e: payload?.event,
      m: payload?.matchId,
      p: payload?.player,
      r: payload?.round,
      s: payload?.set,
      l: payload?.leg
    });
    const now = Date.now();
    if (sig === lastCustomEventSig && (now - lastCustomEventAt) < 120) return true;
    lastCustomEventSig = sig;
    lastCustomEventAt = now;
    return false;
  }

  function getNestedObjectCandidates(value) {
    if (!value || typeof value !== "object") return [];
    const out = [value];
    const nestedKeys = ["data", "payload", "body", "detail", "event", "state", "message"];
    for (const key of nestedKeys) {
      const child = value?.[key];
      if (child && typeof child === "object") out.push(child);
    }
    return out;
  }

  function pickFirstValue(candidates) {
    for (const value of candidates) {
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return null;
  }

  function findNestedValueByKeys(root, keys, maxDepth = 4) {
    if (!root || typeof root !== "object") return null;
    const wanted = new Set((Array.isArray(keys) ? keys : [keys]).map((key) => String(key || "").toLowerCase()));
    const queue = [{ value: root, depth: 0 }];
    const seen = new Set();

    while (queue.length > 0) {
      const current = queue.shift();
      const value = current?.value;
      const depth = Number(current?.depth || 0);
      if (!value || typeof value !== "object" || depth > maxDepth) continue;
      if (seen.has(value)) continue;
      seen.add(value);

      for (const [key, child] of Object.entries(value)) {
        const normalizedKey = String(key || "").toLowerCase();
        if (wanted.has(normalizedKey) && child !== undefined && child !== null && child !== "") {
          return child;
        }
        if (child && typeof child === "object") {
          queue.push({ value: child, depth: depth + 1 });
        }
      }
    }
    return null;
  }

  function parseWinnerReference(rawWinner, roots = []) {
    if (rawWinner === undefined || rawWinner === null || rawWinner === "") return null;

    const directNum = Number(rawWinner);
    if (Number.isFinite(directNum) && Number.isInteger(directNum) && directNum >= 0 && directNum <= 15) {
      return directNum;
    }

    const objectCandidates = [rawWinner, ...roots].filter((x) => x && typeof x === "object");
    for (const source of objectCandidates) {
      if (!source || typeof source !== "object") continue;
      const nestedIndex = pickFirstValue([
        source?.index,
        source?.playerIndex,
        source?.winnerIndex,
        source?.id
      ]);
      const idx = Number(nestedIndex);
      if (Number.isFinite(idx) && Number.isInteger(idx) && idx >= 0 && idx <= 15) {
        return idx;
      }
    }

    const winnerName = String(
      typeof rawWinner === "string"
        ? rawWinner
        : (
          rawWinner?.name ??
          rawWinner?.displayName ??
          rawWinner?.username ??
          rawWinner?.playerName ??
          ""
        )
    ).trim().toLowerCase();
    if (!winnerName) return null;

    for (const root of roots) {
      const playerGroups = [
        Array.isArray(root?.players) ? root.players : null,
        Array.isArray(root?.participants) ? root.participants : null,
        Array.isArray(root?.competitors) ? root.competitors : null
      ].filter(Array.isArray);
      for (const players of playerGroups) {
        for (let i = 0; i < players.length; i += 1) {
          const player = players[i];
          if (!player || typeof player !== "object") continue;
          const playerName = String(
            player.name ??
            player.displayName ??
            player.username ??
            player.playerName ??
            player.user?.name ??
            ""
          ).trim().toLowerCase();
          if (playerName && playerName === winnerName) return i;
        }
      }
    }

    return null;
  }

  // Game-Event normalisieren (inkl. robustem Segment/Score Fallback)
  function normalizeGameEvent(gameEventData) {
    if (!gameEventData || typeof gameEventData !== "object") return null;

    const root = gameEventData?.data && typeof gameEventData.data === "object"
      ? gameEventData.data
      : gameEventData;
    const rootCandidates = getNestedObjectCandidates(root);
    const rootPrimary = rootCandidates[0] || root;
    const body = pickFirstValue(rootCandidates.map((candidate) => (
      candidate?.body && typeof candidate.body === "object" ? candidate.body : null
    ))) || rootPrimary;
    const bodyCandidates = getNestedObjectCandidates(body);

    const evNameRaw = pickFirstValue([
      rootPrimary?.event,
      rootPrimary?.type,
      rootPrimary?.eventType,
      rootPrimary?.action,
      rootPrimary?.actionType,
      rootPrimary?.name,
      body?.event,
      body?.type,
      body?.eventType,
      body?.action,
      body?.actionType,
      body?.name,
      findNestedValueByKeys(rootPrimary, ["event", "eventType", "action", "actionType", "name", "type"])
    ]);
    const evName = String(evNameRaw || "").toLowerCase();

    const seg = pickFirstValue([
      body?.segment,
      body?.dart?.segment,
      rootPrimary?.segment,
      findNestedValueByKeys(body, ["segment"]),
      findNestedValueByKeys(rootPrimary, ["segment"])
    ]);

    const segName = typeof seg === "string" ? seg : (seg?.name ?? null);
    let mult = Number.isFinite(Number(seg?.multiplier)) ? Number(seg.multiplier) : null;
    let num = Number.isFinite(Number(seg?.number)) ? Number(seg.number) : null;
    const bed = seg?.bed ?? body?.bed ?? null;
    const coords = body?.coords ?? root?.coords ?? null;
    const matchId = pickFirstValue([
      rootPrimary?.matchId,
      rootPrimary?.id,
      body?.matchId,
      body?.id,
      findNestedValueByKeys(rootPrimary, ["matchId", "match_id", "id"])
    ]);
    const round = pickFirstValue([
      body?.round,
      rootPrimary?.round,
      findNestedValueByKeys(rootPrimary, ["round", "roundNumber"])
    ]);
    const set = pickFirstValue([
      body?.set,
      rootPrimary?.set,
      findNestedValueByKeys(rootPrimary, ["set", "setNumber", "currentSet"])
    ]);
    const leg = pickFirstValue([
      body?.leg,
      rootPrimary?.leg,
      findNestedValueByKeys(rootPrimary, ["leg", "legNumber", "currentLeg"])
    ]);

    const looksLikeThrow =
      evName.includes("throw") ||
      evName.includes("dart") ||
      !!segName ||
      Number.isFinite(mult) ||
      Number.isFinite(num) ||
      !!body?.dart ||
      !!coords;

    if (looksLikeThrow) {
      if ((!Number.isFinite(mult) || !Number.isFinite(num)) && typeof segName === "string") {
        const s = segName.trim().toUpperCase();
        if (/^T([1-9]|1\d|20)$/.test(s)) {
          mult = 3;
          num = Number(s.slice(1));
        } else if (/^D([1-9]|1\d|20|25)$/.test(s)) {
          mult = 2;
          num = Number(s.slice(1));
        } else if (/^S([1-9]|1\d|20|25)$/.test(s)) {
          mult = 1;
          num = Number(s.slice(1));
        } else if (/^(?:[1-9]|1\d|20)$/.test(s)) {
          mult = 1;
          num = Number(s);
        } else if (s === "BULL") {
          mult = 1;
          num = 25;
        } else if (s === "DBULL") {
          mult = 2;
          num = 25;
        } else if (/^M(?:ISS)?\d*$/.test(s) || s === "MISS") {
          mult = 0;
          num = 0;
        }
      }

      let score = Number.isFinite(Number(body?.score)) ? Number(body.score) : null;
      if (!Number.isFinite(score) && Number.isFinite(mult) && Number.isFinite(num)) {
        score = mult * num;
      }

      if (!Number.isFinite(score) && typeof segName === "string") {
        if (/^m\d{1,2}$/i.test(segName) || /^miss$/i.test(segName)) score = 0;
        else if (/^bull$/i.test(segName)) score = 25;
        else if (/^dbull$/i.test(segName)) score = 50;
      }
      if (!Number.isFinite(score)) return null;

      const playerRaw = pickFirstValue([
        body?.playerIndex,
        body?.player,
        body?.currentPlayer,
        body?.thrower,
        rootPrimary?.playerIndex,
        rootPrimary?.player,
        rootPrimary?.currentPlayer,
        rootPrimary?.thrower,
        findNestedValueByKeys(rootPrimary, ["playerIndex", "currentPlayerIndex", "activePlayerIndex", "player", "thrower"])
      ]);
      const playerNameRaw =
        pickFirstValue([
          body?.playerName,
          body?.name,
          body?.displayName,
          body?.username,
          body?.player?.name,
          body?.user?.name,
          rootPrimary?.playerName,
          rootPrimary?.name,
          rootPrimary?.displayName,
          rootPrimary?.username,
          findNestedValueByKeys(rootPrimary, ["playerName", "winnerName", "displayName", "username", "name"])
        ]);
      let player = null;
      let playerName = null;
      const playerNum = Number(playerRaw);
      if (Number.isFinite(playerNum) && Number.isInteger(playerNum) && playerNum >= 0 && playerNum <= 15) {
        player = playerNum;
      } else if (playerRaw && typeof playerRaw === "object") {
        const nestedPlayerNum = Number(
          pickFirstValue([playerRaw.index, playerRaw.playerIndex, playerRaw.id])
        );
        if (Number.isFinite(nestedPlayerNum) && Number.isInteger(nestedPlayerNum) && nestedPlayerNum >= 0 && nestedPlayerNum <= 15) {
          player = nestedPlayerNum;
        }
        const nestedPlayerName = String(
          pickFirstValue([playerRaw.name, playerRaw.displayName, playerRaw.username, playerRaw.playerName]) || ""
        ).trim();
        if (nestedPlayerName) playerName = nestedPlayerName;
      } else if (typeof playerRaw === "string") {
        const p = playerRaw.trim();
        const pl = p.toLowerCase();
        if (pl === "left") player = 0;
        else if (pl === "right") player = 1;
        else if (p) playerName = p;
      }

      if (!playerName && typeof playerNameRaw === "string") {
        const pn = playerNameRaw.trim();
        if (pn) playerName = pn;
      }

      if (!playerName && typeof playerRaw === "string") {
        const p = playerRaw.trim().toLowerCase();
        if (p === "left") player = 0;
        else if (p === "right") player = 1;
      }

      return {
        type: "throw",
        ts: Date.now(),
        matchId,
        round,
        set,
        leg,
        score,
        player,
        playerName,
        segment: segName,
        bed,
        multiplier: mult,
        number: num,
        coords
      };
    }

    return {
      type: "event",
      ts: Date.now(),
      matchId,
      round,
      set,
      leg,
      player: parseWinnerReference(
        pickFirstValue([
          body?.playerIndex,
          body?.player,
          rootPrimary?.playerIndex,
          rootPrimary?.player
        ]),
        [...rootCandidates, ...bodyCandidates]
      ),
      playerName: String(
        pickFirstValue([
          body?.playerName,
          body?.name,
          body?.displayName,
          rootPrimary?.playerName,
          rootPrimary?.name,
          rootPrimary?.displayName
        ]) || ""
      ).trim() || null,
      winner: parseWinnerReference(
        pickFirstValue([
          body?.winner,
          body?.winnerIndex,
          body?.winnerPlayer,
          rootPrimary?.winner,
          rootPrimary?.winnerIndex,
          findNestedValueByKeys(rootPrimary, ["winner", "winnerIndex", "winnerPlayer"])
        ]),
        [...rootCandidates, ...bodyCandidates]
      ),
      event: String(evNameRaw ?? "unknown"),
      raw: gameEventData
    };
  }

  function normalizeState(stateData) {
    if (!stateData || typeof stateData !== "object") return null;

    const node = stateData?.state && typeof stateData.state === "object" ? stateData.state : stateData;
    function parsePlayerIndex(candidates, rootsForPlayers) {
      for (const raw of candidates) {
        const n = Number(raw);
        if (Number.isFinite(n)) return n;
        if (raw && typeof raw === "object") {
          const nested = Number(raw.index ?? raw.playerIndex ?? raw.id);
          if (Number.isFinite(nested)) return nested;
        }
        if (typeof raw === "string") {
          const s = raw.trim().toLowerCase();
          if (s === "left") return 0;
          if (s === "right") return 1;

          for (const root of rootsForPlayers) {
            const playerGroups = [
              Array.isArray(root?.players) ? root.players : null,
              Array.isArray(root?.participants) ? root.participants : null,
              Array.isArray(root?.competitors) ? root.competitors : null
            ].filter(Array.isArray);
            for (const players of playerGroups) {
              for (let i = 0; i < players.length; i += 1) {
                const p = players[i];
                if (!p || typeof p !== "object") continue;
                const name = String(
                  p.name ??
                  p.username ??
                  p.displayName ??
                  p.playerName ??
                  p.user?.name ??
                  p.user ??
                  ""
                ).trim().toLowerCase();
                if (name && name === s) return i;
              }
            }
          }
        }
      }
      return null;
    }
    function extractCheckoutGuide(root) {
      if (!root || typeof root !== "object") return null;
      const direct =
        root.checkoutGuide ??
        root.checkout ??
        root.checkoutPath ??
        root.checkoutSuggestion ??
        root.finishSuggestion ??
        root.suggestion ??
        null;
      if (direct) return direct;

      const queue = [{ v: root, d: 0 }];
      const seen = new Set();
      while (queue.length > 0) {
        const { v, d } = queue.shift();
        if (!v || typeof v !== "object" || d > 4) continue;
        if (seen.has(v)) continue;
        seen.add(v);

        for (const [k, child] of Object.entries(v)) {
          const key = String(k || "").toLowerCase();
          const keyLooksCheckout =
            key.includes("checkout") ||
            key.includes("finish") ||
            key.includes("suggestion") ||
            key.includes("path");
          if (keyLooksCheckout && child) {
            if (typeof child === "string" || Array.isArray(child)) return child;
            if (typeof child === "object") {
              const cand =
                child.suggestion ??
                child.recommendation ??
                child.target ??
                child.checkout ??
                child.path ??
                child.last ??
                null;
              if (cand) return cand;
            }
          }
          if (child && typeof child === "object") {
            queue.push({ v: child, d: d + 1 });
          }
        }
      }
      return null;
    }

    const checkoutGuide = extractCheckoutGuide(node) ?? extractCheckoutGuide(stateData) ?? null;
    const scoreRoots = [stateData?.state, stateData];

    function readScore(obj) {
      if (!obj || typeof obj !== "object") return null;
      const candidates = [
        obj.remaining,
        obj.left,
        obj.rest,
        obj.pointsLeft,
        obj.toGo,
        obj.scoreToGo,
        obj.remainingScore,
        obj.currentScore,
        obj.gameScore,
        obj.points,
        obj.score
      ];
      for (const raw of candidates) {
        const n = Number(raw);
        if (Number.isFinite(n)) return n;
      }
      return null;
    }

    function toPlayerScores(anyPlayers) {
      if (!Array.isArray(anyPlayers)) return null;
      const scores = anyPlayers.map((p) => {
        if (typeof p === "number" && Number.isFinite(p)) return p;
        if (p && typeof p === "object") return readScore(p);
        return null;
      });
      return scores.some((x) => Number.isFinite(x)) ? scores : null;
    }

    let playerScores = null;
    for (const root of scoreRoots) {
      if (playerScores) break;
      playerScores =
        toPlayerScores(root?.players) ??
        toPlayerScores(root?.participants) ??
        toPlayerScores(root?.competitors) ??
        toPlayerScores(root?.scores) ??
        toPlayerScores(root?.playerScores) ??
        null;
    }

    const playerIndex = parsePlayerIndex([
      node?.playerIndex,
      node?.currentPlayerIndex,
      node?.activePlayerIndex,
      node?.player,
      node?.currentPlayer,
      stateData?.playerIndex,
      stateData?.currentPlayerIndex,
      stateData?.activePlayerIndex,
      stateData?.player,
      stateData?.currentPlayer,
      findNestedValueByKeys(node, ["playerIndex", "currentPlayerIndex", "activePlayerIndex", "player", "currentPlayer"]),
      findNestedValueByKeys(stateData, ["playerIndex", "currentPlayerIndex", "activePlayerIndex", "player", "currentPlayer"])
    ], [node, stateData]);

    const winner = parseWinnerReference(
      pickFirstValue([
        node?.winner,
        node?.winnerIndex,
        node?.winnerPlayer,
        stateData?.winner,
        stateData?.winnerIndex,
        stateData?.winnerPlayer,
        findNestedValueByKeys(node, ["winner", "winnerIndex", "winnerPlayer"]),
        findNestedValueByKeys(stateData, ["winner", "winnerIndex", "winnerPlayer"])
      ]),
      [node, stateData]
    );

    return {
      type: "state",
      ts: Date.now(),
      matchId: stateData.id ?? node?.id ?? null,
      player: playerIndex,
      round: node?.round ?? stateData?.round ?? null,
      set: node?.set ?? stateData?.set ?? null,
      leg: node?.leg ?? stateData?.leg ?? null,
      turnBusted: !!(node?.turnBusted ?? stateData?.turnBusted),
      gameFinished: !!(node?.gameFinished ?? stateData?.gameFinished),
      winner,
      checkoutGuide,
      playerScores,
      raw: stateData
    };
  }

  function handleAutodartsMessage(raw) {
    if (typeof raw !== "string") return;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    // mehrere Envelope-Varianten unterstützen (Autodarts sendet nicht immer identisch)
    const envelopes = [parsed, parsed?.data, parsed?.payload].filter((x) => x && typeof x === "object");
    const topics = envelopes
      .map((x) => String(x?.topic || ""))
      .filter(Boolean)
      .map((x) => x.toLowerCase());
    const channels = envelopes
      .map((x) => String(x?.channel || ""))
      .filter(Boolean)
      .map((x) => x.toLowerCase());
    const looksAutodarts =
      channels.some((c) => c.includes("autodarts")) ||
      topics.some((t) => t.includes("autodarts"));
    if (looksAutodarts) {
      postCapture("ws_envelope", clipForCapture(parsed), {
        channels,
        topics,
        rootKeys: safeShallowKeys(parsed)
      });
    }

    const channelLooksRelevant = channels.some((c) =>
      c.includes("autodarts.match") || c.includes("autodarts.game") || c.includes("match")
    );
    const topic = topics.find(Boolean) || "";
    if (!channelLooksRelevant && !topic) return;

    const isGameEventTopic =
      topic.endsWith(".game-events") ||
      topic.includes(".game-events.") ||
      topic.includes("game-events") ||
      topic.includes("game_event");

    const isStateTopic =
      topic.endsWith(".state") ||
      topic.includes(".state.") ||
      topic.includes("/state") ||
      topic.includes("match-state") ||
      topic.includes("state_update") ||
      topic.includes("state");

    const payload =
      parsed?.data?.data ??
      parsed?.payload?.data ??
      parsed?.data ??
      parsed?.payload ??
      parsed;

    const looksStateLike =
      payload &&
      typeof payload === "object" &&
      (
        payload.state ||
        payload.players ||
        payload.playerScores ||
        payload.scores ||
        payload.set !== undefined ||
        payload.leg !== undefined ||
        payload.round !== undefined
      );

    if (isGameEventTopic) {
      postCapture("ws_game_events", payload, {
        topic,
        channels,
        rootKeys: safeShallowKeys(parsed),
        payloadKeys: safeShallowKeys(payload)
      });
      if (Array.isArray(payload)) {
        for (const item of payload) {
          const p = normalizeGameEvent(item);
          if (p) post(p);
        }
      } else {
        const p = normalizeGameEvent(payload);
        if (p) post(p);
      }
      return;
    }

    // Game-Start manchmal im State-/Match-Channel, nicht unter game-events
    if (!isGameEventTopic && payload && typeof payload === "object") {
      const quickEvRaw = pickFirstValue([
        payload.event,
        payload.eventType,
        findNestedValueByKeys(payload, ["event", "eventType"]),
        payload.data && typeof payload.data === "object" ? payload.data.event : null,
        payload.message && typeof payload.message === "object" ? payload.message.event : null
      ]);
      const quickEv = String(quickEvRaw || "").trim();
      if (quickEv) {
        const qk = quickEv.toLowerCase().replace(/[\s._-]+/g, "");
        const qVar = new Set([qk]);
        if (qk.endsWith("event") && qk.length > 5) qVar.add(qk.slice(0, -5));
        const startKeys = new Set([
          "gamestarted",
          "matchstarted",
          "boardstarted",
          "gameon",
          "gamebegin",
          "matchbegin",
          "boardbegin"
        ]);
        if ([...qVar].some((k) => startKeys.has(k))) {
          const p = normalizeGameEvent({
            event: quickEv,
            matchId: pickFirstValue([
              payload.matchId,
              findNestedValueByKeys(payload, ["matchId", "match_id", "id"])
            ]),
            set: pickFirstValue([payload.set, findNestedValueByKeys(payload, ["set", "setNumber", "currentSet"])]),
            leg: pickFirstValue([payload.leg, findNestedValueByKeys(payload, ["leg", "legNumber", "currentLeg"])]),
            round: pickFirstValue([payload.round, findNestedValueByKeys(payload, ["round", "roundNumber"])]),
            raw: payload
          });
          if (p && p.type === "event") post(p);
        }
      }
    }

    if (isStateTopic || looksStateLike) {
      postCapture("ws_state", payload, {
        topic,
        channels,
        rootKeys: safeShallowKeys(parsed),
        payloadKeys: safeShallowKeys(payload)
      });
      const s = normalizeState(payload);
      if (s) post(s);
    }
  }

  function bindAutodartsDomEvents() {
    // Directly consume website-provided events as primary source of truth.
    window.addEventListener("autodarts-game-event", (ev) => {
      postCapture("dom_game_event", ev?.detail, {
        detailKeys: safeShallowKeys(ev?.detail)
      });
      const p = normalizeGameEvent(ev?.detail);
      if (!p || shouldDropCustomDuplicate("game-event", p)) return;
      post(p);
    });

    window.addEventListener("autodarts-state", (ev) => {
      postCapture("dom_state", ev?.detail, {
        detailKeys: safeShallowKeys(ev?.detail)
      });
      const s = normalizeState(ev?.detail);
      if (!s || shouldDropCustomDuplicate("state", s)) return;
      post(s);
    });
  }

  function bindFetchCapture() {
    if (!NativeFetch) return;
    window.fetch = async function patchedFetch(input, init) {
      const url = (typeof input === "string" ? input : (input?.url || "")).toString();
      let res;
      try {
        res = await NativeFetch(input, init);
      } catch (err) {
        if (shouldCaptureUrl(url)) {
          postCapture("fetch_error", { error: String(err?.message || err) }, {
            url,
            method: String(init?.method || "GET").toUpperCase()
          });
        }
        throw err;
      }

      if (!shouldCaptureUrl(url)) return res;

      try {
        const clone = res.clone();
        const ct = String(clone.headers?.get("content-type") || "").toLowerCase();
        let body = null;
        if (ct.includes("application/json")) {
          body = clipForCapture(await clone.json());
        } else {
          const text = await clone.text();
          body = clipForCapture(tryParseJsonText(text) ?? text.slice(0, 400));
        }
        postCapture("fetch_response", body, {
          url,
          status: clone.status,
          method: String(init?.method || "GET").toUpperCase(),
          contentType: ct
        });
      } catch {
        // ignore
      }
      return res;
    };
  }

  function bindXhrCapture() {
    if (!NativeXHR) return;
    const origOpen = NativeXHR.prototype.open;
    const origSend = NativeXHR.prototype.send;

    NativeXHR.prototype.open = function patchedOpen(method, url) {
      try {
        this.__AD_SB_URL__ = String(url || "");
        this.__AD_SB_METHOD__ = String(method || "GET").toUpperCase();
      } catch {}
      return origOpen.apply(this, arguments);
    };

    NativeXHR.prototype.send = function patchedSend() {
      try {
        this.addEventListener("load", () => {
          const url = String(this.__AD_SB_URL__ || "");
          if (!shouldCaptureUrl(url)) return;
          const ct = String(this.getResponseHeader?.("content-type") || "").toLowerCase();
          const raw = this.responseType === "" || this.responseType === "text"
            ? String(this.responseText || "")
            : this.response;
          const parsed = typeof raw === "string" ? (tryParseJsonText(raw) ?? raw.slice(0, 400)) : raw;
          postCapture("xhr_response", clipForCapture(parsed), {
            url,
            method: String(this.__AD_SB_METHOD__ || "GET"),
            status: Number(this.status || 0),
            contentType: ct
          });
        });
      } catch {
        // ignore
      }
      return origSend.apply(this, arguments);
    };
  }

  function bindEventSourceCapture() {
    if (!NativeEventSource) return;
    function PatchedEventSource(url, config) {
      const es = new NativeEventSource(url, config);
      es.addEventListener("message", (ev) => {
        if (!shouldCaptureUrl(url)) return;
        const parsed = tryParseJsonText(String(ev?.data || ""));
        postCapture("eventsource_message", clipForCapture(parsed ?? String(ev?.data || "").slice(0, 400)), {
          url: String(url || "")
        });
      });
      return es;
    }
    PatchedEventSource.prototype = NativeEventSource.prototype;
    Object.setPrototypeOf(PatchedEventSource, NativeEventSource);
    window.EventSource = PatchedEventSource;
  }

  function captureStorageSnapshot(reason = "storage_snapshot") {
    try {
      const ls = {};
      const ss = {};
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = String(localStorage.key(i) || "");
        if (!key) continue;
        const lk = key.toLowerCase();
        if (lk.includes("autodarts") || lk.includes("match") || lk.includes("game")) {
          ls[key] = localStorage.getItem(key);
        }
      }
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = String(sessionStorage.key(i) || "");
        if (!key) continue;
        const lk = key.toLowerCase();
        if (lk.includes("autodarts") || lk.includes("match") || lk.includes("game")) {
          ss[key] = sessionStorage.getItem(key);
        }
      }
      if (Object.keys(ls).length || Object.keys(ss).length) {
        postCapture("storage_snapshot", clipForCapture({ localStorage: ls, sessionStorage: ss }), { reason });
      }
    } catch {
      // ignore
    }
  }

  function captureGlobalSnapshot(reason = "global_snapshot") {
    try {
      const candidates = [
        "__NEXT_DATA__",
        "__APOLLO_STATE__",
        "__INITIAL_STATE__",
        "__REDUX_STATE__",
        "autodarts"
      ];
      const out = {};
      for (const key of candidates) {
        if (window[key] !== undefined) out[key] = clipForCapture(window[key]);
      }
      if (Object.keys(out).length > 0) {
        postCapture("global_snapshot", out, { reason });
      }
    } catch {
      // ignore
    }
  }

  function PatchedWebSocket(url, protocols) {
    const ws = protocols ? new NativeWS(url, protocols) : new NativeWS(url);
    ws.addEventListener("message", (ev) => {
      handleAutodartsMessage(ev?.data);
    });
    return ws;
  }

  const nativeDispatchEvent = NativeWS.prototype.dispatchEvent;
  if (typeof nativeDispatchEvent === "function") {
    NativeWS.prototype.dispatchEvent = function patchedDispatchEvent(ev) {
      try {
        if (ev?.type === "message") {
          handleAutodartsMessage(ev?.data);
        }
      } catch {
        // ignore
      }
      return nativeDispatchEvent.call(this, ev);
    };
  }

  const nativeSend = NativeWS.prototype.send;
  if (typeof nativeSend === "function") {
    NativeWS.prototype.send = function patchedSend(data) {
      try {
        const s = typeof data === "string" ? data : "";
        const parsed = s ? tryParseJsonText(s) : null;
        postCapture("ws_outgoing", clipForCapture(parsed ?? (s || "[binary]")), {
          url: String(this?.url || ""),
          dataType: typeof data
        });
      } catch {
        // ignore
      }
      return nativeSend.call(this, data);
    };
  }

  PatchedWebSocket.prototype = NativeWS.prototype;
  Object.setPrototypeOf(PatchedWebSocket, NativeWS);
  window.WebSocket = PatchedWebSocket;
  bindAutodartsDomEvents();
  bindFetchCapture();
  bindXhrCapture();
  bindEventSourceCapture();
  captureGlobalSnapshot("init");
  captureStorageSnapshot("init");
  window.addEventListener("focus", () => {
    captureGlobalSnapshot("focus");
    captureStorageSnapshot("focus");
  });
})();
