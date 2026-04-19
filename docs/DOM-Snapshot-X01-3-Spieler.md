# DOM-Snapshot: X01-Match mit 3 Spielern

Dieses Dokument beschreibt, **welche Daten** sich aus den von dir genannten UI-Bereichen (**Div Box 1–3**) zuverlässig auslesen lassen und **welche Variablen** wir daraus für eine zentrale Snapshot-Struktur (z. B. für Worker, Trigger, Logging) setzen können.

> **Hinweis:** Chakra-`css-*`-Klassen sind oft **build-abhängig** und können sich ändern. Priorität haben **`id`** und feste Klassen wie **`ad-ext-*`**.

---

## Gesamtobjekt (Vorschlag)

Ein gemeinsames Objekt, z. B. `domPlaySnapshot` oder `lastDomX01Snapshot`:

| Pfad (Beispiel) | Typ | Quelle | Bedeutung |
|-----------------|-----|--------|-----------|
| `snapshot.meta.source` | `string` | fest | z. B. `"autodarts_dom"` |
| `snapshot.meta.collectedAt` | `number` | `Date.now()` | Zeitstempel der letzten Erhebung |
| `snapshot.meta.playerCount` | `number` | gezählt | hier **3** |

---

## Div Box 1 — Kopfzeile (Spielmodus, Start, Runden)

**Bereich:** `ul` mit u. a. `#ad-ext-game-variant`, Startzahl, SI-DO, `R1/50`, Links/Buttons.

### Stabile Anker

| Selektor | Variable(n) | Typ | Beschreibung |
|----------|-------------|-----|--------------|
| `#ad-ext-game-variant` | `header.gameVariant` | `string` | Spielmodus, z. B. `"X01"` |
| `#adt-stream-mode-button` | `header.streamingModeButtonPresent` | `boolean` | Button vorhanden (optional) |
| `a[aria-label="Match stats"]` | `header.matchStatsHref` | `string \| null` | Link zur Match-History (optional) |

### Über die `ul`-Liste (ohne feste css-Klassen)

Die **zweite** und **dritte** sichtbare Text-`span` in derselben Liste wie `#ad-ext-game-variant` liefern typischerweise Startscore und Ein-/Ausstiegsregel; die **Rundenangabe** enthält oft ein Muster `R<n>/<m>`.

| Variable | Typ | Herleitung |
|----------|-----|------------|
| `header.startScore` | `number \| null` | Text des Spans nach `gameVariant` (z. B. `"301"`) → `parseInt` |
| `header.inOutRule` | `string` | z. B. `"SI-DO"` (Single In / Double Out) |
| `header.roundLabelRaw` | `string` | Rohtext, z. B. `"R1/50"` |
| `header.roundCurrent` | `number \| null` | Regex `R(\d+)/(\d+)` → erste Gruppe |
| `header.roundMax` | `number \| null` | Regex `R(\d+)/(\d+)` → zweite Gruppe |

**Empfehlung Implementation:** Container `document.querySelector('#ad-ext-game-variant')?.closest('ul')`, dann `querySelectorAll('span')` filtern (sichtbarer Text), statt `css-bs3vp6` zu verwenden.

---

## Div Box 2 — Spielerleiste (3 Karten)

**Bereich:** Wiederholte Blöcke mit Klasse **`ad-ext-player`** (pro Spieler eine Karte).

### Pro Spieler (Index `i = 0 … n-1`)

Selektor: alle `document.querySelectorAll('.ad-ext-player')` in **DOM-Reihenfolge** = Anzeigereihenfolge links → rechts.

