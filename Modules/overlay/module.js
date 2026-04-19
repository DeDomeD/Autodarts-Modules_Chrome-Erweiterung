(function initOverlayModule(scope) {
  scope.AD_SB_MODULES = scope.AD_SB_MODULES || {};
  let CONNECTIONS_OPEN = false;

  function renderConnectionButton(kind, label) {
    return `
      <button
        type="button"
        class="connectionStatusBtn"
        data-connection-kind="${kind}"
        ${kind === "obs" ? "data-obs-status" : "data-sb-status"}
        data-connection-retry="${kind}"
      >
        <div class="connectionStatusLabel">
          <span>${label}</span>
          <span class="connectionStatusText" data-connection-status-text></span>
          <span class="connectionStatusAttempts" data-connection-attempts></span>
        </div>
      </button>
    `;
  }

  scope.AD_SB_MODULES.overlay = {
    id: "overlay",
    icon: "O",
    navLabelKey: "nav_overlay",
    needs: { streamerbot: false, obs: false },
    render() {
      return `
        <h2 class="title"><span data-i18n="title_overlay">Overlay</span><span class="titleMeta">OBS/Web</span></h2>

        <div class="card">
          <div class="sectionHead">
            <div class="sectionTitle" style="margin:0;" data-i18n="section_connections">Verbindungen</div>
            <button type="button" class="miniChevronBtn${CONNECTIONS_OPEN ? " active" : ""}" id="overlayConnectionToggle" aria-label="Overlay Verbindungen" title="Overlay Verbindungen"><span class="ddArrow">${CONNECTIONS_OPEN ? "^" : "v"}</span></button>
          </div>
          <div class="connectionStatusGrid" id="overlayConnectionGrid" data-connections-open="${CONNECTIONS_OPEN ? "true" : "false"}">
            ${renderConnectionButton("obs", "OBS")}
            ${renderConnectionButton("sb", "Streamer.bot")}
          </div>
          <div class="inlinePopupWrap${CONNECTIONS_OPEN ? " open" : ""}" id="overlayConnectionWrap" style="padding:0; border-top:none; background:transparent;">
            <div class="formRow">
              <div class="connectionInputHeader">
                <label class="label" for="overlayObsUrl">OBS WS URL</label>
                <div class="connectionInputSwitch">
                  <span>Aktiv</span>
                  <label class="switch switchCompact"><input id="overlayObsEnabled" type="checkbox" /><span class="slider"></span></label>
                </div>
              </div>
              <input class="input" id="overlayObsUrl" type="text" placeholder="ws://127.0.0.1:4455/" />
              <div class="hint" data-i18n="hint_obs_ws">OBS WebSocket Server</div>
            </div>
            <div class="formRow">
              <label class="label" for="overlayObsPassword">OBS Passwort</label>
              <input class="input" id="overlayObsPassword" type="password" placeholder="optional" />
            </div>
            <div class="divider"></div>
            <div class="formRow">
              <div class="connectionInputHeader">
                <label class="label" for="overlaySbUrl">Streamer.bot WS URL</label>
                <div class="connectionInputSwitch">
                  <span>Aktiv</span>
                  <label class="switch switchCompact"><input id="overlaySbEnabled" type="checkbox" /><span class="slider"></span></label>
                </div>
              </div>
              <input class="input" id="overlaySbUrl" type="text" placeholder="ws://127.0.0.1:8080/" />
              <div class="hint" data-i18n="hint_sb_ws">Streamer.bot WebSocket Server</div>
            </div>
            <div class="formRow">
              <label class="label" for="overlaySbPassword">Streamer.bot Passwort</label>
              <input class="input" id="overlaySbPassword" type="password" placeholder="optional" />
            </div>
            <div class="formRow">
              <label class="label" for="overlayActionPrefix" data-i18n="label_action_prefix">Action Prefix</label>
              <input class="input" id="overlayActionPrefix" type="text" placeholder="AD-SB " />
              <div class="hint" data-i18n="hint_action_prefix">Actions run as Prefix + Suffix.</div>
            </div>
          </div>

          <div class="divider"></div>
          <div class="cardHeader">
            <div class="cardTitle" data-i18n="card_overlay_endpoint">Overlay Endpoint</div>
            <div class="pill pillSoft" data-i18n="status_coming">Coming</div>
          </div>

          <div class="list">
            <div class="formRow">
              <label class="label" for="overlayWsPort" data-i18n="label_port">Port</label>
              <input class="input" id="overlayWsPort" type="number" min="1" max="65535" step="1" />
              <div class="hint" data-i18n="hint_overlay_port">Used later to provide overlay data.</div>
            </div>

            <div class="rowSplit" style="margin-top:10px;">
              <button id="btnOpenOverlay" class="btnPrimary" data-i18n="btn_open_overlay">Open Overlay</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="cardHeader">
            <div class="cardTitle" data-i18n="overlay_pdc_appearance">PDC-TV Glow</div>
          </div>
          <div class="list">
            <div class="formRow">
              <label class="label" for="overlayPdcGlowHue" data-i18n="overlay_pdc_glow_hue">Glow-Farbe (Farbton)</label>
              <div style="display:flex;align-items:center;gap:10px;width:100%;flex-wrap:wrap;">
                <input type="range" id="overlayPdcGlowHue" class="hueSlider" min="0" max="360" step="1" />
                <span id="overlayPdcGlowHueOut" style="min-width:2.75em;font-variant-numeric:tabular-nums;text-align:right">172</span>
                <span style="opacity:0.7">°</span>
              </div>
              <div class="hint" data-i18n="overlay_pdc_glow_hue_hint">Gilt für das OBS-Overlay bei Schema „PDC TV Official“ (0–360°).</div>
            </div>
            <div class="formRow">
              <label class="label" for="overlayPdcGlowIntensity" data-i18n="overlay_pdc_glow_intensity">Glow-Intensität</label>
              <div style="display:flex;align-items:center;gap:10px;width:100%;">
                <input
                  type="range"
                  id="overlayPdcGlowIntensity"
                  min="0"
                  max="100"
                  step="1"
                  style="flex:1;min-width:0;accent-color:var(--accent);"
                />
                <span id="overlayPdcGlowIntensityOut" style="min-width:2.5em;font-variant-numeric:tabular-nums;text-align:right">100</span>
                <span style="opacity:0.7">%</span>
              </div>
              <div class="hint" data-i18n="overlay_pdc_glow_intensity_hint">0 = aus, 100 = volle Stärke.</div>
            </div>
          </div>
        </div>

        <div class="spacer"></div>
      `;
    },
    bind(api) {
      const root = api.root;
      root.querySelector("#overlayConnectionToggle")?.addEventListener("click", () => {
        CONNECTIONS_OPEN = !CONNECTIONS_OPEN;
        scope.AD_SB_MODULES.overlay.sync(api, api.getSettings?.() || {});
      });
      api.bindAuto(root, "overlayObsEnabled", "obsEnabled");
      api.bindAuto(root, "overlaySbEnabled", "sbEnabled");
      api.bindAuto(root, "overlayWsPort", "overlayWsPort", "number");
      api.bindAutoImmediate(root, "overlayObsUrl", "obsUrl", (value) => String(value || "").trim());
      api.bindAutoImmediate(root, "overlayObsPassword", "obsPassword", (value) => String(value || ""));
      api.bindAutoImmediate(root, "overlaySbUrl", "sbUrl", (value) => String(value || "").trim());
      api.bindAutoImmediate(root, "overlaySbPassword", "sbPassword", (value) => String(value || ""));
      api.bindAutoImmediate(root, "overlayActionPrefix", "actionPrefix", (value) => api.normalizePrefix(value || ""));
      root.querySelectorAll("[data-connection-retry]").forEach((button) => {
        button.addEventListener("click", async () => {
          const kind = String(button.dataset.connectionRetry || "");
          if (kind === "sb") await api.send({ type: "SB_RETRY" });
          if (kind === "obs") await api.send({ type: "OBS_RETRY" });
          setTimeout(() => api.refreshConnectionStatuses?.(), 150);
        });
      });
      root.querySelector("#btnOpenOverlay")?.addEventListener("click", () => {
        const sbws = encodeURIComponent(String(api.getSettings()?.sbUrl || "ws://127.0.0.1:8080/").trim());
        const url = chrome.runtime.getURL(`Modules/overlay/OBS/index.html?sbws=${sbws}`);
        if (chrome?.tabs?.create) {
          chrome.tabs.create({ url });
          return;
        }
        window.open(url, "_blank");
      });

      const hueEl = root.querySelector("#overlayPdcGlowHue");
      const hueOut = root.querySelector("#overlayPdcGlowHueOut");
      const intEl = root.querySelector("#overlayPdcGlowIntensity");
      const intOut = root.querySelector("#overlayPdcGlowIntensityOut");
      const syncHueThumb = () => {
        if (!hueEl) return;
        hueEl.style.setProperty("--hue", String(parseInt(hueEl.value, 10) || 0));
      };
      let hueDebounce = null;
      let intDebounce = null;
      const commitGlow = async (partial) => {
        await api.savePartial(partial);
      };
      hueEl?.addEventListener("input", () => {
        syncHueThumb();
        if (hueOut) hueOut.textContent = String(hueEl.value);
        if (hueDebounce) clearTimeout(hueDebounce);
        hueDebounce = setTimeout(() => {
          hueDebounce = null;
          void commitGlow({ pdcGlowHue: parseInt(hueEl.value, 10) });
        }, 140);
      });
      hueEl?.addEventListener("change", () => {
        syncHueThumb();
        if (hueDebounce) {
          clearTimeout(hueDebounce);
          hueDebounce = null;
        }
        if (hueOut) hueOut.textContent = String(hueEl.value);
        void commitGlow({ pdcGlowHue: parseInt(hueEl.value, 10) });
      });
      intEl?.addEventListener("input", () => {
        if (intOut) intOut.textContent = String(intEl.value);
        if (intDebounce) clearTimeout(intDebounce);
        intDebounce = setTimeout(() => {
          intDebounce = null;
          void commitGlow({ pdcGlowIntensity: parseInt(intEl.value, 10) });
        }, 140);
      });
      intEl?.addEventListener("change", () => {
        if (intDebounce) {
          clearTimeout(intDebounce);
          intDebounce = null;
        }
        if (intOut) intOut.textContent = String(intEl.value);
        void commitGlow({ pdcGlowIntensity: parseInt(intEl.value, 10) });
      });
    },
    sync(api, settings) {
      const root = api.root;
      const s = settings || {};
      api.setChecked(root, "overlayObsEnabled", s.obsEnabled !== false);
      api.setChecked(root, "overlaySbEnabled", s.sbEnabled !== false);
      api.setValue(root, "overlayObsUrl", s.obsUrl || "");
      api.setValue(root, "overlayObsPassword", s.obsPassword || "");
      api.setValue(root, "overlaySbUrl", s.sbUrl || "");
      api.setValue(root, "overlaySbPassword", s.sbPassword || "");
      api.setValue(root, "overlayActionPrefix", String(s.actionPrefix || "").trim());
      api.setValue(root, "overlayWsPort", Number.isFinite(s.overlayWsPort) ? s.overlayWsPort : 4455);
      const gh = Number.isFinite(s.pdcGlowHue) ? Math.max(0, Math.min(360, Math.round(s.pdcGlowHue))) : 172;
      const gi = Number.isFinite(s.pdcGlowIntensity) ? Math.max(0, Math.min(100, Math.round(s.pdcGlowIntensity))) : 100;
      const hueEl = root.querySelector("#overlayPdcGlowHue");
      const intEl = root.querySelector("#overlayPdcGlowIntensity");
      if (hueEl) {
        hueEl.value = String(gh);
        hueEl.style.setProperty("--hue", String(gh));
      }
      if (intEl) intEl.value = String(gi);
      const hueOut = root.querySelector("#overlayPdcGlowHueOut");
      const intOut = root.querySelector("#overlayPdcGlowIntensityOut");
      if (hueOut) hueOut.textContent = String(gh);
      if (intOut) intOut.textContent = String(gi);
      const connectionWrap = root.querySelector("#overlayConnectionWrap");
      if (connectionWrap) connectionWrap.classList.toggle("open", CONNECTIONS_OPEN);
      const connectionGrid = root.querySelector("#overlayConnectionGrid");
      if (connectionGrid) {
        connectionGrid.dataset.connectionsOpen = CONNECTIONS_OPEN ? "true" : "false";
        const visibleCount = Array.from(connectionGrid.querySelectorAll("[data-connection-kind]")).filter((node) => {
          const kind = String(node.dataset.connectionKind || "");
          return kind === "obs" ? s.obsEnabled !== false : s.sbEnabled !== false;
        }).length;
        connectionGrid.classList.toggle("compactSingle", visibleCount <= 1);
      }
      const connectionToggle = root.querySelector("#overlayConnectionToggle");
      if (connectionToggle) {
        connectionToggle.classList.toggle("active", CONNECTIONS_OPEN);
        connectionToggle.innerHTML = `<span class="ddArrow">${CONNECTIONS_OPEN ? "^" : "v"}</span>`;
      }
      api.refreshConnectionStatuses?.();
    }
  };
})(window);
