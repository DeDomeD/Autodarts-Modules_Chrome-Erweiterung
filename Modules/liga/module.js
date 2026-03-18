(function initLigaModule(scope) {
  scope.AD_SB_MODULES = scope.AD_SB_MODULES || {};

  function parseMatches(raw) {
    try {
      const list = JSON.parse(String(raw || "[]"));
      if (!Array.isArray(list)) return [];
      return list
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          id: String(item.id || `${item.date || ""}-${item.opponent || ""}-${Math.random()}`).trim(),
          date: String(item.date || "").trim(),
          opponent: String(item.opponent || "").trim(),
          mode: String(item.mode || "heim").trim().toLowerCase(),
          status: String(item.status || "offen").trim().toLowerCase(),
          score: String(item.score || "").trim(),
          source: String(item.source || "manual").trim().toLowerCase()
        }))
        .filter((item) => item.opponent);
    } catch {
      return [];
    }
  }

  function serializeMatches(list) {
    return JSON.stringify(list || []);
  }

  function sortMatches(list) {
    return [...list].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  }

  function renderMatches(settings) {
    const matches = sortMatches(parseMatches(settings?.ligaMatchesJson));
    if (!matches.length) {
      return `<div class="hint">Noch keine Liga-Spiele eingetragen.</div>`;
    }
    const rows = matches.map((match) => `
      <tr>
        <td>${match.date || "-"}</td>
        <td>${match.opponent}</td>
        <td>${match.mode === "auswaerts" ? "Auswärts" : "Heim"}</td>
        <td>${match.status || "offen"}</td>
        <td>${match.score || "-"}</td>
        <td>${match.source === "import" ? "Import" : "Manuell"}</td>
        <td><button type="button" class="btnMini" data-liga-remove="${match.id}">X</button></td>
      </tr>
    `).join("");
    return `
      <div style="overflow:auto;">
        <table class="ligaTable">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Gegner</th>
              <th>Ort</th>
              <th>Status</th>
              <th>Ergebnis</th>
              <th>Quelle</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  async function saveMatches(api, nextMatches) {
    await api.savePartial({ ligaMatchesJson: serializeMatches(sortMatches(nextMatches)) });
  }

  function parseImportText(raw) {
    const text = String(raw || "").trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((item, idx) => ({
          id: String(item.id || `import-${idx}`),
          date: String(item.date || "").trim(),
          opponent: String(item.opponent || "").trim(),
          mode: String(item.mode || "heim").trim().toLowerCase(),
          status: String(item.status || "offen").trim().toLowerCase(),
          score: String(item.score || "").trim(),
          source: "import"
        })).filter((item) => item.opponent);
      }
    } catch {}

    return text
      .split(/\r?\n/)
      .map((line, idx) => {
        const parts = line.split("|").map((part) => String(part || "").trim());
        return {
          id: `import-line-${idx}`,
          date: parts[0] || "",
          opponent: parts[1] || "",
          mode: String(parts[2] || "heim").toLowerCase(),
          status: String(parts[3] || "offen").toLowerCase(),
          score: parts[4] || "",
          source: "import"
        };
      })
      .filter((item) => item.opponent);
  }

  scope.AD_SB_MODULES.liga = {
    id: "liga",
    icon: "L",
    navLabelKey: "nav_liga",
    needs: { streamerbot: false, obs: false },
    render() {
      return `
        <h2 class="title"><span data-i18n="title_liga">Liga</span><span class="titleMeta">Own Platform</span></h2>
        <div class="card">
          <div class="list">
            <div class="listToggle">
              <div class="liText">
                <div class="liTitle">Liga-Modul aktiv</div>
                <div class="liSub">Verwalte Liga-Daten, Spieltage und Match-Liste direkt im Popup.</div>
              </div>
              <label class="switch">
                <input id="ligaEnabled" type="checkbox" />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="formRow">
            <label class="label" for="ligaName">Liga</label>
            <input class="input" id="ligaName" type="text" placeholder="z.B. Bezirksliga Nord" />
          </div>
          <div class="formRow">
            <label class="label" for="ligaSeason">Saison</label>
            <input class="input" id="ligaSeason" type="text" placeholder="2026" />
          </div>
          <div class="formRow">
            <label class="label" for="ligaTeamName">Team / Spieler</label>
            <input class="input" id="ligaTeamName" type="text" placeholder="Mein Team" />
          </div>
          <div class="formRow">
            <label class="label" for="ligaSourceUrl">Eigene Liga-Website</label>
            <input class="input" id="ligaSourceUrl" type="text" placeholder="https://deine-liga-website.de/" />
            <div class="rowSplit" style="margin-top:10px;">
              <button id="ligaOpenWebsite" class="btnPrimary" type="button">Website öffnen</button>
            </div>
          </div>
          <div class="formRow">
            <div class="hint">Hier kommt später deine eigene Liga-Website hin. Die Tabelle unten bleibt für deine lokale Match-Verwaltung im Modul.</div>
          </div>
        </div>

        <div class="sectionTitle" style="margin-top:14px;">Spiele importieren</div>
        <div class="card">
          <div class="hint">Automatisch über einen Import-Block: JSON-Array oder pro Zeile <code>Datum | Gegner | heim/auswaerts | status | score</code>.</div>
          <div class="formRow">
            <label class="label" for="ligaImportText">Import</label>
            <textarea class="input" id="ligaImportText" rows="6" placeholder='[{"date":"2026-03-20","opponent":"Team B","mode":"heim","status":"geplant","score":""}]'></textarea>
          </div>
          <div class="rowSplit">
            <button id="ligaImportBtn" class="btnPrimary" type="button">Importieren</button>
          </div>
        </div>

        <div class="sectionTitle" style="margin-top:14px;">Spiel manuell erfassen</div>
        <div class="card">
          <div class="formRow">
            <label class="label" for="ligaMatchDate">Datum</label>
            <input class="input" id="ligaMatchDate" type="date" />
          </div>
          <div class="formRow">
            <label class="label" for="ligaMatchOpponent">Gegner</label>
            <input class="input" id="ligaMatchOpponent" type="text" placeholder="Gegner-Team" />
          </div>
          <div class="formRow">
            <label class="label" for="ligaMatchMode">Ort</label>
            <select class="input" id="ligaMatchMode">
              <option value="heim">Heim</option>
              <option value="auswaerts">Auswärts</option>
            </select>
          </div>
          <div class="formRow">
            <label class="label" for="ligaMatchStatus">Status</label>
            <select class="input" id="ligaMatchStatus">
              <option value="offen">Offen</option>
              <option value="geplant">Geplant</option>
              <option value="gespielt">Gespielt</option>
            </select>
          </div>
          <div class="formRow">
            <label class="label" for="ligaMatchScore">Ergebnis</label>
            <input class="input" id="ligaMatchScore" type="text" placeholder="z.B. 8:4" />
          </div>
          <div class="rowSplit">
            <button id="ligaAddMatchBtn" class="btnPrimary" type="button">Spiel hinzufügen</button>
          </div>
        </div>

        <div class="sectionTitle" style="margin-top:14px;">Spiel-Liste</div>
        <div class="card">
          <div id="ligaMatchesMount" class="list"></div>
        </div>
        <div class="spacer"></div>
      `;
    },
    bind(api) {
      const root = api.root;
      api.bindAuto(root, "ligaEnabled", "ligaEnabled");
      api.bindAuto(root, "ligaName", "ligaName", "text");
      api.bindAuto(root, "ligaSeason", "ligaSeason", "text");
      api.bindAuto(root, "ligaTeamName", "ligaTeamName", "text");
      api.bindAuto(root, "ligaSourceUrl", "ligaSourceUrl", "text");

      root.querySelector("#ligaOpenWebsite")?.addEventListener("click", () => {
        const url = String(api.getSettings()?.ligaSourceUrl || "").trim();
        if (!url) return;
        if (chrome?.tabs?.create) chrome.tabs.create({ url });
        else window.open(url, "_blank");
      });

      root.querySelector("#ligaImportBtn")?.addEventListener("click", async () => {
        const settings = api.getSettings?.() || {};
        const text = root.querySelector("#ligaImportText")?.value || "";
        const imported = parseImportText(text);
        if (!imported.length) return;
        const existing = parseMatches(settings?.ligaMatchesJson);
        const merged = [...existing];
        for (const item of imported) {
          if (merged.some((match) => match.date === item.date && match.opponent === item.opponent)) continue;
          merged.push(item);
        }
        await saveMatches(api, merged);
        const area = root.querySelector("#ligaImportText");
        if (area) area.value = "";
      });

      root.querySelector("#ligaAddMatchBtn")?.addEventListener("click", async () => {
        const settings = api.getSettings?.() || {};
        const date = String(root.querySelector("#ligaMatchDate")?.value || "").trim();
        const opponent = String(root.querySelector("#ligaMatchOpponent")?.value || "").trim();
        const mode = String(root.querySelector("#ligaMatchMode")?.value || "heim").trim().toLowerCase();
        const status = String(root.querySelector("#ligaMatchStatus")?.value || "offen").trim().toLowerCase();
        const score = String(root.querySelector("#ligaMatchScore")?.value || "").trim();
        if (!opponent) return;
        const matches = parseMatches(settings?.ligaMatchesJson);
        matches.push({
          id: `manual-${Date.now()}`,
          date,
          opponent,
          mode,
          status,
          score,
          source: "manual"
        });
        await saveMatches(api, matches);
        const ids = ["#ligaMatchDate", "#ligaMatchOpponent", "#ligaMatchScore"];
        ids.forEach((selector) => {
          const el = root.querySelector(selector);
          if (el) el.value = "";
        });
      });

      root.addEventListener("click", async (ev) => {
        const target = ev.target;
        if (!target || !target.closest) return;
        const removeBtn = target.closest("[data-liga-remove]");
        if (!removeBtn) return;
        const id = String(removeBtn.dataset.ligaRemove || "").trim();
        if (!id) return;
        const settings = api.getSettings?.() || {};
        const matches = parseMatches(settings?.ligaMatchesJson).filter((item) => item.id !== id);
        await saveMatches(api, matches);
      });
    },
    sync(api, settings) {
      const root = api.root;
      const s = settings || {};
      api.setChecked(root, "ligaEnabled", !!s.ligaEnabled);
      api.setValue(root, "ligaName", s.ligaName || "");
      api.setValue(root, "ligaSeason", s.ligaSeason || "");
      api.setValue(root, "ligaTeamName", s.ligaTeamName || "");
      api.setValue(root, "ligaSourceUrl", s.ligaSourceUrl || "");
      const mount = root.querySelector("#ligaMatchesMount");
      if (mount) mount.innerHTML = renderMatches(s);
    }
  };
})(window);