| Variable | Typ | Selektor / Logik | Beschreibung |
|----------|-----|------------------|--------------|
| `players[i].displayName` | `string` | `.ad-ext-player-name` (innerer Text) | z. B. `"EINS"`, `"ZWEI"`, `"DREI"` |
| `players[i].scoreRemaining` | `number \| null` | `.ad-ext-player-score` | Restpunkte, z. B. `301` |
| `players[i].legsWon` | `number \| null` | Grüne Box: erster Zahl-`p` im Leg-Bereich der Karte (siehe HTML-Struktur) | Gewonnene Legs, z. B. `0` |
| `players[i].dartsThrownThisTurn` | `number \| null` | Textzeile mit `#…` (siehe unten) | Zahl nach `#`, z. B. `0` bei Visit-Start |
| `players[i].averageLeg` | `number \| null` | Parse der Ø-Zeile | Durchschnitt **aktuelles Leg** |
| `players[i].averageMatch` | `number \| null` | Parse der Ø-Zeile | Durchschnitt **gesamt Match** |
| `players[i].isActive` | `boolean` | **nicht** `classList.contains('ad-ext-player-inactive')` **oder** zusätzlich aktiver Rahmen / Klasse, sobald bekannt | Nur **ein** Spieler sollte aktiv sein |

### Ø-Zeile (unter dem Namen)

Rohformat aus dem UI: `#0 | ∅ 0.0 / 0.0` (dein Beispiel).

| Variable | Regex / Split (Vorschlag) | Bedeutung |
|----------|---------------------------|-----------|
| `dartsThrownThisTurn` | nach `#` bis zum nächsten Leerzeichen `\|` | Pfeile im aktuellen Turn (laut UI) |
| `averageLeg` | zwischen `∅` und `/` | Leg-Durchschnitt |
| `averageMatch` | nach `/` | Match-Durchschnitt |

**Abgeleitet (gesamt):**

| Variable | Typ | Herleitung |
|----------|-----|------------|
| `snapshot.activePlayerIndex` | `number \| null` | Index `i` mit `players[i].isActive === true` |
| `snapshot.playerScores` | `number[]` | `[players[0].scoreRemaining, …]` |
| `snapshot.playerNames` | `string[]` | Anzeigenamen in Reihenfolge |

---

## Div Box 3 — Aktueller Turn (`#ad-ext-turn`)

**Container:** `#ad-ext-turn`

### Turn-Summe (laufende Aufnahme)

| Variable | Typ | Selektor / Logik | Beschreibung |
|----------|-----|------------------|--------------|
| `turn.visitSum` | `number \| null` | `.ad-ext-turn-points` (Zahl parsen) | **Kumulative Punktzahl dieser Aufnahme** (nicht Restscore). Beispiel: S20 → `20`, dann +S12 → `32`, dann +T20 → `92`. |

### Die drei Pfeil-Slots (Reihenfolge links → rechts)

Die Slots sind **Geschwister** unter `#ad-ext-turn` (nach dem Block mit `.ad-ext-turn-points`), typischerweise **drei** Kästen, danach der Referee-Button.

**Leer (noch kein Wurf in diesem Slot):**

- Root-Element: `div.score` (nur **Dart-Platzhalter-**`<img>`, **kein** `.ad-ext-turn-throw`).

**Belegt (Wurf registriert):**

- Root-Element: `div.ad-ext-turn-throw`
- Darin: weiterhin Dart-`<img>`, plus ein `p.chakra-text` mit verschachtelten `div`s:
  - **Zeile 1 (groß):** geworfene **Punkte** des Segments (z. B. `5`, `20`, `1`)
  - **Zeile 2 (klein, gedimmt):** **Segment-Kürzel** (z. B. `S5`, `S20`, `S1` — entspricht Single/Double/Triple + Feld)

| Variable | Typ | Beschreibung |
|----------|-----|--------------|
| `turn.slots[i].empty` | `boolean` | `true`, wenn Slot `div.score` ohne Wurfdaten (nur Platzhalter) |
| `turn.slots[i].points` | `number \| null` | Punkte des Wurfs im Slot `i`; `null`, wenn `empty` |
| `turn.slots[i].segmentLabel` | `string \| null` | z. B. `"S5"`, `"S20"`, `"D10"`, `"T20"`; `null`, wenn `empty` |

**Abgeleitet (Länge immer 3 bei X01):**

