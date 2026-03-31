# bridge

Website-Bridge fuer `play.autodarts.io`.

Enthaelt die Dateien, die direkt auf der Website laufen oder dort Daten auslesen:

- `content.js`: Content-Script der Extension, injiziert die In-Page-Bridge und leitet Events weiter.
- `pageScript.js`: In-Page-Script fuer WebSocket-Hooks, DOM-Beobachtung und JS-State-Scanner.

Ziel:

- mehr Autodarts-Daten direkt auf der Website auslesen
- robuste Fallbacks ueber DOM, globale JS-Objekte und WebSocket-Signale
- Trennung von Website-Bridge (`Main/bridge`) und Background/Core-Logik (`Main/core`)
