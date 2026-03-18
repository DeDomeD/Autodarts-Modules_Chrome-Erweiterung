(function initMainSettingsPage(scope) {
  scope.AD_SB_MAIN_SETTINGS = {
    id: "settings",
    icon: "[]",
    navLabelKey: "nav_settings",
    render(context = {}) {
      const needs = context.needs || {};
      const showConnections = !!(needs.streamerbot || needs.obs);
      const showSb = !!needs.streamerbot;
      const showObs = !!needs.obs;

      return `
        <h2 class="title" data-i18n="title_settings">Settings</h2>

        <div class="sectionTitle" data-i18n="section_general">General</div>
        <div class="card">
          <div class="list">
            <div class="listToggle">
              <div class="liText">
                <div class="liTitle" data-i18n="enabled_title">Enabled</div>
                <div class="liSub" data-i18n="enabled_sub">Master switch for all triggers</div>
              </div>
              <label class="switch">
                <input id="enabled" type="checkbox" />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          <div class="formRow">
            <label class="label" for="uiLanguage" data-i18n="language_label">Language</label>
            <select class="input" id="uiLanguage">
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
            <div class="hint" data-i18n="language_hint">Changes all popup texts between German and English.</div>
          </div>
        </div>

        ${showConnections ? `
          <div class="sectionHead">
            <div class="sectionTitle" data-i18n="section_connections">Connections</div>
            <button id="btnSaveConn" class="btnMini" data-i18n="btn_save_connections">Save Connections</button>
          </div>
          <div class="card">
            ${showSb ? `
              <div class="cardHeader">
                <div class="cardTitle" data-i18n="card_streamerbot">Streamer.bot WebSocket</div>
                <div class="pill" id="wsStatus" data-i18n="status_unknown">Unknown</div>
              </div>

              <div class="formRow">
                <label class="label" for="sbUrl" data-i18n="label_ws_url">WS URL</label>
                <input class="input" id="sbUrl" type="text" placeholder="ws://127.0.0.1:8080/" />
                <div class="hint" data-i18n="hint_sb_ws">Streamer.bot WebSocket Server</div>
              </div>

              <div class="formRow">
                <label class="label" for="actionPrefix" data-i18n="label_action_prefix">Action Prefix</label>
                <input class="input" id="actionPrefix" type="text" placeholder="AD-SB " />
                <div class="hint" data-i18n="hint_action_prefix">Actions run as Prefix + Suffix.</div>
              </div>

              <div class="rowSplit">
                <button id="btnTestWS" class="btnPrimary" data-i18n="btn_test_streamerbot">Test Streamer.bot</button>
              </div>
            ` : ""}

            ${showSb && showObs ? `<div class="divider"></div>` : ""}

            ${showObs ? `
              <div class="cardHeader">
                <div class="cardTitle" data-i18n="card_obs">OBS WebSocket</div>
                <div class="pill pillSoft" id="obsStatus" data-i18n="status_coming">Coming</div>
              </div>

              <div class="formRow">
                <label class="label" for="obsUrl" data-i18n="label_ws_url">WS URL</label>
                <input class="input" id="obsUrl" type="text" placeholder="ws://127.0.0.1:4455/" />
                <div class="hint" data-i18n="hint_obs_ws">OBS WebSocket Server</div>
              </div>
            ` : ""}
          </div>
        ` : ""}

        <div class="sectionTitle" style="margin-top:14px;" data-i18n="section_throw_filter">Throw Filter</div>
        <div class="card">
          <div class="list">
            <div class="listToggle">
              <div class="liText">
                <div class="liTitle" data-i18n="only_my_throws_title">Only my throws</div>
                <div class="liSub" data-i18n="only_my_throws_sub">Filter by player index</div>
              </div>
              <label class="switch">
                <input id="onlyMyThrows" type="checkbox" />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          <div class="formRow">
            <label class="label" for="myPlayerIndex" data-i18n="label_my_player_index">My player index</label>
            <input class="input" id="myPlayerIndex" type="number" min="0" step="1" />
            <div class="hint" data-i18n="hint_my_player_index">Used when enabled.</div>
          </div>
        </div>

        <div class="sectionTitle" style="margin-top:14px;" data-i18n="section_debug">Debug</div>
        <div class="card">
          <div class="list">
            <div class="listToggle">
              <div class="liText">
                <div class="liTitle" data-i18n="debug_actions_title">Debug: Actions</div>
                <div class="liSub" data-i18n="debug_actions_sub">Console logs for actions</div>
              </div>
              <label class="switch">
                <input type="checkbox" id="debugActions" />
                <span class="slider"></span>
              </label>
            </div>

            <div class="listToggle">
              <div class="liText">
                <div class="liTitle" data-i18n="debug_game_events_title">Debug: Game Events</div>
                <div class="liSub" data-i18n="debug_game_events_sub">Console logs for events</div>
              </div>
              <label class="switch">
                <input type="checkbox" id="debugGameEvents" />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>

        <div class="sectionTitle" style="margin-top:14px;" data-i18n="section_settings">Settings</div>
        <div class="card">
          <div class="hint" data-i18n="settings_io_hint">Import or export your current settings.</div>
          <div class="rowSplit" style="margin-top:10px;">
            <button id="btnSaveIni" class="btnPrimary" data-i18n="btn_save">Save</button>
            <button id="btnLoadIni" class="btn" data-i18n="btn_load">Load</button>
          </div>
          <input id="iniFileInput" type="file" accept=".ini,text/plain" style="display:none;" />
          <div class="hint" id="iniStatus" style="margin-top:8px;"></div>
        </div>
      `;
    },
    bind(api) {
      const root = api.root;

      root.querySelector("#btnSaveConn")?.addEventListener("click", async () => {
        await api.savePartial({
          sbUrl: root.querySelector("#sbUrl")?.value?.trim() || "",
          obsUrl: root.querySelector("#obsUrl")?.value?.trim() || "",
          actionPrefix: api.normalizePrefix(root.querySelector("#actionPrefix")?.value || "")
        });
      });

      root.querySelector("#btnTestWS")?.addEventListener("click", async () => {
        await api.send({ type: "SB_TEST" });
        setTimeout(api.refreshSbStatus, 150);
      });

      root.querySelector("#btnLoadIni")?.addEventListener("click", () => {
        const input = root.querySelector("#iniFileInput");
        if (!input) return;
        input.value = "";
        input.click();
      });

      root.querySelector("#iniFileInput")?.addEventListener("change", async (ev) => {
        const statusEl = root.querySelector("#iniStatus");
        try {
          const file = ev?.target?.files?.[0];
          if (!file) return;
          if (statusEl) statusEl.textContent = api.t("status_loading");
          const text = await file.text();
          const partial = api.parseIniSettings(text);
          if (Object.keys(partial).length === 0) throw new Error(api.t("status_no_valid_values"));
          await api.savePartial(partial);
          if (statusEl) statusEl.textContent = api.t("status_loaded_from", { name: file.name });
        } catch (e) {
          if (statusEl) statusEl.textContent = api.t("status_load_failed", { error: String(e?.message || e) });
        }
      });

      root.querySelector("#btnSaveIni")?.addEventListener("click", async () => {
        const statusEl = root.querySelector("#iniStatus");
        try {
          if (statusEl) statusEl.textContent = api.t("status_loading");
          const ini = api.toIniText(api.getSettings());
          const blob = new Blob([ini], { type: "text/plain;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "settings.ini";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          if (statusEl) statusEl.textContent = api.t("status_saved_download");
        } catch (e) {
          if (statusEl) statusEl.textContent = api.t("status_save_failed", { error: String(e?.message || e) });
        }
      });

      api.bindAuto(root, "enabled", "enabled");
      api.bindAuto(root, "uiLanguage", "uiLanguage", "text");
      api.bindAuto(root, "onlyMyThrows", "onlyMyThrows");
      api.bindAuto(root, "myPlayerIndex", "myPlayerIndex", "number");
      api.bindAuto(root, "debugActions", "debugActions");
      api.bindAuto(root, "debugGameEvents", "debugGameEvents");
    },
    sync(api, settings) {
      const root = api.root;
      const s = settings || {};
      api.setValue(root, "sbUrl", s.sbUrl || "");
      api.setValue(root, "obsUrl", s.obsUrl || "");
      api.setValue(root, "actionPrefix", String(s.actionPrefix || "").trim());
      api.setChecked(root, "enabled", !!s.enabled);
      api.setValue(root, "uiLanguage", String(s.uiLanguage || "de").toLowerCase() === "en" ? "en" : "de");
      api.setChecked(root, "onlyMyThrows", !!s.onlyMyThrows);
      api.setValue(root, "myPlayerIndex", Number.isFinite(s.myPlayerIndex) ? s.myPlayerIndex : 0);
      api.setChecked(root, "debugActions", !!s.debugActions);
      api.setChecked(root, "debugGameEvents", !!s.debugGameEvents);

      const statusEl = root.querySelector("#iniStatus");
      if (statusEl && !statusEl.textContent) statusEl.textContent = api.t("status_idle");
    }
  };
})(window);