| Variable | Typ | Herleitung |
|----------|-----|------------|
| `turn.dartSlotCount` | `number` | Anzahl erkannter Slot-Elemente (`.score` + `.ad-ext-turn-throw` in Turn-Zeile), erwartet **3** |
| `turn.filledSlotCount` | `number` | Anzahl Slots mit `empty === false` |
| `turn.dartPoints` | `(number \| null)[]` | `[slots[0].points, …]` |
| `turn.dartSegmentLabels` | `(string \| null)[]` | `[slots[0].segmentLabel, …]` |

**Plausibilität:** `visitSum` sollte der **Summe** der **nicht-leeren** `slots[i].points` entsprechen (solange kein Bust/UI-Zwischenzustand).

### KI-Referee (Plus, optional)

| Variable | Typ | Selektor | Beschreibung |
|----------|-----|----------|--------------|
| `turn.refereeButtonPresent` | `boolean` | `button[aria-label="Call referee"]` | Button existiert |
| `turn.refereeButtonDisabled` | `boolean` | gleicher Button | `disabled`-Attribut |

**Klick / Nutzung:** rein aus dem **DOM-Snapshot** nicht sichtbar. Optional später z. B. `ui.lastRefereeClickAt` (Zeitstempel), wenn im Content-Script ein `click`-Listener gesetzt wird.

---

## Steuerung — Undo & Next

**Bereich:** `chakra-stack` mit zwei Buttons; erkennbar am sichtbaren Text **„Undo“** und **„Next“** (Icon + Text).

| Variable | Typ | Logik (Vorschlag) | Beschreibung |
|----------|-----|-------------------|--------------|
| `controls.undoPresent` | `boolean` | Button mit Textinhalt `Undo` | Undo verfügbar |
| `controls.undoDisabled` | `boolean` | `disabled` am Undo-Button | |
| `controls.nextPresent` | `boolean` | Button mit Textinhalt `Next` | Nächster Spieler / Abschluss o. Ä. |
| `controls.nextDisabled` | `boolean` | `disabled` am Next-Button | |

**Selektor-Hinweis:** Zuverlässiger als `css-*`: `Array.from(document.querySelectorAll('button')).find(b => /Undo/i.test(b.textContent))` (analog `Next`), oder näherer Container, sobald ein stabiler Parent bekannt ist.

---

## Board-Ansicht — Modi (Segment / Koordinaten / Live)

**Bereich:** `div[role="group"][data-orientation="horizontal"]` mit drei Buttons; Unterscheidung über **`aria-label`**.

| `aria-label` | Variable (aktiv?) | Typ | Logik |
|--------------|-------------------|-----|--------|
| `Segmentmodus` | `boardView.segmentModeActive` | `boolean` | Button hat Attribut **`data-active`** (laut Beispiel) |
| `Koordinatenmodus` | `boardView.coordinateModeActive` | `boolean` | `data-active` auf diesem Button |
| `Live-Modus` | `boardView.liveModeActive` | `boolean` | `data-active` auf diesem Button |

| Variable | Typ | Beschreibung |
|----------|-----|--------------|
| `boardView.activeModeLabel` | `string \| null` | z. B. `"Koordinatenmodus"` — welcher der drei aktiv ist (Komfortfeld) |

**Hinweis:** Es kann mehrere `role="group"`-Gruppen geben; Gruppe eindeutig machen, indem sie **genau diese drei** `aria-label`-Werte enthält.

---

## Board-Erkennung — Starten, Zurücksetzen, Kalibrieren, Abbrechen (+ Status)

**Bereich:** `chakra-stack` mit rotem Indikator-Link, **Starten**, **Zurücksetzen**, Kalibrieren-Icon-Button, **Abbrechen**.

