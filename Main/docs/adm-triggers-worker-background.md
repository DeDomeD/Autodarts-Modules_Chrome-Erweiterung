# ADM-Trigger: Worker vs. Background (Service Worker)

Dieses Dokument beschreibt **welche Trigger-Schlüssel** in der aktuellen Extension-Architektur **tatsächlich** vorkommen und wie sie **zusammenhaengen**. Ziel: WLED-, Effects- und Debug-Konfiguration nur mit Schluesseln zu belegen, die im laufenden Service Worker auch ankommen.

Das **WLED-Trigger-Dropdown** (`Modules/wled/module.js`) listet Schluessel, die **nach** `toUnifiedDispatchKey` im Worker-Log erscheinen (gleiche Form wie bei `AD_SB.wled.handleActionTrigger`).

## Kurzfassung


| Begriff                              | Bedeutung                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Background / Service Worker**      | Laedt `adm-trigger-foundation.js` (API, Keys, Bus), `adm-trigger-sources.js` (WebSocket + DOM/observed-Stubs), `adm-trigger-engine.js`, `Modules/wled/engine.js` (siehe `Main/core/background.js` `importScripts`). Hier laeuft `AD_SB.admTriggerBus.emit` und danach u. a. `AD_SB.wled.handleActionTrigger`.        |
| **Worker (`adm-trigger-worker.js`)** | **Emittiert keine eigenen Trigger.** Er formatiert Konsolen-/Mirror-Zeilen und schreibt optional Debug-Metadaten, wenn der Bus feuert (`admTriggerBus.__log` → `triggerWorkerLog.logTriggerToStorage`). Die geloggten Schluessel sind dieselben **Bus-Schlüssel** (nach Normalisierung), keine zweite Parallel-Welt. |


Fazit: **Es gibt keine getrennte „Worker-Trigger-Liste“.** Sinnvoll ist die Aufteilung:

1. **Bus-Eingang (Roh)** — was der WebSocket-Teil in `adm-trigger-sources.js` bzw. die Engine an `emit` uebergibt (teilweise dynamisch, z. B. Spielername).
2. **Bus / WLED (logisch)** — was `adm-trigger-foundation.js` (`admTriggerKeys`) per `toUnifiedDispatchKey` daraus macht; **WLED** und **Worker-Log** arbeiten mit dieser Vereinheitlichung beim Matching bzw. Logging.

---

## 1. Background: wo werden Trigger erzeugt?

### 1.1 Hauptquelle: WebSocket-Bridge (`Main/bridge/adm-trigger-sources.js`, WebSocket-Quelle)

Nur wenn `bridgeSource === "websocket"` (Page-Script), werden Wurf-, State- und Game-Events verarbeitet.

`**handleThrow`** (Auszug — fest kodierte `emit`-Schluessel):

- `throw`
- Segment aus Wurf: `s`*, `d`*, `t*` (Kleinbuchstaben), `bull`, `outside` (siehe `getThrowTriggerName`)
- Spielername als Schluessel: normalisierter Name (`normalizePlayerTriggerName`, z. B. `max_mustermann`)
- `bot_throw`
- `outside`
- `specialMiss`, `miss`, `bull`, `dbull`, `bull_checkout`, `dbl`, `tpl`
- optionale Segment-Extras `t17`–`t20`, wenn in Settings eigene Actions existieren (`hasSpecificTripleAction`)

`**handleState`**:

- `busted` (wenn `s.turnBusted`)
- `gameshot` (wenn `s.gameFinished && s.winner != null`)

`**handleGameEvent`**:

- optional `gameon` (nur wenn Bridge-Eventname zu `GAME_ON_BRIDGE_EVENT_KEYS` passt, mit Debounce)
- fuer **jeden** normalisierten Schluessel aus `getEventTriggerKeys(e)`: `emit(k, …)` — **damit sind beliebige Eventnamen** (lowercase / kompakt) moeglich, solange Autodarts sie so sendet
- `gameshot+<throwName>`, `matchshot+<throwName>` wenn der Event-Satz passende Keys enthaelt (`throwName` kommt aus `getEventThrowTriggerName`)

`**getEventTriggerKeys`** — zusaetzlich zum Roh-Eventname u. a.:

- `busted` (Alias bei `bust`)
- `matchshot`, `takeout`, `takeout_finished`
- `board_starting`, `board_started`, `board_stopping`, `board_stopped`
- `calibration_started`, `calibration_finished`
- `manual_reset_done`
- `lobby_in`, `lobby_out`, `tournament_ready`

(Siehe Implementierung in derselben Datei.)

### 1.2 Engine (`Main/bridge/adm-trigger-engine.js`)

Zusaetzlich direkt ueber den Bus (nicht ueber die WebSocket-Quelle):

- `x01_game_start` — wenn dieselbe Game-ON-Roster-Zeile wie X01 geloggt wird (kein Cork; siehe `printGameOnOnceByRosterContent`)
- `bull_off_start`
- `bull_off_end`

### 1.3 Platzhalter-Quellen

