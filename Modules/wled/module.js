(function initWledModule(scope) {
  scope.AD_SB_MODULES = scope.AD_SB_MODULES || {};
  const TRIGGER_GROUP_COLLAPSED = {};

  const WLED_TRIGGER_OPTIONS = [
    { value: "miss", de: "Miss", en: "Miss" },
    { value: "specialMiss", de: "Special Miss", en: "Special Miss" },
    { value: "dbl", de: "Double", en: "Double" },
    { value: "tpl", de: "Triple", en: "Triple" },
    { value: "bull", de: "Bull", en: "Bull" },
    { value: "dbull", de: "Double Bull", en: "Double Bull" },
    { value: "t20", de: "T20", en: "T20" },
    { value: "t19", de: "T19", en: "T19" },
    { value: "t18", de: "T18", en: "T18" },
    { value: "t17", de: "T17", en: "T17" },
    { value: "high100", de: "High 100+", en: "High 100+" },
    { value: "high140", de: "High 140+", en: "High 140+" },
    { value: "oneeighty", de: "180", en: "180" },
    { value: "noScore", de: "No Score", en: "No Score" },
    { value: "waschmaschine", de: "Waschmaschine", en: "Waschmaschine" },
    { value: "bust", de: "Bust", en: "Bust" },
    { value: "winner", de: "Winner", en: "Winner" },
    { value: "correction", de: "Korrektur", en: "Correction" },
    { value: "myTurnStart", de: "Mein Zug", en: "My Turn Start" },
    { value: "opponentTurnStart", de: "Gegner Zug", en: "Opponent Turn Start" }
  ];
  const WLED_TRIGGER_SUGGESTIONS = [
    ...WLED_TRIGGER_OPTIONS.map((item) => item.value),
    "throw",
    "last_throw",
    "gameon",
    "takeout",
    "takeout_finished",
    "gameshot",
    "gameshot+d10",
    "gameshot+t20",
    "matchshot",
    "matchshot+bull",
    "busted",
    "outside",
    "bot_throw",
    "board_starting",
    "board_started",
    "board_stopping",
    "board_stopped",
    "calibration_started",
    "calibration_finished",
    "manual_reset_done",
    "lobby_in",
    "lobby_out",
    "tournament_ready",
    "range_100_180",
    "180",
    "140",
    "s20",
    "d10",
    "t20",
    "t19",
    "t18",
    "t17",
    "t20_t20_t20",
    "s20_s20_s20",
    "d16_d16_d16",
    "player_1",
    "player_2",
    "player_3",
    "player_4",
    "player_5",
    "player_6"
  ];
  const WLED_TRIGGER_GROUPS = [
    {
      key: "main",
      de: "Main Source",
      en: "Main Source",
      values: ["throw", "last_throw", "gameon", "myTurnStart", "opponentTurnStart", "manual_reset_done"]
    },
    {
      key: "finish",
      de: "Checkouts",
      en: "Checkouts",
      values: ["takeout", "takeout_finished", "gameshot", "matchshot", "winner", "busted", "bust"]
    },
    {
      key: "visit",
      de: "Visit & Punkte",
      en: "Visit & Points",
      values: ["180", "140", "range_100_180", "high100", "high140", "oneeighty", "noScore", "waschmaschine"]
    },
    {
      key: "segments",
      de: "Segmente",
      en: "Segments",
      values: ["s20", "d10", "t20", "outside", "bull", "dbull", "dbl", "tpl"]
    },
    {
      key: "combo",
      de: "Kombis & Spieler",
      en: "Combos & Players",
      values: ["player_1", "player_2", "player_3", "player_4", "bot_throw"]
    },
    {
      key: "system",
      de: "Board & System",
      en: "Board & System",
      values: ["board_starting", "board_started", "board_stopping", "board_stopped", "calibration_started", "calibration_finished", "lobby_in", "lobby_out", "tournament_ready"]
    }
  ];

  const wledUiState = {
    presetsByControllerId: {},
    statusByControllerId: {},
    collapsedByControllerId: {},
    loadedEndpointByControllerId: {},
    loadingByControllerId: {},
    presetDropdownOpen: false,
    advancedJsonCollapsed: true,
    advancedJsonDraft: "",
    advancedJsonHelperMode: "player",
    advancedJsonHelperHue: 210
  };

  function getLang(settings) {
    return String(settings?.uiLanguage || "de").toLowerCase() === "en" ? "en" : "de";
  }

  function clampHue(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 210;
    return Math.max(0, Math.min(360, Math.round(num)));
  }

  function hslToRgb(h, s = 88, l = 50) {
    const hue = ((Number(h) % 360) + 360) % 360;
    const sat = Math.max(0, Math.min(100, Number(s))) / 100;
    const light = Math.max(0, Math.min(100, Number(l))) / 100;
    const c = (1 - Math.abs((2 * light) - 1)) * sat;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = light - (c / 2);
    let r = 0;
    let g = 0;
    let b = 0;

    if (hue < 60) [r, g, b] = [c, x, 0];
    else if (hue < 120) [r, g, b] = [x, c, 0];
    else if (hue < 180) [r, g, b] = [0, c, x];
    else if (hue < 240) [r, g, b] = [0, x, c];
    else if (hue < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];

    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255)
    ];
  }

  function buildSolidAdvancedJson(hue) {
    const [r, g, b] = hslToRgb(hue);
    return JSON.stringify({
      on: true,
      seg: [
        {
          id: 0,
          fx: 0,
          col: [[r, g, b], [0, 0, 0], [0, 0, 0]]
        }
      ]
    }, null, 2);
  }

  function renderAdvancedJsonHelper(settings) {
    const lang = getLang(settings);
    const mode = wledUiState.advancedJsonHelperMode === "score" ? "score" : "player";
    const hue = clampHue(wledUiState.advancedJsonHelperHue);
    const modeTitle = mode === "score"
      ? (lang === "en" ? "Score Color" : "Score-Farbe")
      : (lang === "en" ? "Player Color" : "Spieler-Farbe");
    return `
      <div class="advancedJsonHelper">
        <div class="advancedJsonHelperHead">
          <div class="advancedJsonHelperTitle">${modeTitle}</div>
          <div class="choiceRow advancedJsonModeRow">
            <button type="button" class="choiceBtn${mode === "player" ? " active" : ""}" data-wled-advanced-mode="player">${lang === "en" ? "Player" : "Spieler"}</button>
            <button type="button" class="choiceBtn${mode === "score" ? " active" : ""}" data-wled-advanced-mode="score">${lang === "en" ? "Score" : "Score"}</button>
          </div>
        </div>
        <div class="advancedJsonHelperControls">
          <input
            id="wledAdvancedJsonHue"
            class="hueSlider advancedJsonHueSlider"
            type="range"
            min="0"
            max="360"
            step="1"
            value="${hue}"
            style="--hue:${hue};"
          />
          <div class="advancedJsonColorPreview" style="background:hsl(${hue} 88% 50%);"></div>
        </div>
        <div class="rowSplit">
          <button type="button" class="btnMini" id="wledApplyAdvancedJsonHelper">${lang === "en" ? "Apply Solid Json" : "Solid Json uebernehmen"}</button>
        </div>
      </div>
    `;
  }

  function renderAdvancedJsonSection(settings) {
    const lang = getLang(settings);
    return `
      <div class="advancedJsonSection">
        <button
          type="button"
          class="triggerGroupHeader"
          id="wledAdvancedJsonToggle"
          aria-expanded="${wledUiState.advancedJsonCollapsed ? "false" : "true"}"
        >
          <span class="triggerGroupTitle">Advanced Json</span>
          <span class="triggerGroupArrow">${wledUiState.advancedJsonCollapsed ? "v" : "^"}</span>
        </button>
        <div class="advancedJsonSectionBody${wledUiState.advancedJsonCollapsed ? " hidden" : ""}">
          <div class="advancedJsonCard">
            <label class="label advancedJsonLabel" for="wledAdvancedJson">Advanced Json</label>
            <textarea
              class="input advancedJsonInput"
              id="wledAdvancedJson"
              rows="6"
              placeholder='{"on":true,"bri":180,"seg":[{"id":0,"fx":27}]}'
            >${wledUiState.advancedJsonDraft}</textarea>
            <div class="hint advancedJsonHint">${lang === "en" ? "Optional WLED JSON that is additionally sent to the selected controllers." : "Optionales WLED JSON, das zusaetzlich an die gewaehlten Controller gesendet wird."}</div>
            <div id="wledAdvancedJsonHelperMount">${renderAdvancedJsonHelper(settings)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function parseControllers(raw) {
    try {
      const arr = JSON.parse(String(raw || "[]"));
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((item) => item && typeof item === "object")
        .map((item, index) => ({
          id: String(item.id || `ctrl_${index + 1}`).trim(),
          name: String(item.name || "").trim(),
          endpoint: String(item.endpoint || "").trim()
        }))
        .filter((item) => !!item.id);
    } catch {
      return [];
    }
  }

  function normalizePresetTargets(rawTargets, controllers) {
    const controllerMap = new Map((controllers || []).map((item, index) => [item.id, { ...item, index }]));
    if (!Array.isArray(rawTargets)) return [];
    return rawTargets
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const controllerId = String(item.controllerId || "").trim();
        const presetId = String(item.presetId || "").trim();
        const controller = controllerMap.get(controllerId);
        if (!controller || !presetId) return null;
        return {
          controllerId,
          presetId,
          presetName: String(item.presetName || "").trim(),
          controllerName: String(item.controllerName || "").trim() || controller.name || `Controller ${controller.index + 1}`
        };
      })
      .filter(Boolean);
  }

  function parseWledEffects(raw, controllers = []) {
    try {
      const arr = JSON.parse(String(raw || "[]"));
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const legacyTargets = item.controllerId && item.presetId
            ? [{
                controllerId: String(item.controllerId || item.controller || "").trim(),
                presetId: String(item.presetId || "").trim(),
                presetName: String(item.presetName || "").trim()
              }]
            : [];
          const presetTargets = normalizePresetTargets(item.presetTargets || legacyTargets, controllers);
          return {
            id: String(item.id || "").trim(),
            name: String(item.name || "").trim(),
            trigger: String(item.trigger || "").trim(),
            presetTargets,
            advancedJson: String(item.advancedJson || "").trim(),
            enabled: item.enabled !== false
          };
        })
        .filter((item) => !!item.id && !!item.name && !!item.trigger && (item.presetTargets.length > 0 || !!item.advancedJson));
    } catch {
      return [];
    }
  }

  function getControllers(settings) {
    const parsed = parseControllers(settings?.wledControllersJson);
    return parsed.length ? parsed : [{ id: "ctrl_1", name: "", endpoint: "http://127.0.0.1" }];
  }

  function isControllerCollapsed(controllerId) {
    return wledUiState.collapsedByControllerId[controllerId] !== false;
  }

  function getControllerLabel(controller, settings, index = -1) {
    if (controller?.name) return controller.name;
    const fallbackIndex = index >= 0 ? index + 1 : 1;
    return getLang(settings) === "en" ? `Controller ${fallbackIndex}` : `Controller ${fallbackIndex}`;
  }

  function getTriggerLabel(trigger, settings) {
    const lang = getLang(settings);
    const normalized = normalizeConfiguredTrigger(trigger);
    const playerMatch = normalized.match(/^(player|spieler)_(\d+)$/);
    if (playerMatch) {
      const number = Number(playerMatch[2]);
      if (number >= 1) {
        return lang === "en" ? `Player ${number}` : `Spieler ${number}`;
      }
    }
    const entry = WLED_TRIGGER_OPTIONS.find((item) => item.value === trigger);
    return entry ? (lang === "en" ? entry.en : entry.de) : trigger;
  }

  function getAllLoadedPresets(settings) {
    const controllers = getControllers(settings);
    return controllers.flatMap((controller, index) => {
      const controllerLabel = getControllerLabel(controller, settings, index);
      return (wledUiState.presetsByControllerId[controller.id] || []).map((preset) => ({
        controllerId: controller.id,
        controllerLabel,
        presetId: String(preset.id),
        presetName: String(preset.name || "")
      }));
    });
  }

  function getSelectedPresetTargets(root, settings) {
    const raw = String(root.querySelector("#wledSelectedPresetTargets")?.value || "[]");
    const allLoaded = getAllLoadedPresets(settings);
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item) => {
        const controllerId = String(item?.controllerId || "").trim();
        const presetId = String(item?.presetId || "").trim();
        const match = allLoaded.find((entry) => entry.controllerId === controllerId && entry.presetId === presetId);
        if (!match) return null;
        return {
          controllerId,
          controllerName: match.controllerLabel,
          presetId,
          presetName: match.presetName
        };
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  function renderTriggerSuggestions(settings) {
    const lang = getLang(settings);
    return WLED_TRIGGER_SUGGESTIONS
      .map((value) => {
        const playerMatch = String(value).match(/^player_(\d+)$/);
        if (playerMatch) {
          const number = Number(playerMatch[1]);
          const label = lang === "en" ? `Player ${number}` : `Spieler ${number}`;
          return `<option value="${value}" label="${label}"></option>`;
        }
        const item = WLED_TRIGGER_OPTIONS.find((entry) => entry.value === value);
        const label = item ? (lang === "en" ? item.en : item.de) : value;
        return `<option value="${value}" label="${label}"></option>`;
      })
      .join("");
  }

  function normalizeConfiguredTrigger(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getPlayerTriggerHintText(value, settings) {
    const lang = getLang(settings);
    const normalized = normalizeConfiguredTrigger(value);
    if (!/^player_[12]$/.test(normalized) && !/^spieler_[12]$/.test(normalized)) return "";
    return lang === "en"
      ? "You can also use player_3, player_4, player_5 and more."
      : "Du kannst genauso auch player_3, player_4, player_5 usw. verwenden.";
  }

  function updateTriggerFieldHint(root, settings) {
    const input = root.querySelector("#wledEffectTrigger");
    const hint = root.querySelector("#wledEffectTriggerDynamicHint");
    if (!hint) return;
    hint.textContent = getPlayerTriggerHintText(input?.value, settings);
    hint.style.display = hint.textContent ? "" : "none";
  }

  function isTriggerGroupCollapsed(groupKey) {
    return TRIGGER_GROUP_COLLAPSED[groupKey] !== false;
  }

  function renderTriggerPickerGroups(settings) {
    const lang = getLang(settings);
    return `
      <div class="triggerPicker">
        ${WLED_TRIGGER_GROUPS.map((group) => `
          <div class="triggerGroup">
            <button
              type="button"
              class="triggerGroupHeader"
              data-wled-trigger-group-toggle="${group.key}"
              aria-expanded="${isTriggerGroupCollapsed(group.key) ? "false" : "true"}"
            >
              <span class="triggerGroupTitle">${lang === "en" ? group.en : group.de}</span>
              <span class="triggerGroupArrow">${isTriggerGroupCollapsed(group.key) ? "v" : "^"}</span>
            </button>
            <div class="triggerChipRow${isTriggerGroupCollapsed(group.key) ? " hidden" : ""}">
              ${group.values.map((value) => `
                <button type="button" class="triggerChip" data-wled-trigger-pick="${value}">
                  <span class="triggerChipValue">${getTriggerLabel(value, settings)}</span>
                </button>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function formatPresetName(item) {
    return item.presetName ? item.presetName : `Preset ${item.presetId}`;
  }

  function formatPresetSelectionLabel(settings, selectedTargets) {
    const lang = getLang(settings);
    if (!selectedTargets.length) return lang === "en" ? "Choose presets" : "Presets auswaehlen";
    if (selectedTargets.length === 1) {
      const target = selectedTargets[0];
      return `${target.presetName || `Preset ${target.presetId}`} | W ${target.controllerName}`;
    }
    return lang === "en"
      ? `${selectedTargets.length} presets selected`
      : `${selectedTargets.length} Presets ausgewaehlt`;
  }

  function renderPresetPicker(settings, selectedTargets = []) {
    const selectedSet = new Set(selectedTargets.map((item) => `${item.controllerId}::${item.presetId}`));
    const allLoaded = getAllLoadedPresets(settings);
    if (!allLoaded.length) {
      return `<div class="hint" style="margin-top:0;">${getLang(settings) === "en" ? "Load presets from one or more controllers first." : "Lade zuerst Presets von einem oder mehreren Controllern."}</div>`;
    }
    return `
      <div class="presetDropdown" data-wled-preset-dropdown="true">
        <input id="wledSelectedPresetTargets" type="hidden" value='${JSON.stringify(selectedTargets)}' />
        <div class="presetSelectedList">
          ${selectedTargets.length ? selectedTargets.map((target) => `
            <button
              type="button"
              class="presetSelectedChip"
              data-wled-remove-selected="${target.controllerId}::${target.presetId}"
            >
              <span class="presetSelectedChipText">
                <span class="presetSelectedChipTitle">${target.presetName || `Preset ${target.presetId}`}</span>
                <span class="presetSelectedChipSub">${target.controllerName}</span>
              </span>
              <span class="presetSelectedChipClose">X</span>
            </button>
          `).join("") : `<div class="hint" style="margin-top:0;">${getLang(settings) === "en" ? "No presets selected yet." : "Noch keine Presets ausgewaehlt."}</div>`}
        </div>
        <button
          type="button"
          class="input presetDropdownBtn"
          id="wledPresetDropdownBtn"
          aria-expanded="${wledUiState.presetDropdownOpen ? "true" : "false"}"
        >
          <span class="presetDropdownValue">${formatPresetSelectionLabel(settings, selectedTargets)}</span>
          <span class="presetDropdownArrow">${wledUiState.presetDropdownOpen ? "^" : "v"}</span>
        </button>
        <div class="presetDropdownMenu${wledUiState.presetDropdownOpen ? " open" : ""}">
          <div class="list" style="margin-top:0;">
            ${allLoaded.map((item) => {
              const key = `${item.controllerId}::${item.presetId}`;
              return `
                <button
                  type="button"
                  class="listItem presetOptionBtn${selectedSet.has(key) ? " active" : ""}"
                  data-wled-preset-option="true"
                  data-wled-preset-controller="${item.controllerId}"
                  data-wled-preset-id="${item.presetId}"
                >
                  <div class="liText">
                    <div class="liTitle">${formatPresetName(item)}</div>
                    <div class="liSub">${item.controllerLabel}</div>
                  </div>
                </button>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderControllers(settings) {
    const controllers = getControllers(settings);
    return controllers.map((controller, index) => `
      <div class="card" style="margin-top:${index === 0 ? 0 : 12}px;">
        <button
          type="button"
          class="listItem"
          data-wled-toggle-controller="${controller.id}"
          style="padding:0;background:transparent;border:none;"
          aria-expanded="${isControllerCollapsed(controller.id) ? "false" : "true"}"
        >
          <div class="liText" style="padding:0;">
            <div class="liTitle">${getControllerLabel(controller, settings, index)}</div>
          </div>
          <div class="liSub" style="margin-top:0;flex:0 0 auto;">${isControllerCollapsed(controller.id) ? "v" : "^"}</div>
        </button>
        <div class="inlinePopupWrap${isControllerCollapsed(controller.id) ? "" : " open"}" data-wled-controller-panel="${controller.id}">
          <div class="inlinePopupCard">
            <div class="formRow" style="margin-top:0;">
              <label class="label" for="wledControllerName_${controller.id}">Name</label>
              <input class="input" id="wledControllerName_${controller.id}" data-wled-controller-name="${controller.id}" type="text" placeholder="${getLang(settings) === "en" ? "Optional display name" : "Optionaler Anzeigename"}" value="${controller.name}" />
            </div>
            <div class="formRow">
              <label class="label" for="wledControllerEndpoint_${controller.id}">IP / Endpoint</label>
              <input class="input" id="wledControllerEndpoint_${controller.id}" data-wled-controller-endpoint="${controller.id}" type="text" placeholder="http://192.168.178.50" value="${controller.endpoint}" />
              <div class="hint">WLED IP oder kompletter HTTP Endpoint.</div>
            </div>
            <div class="inlineActionsRow" style="margin-top:12px;">
              <button type="button" class="btnMini" data-wled-load-presets="${controller.id}">Presets laden</button>
              ${index > 0 ? `<button type="button" class="customThemeDelete" data-wled-remove-controller="${controller.id}" title="Controller entfernen">X</button>` : ""}
            </div>
            <div class="hint" data-wled-status="${controller.id}">${wledUiState.statusByControllerId[controller.id] || ""}</div>
          </div>
        </div>
      </div>
    `).join("");
  }

  function renderTargetSummary(item, settings) {
    const parts = [];
    if (item.presetTargets.length) {
      parts.push(item.presetTargets.map((target) => `${target.controllerName} | ${target.presetId}${target.presetName ? ` - ${target.presetName}` : ""}`).join(" | "));
    }
    if (item.advancedJson) {
      parts.push("Advanced Json");
    }
    return parts.join(" | ");
  }

  function renderEffectList(settings) {
    const controllers = getControllers(settings);
    const items = parseWledEffects(settings?.wledEffectsJson, controllers);
    if (!items.length) {
      return `<div class="hint" style="margin-top:0;">${getLang(settings) === "en" ? "No WLED effects created yet." : "Noch keine WLED-Effekte angelegt."}</div>`;
    }
    return `
      <div class="list" style="margin-top:12px;">
        ${items.map((item) => `
          <div class="listToggle">
            <div class="liText">
              <div class="liTitle">${item.name}</div>
              <div class="liSub">${getTriggerLabel(item.trigger, settings)} | ${renderTargetSummary(item, settings)}</div>
            </div>
            <div class="inlineActionsRow">
              <button type="button" class="btnMini" data-wled-test="${item.id}">Test</button>
              <label class="switch">
                <input type="checkbox" data-wled-toggle="${item.id}" ${item.enabled ? "checked" : ""} />
                <span class="slider"></span>
              </label>
              <button type="button" class="customThemeDelete" data-wled-delete="${item.id}" title="Effekt loeschen">X</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function updateControllerStatus(root, controllerId, text) {
    const el = root.querySelector(`[data-wled-status="${controllerId}"]`);
    if (el) el.textContent = text || "";
  }

  function refreshPresetPicker(root, settings) {
    const mount = root.querySelector("#wledPresetPickerMount");
    if (!mount) return;
    const selectedTargets = getSelectedPresetTargets(root, settings);
    mount.innerHTML = renderPresetPicker(settings, selectedTargets);
  }

  function writeSelectedPresetTargets(root, targets) {
    const hidden = root.querySelector("#wledSelectedPresetTargets");
    if (hidden) hidden.value = JSON.stringify(targets || []);
  }

  async function saveControllers(api, controllers) {
    await api.savePartial({ wledControllersJson: JSON.stringify(controllers) });
  }

  async function loadPresetsForController(api, controllerId) {
    const root = api.root;
    const settings = api.getSettings?.() || {};
    const endpoint = String(root.querySelector(`[data-wled-controller-endpoint="${controllerId}"]`)?.value || "").trim();
    if (!endpoint) {
      wledUiState.presetsByControllerId[controllerId] = [];
      wledUiState.loadedEndpointByControllerId[controllerId] = "";
      wledUiState.statusByControllerId[controllerId] = "";
      updateControllerStatus(root, controllerId, "");
      return;
    }
    if (wledUiState.loadingByControllerId[controllerId]) return;
    wledUiState.loadingByControllerId[controllerId] = true;
    updateControllerStatus(root, controllerId, getLang(settings) === "en" ? "Loading presets..." : "Lade Presets...");
    try {
      const res = await api.send({ type: "GET_WLED_PRESETS", endpoint });
      if (!res?.ok) throw new Error(res?.error || "Preset load failed");
      wledUiState.presetsByControllerId[controllerId] = Array.isArray(res.presets) ? res.presets : [];
      wledUiState.loadedEndpointByControllerId[controllerId] = endpoint;
      const text = getLang(settings) === "en"
        ? `${wledUiState.presetsByControllerId[controllerId].length} presets loaded.`
        : `${wledUiState.presetsByControllerId[controllerId].length} Presets geladen.`;
      wledUiState.statusByControllerId[controllerId] = text;
      updateControllerStatus(root, controllerId, text);
      refreshPresetPicker(root, api.getSettings?.() || settings);
    } catch (e) {
      const text = getLang(settings) === "en"
        ? `Load failed: ${String(e?.message || e)}`
        : `Laden fehlgeschlagen: ${String(e?.message || e)}`;
      wledUiState.statusByControllerId[controllerId] = text;
      updateControllerStatus(root, controllerId, text);
    } finally {
      wledUiState.loadingByControllerId[controllerId] = false;
    }
  }

  function autoLoadPresets(api, settings) {
    const controllers = getControllers(settings);
    for (const controller of controllers) {
      const endpoint = String(controller.endpoint || "").trim();
      if (!endpoint) continue;
      if (wledUiState.loadingByControllerId[controller.id]) continue;
      if (wledUiState.loadedEndpointByControllerId[controller.id] === endpoint) continue;
      loadPresetsForController(api, controller.id);
    }
  }

  scope.AD_SB_MODULES.wled = {
    id: "wled",
    icon: "W",
    navLabelKey: "nav_wled",
    needs: { streamerbot: false, obs: false },
    render() {
      return `
        <h2 class="title" data-i18n="title_wled">WLED</h2>
        <div class="card">
          <div class="sectionHead">
            <div class="sectionTitle" style="margin:0;">WLED Effekte</div>
            <button id="addWledEffectBtn" class="btnMini" type="button">Hinzufügen</button>
          </div>
          <div class="hint">Lege mehrere Trigger an und waehle dafuer beliebig viele Presets aus allen geladenen Controllern.</div>
          <div class="formRow">
            <label class="label" for="wledEffectName">Name</label>
            <input class="input" id="wledEffectName" type="text" placeholder="z. B. 180 Ring" />
          </div>
          <div class="formRow">
            <label class="label">Presets</label>
            <div id="wledPresetPickerMount"></div>
          </div>
          <div class="formRow" id="wledAdvancedJsonSectionMount">${renderAdvancedJsonSection({ uiLanguage: "de" })}</div>
          <div class="formRow">
            <label class="label" for="wledEffectTrigger">Autodarts Trigger</label>
            <input class="input" id="wledEffectTrigger" type="text" list="wledTriggerSuggestions" placeholder="z. B. gameshot, range_100_180, t20_t20_t20" />
            <datalist id="wledTriggerSuggestions">${renderTriggerSuggestions({ uiLanguage: "de" })}</datalist>
            <div class="hint">Freier Trigger oder Schnellwahl. Fuer weitere Spieler einfach <code>player_3</code>, <code>player_4</code>, <code>player_5</code> usw. eintragen.</div>
            <div class="hint" id="wledEffectTriggerDynamicHint" style="display:none;"></div>
            <div id="wledTriggerPickerMount">${renderTriggerPickerGroups({ uiLanguage: "de" })}</div>
          </div>
          <div id="wledEffectsStatus" class="hint" style="margin-top:8px;"></div>
          <div id="wledEffectsListMount"></div>
        </div>

        <div class="spacer"></div>
        <div class="sectionHead">
          <div class="sectionTitle" style="margin:0;">Controller</div>
          <button id="addWledControllerBtn" class="btnMini" type="button">Controller hinzufuegen</button>
        </div>
        <div id="wledControllersMount"></div>
        <div class="spacer"></div>
      `;
    },
    bind(api) {
      const root = api.root;
      root.querySelector("#wledEffectTrigger")?.addEventListener("input", () => {
        updateTriggerFieldHint(root, api.getSettings?.() || {});
      });
      root.addEventListener("input", (ev) => {
        const target = ev.target;
        if (target?.matches?.("#wledAdvancedJson")) {
          wledUiState.advancedJsonDraft = String(target.value || "");
          return;
        }
        if (!target?.matches?.("#wledAdvancedJsonHue")) return;
        const hue = clampHue(target.value);
        wledUiState.advancedJsonHelperHue = hue;
        target.style.setProperty("--hue", String(hue));
        const preview = root.querySelector(".advancedJsonColorPreview");
        if (preview) preview.style.background = `hsl(${hue} 88% 50%)`;
      });

      root.querySelector("#addWledControllerBtn")?.addEventListener("click", async () => {
        const settings = api.getSettings?.() || {};
        const controllers = getControllers(settings);
        const nextIndex = controllers.length + 1;
        const nextId = `ctrl_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
        const nextControllers = controllers.concat([{ id: nextId, name: "", endpoint: "" }]);
        wledUiState.collapsedByControllerId[nextId] = false;
        await saveControllers(api, nextControllers);
        const statusEl = root.querySelector("#wledEffectsStatus");
        if (statusEl) statusEl.textContent = getLang(settings) === "en"
          ? `Controller ${nextIndex} added.`
          : `Controller ${nextIndex} hinzugefuegt.`;
      });

      root.querySelector("#addWledEffectBtn")?.addEventListener("click", async () => {
        const settings = api.getSettings?.() || {};
        const controllers = getControllers(settings);
        const lang = getLang(settings);
        const statusEl = root.querySelector("#wledEffectsStatus");
        const name = String(root.querySelector("#wledEffectName")?.value || "").trim();
        const trigger = normalizeConfiguredTrigger(root.querySelector("#wledEffectTrigger")?.value);
        const advancedJson = String(root.querySelector("#wledAdvancedJson")?.value || wledUiState.advancedJsonDraft || "").trim();
        const presetTargets = getSelectedPresetTargets(root, settings);
        if (!name || !trigger || (!presetTargets.length && !advancedJson)) {
          if (statusEl) statusEl.textContent = lang === "en"
            ? "Please enter a name, trigger and choose presets or Advanced Json."
            : "Bitte Name, Trigger und Presets oder Advanced Json auswaehlen.";
          return;
        }
        if (advancedJson) {
          try {
            JSON.parse(advancedJson);
          } catch (e) {
            if (statusEl) statusEl.textContent = lang === "en"
              ? `Advanced Json invalid: ${String(e?.message || e)}`
              : `Advanced Json ungueltig: ${String(e?.message || e)}`;
            return;
          }
        }
        if (advancedJson && !presetTargets.length) {
          if (statusEl) statusEl.textContent = lang === "en"
            ? "Please select at least one preset so the target controller is known."
            : "Bitte mindestens ein Preset waehlen, damit der Ziel-Controller bekannt ist.";
          return;
        }
        const nextEffects = parseWledEffects(settings.wledEffectsJson, controllers).concat([{
          id: `wled_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
          name,
          trigger,
          presetTargets,
          advancedJson
        }]);
        await api.savePartial({ wledEffectsJson: JSON.stringify(nextEffects) });
        const nameInput = root.querySelector("#wledEffectName");
        if (nameInput) nameInput.value = "";
        const triggerInput = root.querySelector("#wledEffectTrigger");
        if (triggerInput) triggerInput.value = "";
        const advancedJsonInput = root.querySelector("#wledAdvancedJson");
        if (advancedJsonInput) advancedJsonInput.value = "";
        wledUiState.advancedJsonDraft = "";
        writeSelectedPresetTargets(root, []);
        wledUiState.presetDropdownOpen = false;
        refreshPresetPicker(root, api.getSettings?.() || settings);
        if (statusEl) statusEl.textContent = lang === "en" ? "WLED effect added." : "WLED Effekt hinzugefuegt.";
      });

      root.addEventListener("change", async (ev) => {
        const target = ev.target;
        if (target?.matches?.("[data-wled-toggle]")) {
          const settings = api.getSettings?.() || {};
          const controllers = getControllers(settings);
          const id = String(target.dataset.wledToggle || "");
          const nextEffects = parseWledEffects(settings.wledEffectsJson, controllers).map((item) => (
            item.id === id ? { ...item, enabled: !!target.checked } : item
          ));
          await api.savePartial({ wledEffectsJson: JSON.stringify(nextEffects) });
          return;
        }

        if (target?.matches?.("[data-wled-controller-name], [data-wled-controller-endpoint]")) {
          const settings = api.getSettings?.() || {};
          const controllers = getControllers(settings).map((item) => {
            if (item.id !== target.dataset.wledControllerName && item.id !== target.dataset.wledControllerEndpoint) return item;
            return {
              ...item,
              name: String(root.querySelector(`[data-wled-controller-name="${item.id}"]`)?.value || "").trim(),
              endpoint: String(root.querySelector(`[data-wled-controller-endpoint="${item.id}"]`)?.value || "").trim()
            };
          });
          await saveControllers(api, controllers);
        }
      });

      root.addEventListener("click", async (ev) => {
        if (
          wledUiState.presetDropdownOpen &&
          !ev.target?.closest?.("[data-wled-preset-dropdown]") &&
          !ev.target?.closest?.("#wledPresetDropdownBtn")
        ) {
          wledUiState.presetDropdownOpen = false;
          refreshPresetPicker(root, api.getSettings?.() || {});
        }

        const dropdownBtn = ev.target?.closest?.("#wledPresetDropdownBtn");
        if (dropdownBtn) {
          wledUiState.presetDropdownOpen = !wledUiState.presetDropdownOpen;
          refreshPresetPicker(root, api.getSettings?.() || {});
          return;
        }

        const advancedJsonToggleBtn = ev.target?.closest?.("#wledAdvancedJsonToggle");
        if (advancedJsonToggleBtn) {
          wledUiState.advancedJsonDraft = String(root.querySelector("#wledAdvancedJson")?.value || wledUiState.advancedJsonDraft || "");
          wledUiState.advancedJsonCollapsed = !wledUiState.advancedJsonCollapsed;
          const mount = root.querySelector("#wledAdvancedJsonSectionMount");
          if (mount) mount.innerHTML = renderAdvancedJsonSection(api.getSettings?.() || {});
          return;
        }

        const groupToggleBtn = ev.target?.closest?.("[data-wled-trigger-group-toggle]");
        if (groupToggleBtn) {
          const groupKey = String(groupToggleBtn.dataset.wledTriggerGroupToggle || "");
          if (groupKey) {
            TRIGGER_GROUP_COLLAPSED[groupKey] = !isTriggerGroupCollapsed(groupKey);
            const triggerPickerMount = root.querySelector("#wledTriggerPickerMount");
            if (triggerPickerMount) triggerPickerMount.innerHTML = renderTriggerPickerGroups(api.getSettings?.() || {});
          }
          return;
        }

        const advancedModeBtn = ev.target?.closest?.("[data-wled-advanced-mode]");
        if (advancedModeBtn) {
          wledUiState.advancedJsonHelperMode = String(advancedModeBtn.dataset.wledAdvancedMode || "player") === "score" ? "score" : "player";
          const mount = root.querySelector("#wledAdvancedJsonHelperMount");
          if (mount) mount.innerHTML = renderAdvancedJsonHelper(api.getSettings?.() || {});
          return;
        }

        const applyAdvancedJsonBtn = ev.target?.closest?.("#wledApplyAdvancedJsonHelper");
        if (applyAdvancedJsonBtn) {
          const textarea = root.querySelector("#wledAdvancedJson");
          const nextValue = buildSolidAdvancedJson(wledUiState.advancedJsonHelperHue);
          wledUiState.advancedJsonDraft = nextValue;
          if (textarea) textarea.value = nextValue;
          return;
        }

        const triggerPickBtn = ev.target?.closest?.("[data-wled-trigger-pick]");
        if (triggerPickBtn) {
          const triggerInput = root.querySelector("#wledEffectTrigger");
          if (triggerInput) {
            triggerInput.value = String(triggerPickBtn.dataset.wledTriggerPick || "");
            triggerInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
          return;
        }

        const presetOptionBtn = ev.target?.closest?.("[data-wled-preset-option]");
        if (presetOptionBtn) {
          const settings = api.getSettings?.() || {};
          const controllerId = String(presetOptionBtn.dataset.wledPresetController || "").trim();
          const presetId = String(presetOptionBtn.dataset.wledPresetId || "").trim();
          const selectedTargets = getSelectedPresetTargets(root, settings);
          const exists = selectedTargets.some((item) => item.controllerId === controllerId && item.presetId === presetId);
          const match = getAllLoadedPresets(settings).find((item) => item.controllerId === controllerId && item.presetId === presetId);
          if (!match) return;
          const nextTargets = exists
            ? selectedTargets.filter((item) => !(item.controllerId === controllerId && item.presetId === presetId))
            : selectedTargets.concat([{
                controllerId,
                controllerName: match.controllerLabel,
                presetId,
                presetName: match.presetName
              }]);
          writeSelectedPresetTargets(root, nextTargets);
          wledUiState.presetDropdownOpen = true;
          refreshPresetPicker(root, settings);
          return;
        }

        const removeSelectedBtn = ev.target?.closest?.("[data-wled-remove-selected]");
        if (removeSelectedBtn) {
          const settings = api.getSettings?.() || {};
          const removeKey = String(removeSelectedBtn.dataset.wledRemoveSelected || "");
          const nextTargets = getSelectedPresetTargets(root, settings)
            .filter((item) => `${item.controllerId}::${item.presetId}` !== removeKey);
          writeSelectedPresetTargets(root, nextTargets);
          refreshPresetPicker(root, settings);
          return;
        }

        const loadBtn = ev.target?.closest?.("[data-wled-load-presets]");
        if (loadBtn) {
          await loadPresetsForController(api, String(loadBtn.dataset.wledLoadPresets || ""));
          return;
        }

        const collapseBtn = ev.target?.closest?.("[data-wled-toggle-controller]");
        if (collapseBtn) {
          const controllerId = String(collapseBtn.dataset.wledToggleController || "");
          wledUiState.collapsedByControllerId[controllerId] = !isControllerCollapsed(controllerId);
          const settings = api.getSettings?.() || {};
          const controllerMount = root.querySelector("#wledControllersMount");
          if (controllerMount) controllerMount.innerHTML = renderControllers(settings);
          return;
        }

        const removeBtn = ev.target?.closest?.("[data-wled-remove-controller]");
        if (removeBtn) {
          const settings = api.getSettings?.() || {};
          const controllers = getControllers(settings);
          const removeId = String(removeBtn.dataset.wledRemoveController || "");
          const nextControllers = controllers.filter((item) => item.id !== removeId);
          const nextEffects = parseWledEffects(settings.wledEffectsJson, controllers)
            .map((item) => ({
              ...item,
              presetTargets: item.presetTargets.filter((target) => target.controllerId !== removeId)
            }))
            .filter((item) => item.presetTargets.length > 0);
          delete wledUiState.presetsByControllerId[removeId];
          delete wledUiState.statusByControllerId[removeId];
          await api.savePartial({
            wledControllersJson: JSON.stringify(nextControllers),
            wledEffectsJson: JSON.stringify(nextEffects)
          });
          return;
        }

        const deleteBtn = ev.target?.closest?.("[data-wled-delete]");
        if (deleteBtn) {
          const settings = api.getSettings?.() || {};
          const controllers = getControllers(settings);
          const id = String(deleteBtn.dataset.wledDelete || "");
          const nextEffects = parseWledEffects(settings.wledEffectsJson, controllers).filter((item) => item.id !== id);
          await api.savePartial({ wledEffectsJson: JSON.stringify(nextEffects) });
          return;
        }

        const testBtn = ev.target?.closest?.("[data-wled-test]");
        if (!testBtn) return;
        const settings = api.getSettings?.() || {};
        const controllers = getControllers(settings);
        const items = parseWledEffects(settings.wledEffectsJson, controllers);
        const statusEl = root.querySelector("#wledEffectsStatus");
        const id = String(testBtn.dataset.wledTest || "");
        const match = items.find((item) => item.id === id);
        if (!match) return;
        try {
          const res = await api.send({ type: "TRIGGER_WLED_TARGETS", targets: match.presetTargets, advancedJson: match.advancedJson || "" });
          if (!res?.ok) throw new Error(res?.error || "Trigger failed");
          if (statusEl) statusEl.textContent = getLang(settings) === "en" ? "Presets triggered." : "Presets ausgeloest.";
        } catch (e) {
          if (statusEl) statusEl.textContent = getLang(settings) === "en"
            ? `Trigger failed: ${String(e?.message || e)}`
            : `Trigger fehlgeschlagen: ${String(e?.message || e)}`;
        }
      });
    },
    sync(api, settings) {
      const root = api.root;
      const s = settings || {};
      const controllers = getControllers(s);
      wledUiState.advancedJsonDraft = String(root.querySelector("#wledAdvancedJson")?.value || wledUiState.advancedJsonDraft || "");

      const triggerSuggestions = root.querySelector("#wledTriggerSuggestions");
      if (triggerSuggestions) triggerSuggestions.innerHTML = renderTriggerSuggestions(s);
      updateTriggerFieldHint(root, s);
      const advancedJsonSectionMount = root.querySelector("#wledAdvancedJsonSectionMount");
      if (advancedJsonSectionMount) advancedJsonSectionMount.innerHTML = renderAdvancedJsonSection(s);
      const advancedJsonHelperMount = root.querySelector("#wledAdvancedJsonHelperMount");
      if (advancedJsonHelperMount) advancedJsonHelperMount.innerHTML = renderAdvancedJsonHelper(s);
      const triggerPickerMount = root.querySelector("#wledTriggerPickerMount");
      if (triggerPickerMount) triggerPickerMount.innerHTML = renderTriggerPickerGroups(s);

      const controllerMount = root.querySelector("#wledControllersMount");
      if (controllerMount) controllerMount.innerHTML = renderControllers(s);

      refreshPresetPicker(root, s);

      const effectsMount = root.querySelector("#wledEffectsListMount");
      if (effectsMount) effectsMount.innerHTML = renderEffectList(s);

      for (const controller of controllers) {
        updateControllerStatus(root, controller.id, wledUiState.statusByControllerId[controller.id] || "");
      }

      autoLoadPresets(api, s);
    }
  };
})(window);