| Variable | Typ | Selektor / Logik | Beschreibung |
|----------|-----|------------------|--------------|
| `boardDetection.statusLinkPresent` | `boolean` | `a.chakra-link` mit Inhalt 🔴 (oder Klasse `chakra-button`) | Live-/Status-Anzeige (kann `disabled` sein) |
| `boardDetection.statusLinkDisabled` | `boolean` | `disabled` am Link | |
| `boardDetection.startPresent` | `boolean` | Button, Text enthält **Starten** | |
| `boardDetection.startDisabled` | `boolean` | `disabled` | |
| `boardDetection.resetPresent` | `boolean` | Button, Text enthält **Zurücksetzen** | |
| `boardDetection.resetDisabled` | `boolean` | `disabled` | |
| `boardDetection.calibratePresent` | `boolean` | `button[aria-label="Board kalibrieren"]` | |
| `boardDetection.calibrateDisabled` | `boolean` | `disabled` | |
| `boardDetection.cancelPresent` | `boolean` | Button, Text **Abbrechen** | |
| `boardDetection.cancelDisabled` | `boolean` | `disabled` | |

**„Aufgeben“:** In anderen Match-Kontexten kann statt **Abbrechen** ein **Aufgeben**-Button stehen — gleiche Auslese-Idee über **sichtbaren Buttontext** (`Aufgeben`).

---

## Kurz: Welche Variablen „kann man hiermit setzen“?

**Aus Div Box 1**

- `gameVariant`, `startScore`, `inOutRule`, `roundCurrent`, `roundMax`, `roundLabelRaw`, optional `matchStatsHref`, Streaming-Button-Flag.

**Aus Div Box 2 (pro Spieler + abgeleitet)**

- `displayName`, `scoreRemaining`, `legsWon`, `dartsThrownThisTurn`, `averageLeg`, `averageMatch`, `isActive`.
- Abgeleitet: `activePlayerIndex`, `playerScores[]`, `playerNames[]`.

**Aus Div Box 3**

- `visitSum`, `slots[]` mit `empty`, `points`, `segmentLabel`; abgeleitet `filledSlotCount`, `dartPoints[]`, `dartSegmentLabels[]`, `dartSlotCount`.
- `refereeButtonPresent`, `refereeButtonDisabled`.

**Steuerung**

- `controls.undo*`, `controls.next*`.

**Board-Ansicht**

- `boardView.segmentModeActive`, `coordinateModeActive`, `liveModeActive`, `activeModeLabel`.

**Board-Erkennung**

- `boardDetection.*` für Status-Link, Starten, Zurücksetzen, Kalibrieren, Abbrechen (bzw. Aufgeben).

---

## Implementierung im Projekt (`dom_play_snapshot`)

Bei **jeder DOM-Änderung** (bestehender `MutationObserver` auf `documentElement`, Debounce **120 ms**) wird ein Snapshot gebaut und:

1. **Im Tab (PAGE)** unter `window.__ADM_DOM_PLAY_SNAPSHOT__` abgelegt (plus `window.__ADM_DOM_PLAY_SNAPSHOT_AT__` = Zeitstempel).
2. Per Bridge als **`state`** mit `bridgeSource: "observed"` und `raw.source === "dom_play_snapshot"` an den Service Worker geschickt (Dedupe über `domSnapshotSig`, mindestens **450 ms** gleiche Signatur → kein zweiter Post).

Der Service Worker speichert den letzten Stand in **`runtimeState.lastDomPlaySnapshot`** / **`lastDomPlaySnapshotAt`** und leert ihn bei **neuem Match**.

**Auslesen (Worker / Module):**

- `AD_SB.admTriggers.getDomPlaySnapshot()` → `{ snapshot, at }`
- `AD_SB.admTriggers.getSnapshot()` enthält ebenfalls `lastDomPlaySnapshot` und `lastDomPlaySnapshotAt`.

Die eigentliche **Dart-Index-Logik** (Throw 1–3 vs. nächster Visit) kann schrittweise auf `snapshot.turn.filledSlotCount`, `snapshot.players[i].dartsThrownThisTurn` und `snapshot.turn.dartPoints` umgestellt werden — ohne die alten Heuristiken sofort zu entfernen.