Die **DOM**- und **observed**-Quellen in derselben Datei (`adm-trigger-sources.js`) rufen aktuell **keine** `emit`-Handler auf — dort gibt es noch keine Trigger.

---

## 2. Vereinheitlichung: `admTriggerKeys` in `Main/bridge/adm-trigger-foundation.js`

WLED (`Modules/wled/engine.js`) matched mit `triggerMatchesRule`. Wichtig ist:

- Vergleich von **Regel** (z. B. in `wledEffectsJson`) und **emittiertem** Schluessel ueber `toUnifiedDispatchKey` auf **beiden** Seiten.

Auszug der Zuordnungen (Roh → logisch einheitlich):


| Roh (Beispiele)                                          | Unified / WLED-relevant |
| -------------------------------------------------------- | ----------------------- |
| `checkout`, `checkout_`*                                 | `takeout`               |
| `turn_active_player`, `myturnstart`, `opponentturnstart` | `gameon`                |
| `oneeighty`                                              | `180`                   |
| `high140`                                                | `140`                   |
| `high100`                                                | `range_100_139`         |
| `winner`                                                 | `gameshot`              |
| `bust`                                                   | `busted`                |
| `correction`                                             | `manual_reset_done`     |
| `miss`, `specialmiss`                                    | `outside`               |
| `dbl`                                                    | `double`                |
| `tpl`                                                    | `triple`                |
| `dbull`                                                  | `bull`                  |
| `waschmaschine`                                          | `s20_s1_s5`             |


`triggerMatchesRule` unterstuetzt zusaetzlich `range_MIN_MAX` (Zahl im Payload bzw. reiner Zahlenschluessel).

---

## 3. Worker: was passiert dort wirklich?

`Main/bridge/adm-trigger-worker.js`:

- Konsolenzeilen zu Wuerfen, Game ON, Checkout-Guide, Bust, Next Leg, Leg Win usw.
- `logTriggerToStorage` speichert Metadaten, wenn `admTriggerBus.__log` gesetzt ist (WebSocket-Init in `adm-trigger-sources.js`): Felder u. a. `trigger`, `effect`, `segment`.

Der gespeicherte `trigger`-Wert entspricht dem **normalisierten Bus-Key** (einheitliche Schreibweise), nicht einem separaten Worker-Vokabular.

---

## 4. Sinnvolle Gruppierung fuer Konfiguration (WLED / Effects)

### 4.1 Match & Leg

- `throw`, `gameon`, `gameshot`, `matchshot`, `busted`, `bot_throw`, `outside`

### 4.2 Checkout & Autodarts-Events

- `takeout`, `takeout_finished`, `checkout` (Roh-Event kann so heissen; unified → `takeout`)
- Kombinationen: `gameshot+<segment>`, `matchshot+<segment>` (z. B. `gameshot+t20`)

### 4.3 Segment-Treffer (pro Dart)

- `s1`–`s20`, `s25`, `d1`–`d20`, `t1`–`t20`, `t25`, `bull`, `dbull`
- Kettentypen: `miss`, `specialMiss`, `dbl`, `tpl`, `bull_checkout`
- Vereinheitlicht oft genutzt: `double`, `triple`, `bull` (statt `dbl`/`tpl`/`dbull` — Matching gleicht aus)

### 4.4 Board, Kalibrierung, Lobby

- `board_starting`, `board_started`, `board_stopping`, `board_stopped`
- `calibration_started`, `calibration_finished`
- `manual_reset_done`
- `lobby_in`, `lobby_out`, `tournament_ready`

### 4.5 Gamemode (Engine)

- `x01_game_start` — X01-Spielstart (Game ON mit Moduszeile, nicht Bull-Off-Cork)
- `bull_off_start`, `bull_off_end`

### 4.6 Dynamisch (Spieler)

- Jeder normalisierte Anzeigename als Schluessel (z. B. `team_peter`) — siehe `handleThrow` in der WebSocket-Quelle.

### 4.7 Dynamisch (Game-Events)

- Jeder von Autodarts gemeldete **Event-String** (normalisiert) kann einmalig als Trigger erscheinen, wenn er durch `getEventTriggerKeys` oder Roh-`emit` laeuft. Fuer exotische Events: im Debug-Log pruefen oder Test-Match fahren.

---

## 5. Hinweis zu aelteren / Website-Dokumentationen

Fruehere Listen mit z. B. `last_throw`, `turn_end`, `180` als **fester** Wurf-Engine-Trigger beziehen sich auf aeltere Extension-Architekturen. In der **aktuellen** Service-Worker-Kette werden diese **nicht** zentral aus der WebSocket-Quelle emittiert; sie koennen hoechstens erscheinen, wenn ein **Game-Event** oder ein anderer Roh-Schluessel sie so nennt.

---

*Datei gepflegt fuer Autodarts Modules (Chrome Extension). Bei Aenderungen an `adm-trigger-sources.js` (WebSocket-Teil) oder `adm-trigger-foundation.js` (Keys/Bus) diese Liste anpassen.*