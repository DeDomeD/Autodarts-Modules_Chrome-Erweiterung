/**
 * Minimaler WebSocket-Signaling-Server für das Playercam-Modul.
 * Start: npm install && node signaling-server.mjs
 * Port: PORT=8766 (Standard 8766)
 */
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT) || 8766;
const wss = new WebSocketServer({ port: PORT });
/** @type {Map<string, import('ws').WebSocket>} */
const peers = new Map();

function safeSend(ws, obj) {
  try {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

wss.on("connection", (ws) => {
  let peerId = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw || ""));
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "register" && msg.peerId) {
      const id = String(msg.peerId).trim().slice(0, 128);
      if (!id) return;
      if (peerId && peerId !== id) {
        peers.delete(peerId);
      }
      peerId = id;
      const prev = peers.get(id);
      if (prev && prev !== ws) {
        try {
          prev.close(4000, "replaced");
        } catch {
          /* ignore */
        }
      }
      peers.set(id, ws);
      safeSend(ws, { type: "registered", peerId: id });
      return;
    }

    if (!peerId) return;

    if (msg.type === "signal" && msg.to && msg.data) {
      const to = String(msg.to).trim();
      const target = peers.get(to);
      if (target && target !== ws) {
        safeSend(target, { type: "signal", from: peerId, data: msg.data });
      }
      return;
    }

    if (msg.type === "ping") {
      safeSend(ws, { type: "pong", t: msg.t });
    }
  });

  ws.on("close", () => {
    if (peerId) peers.delete(peerId);
  });
});

console.log(`[playercam signaling] ws://127.0.0.1:${PORT} (WebSocket, JSON register/signal)`);
