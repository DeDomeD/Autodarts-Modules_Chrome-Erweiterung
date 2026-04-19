(function initPixelitModule(scope) {
  scope.AD_SB_MODULES = scope.AD_SB_MODULES || {};

  scope.AD_SB_MODULES.pixelit = {
    id: "pixelit",
    icon: "P",
    navLabelKey: "nav_pixelit",
    needs: { streamerbot: false, obs: false },
    render() {
      return `
        <h2 class="title"><span data-i18n="title_pixelit">PixelIt</span><span class="titleMeta">LED</span></h2>
        <div class="card">
          <p class="hint" data-i18n="pixelit_intro_hint">
            Steuert eine PixelIt-Matrix im LAN per HTTP POST /api/screen (siehe pixelit-project.github.io). Trigger wie bei WLED; Platzhalter im Text: {segment}, {score}, {sum}, {playerName}, …
          </p>
          <div class="formRow">
            <label class="label" for="pixelitBaseUrl" data-i18n="pixelit_base_url_label">Geräte-URL</label>
            <input class="input" id="pixelitBaseUrl" type="text" placeholder="http://192.168.178.2" />
            <div class="hint" data-i18n="pixelit_base_url_hint">Ohne Pfad — Port 80 wird angenommen, z. B. http://pixelit.local</div>
          </div>
          <div class="formRow">
            <label class="label" for="pixelitMinIntervalMs" data-i18n="pixelit_min_interval_label">Min. Abstand (ms)</label>
            <input class="input" id="pixelitMinIntervalMs" type="number" min="0" max="60000" step="50" />
            <div class="hint" data-i18n="pixelit_min_interval_hint">Begrenzt HTTP-Traffic zwischen zwei Screen-Posts.</div>
          </div>
          <div class="formRow">
            <label class="label" for="pixelitTestText" data-i18n="pixelit_test_text_label">Test-Text</label>
            <input class="input" id="pixelitTestText" type="text" maxlength="120" />
          </div>
          <div class="rowSplit">
            <button type="button" class="btnPrimary" id="pixelitBtnMatrixInfo" data-i18n="pixelit_test_matrix_btn">Matrixinfo laden</button>
            <button type="button" class="btnPrimary" id="pixelitBtnTestScreen" data-i18n="pixelit_test_screen_btn">Test-Screen senden</button>
          </div>
          <div class="formRow" id="pixelitStatusRow" style="display:none;">
            <label class="label" data-i18n="pixelit_status_label">Status</label>
            <pre class="input" id="pixelitStatus" style="white-space:pre-wrap;min-height:3em;font-size:11px;"></pre>
          </div>
        </div>
        <div class="sectionTitle" style="margin-top:14px;" data-i18n="pixelit_effects_section">Trigger → Text</div>
        <div class="card">
          <div class="formRow">
            <label class="label" for="pixelitEffectsJson" data-i18n="pixelit_effects_json_label">pixelitEffectsJson</label>
            <textarea class="input" id="pixelitEffectsJson" rows="12" spellcheck="false" placeholder="[]"></textarea>
            <div class="hint" data-i18n="pixelit_effects_json_hint">JSON-Array: je Eintrag trigger, textTemplate, optional bigFont, scrollText, hexColor, brightness, switchAnimation, playerFilter, extraScreenJson (rohes JSON wird mit Text zusammengeführt).</div>
          </div>
        </div>
        <div class="spacer"></div>
      `;
    },
    bind(api) {
      const root = api.root;
      api.bindAutoImmediate(root, "pixelitBaseUrl", "pixelitBaseUrl", (v) => String(v || "").trim());
      api.bindAutoImmediate(root, "pixelitEffectsJson", "pixelitEffectsJson", (v) => String(v || ""));
      api.bindAutoImmediate(root, "pixelitTestText", "pixelitTestText", (v) => String(v || "").trim().slice(0, 120));

      const minEl = root.querySelector("#pixelitMinIntervalMs");
      if (minEl) {
        const commit = async () => {
          const n = parseInt(String(minEl.value || "0"), 10);
          const v = Number.isFinite(n) ? Math.max(0, Math.min(60000, n)) : 600;
          await api.savePartial({ pixelitMinIntervalMs: v });
        };
        minEl.addEventListener("change", () => void commit());
        minEl.addEventListener("input", () => {
          clearTimeout(minEl._deb);
          minEl._deb = setTimeout(() => void commit(), 300);
        });
      }

      const statusRow = root.querySelector("#pixelitStatusRow");
      const statusEl = root.querySelector("#pixelitStatus");
      const showStatus = (text, ok) => {
        if (!statusEl || !statusRow) return;
        statusRow.style.display = "";
        statusEl.textContent = text;
        statusEl.style.borderColor = ok ? "" : "var(--danger, #c00)";
      };

      root.querySelector("#pixelitBtnMatrixInfo")?.addEventListener("click", async () => {
        const endpoint = api.getSettings?.()?.pixelitBaseUrl || root.querySelector("#pixelitBaseUrl")?.value;
        showStatus("…", true);
        const res = await api.send({ type: "GET_PIXELIT_MATRIXINFO", endpoint });
        if (res?.ok) {
          showStatus(JSON.stringify(res.info || {}, null, 2), true);
        } else {
          showStatus(String(res?.error || "failed"), false);
        }
      });

      root.querySelector("#pixelitBtnTestScreen")?.addEventListener("click", async () => {
        const endpoint = api.getSettings?.()?.pixelitBaseUrl || root.querySelector("#pixelitBaseUrl")?.value;
        const text = String(root.querySelector("#pixelitTestText")?.value || api.getSettings?.()?.pixelitTestText || "ADM").trim() || "ADM";
        showStatus("…", true);
        const res = await api.send({
          type: "TRIGGER_PIXELIT_TEST",
          endpoint,
          text
        });
        if (res?.ok) {
          showStatus("OK", true);
        } else {
          showStatus(String(res?.error || "failed"), false);
        }
      });
    },
    sync(api, settings) {
      const root = api.root;
      const s = settings || {};
      api.setValue(root, "pixelitBaseUrl", s.pixelitBaseUrl || "");
      api.setValue(root, "pixelitMinIntervalMs", String(Number.isFinite(Number(s.pixelitMinIntervalMs)) ? s.pixelitMinIntervalMs : 600));
      api.setValue(root, "pixelitTestText", s.pixelitTestText || "ADM");
      api.setValue(root, "pixelitEffectsJson", String(s.pixelitEffectsJson != null ? s.pixelitEffectsJson : "[]"));
    }
  };
})(window);
