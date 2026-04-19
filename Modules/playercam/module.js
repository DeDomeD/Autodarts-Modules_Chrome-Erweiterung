(function initPlayercamModule(scope) {
  scope.AD_SB_MODULES = scope.AD_SB_MODULES || {};

  const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

  function $(root, id) {
    return root.querySelector(`#${id}`);
  }

  function setStatus(root, text) {
    const el = $(root, "playercamStatus");
    if (el) el.textContent = text || "";
  }

  async function ensureMediaPermissions() {
    if (!chrome?.permissions?.request) return true;
    return new Promise((resolve) => {
      try {
        chrome.permissions.request({ permissions: ["camera", "microphone"] }, (granted) => {
          if (chrome.runtime?.lastError) resolve(false);
          else resolve(!!granted);
        });
      } catch {
        resolve(false);
      }
    });
  }

  function stopStream(stream) {
    if (!stream) return;
    try {
      for (const t of stream.getTracks()) t.stop();
    } catch {
      /* ignore */
    }
  }

  scope.AD_SB_MODULES.playercam = {
    id: "playercam",
    icon: "P",
    navLabelKey: "nav_playercam",
    needs: { streamerbot: false, obs: false },
    render() {
      return `
        <h2 class="title"><span data-i18n="title_playercam">Player Cam</span><span class="titleMeta">WebRTC</span></h2>

        <div class="card">
          <div class="cardHeader">
            <div class="cardTitle" data-i18n="playercam_card_identity">Dein Profil</div>
          </div>
          <div class="list">
            <div class="formRow">
              <label class="label" for="playercamDisplayName" data-i18n="playercam_display_name">Anzeigename</label>
              <input class="input" id="playercamDisplayName" type="text" maxlength="48" placeholder="Nickname" />
            </div>
            <div class="formRow">
              <label class="label" for="playercamPeerId" data-i18n="playercam_peer_id">Deine Peer-ID</label>
              <div style="display:flex;gap:8px;align-items:center;width:100%;flex-wrap:wrap;">
                <input class="input" id="playercamPeerId" type="text" readonly style="flex:1;min-width:0;font-family:ui-monospace,monospace;font-size:12px;" />
                <button type="button" class="btnSecondary" id="playercamCopyId" data-i18n="playercam_copy_id">Kopieren</button>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="cardHeader">
            <div class="cardTitle" data-i18n="playercam_card_signal">Signaling</div>
          </div>
          <div class="list">
            <div class="formRow">
              <label class="label" for="playercamSignalingUrl" data-i18n="playercam_ws_url">WebSocket-URL</label>
              <input class="input" id="playercamSignalingUrl" type="text" placeholder="ws://127.0.0.1:8766" />
              <div class="hint" data-i18n="playercam_ws_hint">Gemeinsamer Server für alle Teilnehmer (lokal: signaling-server.mjs).</div>
            </div>
            <div class="formRow">
              <label class="label" for="playercamSignalingToken" data-i18n="playercam_token_optional">Token (optional)</label>
              <input class="input" id="playercamSignalingToken" type="password" placeholder="" autocomplete="off" />
            </div>
            <div class="rowSplit" style="margin-top:8px;">
              <button type="button" class="btnPrimary" id="playercamWsConnect" data-i18n="playercam_connect_ws">Mit Server verbinden</button>
              <button type="button" class="btnSecondary" id="playercamWsDisconnect" data-i18n="playercam_disconnect_ws">Trennen</button>
            </div>
            <div class="formRow" style="margin-top:6px;">
              <div id="playercamStatus" class="hint" style="min-height:1.25em;"></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="cardHeader">
            <div class="cardTitle" data-i18n="playercam_card_call">Anruf</div>
          </div>
          <div class="list">
            <div class="formRow">
              <label class="label" for="playercamRemotePeerId" data-i18n="playercam_remote_id">Peer-ID des Partners</label>
              <input class="input" id="playercamRemotePeerId" type="text" placeholder="UUID des anderen" style="font-family:ui-monospace,monospace;font-size:12px;" />
            </div>
            <div class="rowSplit" style="margin-top:8px;">
              <button type="button" class="btnPrimary" id="playercamCallBtn" data-i18n="playercam_call">Kamera starten &amp; anrufen</button>
              <button type="button" class="btnSecondary" id="playercamHangupBtn" data-i18n="playercam_hangup">Auflegen</button>
            </div>
            <div id="playercamIncoming" class="formRow hidden" style="margin-top:10px;padding:10px;border:1px solid var(--stroke);border-radius:8px;background:var(--card2);">
              <div style="margin-bottom:8px;font-weight:600;" data-i18n="playercam_incoming_title">Eingehender Anruf</div>
              <div id="playercamIncomingFrom" class="hint" style="margin-bottom:10px;"></div>
              <div class="rowSplit">
                <button type="button" class="btnPrimary" id="playercamAcceptBtn" data-i18n="playercam_accept">Annehmen</button>
                <button type="button" class="btnSecondary" id="playercamRejectBtn" data-i18n="playercam_reject">Ablehnen</button>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="cardHeader">
            <div class="cardTitle" data-i18n="playercam_card_video">Video</div>
          </div>
          <div class="list" style="padding-bottom:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;">
              <div>
                <div class="hint" style="margin-bottom:4px;" data-i18n="playercam_remote_label">Partner</div>
                <video id="playercamRemoteVideo" playsinline autoplay style="width:100%;max-height:200px;background:#000;border-radius:8px;object-fit:cover;"></video>
              </div>
              <div>
                <div class="hint" style="margin-bottom:4px;" data-i18n="playercam_local_label">Du</div>
                <video id="playercamLocalVideo" playsinline muted autoplay style="width:100%;max-height:200px;background:#111;border-radius:8px;object-fit:cover;"></video>
              </div>
            </div>
          </div>
        </div>

        <div class="spacer"></div>
      `;
    },

    bind(api) {
      const root = api.root;
      let ws = null;
      let pc = null;
      let localStream = null;
      let remotePeerId = null;
      let pendingOffer = null;
      let pendingFrom = null;

      api.bindAutoImmediate(root, "playercamDisplayName", "playercamDisplayName", (v) => String(v || "").trim().slice(0, 48));
      api.bindAutoImmediate(root, "playercamSignalingUrl", "playercamSignalingUrl", (v) => String(v || "").trim());
      api.bindAutoImmediate(root, "playercamSignalingToken", "playercamSignalingToken", (v) => String(v || ""));

      function wsSend(obj) {
        if (!ws || ws.readyState !== 1) return false;
        try {
          ws.send(JSON.stringify(obj));
          return true;
        } catch {
          return false;
        }
      }

      function closePeer() {
        if (pc) {
          try {
            pc.ontrack = null;
            pc.onicecandidate = null;
            pc.onconnectionstatechange = null;
            pc.close();
          } catch {
            /* ignore */
          }
          pc = null;
        }
        stopStream(localStream);
        localStream = null;
        const rv = $(root, "playercamRemoteVideo");
        const lv = $(root, "playercamLocalVideo");
        if (rv) rv.srcObject = null;
        if (lv) lv.srcObject = null;
        remotePeerId = null;
        pendingOffer = null;
        pendingFrom = null;
        const inc = $(root, "playercamIncoming");
        if (inc) inc.classList.add("hidden");
      }

      function hangup() {
        closePeer();
        setStatus(root, "");
      }

      async function attachLocalToVideo() {
        const lv = $(root, "playercamLocalVideo");
        if (lv && localStream) lv.srcObject = localStream;
      }

      async function ensureLocalStream() {
        const ok = await ensureMediaPermissions();
        if (!ok) {
          setStatus(root, api.t?.("playercam_err_permissions") || "Kamera/Mikro nicht erlaubt.");
          return null;
        }
        try {
          const s = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 360 } },
            audio: true
          });
          return s;
        } catch (e) {
          setStatus(root, String(e?.message || e || "getUserMedia failed"));
          return null;
        }
      }

      function createPc() {
        const c = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        c.onicecandidate = (ev) => {
          if (!ev.candidate || !remotePeerId) return;
          wsSend({
            type: "signal",
            to: remotePeerId,
            data: { type: "candidate", candidate: ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate }
          });
        };
        c.ontrack = (ev) => {
          const rv = $(root, "playercamRemoteVideo");
          if (rv && ev.streams[0]) rv.srcObject = ev.streams[0];
        };
        c.onconnectionstatechange = () => {
          const st = c.connectionState;
          if (st === "failed" || st === "disconnected" || st === "closed") {
            setStatus(root, api.t?.("playercam_state_" + st) || st);
          }
        };
        return c;
      }

      async function handleSignal(from, data) {
        if (!data || typeof data !== "object") return;
        const t = data.type;

        if (t === "offer") {
          if (pc && pc.connectionState === "connected") {
            setStatus(root, api.t?.("playercam_busy") || "Bereits in einem Anruf.");
            return;
          }
          pendingOffer = data.sdp;
          pendingFrom = from;
          const inc = $(root, "playercamIncoming");
          const lab = $(root, "playercamIncomingFrom");
          if (inc) inc.classList.remove("hidden");
          if (lab) lab.textContent = `${from}`;
          setStatus(root, api.t?.("playercam_incoming_status") || "Eingehend…");
          return;
        }

        if (t === "answer" && pc) {
          try {
            await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
          } catch (e) {
            setStatus(root, String(e?.message || e));
          }
          return;
        }

        if (t === "candidate" && pc && data.candidate) {
          try {
            await pc.addIceCandidate(data.candidate);
          } catch {
            /* ignore late candidates */
          }
        }
      }

      async function acceptIncoming() {
        if (!pendingOffer || !pendingFrom) return;
        const from = pendingFrom;
        const sdp = pendingOffer;
        pendingOffer = null;
        pendingFrom = null;
        const inc = $(root, "playercamIncoming");
        if (inc) inc.classList.add("hidden");

        hangup();
        remotePeerId = from;
        localStream = await ensureLocalStream();
        if (!localStream) return;
        await attachLocalToVideo();

        pc = createPc();
        for (const track of localStream.getTracks()) {
          pc.addTrack(track, localStream);
        }
        try {
          await pc.setRemoteDescription({ type: "offer", sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          wsSend({ type: "signal", to: from, data: { type: "answer", sdp: answer.sdp } });
          setStatus(root, api.t?.("playercam_connected") || "Verbunden");
        } catch (e) {
          setStatus(root, String(e?.message || e));
          hangup();
        }
      }

      function rejectIncoming() {
        pendingOffer = null;
        pendingFrom = null;
        const inc = $(root, "playercamIncoming");
        if (inc) inc.classList.add("hidden");
        setStatus(root, "");
      }

      async function startOutgoingCall() {
        const settings = api.getSettings?.() || {};
        const myId = String(settings.playercamPeerId || "").trim();
        const target = String($(root, "playercamRemotePeerId")?.value || "").trim();
        if (!myId || !target) {
          setStatus(root, api.t?.("playercam_err_ids") || "Peer-IDs fehlen.");
          return;
        }
        if (target === myId) {
          setStatus(root, api.t?.("playercam_err_self") || "Nicht dich selbst anrufen.");
          return;
        }
        if (!ws || ws.readyState !== 1) {
          setStatus(root, api.t?.("playercam_err_ws") || "Zuerst mit Signaling verbinden.");
          return;
        }

        hangup();
        remotePeerId = target;
        localStream = await ensureLocalStream();
        if (!localStream) return;
        await attachLocalToVideo();

        pc = createPc();
        for (const track of localStream.getTracks()) {
          pc.addTrack(track, localStream);
        }
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          wsSend({ type: "signal", to: target, data: { type: "offer", sdp: offer.sdp } });
          setStatus(root, api.t?.("playercam_ringing") || "Klingelt…");
        } catch (e) {
          setStatus(root, String(e?.message || e));
          hangup();
        }
      }

      function connectWs() {
        const url = String($(root, "playercamSignalingUrl")?.value || "").trim();
        if (!/^wss?:\/\//i.test(url)) {
          setStatus(root, api.t?.("playercam_err_url") || "Ungültige WebSocket-URL.");
          return;
        }
        const settings = api.getSettings?.() || {};
        const peerId = String(settings.playercamPeerId || "").trim();
        if (!peerId) {
          setStatus(root, api.t?.("playercam_err_noid") || "Keine Peer-ID.");
          return;
        }

        try {
          ws?.close();
        } catch {
          /* ignore */
        }
        ws = null;
        hangup();

        setStatus(root, api.t?.("playercam_ws_connecting") || "Verbinde…");
        try {
          const socket = new WebSocket(url);
          ws = socket;

          socket.addEventListener("open", () => {
            const token = String(settings.playercamSignalingToken || "").trim();
            const displayName = String(settings.playercamDisplayName || "").trim() || "Player";
            wsSend({
              type: "register",
              peerId,
              displayName,
              ...(token ? { token } : {})
            });
            setStatus(root, api.t?.("playercam_ws_open") || "Verbunden, registriere…");
          });

          socket.addEventListener("message", async (ev) => {
            let msg;
            try {
              msg = JSON.parse(String(ev.data || ""));
            } catch {
              return;
            }
            if (msg.type === "registered") {
              setStatus(root, api.t?.("playercam_ws_registered") || "Bereit.");
              return;
            }
            if (msg.type === "signal" && msg.from && msg.data) {
              await handleSignal(String(msg.from), msg.data);
            }
          });

          socket.addEventListener("close", () => {
            if (ws === socket) ws = null;
            hangup();
            setStatus(root, api.t?.("playercam_ws_closed") || "Signaling getrennt.");
          });

          socket.addEventListener("error", () => {
            setStatus(root, api.t?.("playercam_ws_error") || "WebSocket-Fehler.");
          });
        } catch (e) {
          setStatus(root, String(e?.message || e));
        }
      }

      $(root, "playercamWsConnect")?.addEventListener("click", () => void connectWs());
      $(root, "playercamWsDisconnect")?.addEventListener("click", () => {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
        ws = null;
        hangup();
        setStatus(root, api.t?.("playercam_ws_closed") || "Getrennt.");
      });

      $(root, "playercamCallBtn")?.addEventListener("click", () => void startOutgoingCall());
      $(root, "playercamHangupBtn")?.addEventListener("click", () => {
        hangup();
        setStatus(root, api.t?.("playercam_hangup_ok") || "Aufgelegt.");
      });
      $(root, "playercamAcceptBtn")?.addEventListener("click", () => void acceptIncoming());
      $(root, "playercamRejectBtn")?.addEventListener("click", () => rejectIncoming());

      $(root, "playercamCopyId")?.addEventListener("click", async () => {
        const v = String($(root, "playercamPeerId")?.value || "");
        if (!v) return;
        try {
          await navigator.clipboard.writeText(v);
          setStatus(root, api.t?.("playercam_copied") || "Kopiert.");
        } catch {
          setStatus(root, api.t?.("playercam_copy_failed") || "Kopieren fehlgeschlagen.");
        }
      });
    },

    async sync(api, settings) {
      const root = api.root;
      const s = settings || {};
      let peerId = String(s.playercamPeerId || "").trim();
      if (!peerId) {
        peerId =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `pc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await api.savePartial({ playercamPeerId: peerId });
      }
      api.setValue(root, "playercamPeerId", peerId);
      api.setValue(root, "playercamDisplayName", s.playercamDisplayName || "");
      api.setValue(root, "playercamSignalingUrl", s.playercamSignalingUrl || "");
      api.setValue(root, "playercamSignalingToken", s.playercamSignalingToken || "");
    }
  };
})(window);