---

## Gesamttabelle — Variable · Typ · Selektor/Logik · Beschreibung

Markdown-Pipe-Tabelle mit **fester Spaltenbreite in der Quelle** (Monospace-Editor): `Typ`, `Selektor / Logik` usw. beginnen jeweils in derselben Spalte. Union-Typen stehen als `string \| null` (Backslash vor dem Pipe-Zeichen), damit Markdown die Zelle nicht zerteilt.

| Variable (Pfad)                            | Typ                            | Selektor / Logik                                                         | Beschreibung                                         |
| ------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `meta.source`                              | string                         | fest `dom_play_snapshot`                                                 | Kennzeichnung der Quelle                             |
| `meta.collectedAt`                         | number                         | `Date.now()` beim Scan                                                   | Zeitpunkt der letzten DOM-Auslesung                  |
| `meta.url`                                 | string                         | `location.href`                                                          | Seiten-URL                                           |
| `matchId`                                  | string \| null                 | Pfad `/matches/…/` (UUID)                                                | Match-ID aus der URL                                 |
| `header.gameVariant`                       | string                         | erstes `span` in `ul` von `#ad-ext-game-variant`                         | z. B. X01                                            |
| `header.startScore`                        | number \| null                 | zweites `span` → Zahl                                                    | Startscore (301)                                     |
| `header.inOutRule`                         | string                         | drittes `span`                                                           | z. B. SI-DO                                          |
| `header.roundLabelRaw`                     | string                         | `span` mit Muster R…/…                                                   | z. B. R1/50                                          |
| `header.roundCurrent`                      | number \| null                 | Regex auf `roundLabelRaw`                                                | Aktuelle Runde                                       |
| `header.roundMax`                          | number \| null                 | Regex auf `roundLabelRaw`                                                | Runden-Maximum                                       |
| `header.formatParts`                       | string[]                       | alle `span` der Format-`ul`                                              | Rohliste Kopfzeile                                   |
| `activePlayerIndex`                        | number \| null                 | `getDomActivePlayerColumnIndex()` auf `#ad-ext-player-display`           | Spalte des aktiven Spielers                          |
| `activeRemainingScore`                     | number \| null                 | `players[activePlayerIndex].scoreRemaining`                              | Rest des aktiven Spielers                            |
| `playerScoresRemaining`                    | number[]                       | `players[].scoreRemaining`                                               | Alle Restscores links → rechts                       |
| `players[].index`                          | number                         | Spaltenindex 0…                                                          | Reihenfolge in der Leiste                            |
| `players[].displayName`                    | string \| null                 | `.ad-ext-player-name` Text                                               | Anzeigename                                          |
| `players[].scoreRemaining`                 | number \| null                 | `.ad-ext-player-score`                                                   | Restpunkte                                           |
| `players[].legsWon`                        | number \| null                 | `[class*=3fr5p8] p` o. Ä. in der Spalte                                  | Legs gewonnen                                        |
| `players[].dartsThrownThisTurn`            | number \| null                 | `p` mit `#n` in der Stats-Zeile                                          | UI-Pfeilzähler im Turn                               |
| `players[].averageLeg`                     | number \| null                 | Parse nach ∅ / `/`                                                       | Ø aktuelles Leg                                      |
| `players[].averageMatch`                   | number \| null                 | Parse nach `/` in Ø-Zeile                                                | Ø Match                                              |
| `players[].isActive`                       | boolean                        | `.ad-ext-player` ohne `ad-ext-player-inactive`                           | Aktiver Spieler                                      |
| `players[].statsLineRaw`                   | string \| null                 | volle Stats-Zeile                                                        | Roh für Debug                                        |
| `turn.visitSum`                            | number \| null                 | `.ad-ext-turn-points`                                                    | Summe Punkte aktuelle Aufnahme                       |
| `turn.slots[].empty`                       | boolean                        | `div.score` vs. `div.ad-ext-turn-throw`                                  | Slot leer / belegt                                   |
| `turn.slots[].points`                      | number \| null                 | große Zahl im Flex-Block im Slot                                         | Punkte des Wurfs                                     |
| `turn.slots[].segmentLabel`                | string \| null                 | kleine Zeile (S20, T20, …)                                               | Segment-Kürzel                                       |
| `turn.dartSlotCount`                       | number                         | Anzahl `.score` + `.ad-ext-turn-throw`                                   | typisch 3                                            |
| `turn.filledSlotCount`                     | number                         | Slots mit `empty === false`                                              | Anzahl geworfener Darts im UI                        |
| `turn.dartPoints`                          | (number \| null)[]             | aus `slots`                                                              | Punktliste 3 Slots                                   |
| `turn.dartSegmentLabels`                   | (string \| null)[]             | aus `slots`                                                              | Segmentliste 3 Slots                                 |
| `turn.refereeButtonPresent`                | boolean                        | `button[aria-label="Call referee"]`                                      | KI-Referee sichtbar                                  |
| `turn.refereeButtonDisabled`               | boolean                        | `disabled` am Button                                                     | —                                                    |
| `controls.undoPresent`                     | boolean                        | `button`, Text enthält Undo                                              | —                                                    |
| `controls.undoDisabled`                    | boolean                        | `disabled`                                                               | —                                                    |
| `controls.nextPresent`                     | boolean                        | `button`, Text enthält Next                                              | —                                                    |
| `controls.nextDisabled`                    | boolean                        | `disabled`                                                               | —                                                    |
| `boardView.segmentModeActive`              | boolean                        | `button[aria-label=Segmentmodus]` + `data-active`                        | —                                                    |
| `boardView.coordinateModeActive`           | boolean                        | aria-label Koordinatenmodus + `data-active`                              | —                                                    |
| `boardView.liveModeActive`                 | boolean                        | aria-label Live-Modus + `data-active`                                    | —                                                    |
| `boardView.activeModeLabel`                | string \| null                 | welcher Modus `data-active` hat                                          | Komfortfeld                                          |
| `boardDetection.statusLinkPresent`         | boolean                        | `a.chakra-link.chakra-button` (rot)                                      | Status-Link                                          |
| `boardDetection.statusLinkDisabled`        | boolean                        | `disabled`                                                               | —                                                    |
| `boardDetection.startPresent`              | boolean                        | Buttontext Starten                                                       | —                                                    |
| `boardDetection.startDisabled`             | boolean                        | `disabled`                                                               | —                                                    |
| `boardDetection.resetPresent`              | boolean                        | Buttontext Zurücksetzen                                                  | —                                                    |
| `boardDetection.resetDisabled`             | boolean                        | `disabled`                                                               | —                                                    |
| `boardDetection.calibratePresent`          | boolean                        | `aria-label="Board kalibrieren"`                                         | —                                                    |
| `boardDetection.calibrateDisabled`         | boolean                        | `disabled`                                                               | —                                                    |
| `boardDetection.cancelPresent`             | boolean                        | Buttontext Abbrechen                                                     | —                                                    |
| `boardDetection.cancelDisabled`            | boolean                        | `disabled`                                                               | —                                                    |
| `boardDetection.surrenderPresent`          | boolean                        | Buttontext Aufgeben                                                      | alternativ zu Abbrechen                              |
| `boardDetection.surrenderDisabled`         | boolean                        | `disabled`                                                               | —                                                    |

---

## Noch offen / später

- Weitere **kleine Div-Boxen**, die du ergänzen willst (hier eintragen oder neues Kapitel anhängen).
- **Event-basierte** Variablen (Referee-Klick, Button-Klicks): nur mit **Listeners** oder **MutationObserver**, nicht aus einem rein statischen Snapshot.
- **Konsequente Nutzung** von `lastDomPlaySnapshot` in Visit-Tracker / Throw-Metadaten (schrittweise Migration von der bisherigen Zählkette).
