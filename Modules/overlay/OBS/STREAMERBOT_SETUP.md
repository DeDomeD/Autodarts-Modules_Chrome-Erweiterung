# Streamer.bot Overlay Setup

## Ziel
OBS Browser Source soll Live-Overlay-Daten empfangen.

## 1) Extension konfigurieren
- `Overlay aktivieren` einschalten
- `sbUrl` korrekt setzen (z.B. `ws://127.0.0.1:8080/`)

## 2) Status
Der automatische `overlayUpdate`-Action-Trigger ist aktuell entfernt/deaktiviert.

Wenn du das OBS-Overlay trotzdem über Streamer.bot versorgen willst, sende selbst ein
`Custom Event` mit Name `AD_SB_OVERLAY_UPDATE` und den Overlay-Feldern als Args/Payload.

## 3) OBS Browser Source URL

```text
file:///B:/Desktop/SB-Autodarts/Autodarts Modules/Modules/overlay/OBS/index.html?sbws=ws://127.0.0.1:8080/
```

Hinweis:
- Wenn Streamer.bot nicht lokal läuft, `sbws` auf die Server-IP anpassen.
- Das Extension-Overlay (chrome.runtime) bleibt weiterhin parallel funktionsfähig.
