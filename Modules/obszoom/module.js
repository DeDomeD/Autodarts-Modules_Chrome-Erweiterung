(function initObsZoomModule(scope) {
  scope.AD_SB_MODULES = scope.AD_SB_MODULES || {};
  let CONNECTIONS_OPEN = false;
  let OBS_SCENES = [];
  let SOURCE_PICKER_OPEN = false;
  let OBS_SCENE_SOURCES = [];
  let OBS_SELECTED_SOURCE = "";
  let WARNING_MODAL_OPEN = false;
  let WARNING_MODAL_TITLE = "";
  let WARNING_MODAL_MESSAGE = "";
  let WARNING_MODAL_CONFIRM_LABEL = "Fortfahren";
  let WARNING_MODAL_ACTION = null;
  let OBS_MOVE_DURATION = 300;
  let OBS_EASING_TYPE = 3;
  let OBS_EASING_FUNCTION = 2;
  let OBS_INCLUDE_SINGLES = true;
  let OBS_INCLUDE_DOUBLES = true;
  let OBS_INCLUDE_TRIPLES = true;
  let OBS_TEST_TRIGGER = "T20";
  const OBS_MOVE_PLUGIN_DOWNLOAD_URL = "https://obsproject.com/forum/resources/move.913/";
  const DEFAULT_WEBSITE_BASE = "https://autodarts-modules-production.up.railway.app";

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function getObsZoomGuidePageUrl(api) {
    try {
      const base = api.normalizeWebsiteApiUrl?.(api.getSettings?.()?.websiteApiUrl) || DEFAULT_WEBSITE_BASE;
      return `${String(base).replace(/\/+$/, "")}/modules/obszoom.html#anleitung`;
    } catch {
      return `${DEFAULT_WEBSITE_BASE}/modules/obszoom.html#anleitung`;
    }
  }

  function renderTestButtons() {
    const presets = [
      { value: "T20", label: "T20" },
      { value: "BULL", label: "BULL" },
      { value: "D10", label: "D10" },
      { value: "T19", label: "T19" },
      { value: "MAIN", label: "Main" }
    ];
    return presets.map((p) => `
      <button class="btnMini" type="button" data-obs-zoom-test-preset="${p.value}">${p.label}</button>
    `).join("");
  }

  async function flushObsZoomToStorage(api, root) {
    const sceneName = normalizeText(root.querySelector("#obsZoomSceneSelect")?.value);
    const durationEl = root.querySelector("#obsZoomMoveDuration");
    const duration = Math.max(0, Number(durationEl?.value));
    const partial = {
      obsZoomSceneName: sceneName,
      obsZoomDurationMs: Number.isFinite(duration) ? duration : OBS_MOVE_DURATION,
      obsZoomMoveEasingType: Number(root.querySelector("#obsZoomEasingType")?.value ?? OBS_EASING_TYPE) || 3,
      obsZoomMoveEasingFunction: Number(root.querySelector("#obsZoomEasingFunction")?.value ?? OBS_EASING_FUNCTION) || 2,
      obsZoomIncludeSingles: !!root.querySelector("#obsZoomIncludeSingles")?.checked,
      obsZoomIncludeDoubles: !!root.querySelector("#obsZoomIncludeDoubles")?.checked,
      obsZoomIncludeTriples: !!root.querySelector("#obsZoomIncludeTriples")?.checked,
      obsZoomLastTestTrigger: normalizeText(root.querySelector("#obsZoomTestTrigger")?.value || OBS_TEST_TRIGGER).toUpperCase() || "T20"
    };
    const stored = api.getSettings?.() || {};
    const targetFromUi = normalizeText(OBS_SELECTED_SOURCE);
    const targetStored = normalizeText(stored.obsZoomTargetSource);
    if (targetFromUi && (!OBS_SCENE_SOURCES.length || OBS_SCENE_SOURCES.includes(targetFromUi))) {
      partial.obsZoomTargetSource = targetFromUi;
    } else if (targetStored) {
      partial.obsZoomTargetSource = targetStored;
    }
    await api.savePartial?.(partial);
  }

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

  async function runObsZoomTriggerTest(api, root, rawTrigger, touchInput = true) {
    await flushObsZoomToStorage(api, root);
    const trigger = normalizeText(rawTrigger).toUpperCase();
    if (!trigger) {
      api.setStatus?.("Bitte einen Zoom-Trigger eingeben.");
      return;
    }
    const input = root.querySelector("#obsZoomTestTrigger");
    if (touchInput) {
      if (input) input.value = trigger;
      OBS_TEST_TRIGGER = trigger;
    }
    try {
      const res = await api.send({
        type: "OBS_ZOOM_TRIGGER_TEST",
        trigger,
        payload: {
          source: "obszoom_module_test"
        }
      });
      if (!res?.ok) throw new Error(String(res?.error || res?.reason || "obs_zoom_trigger_test_failed"));
      const modeLabel = res?.mode === "managed_filter" ? "Filter" : "Trigger";
      const targetLabel = String(res?.managedKey || res?.trigger || trigger);
      api.setStatus?.(`Zoom-Test gesendet: ${modeLabel} ${targetLabel}`);
    } catch (error) {
      api.setStatus?.(`Zoom-Test fehlgeschlagen: ${String(error?.message || error || "unknown_error")}`);
    }
  }

  function renderSceneOptions() {
    if (!OBS_SCENES.length) {
      return `<option value="">Keine Szenen geladen</option>`;
    }
    return OBS_SCENES.map((sceneName) => `<option value="${sceneName}">${sceneName}</option>`).join("");
  }

  function renderSourceOptions(api) {
    const lang = String(api?.getSettings?.()?.uiLanguage || "de").toLowerCase();
    const emptyLabel = lang === "en" ? "No sources" : "Keine Quellen";
    if (!OBS_SCENE_SOURCES.length) {
      return `<option value="">${emptyLabel}</option>`;
    }
    return OBS_SCENE_SOURCES.map((sourceName) => `<option value="${sourceName}">${sourceName}</option>`).join("");
  }

  function renderSourcePicker() {
    if (!SOURCE_PICKER_OPEN) return "";
    return `
      <div class="hueModalBackdrop">
        <div class="hueModalDialog">
          <div class="communityModalHeader">
            <div>
              <div class="communityModalTitle">Quelle waehlen</div>
              <div class="communityModalSub">Waehle die OBS Quelle, fuer die die Move Filter erstellt werden sollen.</div>
            </div>
            <div class="communityModalHeaderActions">
              <button type="button" class="btnMini" data-obs-source-picker-close>Schliessen</button>
            </div>
          </div>
          <div class="hueModalBody">
            <div class="list">
              ${OBS_SCENE_SOURCES.map((sourceName) => `
                <button type="button" class="listItem" data-obs-scene-source-pick="${sourceName}">
                  <span>${sourceName}</span>
                </button>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderWarningModal() {
    if (!WARNING_MODAL_OPEN) return "";
    return `
      <div class="hueModalBackdrop">
        <div class="hueModalDialog warningModalDialog">
          <div class="communityModalHeader warningModalHeader">
            <div class="warningModalTitleWrap">
              <div class="warningModalIcon">!</div>
              <div>
                <div class="communityModalTitle">${WARNING_MODAL_TITLE || "Warnung"}</div>
                <div class="communityModalSub">${WARNING_MODAL_MESSAGE || ""}</div>
              </div>
            </div>
          </div>
          <div class="hueModalBody warningModalBody">
            <div class="obsZoomBackupActions">
              <button type="button" class="btnMini" data-obs-warning-cancel>Abbrechen</button>
              <button type="button" class="btnMini warningConfirmBtn" data-obs-warning-confirm>${WARNING_MODAL_CONFIRM_LABEL || "Fortfahren"}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function closeWarningModal(api) {
    WARNING_MODAL_OPEN = false;
    WARNING_MODAL_TITLE = "";
    WARNING_MODAL_MESSAGE = "";
    WARNING_MODAL_CONFIRM_LABEL = "Fortfahren";
    WARNING_MODAL_ACTION = null;
    scope.AD_SB_MODULES.obszoom.sync(api, api.getSettings?.() || {});
  }

  function openWarningModal(api, title, message, onConfirm, confirmLabel = "Fortfahren") {
    WARNING_MODAL_TITLE = String(title || "Warnung");
    WARNING_MODAL_MESSAGE = String(message || "");
    WARNING_MODAL_CONFIRM_LABEL = String(confirmLabel || "Fortfahren");
    WARNING_MODAL_ACTION = typeof onConfirm === "function" ? onConfirm : null;
    WARNING_MODAL_OPEN = true;
    scope.AD_SB_MODULES.obszoom.sync(api, api.getSettings?.() || {});
  }

  async function reloadObsScenes(api, root, silent = false) {
    try {
      const res = await api.send({ type: "OBS_GET_SCENES" });
      if (!res?.ok) throw new Error(String(res?.error || "obs_get_scenes_failed"));
      OBS_SCENES = Array.isArray(res?.scenes) ? res.scenes : [];
      OBS_SCENE_SOURCES = [];
      OBS_SELECTED_SOURCE = "";
      scope.AD_SB_MODULES.obszoom.sync(api, api.getSettings?.() || {});
      if (!silent) {
        api.setStatus?.(OBS_SCENES.length ? `OBS Szenen geladen: ${OBS_SCENES.length}` : "Keine OBS Szenen gefunden.");
      }
    } catch (error) {
      if (!silent) {
        api.setStatus?.(`OBS Szenen konnten nicht geladen werden: ${String(error?.message || error || "unknown_error")}`);
      }
      const sceneSelect = root?.querySelector?.("#obsZoomSceneSelect");
      if (sceneSelect && !sceneSelect.value) {
        sceneSelect.innerHTML = renderSceneOptions();
      }
    }
  }

  async function reloadObsSceneSources(api, root, sceneName, silent = false) {
    const targetScene = String(sceneName || "").trim();
    if (!targetScene) {
      OBS_SCENE_SOURCES = [];
      OBS_SELECTED_SOURCE = "";
      SOURCE_PICKER_OPEN = false;
      scope.AD_SB_MODULES.obszoom.sync(api, api.getSettings?.() || {});
      return;
    }
    try {
      const res = await api.send({ type: "OBS_GET_SCENE_SOURCES", sceneName: targetScene });
      if (!res?.ok) throw new Error(String(res?.error || "obs_get_scene_sources_failed"));
      OBS_SCENE_SOURCES = Array.isArray(res?.sources) ? res.sources : [];
      const storedSource = normalizeText(api.getSettings?.()?.obsZoomTargetSource);
      if (OBS_SCENE_SOURCES.includes(storedSource)) OBS_SELECTED_SOURCE = storedSource;
      if (!OBS_SCENE_SOURCES.includes(OBS_SELECTED_SOURCE)) OBS_SELECTED_SOURCE = OBS_SCENE_SOURCES[0] || "";
      // Quellen-Auswahl-Modal nur nach Create/Update (runCreateMoveFiltersFlow), nie bei passivem Laden
      const persist = { obsZoomSceneName: targetScene };
      if (OBS_SELECTED_SOURCE && OBS_SCENE_SOURCES.includes(OBS_SELECTED_SOURCE)) {
        persist.obsZoomTargetSource = OBS_SELECTED_SOURCE;
      }
      await api.savePartial?.(persist);
      scope.AD_SB_MODULES.obszoom.sync(api, api.getSettings?.() || {});
      if (!silent) {
        api.setStatus?.(OBS_SCENE_SOURCES.length ? `Quellen geladen: ${OBS_SCENE_SOURCES.length}` : "Keine Quellen in der Szene gefunden.");
      }
    } catch (error) {
      OBS_SCENE_SOURCES = [];
      OBS_SELECTED_SOURCE = "";
      SOURCE_PICKER_OPEN = false;
      scope.AD_SB_MODULES.obszoom.sync(api, api.getSettings?.() || {});
      if (!silent) {
        api.setStatus?.(`Quellen konnten nicht geladen werden: ${String(error?.message || error || "unknown_error")}`);
      }
    }
  }

  async function createMoveFiltersForSelection(api, root, sourceName, mode = "upsert") {
    const sceneName = String(root.querySelector("#obsZoomSceneSelect")?.value || "").trim();
    const duration = Number(root.querySelector("#obsZoomMoveDuration")?.value || OBS_MOVE_DURATION);
    const easing = Number(root.querySelector("#obsZoomEasingType")?.value || OBS_EASING_TYPE);
    const easingFunction = Number(root.querySelector("#obsZoomEasingFunction")?.value || OBS_EASING_FUNCTION);
    const targetSource = String(sourceName || "").trim();
    if (!sceneName) {
      api.setStatus?.("Bitte zuerst eine OBS Szene waehlen.");
      return;
    }
    if (!targetSource) {
      api.setStatus?.("Bitte eine OBS Quelle waehlen.");
      return;
    }
    const res = await api.send({
      type: "OBS_CREATE_MOVE_FILTERS",
      mode,
      sceneName,
      sourceName: targetSource,
      duration,
      easing,
      easingFunction,
      includeSingles: OBS_INCLUDE_SINGLES,
      includeDoubles: OBS_INCLUDE_DOUBLES,
      includeTriples: OBS_INCLUDE_TRIPLES
    });
    if (!res?.ok) throw new Error(String(res?.error || "obs_create_move_filters_failed"));
    await api.savePartial?.({
      obsZoomSceneName: sceneName,
      obsZoomTargetSource: targetSource
    });
    const errorCount = Array.isArray(res?.errors) ? res.errors.length : 0;
    const summary = mode === "create"
      ? `erstellt ${res?.created || 0}`
      : `aktualisiert ${res?.updated || 0}`;
    api.setStatus?.(`Move Filter fuer ${sceneName} / ${targetSource}: ${summary}${errorCount ? `, Fehler ${errorCount}` : ""}. Checkout nutzt jetzt diese Szene automatisch.`);
  }

  async function runCreateMoveFiltersFlow(api, root, mode = "upsert") {
    const sceneName = String(root.querySelector("#obsZoomSceneSelect")?.value || "").trim();
    if (!sceneName) {
      api.setStatus?.("Bitte zuerst eine OBS Szene waehlen.");
      return;
    }
    await reloadObsSceneSources(api, root, sceneName, true);
    if (!OBS_SCENE_SOURCES.length) {
      api.setStatus?.("In dieser Szene wurde keine Quelle gefunden.");
      return;
    }
    let picked = normalizeText(root.querySelector("#obsZoomSourceSelect")?.value);
    if (picked && OBS_SCENE_SOURCES.includes(picked)) {
      OBS_SELECTED_SOURCE = picked;
    } else if (OBS_SELECTED_SOURCE && OBS_SCENE_SOURCES.includes(OBS_SELECTED_SOURCE)) {
      picked = OBS_SELECTED_SOURCE;
    } else {
      picked = normalizeText(OBS_SCENE_SOURCES[0] || "");
      OBS_SELECTED_SOURCE = picked;
    }
    if (!picked) {
      api.setStatus?.("Bitte eine Quelle waehlen.");
      return;
    }
    await createMoveFiltersForSelection(api, root, picked, mode);
  }

  async function runDeleteMoveFiltersFlow(api, root) {
    const sceneName = String(root.querySelector("#obsZoomSceneSelect")?.value || "").trim();
    if (!sceneName) {
      api.setStatus?.("Bitte zuerst eine OBS Szene waehlen.");
      return;
    }
    const res = await api.send({
      type: "OBS_DELETE_MOVE_FILTERS",
      sceneName,
      includeSingles: OBS_INCLUDE_SINGLES,
      includeDoubles: OBS_INCLUDE_DOUBLES,
      includeTriples: OBS_INCLUDE_TRIPLES
    });
    if (!res?.ok) throw new Error(String(res?.error || "obs_delete_move_filters_failed"));
    const errorCount = Array.isArray(res?.errors) ? res.errors.length : 0;
    api.setStatus?.(`Move Filter geloescht: ${res?.deleted || 0}${errorCount ? `, Fehler ${errorCount}` : ""}.`);
  }

  function downloadBackupFile(sceneName, payload) {
    const safeSceneName = String(sceneName || "scene")
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
      .replace(/\s+/g, "_");
    const fileName = `obs-zoom-backup-${safeSceneName || "scene"}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function readBackupFile(file) {
    const text = await file.text();
    return JSON.parse(text);
  }

  scope.AD_SB_MODULES.obszoom = {
    id: "obszoom",
    icon: "Z",
    navLabelKey: "nav_obszoom",
    needs: { streamerbot: false, obs: true },
    render() {
      return `
        <h2 class="title"><span data-i18n="title_obszoom">Zoom</span><span class="titleMeta">OBS</span></h2>
        <div class="card">
          <div class="sectionHead">
            <div class="sectionTitle" style="margin:0;" data-i18n="section_connections">Verbindungen</div>
            <button type="button" class="miniChevronBtn${CONNECTIONS_OPEN ? " active" : ""}" id="obsZoomConnectionToggle" aria-label="Zoom Verbindungen" title="Zoom Verbindungen"><span class="ddArrow">${CONNECTIONS_OPEN ? "^" : "v"}</span></button>
          </div>
          <div class="connectionStatusGrid" id="obsZoomConnectionGrid" data-connections-open="${CONNECTIONS_OPEN ? "true" : "false"}">
            ${renderConnectionButton("obs", "OBS")}
            ${renderConnectionButton("sb", "Streamer.bot")}
          </div>
          <div class="inlinePopupWrap${CONNECTIONS_OPEN ? " open" : ""}" id="obsZoomConnectionWrap" style="padding:0; border-top:none; background:transparent;">
            <div class="formRow">
              <div class="connectionInputHeader">
                <label class="label" for="obsUrl">OBS WS URL</label>
                <div class="connectionInputSwitch">
                  <span>Aktiv</span>
                  <label class="switch switchCompact"><input id="obsZoomObsEnabled" type="checkbox" /><span class="slider"></span></label>
                </div>
              </div>
              <input class="input" id="obsUrl" type="text" placeholder="ws://127.0.0.1:4455/" />
              <div class="hint" data-i18n="hint_obs_ws">OBS WebSocket Server</div>
            </div>
            <div class="formRow">
              <label class="label" for="obsZoomObsPassword">OBS Passwort</label>
              <input class="input" id="obsZoomObsPassword" type="password" placeholder="optional" />
            </div>
            <div class="divider"></div>
            <div class="formRow">
              <div class="connectionInputHeader">
                <label class="label" for="obsZoomSbUrl">Streamer.bot WS URL</label>
                <div class="connectionInputSwitch">
                  <span>Aktiv</span>
                  <label class="switch switchCompact"><input id="obsZoomSbEnabled" type="checkbox" /><span class="slider"></span></label>
                </div>
              </div>
              <input class="input" id="obsZoomSbUrl" type="text" placeholder="ws://127.0.0.1:8080/" />
              <div class="hint" data-i18n="hint_sb_ws">Streamer.bot WebSocket Server</div>
            </div>
            <div class="formRow">
              <label class="label" for="obsZoomSbPassword">Streamer.bot Passwort</label>
              <input class="input" id="obsZoomSbPassword" type="password" placeholder="optional" />
            </div>
            <div class="formRow">
              <label class="label" for="obsZoomActionPrefix" data-i18n="label_action_prefix">Action Prefix</label>
              <input class="input" id="obsZoomActionPrefix" type="text" placeholder="AD-SB " />
              <div class="hint" data-i18n="hint_action_prefix">Actions run as Prefix + Suffix.</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="sectionTitle" data-i18n="obszoom_section_player_filter">Zoom: Wer triggert</div>
          <div class="hint" data-i18n="obszoom_player_filter_hint">Steuert, bei welchen Spielern OBS-Zoom auf Würfe und Checkout-Hinweise reagiert. „Mein Spieler-Index“ kommt aus den Einstellungen.</div>
          <div class="formRow">
            <label class="label" for="obsZoomPlayerFilterMode" data-i18n="obszoom_player_filter_mode_label">Modus</label>
            <select class="input" id="obsZoomPlayerFilterMode">
              <option value="all" data-i18n="obszoom_player_filter_mode_all">Alle Spieler</option>
              <option value="my_index" data-i18n="obszoom_player_filter_mode_my_index">Nur mein Spielerindex</option>
              <option value="names" data-i18n="obszoom_player_filter_mode_names">Nur folgende Namen</option>
              <option value="my_index_or_names" data-i18n="obszoom_player_filter_mode_my_or_names">Mein Index oder Namen</option>
            </select>
          </div>
          <div class="formRow">
            <label class="label" for="obsZoomPlayerNamesList" data-i18n="obszoom_player_names_label">Namen</label>
            <textarea class="input" id="obsZoomPlayerNamesList" rows="3" placeholder="z. B. pro Zeile oder mit Komma"></textarea>
            <div class="hint" data-i18n="obszoom_player_names_hint">Eine Zeile oder Komma getrennt; Groß/klein egal. Bei „Nur Namen“ mindestens einen Eintrag.</div>
          </div>
        </div>

        <div class="card">
          <div class="sectionTitle" style="margin:0 0 12px 0;">OBS Szenen</div>
          <div class="hint" style="margin-bottom:12px;">Hier werden alle Filter automatisch erstellt, eine manuelle Ausrichtung in OBS wird jedoch weiterhin benoetigt.</div>
          <div class="formRow">
            <label class="label" for="obsZoomCheckoutTriggerThreshold">Checkout Schwelle</label>
            <input class="input" id="obsZoomCheckoutTriggerThreshold" type="number" min="2" max="170" step="1" value="170" />
            <div class="hint">Ab diesem Restwert und darunter wird der Checkout-Trigger aktiv.</div>
          </div>
          <div class="formRow obsZoomSceneSourceRow">
            <div class="obsZoomSceneCol">
              <div class="obsZoomSceneSelectHead">
                <label class="label" for="obsZoomSceneSelect" data-i18n="obszoom_scene_label">Szene</label>
                <button class="miniChevronBtn" id="btnRefreshObsScenes" type="button" title="Szenen aktualisieren" aria-label="Szenen aktualisieren" style="min-width:28px; width:28px; height:28px; padding:0;">
                  <span class="refreshGlyph"></span>
                </button>
              </div>
              <select class="input" id="obsZoomSceneSelect">
                ${renderSceneOptions()}
              </select>
            </div>
            <div class="obsZoomSourceCol">
              <label class="label" for="obsZoomSourceSelect" data-i18n="obszoom_source_label">Quelle</label>
              <select class="input" id="obsZoomSourceSelect">
                ${renderSourceOptions(null)}
              </select>
            </div>
          </div>
          <div class="hint">Diese Szene wird auch fuer automatische Checkout-Trigger verwendet.</div>
          <div class="formRow">
            <label class="label" for="obsZoomMoveDuration">Duration (ms)</label>
            <input class="input" id="obsZoomMoveDuration" type="number" min="0" step="50" value="300" />
          </div>
          <div class="formRow">
            <label class="label" for="obsZoomEasingType">Easing Type</label>
            <select class="input" id="obsZoomEasingType">
              <option value="0">None</option>
              <option value="1">In</option>
              <option value="2">Out</option>
              <option value="3" selected>In Out</option>
            </select>
          </div>
          <div class="formRow">
            <label class="label" for="obsZoomEasingFunction">Easing Function</label>
            <select class="input" id="obsZoomEasingFunction">
              <option value="1">Quadratic</option>
              <option value="2" selected>Cubic</option>
              <option value="3">Quartic</option>
              <option value="4">Quintic</option>
              <option value="5">Sine</option>
              <option value="6">Circular</option>
              <option value="7">Exponential</option>
              <option value="8">Elastic</option>
              <option value="9">Bounce</option>
              <option value="10">Back</option>
            </select>
          </div>
          <div class="formRow">
            <label class="label">Filtergruppen</label>
            <div class="obsZoomTypeRow">
              <label class="obsZoomTypeToggle">
                <input id="obsZoomIncludeSingles" type="checkbox" checked />
                <span>Single</span>
              </label>
              <label class="obsZoomTypeToggle">
                <input id="obsZoomIncludeDoubles" type="checkbox" checked />
                <span>Double</span>
              </label>
              <label class="obsZoomTypeToggle">
                <input id="obsZoomIncludeTriples" type="checkbox" checked />
                <span>Triple</span>
              </label>
            </div>
            <div class="hint">Main, Bull, DBull und Miss werden immer erstellt.</div>
          </div>
          <div class="inlineActionsRow" style="margin-top:14px;">
            <button class="btn primary" id="btnCreateObsMoveFilters" type="button">Create</button>
            <button class="btn secondary" id="btnUpdateObsMoveFilters" type="button">Update</button>
            <button class="btn secondary" id="btnDeleteObsMoveFilters" type="button">Delete</button>
          </div>
        </div>

        <div class="card">
          <div class="sectionTitle" style="margin:0 0 12px 0;">Test Area</div>
          <div class="hint" style="margin-bottom:12px;">Presets (<code>T20</code>, <code>BULL</code>, <code>D10</code>, <code>T19</code>, Main) feuern sofort &mdash; ohne das Feld unten zu aendern. Das Feld <strong>Trigger</strong> ist nur fuer eigene Befehle; mit <strong>Testen</strong> ausfuehren.</div>
          <div class="miniButtonRow" style="margin-bottom:12px;">
            ${renderTestButtons()}
          </div>
          <div class="formRow">
            <label class="label" for="obsZoomTestTrigger">Trigger</label>
            <input class="input" id="obsZoomTestTrigger" type="text" placeholder="z. B. T20 oder checkout_t20" value="${OBS_TEST_TRIGGER}" />
          </div>
          <div class="inlineActionsRow" style="margin-top:14px;">
            <button class="btn primary" id="btnObsZoomTestTrigger" type="button">Testen</button>
          </div>
        </div>

        <div class="card">
          <div class="sectionTitle" style="margin:0 0 12px 0;">Backup</div>
          <div class="hint" style="margin-bottom:12px;">Exportiere oder spiele komplette Szenen-, Quellen- und Filter-Backups wieder ein.</div>
          <div class="obsZoomBackupActions">
            <button class="btnMini" id="btnExportObsMoveFilterBackup" type="button">Exportieren</button>
            <button class="btnMini" id="btnImportObsMoveFilterBackup" type="button">Importieren</button>
          </div>
          <div class="obsZoomBackupFooter">
            <button class="btnMini" id="btnObsZoomOpenGuide" type="button">Anleitung (Web)</button>
            <button class="btnMini" id="btnDownloadObsMovePlugin" type="button">Plugin</button>
          </div>
          <input id="obsZoomBackupImportInput" type="file" accept="application/json,.json" style="display:none;" />
        </div>
        <div id="obsZoomSourcePickerMount">${renderSourcePicker()}</div>
        <div id="obsZoomWarningModalMount">${renderWarningModal()}</div>
        <div class="spacer"></div>
      `;
    },
    bind(api) {
      const root = api.root;
      root.querySelector("#obsZoomConnectionToggle")?.addEventListener("click", () => {
        CONNECTIONS_OPEN = !CONNECTIONS_OPEN;
        scope.AD_SB_MODULES.obszoom.sync(api, api.getSettings?.() || {});
      });
      api.bindAuto(root, "obsZoomObsEnabled", "obsEnabled");
      api.bindAuto(root, "obsZoomSbEnabled", "sbEnabled");
      api.bindAutoImmediate(root, "obsUrl", "obsUrl", (value) => String(value || "").trim());
      api.bindAutoImmediate(root, "obsZoomObsPassword", "obsPassword", (value) => String(value || ""));
      api.bindAutoImmediate(root, "obsZoomSbUrl", "sbUrl", (value) => String(value || "").trim());
      api.bindAutoImmediate(root, "obsZoomSbPassword", "sbPassword", (value) => String(value || ""));
      api.bindAutoImmediate(root, "obsZoomActionPrefix", "actionPrefix", (value) => api.normalizePrefix(value || ""));
      api.bindAuto(root, "obsZoomCheckoutTriggerThreshold", "checkoutTriggerThreshold", "number");
      api.bindAuto(root, "obsZoomPlayerFilterMode", "obsZoomPlayerFilterMode", "text");
      api.bindAutoImmediate(root, "obsZoomPlayerNamesList", "obsZoomPlayerNamesList", (value) => String(value || ""));
      root.querySelector("#obsZoomSceneSelect")?.addEventListener("change", async (ev) => {
        const sceneName = normalizeText(ev.target?.value);
        await api.savePartial?.({ obsZoomSceneName: sceneName });
        await reloadObsSceneSources(api, root, sceneName, true);
      });
      root.querySelector("#obsZoomSourceSelect")?.addEventListener("change", async (ev) => {
        const name = normalizeText(ev.target?.value);
        OBS_SELECTED_SOURCE = name;
        if (name) await api.savePartial?.({ obsZoomTargetSource: name });
      });
      root.querySelector("#obsZoomMoveDuration")?.addEventListener("input", (ev) => {
        OBS_MOVE_DURATION = Math.max(0, Number(ev.target?.value || OBS_MOVE_DURATION) || 0);
      });
      root.querySelector("#obsZoomMoveDuration")?.addEventListener("change", () => {
        const v = Math.max(0, Number(root.querySelector("#obsZoomMoveDuration")?.value) || 0);
        OBS_MOVE_DURATION = v;
        void api.savePartial?.({ obsZoomDurationMs: v });
      });
      root.querySelector("#obsZoomIncludeSingles")?.addEventListener("change", (ev) => {
        OBS_INCLUDE_SINGLES = !!ev.target?.checked;
        void api.savePartial?.({ obsZoomIncludeSingles: OBS_INCLUDE_SINGLES });
      });
      root.querySelector("#obsZoomIncludeDoubles")?.addEventListener("change", (ev) => {
        OBS_INCLUDE_DOUBLES = !!ev.target?.checked;
        void api.savePartial?.({ obsZoomIncludeDoubles: OBS_INCLUDE_DOUBLES });
      });
      root.querySelector("#obsZoomIncludeTriples")?.addEventListener("change", (ev) => {
        OBS_INCLUDE_TRIPLES = !!ev.target?.checked;
        void api.savePartial?.({ obsZoomIncludeTriples: OBS_INCLUDE_TRIPLES });
      });
      root.querySelector("#obsZoomEasingType")?.addEventListener("change", (ev) => {
        OBS_EASING_TYPE = Number(ev.target?.value || OBS_EASING_TYPE) || 3;
        void api.savePartial?.({ obsZoomMoveEasingType: OBS_EASING_TYPE });
      });
      root.querySelector("#obsZoomEasingFunction")?.addEventListener("change", (ev) => {
        OBS_EASING_FUNCTION = Number(ev.target?.value || OBS_EASING_FUNCTION) || 2;
        void api.savePartial?.({ obsZoomMoveEasingFunction: OBS_EASING_FUNCTION });
      });
      root.querySelectorAll("[data-connection-retry]").forEach((button) => {
        button.addEventListener("click", async () => {
          const kind = String(button.dataset.connectionRetry || "");
          if (kind === "sb") await api.send({ type: "SB_RETRY" });
          if (kind === "obs") await api.send({ type: "OBS_RETRY" });
          setTimeout(() => api.refreshConnectionStatuses?.(), 150);
        });
      });
      root.querySelector("#btnRefreshObsScenes")?.addEventListener("click", async () => {
        await reloadObsScenes(api, root, false);
      });
      root.querySelector("#btnCreateObsMoveFilters")?.addEventListener("click", async () => {
        try {
          await runCreateMoveFiltersFlow(api, root, "create");
        } catch (error) {
          api.setStatus?.(`Move Filter konnten nicht erstellt werden: ${String(error?.message || error || "unknown_error")}`);
        }
      });
      root.querySelector("#btnUpdateObsMoveFilters")?.addEventListener("click", async () => {
        openWarningModal(
          api,
          "Achtung",
          "Diese Aktion ueberschreibt bestehende Move-Filter-Einstellungen in OBS.",
          async () => {
            try {
              await runCreateMoveFiltersFlow(api, root, "update");
            } catch (error) {
              api.setStatus?.(`Move Filter konnten nicht aktualisiert werden: ${String(error?.message || error || "unknown_error")}`);
            }
          },
          "Ueberschreiben"
        );
      });
      root.querySelector("#btnDeleteObsMoveFilters")?.addEventListener("click", async () => {
        openWarningModal(
          api,
          "Filter loeschen",
          "Diese Aktion loescht die angehakten Single-, Double- und Triple-Filter. Main, Bull, DBull und Miss bleiben erhalten.",
          async () => {
            try {
              await runDeleteMoveFiltersFlow(api, root);
            } catch (error) {
              api.setStatus?.(`Move Filter konnten nicht geloescht werden: ${String(error?.message || error || "unknown_error")}`);
            }
          },
          "Loeschen"
        );
      });

      root.querySelector("#btnExportObsMoveFilterBackup")?.addEventListener("click", async () => {
        const sceneName = String(root.querySelector("#obsZoomSceneSelect")?.value || "").trim();
        if (!sceneName) {
          api.setStatus?.("Bitte zuerst eine OBS Szene waehlen.");
          return;
        }
        try {
          const res = await api.send({ type: "OBS_EXPORT_MOVE_FILTER_BACKUP", sceneName });
          if (!res?.ok) throw new Error(String(res?.error || "obs_export_move_filter_backup_failed"));
          const payload = {
            type: "obszoom-move-filter-backup",
            sceneName: res.sceneName || sceneName,
            exportedAt: res.exportedAt || new Date().toISOString(),
            sources: Array.isArray(res.sources) ? res.sources : [],
            filters: Array.isArray(res.filters) ? res.filters : []
          };
          downloadBackupFile(sceneName, payload);
          api.setStatus?.(`Backup exportiert: ${payload.sources.length} Quellen, ${payload.filters.length} Filter.`);
        } catch (error) {
          api.setStatus?.(`Backup konnte nicht exportiert werden: ${String(error?.message || error || "unknown_error")}`);
        }
      });
      root.querySelector("#btnImportObsMoveFilterBackup")?.addEventListener("click", () => {
        const input = root.querySelector("#obsZoomBackupImportInput");
        if (!input) return;
        input.value = "";
        input.click();
      });
      root.querySelector("#obsZoomBackupImportInput")?.addEventListener("change", async (ev) => {
        const file = ev.target?.files?.[0];
        if (!file) return;
        openWarningModal(
          api,
          "Backup einspielen",
          "Diese Aktion kann Szene, Quellen und Filter aus dem Backup in OBS anlegen oder bestehende Einstellungen vollstaendig ueberschreiben.",
          async () => {
            try {
              const backup = await readBackupFile(file);
              const res = await api.send({ type: "OBS_IMPORT_MOVE_FILTER_BACKUP", backup });
              if (!res?.ok) throw new Error(String(res?.error || "obs_import_move_filter_backup_failed"));
              const errorCount = Array.isArray(res?.errors) ? res.errors.length : 0;
              api.setStatus?.(`Backup eingespielt: Szene ${res?.createdScene || 0}, Quellen erstellt ${res?.createdSources || 0}, Quellen aktualisiert ${res?.updatedSources || 0}, Filter erstellt ${res?.createdFilters || 0}, Filter aktualisiert ${res?.updatedFilters || 0}${errorCount ? `, Fehler ${errorCount}` : ""}.`);
              void reloadObsScenes(api, root, true);
            } catch (error) {
              api.setStatus?.(`Backup konnte nicht eingespielt werden: ${String(error?.message || error || "unknown_error")}`);
            }
          },
          "Einspielen"
        );
      });
      root.querySelector("#btnObsZoomOpenGuide")?.addEventListener("click", () => {
        const url = getObsZoomGuidePageUrl(api);
        try {
          if (chrome?.tabs?.create) {
            chrome.tabs.create({ url });
            return;
          }
          window.open(url, "_blank", "noopener,noreferrer");
        } catch (error) {
          api.setStatus?.(`Anleitung konnte nicht geoeffnet werden: ${String(error?.message || error || "unknown_error")}`);
        }
      });
      root.querySelector("#btnDownloadObsMovePlugin")?.addEventListener("click", () => {
        try {
          window.open(OBS_MOVE_PLUGIN_DOWNLOAD_URL, "_blank", "noopener,noreferrer");
          api.setStatus?.("Move Plugin Download geoeffnet.");
        } catch (error) {
          api.setStatus?.(`Move Plugin Download konnte nicht geoeffnet werden: ${String(error?.message || error || "unknown_error")}`);
        }
      });
      let obsZoomTestTriggerSaveTimer = null;
      root.querySelector("#obsZoomTestTrigger")?.addEventListener("input", (ev) => {
        OBS_TEST_TRIGGER = normalizeText(ev.target?.value).toUpperCase();
        if (obsZoomTestTriggerSaveTimer) clearTimeout(obsZoomTestTriggerSaveTimer);
        obsZoomTestTriggerSaveTimer = setTimeout(() => {
          obsZoomTestTriggerSaveTimer = null;
          const v = normalizeText(root.querySelector("#obsZoomTestTrigger")?.value).toUpperCase() || "T20";
          void api.savePartial?.({ obsZoomLastTestTrigger: v });
        }, 400);
      });
      root.querySelector("#btnObsZoomTestTrigger")?.addEventListener("click", async () => {
        await runObsZoomTriggerTest(api, root, root.querySelector("#obsZoomTestTrigger")?.value || OBS_TEST_TRIGGER);
      });
      function attachObsZoomPanelActivationLoad() {
        const pageEl = root;
        if (!pageEl || pageEl.dataset.obsZoomObsActivationBound === "1") return;
        pageEl.dataset.obsZoomObsActivationBound = "1";
        let debounceTimer = null;
        let inFlight = false;
        const runLoad = async () => {
          if (!pageEl.classList.contains("active")) return;
          if (pageEl.classList.contains("pageDisabled")) return;
          if (inFlight) return;
          inFlight = true;
          try {
            await reloadObsScenes(api, root, true);
            const sel = normalizeText(root.querySelector("#obsZoomSceneSelect")?.value);
            if (sel) await reloadObsSceneSources(api, root, sel, true);
          } catch {
            /* still silent */
          } finally {
            inFlight = false;
          }
        };
        const schedule = () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            void runLoad();
          }, 40);
        };
        const mo = new MutationObserver(() => schedule());
        mo.observe(pageEl, { attributes: true, attributeFilter: ["class"] });
        if (pageEl.classList.contains("active") && !pageEl.classList.contains("pageDisabled")) {
          schedule();
        }
      }
      attachObsZoomPanelActivationLoad();

      root.addEventListener("click", async (ev) => {
        const testPresetBtn = ev.target?.closest?.("[data-obs-zoom-test-preset]");
        if (testPresetBtn) {
          const preset = String(testPresetBtn.getAttribute("data-obs-zoom-test-preset") || "").trim();
          await runObsZoomTriggerTest(api, root, preset, false);
          return;
        }

        const sourcePickBtn = ev.target?.closest?.("[data-obs-scene-source-pick]");
        if (sourcePickBtn) {
          OBS_SELECTED_SOURCE = String(sourcePickBtn.dataset.obsSceneSourcePick || "").trim();
          const pendingMode = String(root.dataset.obsZoomPendingMode || "create");
          delete root.dataset.obsZoomPendingMode;
          SOURCE_PICKER_OPEN = false;
          scope.AD_SB_MODULES.obszoom.sync(api, api.getSettings?.() || {});
          try {
            await createMoveFiltersForSelection(api, root, OBS_SELECTED_SOURCE, pendingMode);
          } catch (error) {
            const actionLabel = pendingMode === "create" ? "erstellt" : "aktualisiert";
            api.setStatus?.(`Move Filter konnten nicht ${actionLabel} werden: ${String(error?.message || error || "unknown_error")}`);
          }
          return;
        }

        const closePickerBtn = ev.target?.closest?.("[data-obs-source-picker-close]");
        if (closePickerBtn) {
          delete root.dataset.obsZoomPendingMode;
          SOURCE_PICKER_OPEN = false;
          scope.AD_SB_MODULES.obszoom.sync(api, api.getSettings?.() || {});
          return;
        }

        const cancelWarningBtn = ev.target?.closest?.("[data-obs-warning-cancel]");
        if (cancelWarningBtn) {
          closeWarningModal(api);
          return;
        }

        const confirmWarningBtn = ev.target?.closest?.("[data-obs-warning-confirm]");
        if (confirmWarningBtn) {
          const action = WARNING_MODAL_ACTION;
          closeWarningModal(api);
          if (typeof action === "function") {
            await action();
          }
        }
      });
    },
    sync(api, settings) {
      const root = api.root;
      const s = settings || {};
      {
        const d = Number(s.obsZoomDurationMs);
        OBS_MOVE_DURATION = Number.isFinite(d) && d >= 0 ? d : 450;
        const et = Number(s.obsZoomMoveEasingType);
        OBS_EASING_TYPE = Number.isFinite(et) ? et : 3;
        const ef = Number(s.obsZoomMoveEasingFunction);
        OBS_EASING_FUNCTION = Number.isFinite(ef) ? ef : 2;
        OBS_INCLUDE_SINGLES = s.obsZoomIncludeSingles !== false;
        OBS_INCLUDE_DOUBLES = s.obsZoomIncludeDoubles !== false;
        OBS_INCLUDE_TRIPLES = s.obsZoomIncludeTriples !== false;
        const tt = normalizeText(s.obsZoomLastTestTrigger || "T20").toUpperCase();
        OBS_TEST_TRIGGER = tt || "T20";
      }
      api.setChecked(root, "obsZoomObsEnabled", s.obsEnabled !== false);
      api.setChecked(root, "obsZoomSbEnabled", s.sbEnabled !== false);
      api.setValue(root, "obsUrl", s.obsUrl || "");
      api.setValue(root, "obsZoomObsPassword", s.obsPassword || "");
      api.setValue(root, "obsZoomSbUrl", s.sbUrl || "");
      api.setValue(root, "obsZoomSbPassword", s.sbPassword || "");
      api.setValue(root, "obsZoomActionPrefix", String(s.actionPrefix || "").trim());
      const sceneSelect = root.querySelector("#obsZoomSceneSelect");
      if (sceneSelect) {
        const storedScene = normalizeText(s.obsZoomSceneName);
        const prevUi = normalizeText(sceneSelect.value);
        sceneSelect.innerHTML = renderSceneOptions();
        let pick = "";
        if (storedScene && OBS_SCENES.includes(storedScene)) pick = storedScene;
        else if (prevUi && OBS_SCENES.includes(prevUi)) pick = prevUi;
        else if (OBS_SCENES.length) pick = OBS_SCENES[0];
        if (pick) sceneSelect.value = pick;
        if (pick && pick !== storedScene) {
          void api.savePartial?.({ obsZoomSceneName: pick });
        }
      }
      const sourceSelect = root.querySelector("#obsZoomSourceSelect");
      if (sourceSelect) {
        sourceSelect.innerHTML = renderSourceOptions(api);
        const storedSource = normalizeText(s.obsZoomTargetSource);
        let srcPick = "";
        if (OBS_SELECTED_SOURCE && OBS_SCENE_SOURCES.includes(OBS_SELECTED_SOURCE)) srcPick = OBS_SELECTED_SOURCE;
        else if (storedSource && OBS_SCENE_SOURCES.includes(storedSource)) srcPick = storedSource;
        else if (OBS_SCENE_SOURCES.length) srcPick = OBS_SCENE_SOURCES[0];
        if (srcPick && OBS_SCENE_SOURCES.includes(srcPick)) {
          sourceSelect.value = srcPick;
          OBS_SELECTED_SOURCE = srcPick;
        } else {
          OBS_SELECTED_SOURCE = normalizeText(sourceSelect.value);
        }
      }
      const sourcePickerMount = root.querySelector("#obsZoomSourcePickerMount");
      if (sourcePickerMount) sourcePickerMount.innerHTML = renderSourcePicker();
      const warningModalMount = root.querySelector("#obsZoomWarningModalMount");
      if (warningModalMount) warningModalMount.innerHTML = renderWarningModal();
      api.setValue(root, "obsZoomCheckoutTriggerThreshold", Number.isFinite(s.checkoutTriggerThreshold) ? s.checkoutTriggerThreshold : 170);
      api.setValue(root, "obsZoomPlayerFilterMode", String(s.obsZoomPlayerFilterMode || "all"));
      api.setValue(root, "obsZoomPlayerNamesList", String(s.obsZoomPlayerNamesList || ""));
      api.setValue(root, "obsZoomMoveDuration", OBS_MOVE_DURATION);
      const singlesInput = root.querySelector("#obsZoomIncludeSingles");
      if (singlesInput) singlesInput.checked = OBS_INCLUDE_SINGLES;
      const doublesInput = root.querySelector("#obsZoomIncludeDoubles");
      if (doublesInput) doublesInput.checked = OBS_INCLUDE_DOUBLES;
      const triplesInput = root.querySelector("#obsZoomIncludeTriples");
      if (triplesInput) triplesInput.checked = OBS_INCLUDE_TRIPLES;
      api.setValue(root, "obsZoomEasingType", OBS_EASING_TYPE);
      api.setValue(root, "obsZoomEasingFunction", OBS_EASING_FUNCTION);
      api.setValue(root, "obsZoomTestTrigger", OBS_TEST_TRIGGER);
      const connectionWrap = root.querySelector("#obsZoomConnectionWrap");
      if (connectionWrap) connectionWrap.classList.toggle("open", CONNECTIONS_OPEN);
      const connectionGrid = root.querySelector("#obsZoomConnectionGrid");
      if (connectionGrid) {
        connectionGrid.dataset.connectionsOpen = CONNECTIONS_OPEN ? "true" : "false";
        const visibleCount = Array.from(connectionGrid.querySelectorAll("[data-connection-kind]")).filter((node) => {
          const kind = String(node.dataset.connectionKind || "");
          return kind === "obs" ? s.obsEnabled !== false : s.sbEnabled !== false;
        }).length;
        connectionGrid.classList.toggle("compactSingle", visibleCount <= 1);
      }
      const connectionToggle = root.querySelector("#obsZoomConnectionToggle");
      if (connectionToggle) {
        connectionToggle.classList.toggle("active", CONNECTIONS_OPEN);
        connectionToggle.innerHTML = `<span class="ddArrow">${CONNECTIONS_OPEN ? "^" : "v"}</span>`;
      }
      api.refreshConnectionStatuses?.();
    }
  };
})(window);
