(function initEffectsModule(scope) {
  scope.AD_SB_MODULES = scope.AD_SB_MODULES || {};

  let MISS_GUARD_POPUP_OPEN = false;
  const CUSTOM_EFFECT_TRIGGER_OPTIONS = [
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

  function currentLang(settings) {
    return String(settings?.uiLanguage || "de").toLowerCase() === "en" ? "en" : "de";
  }

  function parseCustomEffects(raw) {
    try {
      const arr = JSON.parse(String(raw || "[]"));
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          id: String(item.id || "").trim(),
          key: String(item.key || "").trim(),
          name: String(item.name || "").trim(),
          trigger: String(item.trigger || "").trim(),
          enabled: item.enabled !== false
        }))
        .filter((item) => !!item.id && !!item.key && !!item.name && !!item.trigger);
    } catch {
      return [];
    }
  }

  function getTriggerLabel(trigger, settings) {
    const lang = currentLang(settings);
    const option = CUSTOM_EFFECT_TRIGGER_OPTIONS.find((item) => item.value === trigger);
    if (!option) return trigger;
    return lang === "en" ? option.en : option.de;
  }

  function renderCustomEffectTriggerOptions(settings, selectedValue = "") {
    const lang = currentLang(settings);
    return CUSTOM_EFFECT_TRIGGER_OPTIONS
      .map((item) => `<option value="${item.value}"${item.value === selectedValue ? " selected" : ""}>${lang === "en" ? item.en : item.de}</option>`)
      .join("");
  }

  function renderCustomEffectsList(settings) {
    const customEffects = parseCustomEffects(settings?.customEffectsJson);
    if (!customEffects.length) {
      return `<div class="hint" style="margin-top:0;" data-i18n="custom_effects_empty">Noch keine benutzerdefinierten Effekte angelegt.</div>`;
    }
    return `
      <div class="list" style="margin-top:12px;">
        ${customEffects.map((item) => `
          <div class="listToggle">
            <div class="liText">
              <div class="liTitle">${item.name}</div>
              <div class="liSub">${getTriggerLabel(item.trigger, settings)}</div>
            </div>
            <div class="inlineActionsRow">
              <label class="switch">
                <input type="checkbox" data-custom-effect-toggle="${item.id}" ${item.enabled ? "checked" : ""} />
                <span class="slider"></span>
              </label>
              <button type="button" class="customThemeDelete" data-custom-effect-delete="${item.id}" title="${currentLang(settings) === "en" ? "Delete effect" : "Effekt löschen"}">X</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  scope.AD_SB_MODULES.effects = {
    id: "effects",
    icon: "E",
    navLabelKey: "nav_effects",
    needs: { streamerbot: true, obs: false },
    render() {
      return `
        <h2 class="title"><span data-i18n="title_effects">Effects</span><span class="titleMeta">Streamer.bot/OBS</span></h2>

        <div class="sectionTitle" data-i18n="section_per_dart">Per Dart</div>
        <div class="list">
          <div class="listToggle">
            <div class="liText">
              <div class="liTitle"> <span data-i18n="miss_title">Miss</span> <button type="button" class="miniChevronBtn${MISS_GUARD_POPUP_OPEN ? " active" : ""}" id="missGuardPopupToggle" aria-label="Miss Guard Einstellungen" title="Miss Guard Einstellungen"><span class="ddArrow">${MISS_GUARD_POPUP_OPEN ? "▲" : "▼"}</span></button></div>
              <div class="liSub" data-i18n="miss_sub">Score 0 / M*</div>
            </div>
            <label class="switch"><input type="checkbox" id="enableMiss" /><span class="slider"></span></label>
          </div>
          <div class="inlinePopupWrap${MISS_GUARD_POPUP_OPEN ? " open" : ""}" id="missGuardPopupWrap">
            <div class="inlinePopupCard">
              <div class="formRow" style="margin-top:0;">
                <label class="label" for="missGuardThreshold" data-i18n="miss_guard_threshold_label">Miss Guard Threshold</label>
                <input class="input" id="missGuardThreshold" type="number" min="2" max="170" step="1" />
                <div class="hint" data-i18n="miss_guard_threshold_hint">At and below this score, generic Miss can be suppressed.</div>
              </div>
              <div class="list" style="margin-top:10px;">
                <div class="listToggle">
                  <div class="liText">
                    <div class="liTitle" data-i18n="miss_guard_title">Double-Out Miss Guard</div>
                    <div class="liSub" data-i18n="miss_guard_sub">Suppress generic Miss in finish range</div>
                  </div>
                  <label class="switch"><input type="checkbox" id="missGuardOnDoubleOut" /><span class="slider"></span></label>
                </div>
              </div>
            </div>
          </div>
          <div class="listToggle">
            <div class="liText">
              <div class="liTitle" data-i18n="double_title">Double</div>
              <div class="liSub" data-i18n="double_sub">Any double hit</div>
            </div>
            <label class="switch"><input type="checkbox" id="enableDouble" /><span class="slider"></span></label>
          </div>
          <div class="listToggle">
            <div class="liText">
              <div class="liTitle" data-i18n="triple_title">Triple (generic)</div>
              <div class="liSub" data-i18n="triple_sub">Only when not T20/T19/T18/T17</div>
            </div>
            <label class="switch"><input type="checkbox" id="enableTriple" /><span class="slider"></span></label>
          </div>
          <div class="listToggle">
            <div class="liText">
              <div class="liTitle" data-i18n="bull_title">Bull</div>
              <div class="liSub">25</div>
            </div>
            <label class="switch"><input type="checkbox" id="enableBull" /><span class="slider"></span></label>
          </div>
          <div class="listToggle">
            <div class="liText">
              <div class="liTitle" data-i18n="dbull_title">Double Bull</div>
              <div class="liSub">50</div>
            </div>
            <label class="switch"><input type="checkbox" id="enableDBull" /><span class="slider"></span></label>
          </div>
        </div>

        <div class="divider"></div>
        <div class="sectionTitle" data-i18n="section_special_triples">Special Triples</div>
        <div class="grid2">
          <div class="tile"><div class="tileTitle">T20</div><label class="switch"><input id="enableT20" type="checkbox" /><span class="slider"></span></label></div>
          <div class="tile"><div class="tileTitle">T19</div><label class="switch"><input id="enableT19" type="checkbox" /><span class="slider"></span></label></div>
          <div class="tile"><div class="tileTitle">T18</div><label class="switch"><input id="enableT18" type="checkbox" /><span class="slider"></span></label></div>
          <div class="tile"><div class="tileTitle">T17</div><label class="switch"><input id="enableT17" type="checkbox" /><span class="slider"></span></label></div>
        </div>

        <div class="divider"></div>
        <div class="sectionTitle" data-i18n="section_per_visit">Per Visit (after 3 darts)</div>
        <div class="list">
          <div class="listToggle">
            <div class="liText">
              <div class="liTitle" data-i18n="high100_title">High 100+</div>
              <div class="liSub" data-i18n="after_third_dart_sub">Triggers only after 3rd dart</div>
            </div>
            <label class="switch"><input type="checkbox" id="enableHigh100" /><span class="slider"></span></label>
          </div>
          <div class="listToggle">
            <div class="liText">
              <div class="liTitle" data-i18n="high140_title">High 140+</div>
              <div class="liSub" data-i18n="after_third_dart_sub">Triggers only after 3rd dart</div>
            </div>
            <label class="switch"><input type="checkbox" id="enableHigh140" /><span class="slider"></span></label>
          </div>
          <div class="listToggle">
            <div class="liText">
              <div class="liTitle" data-i18n="oneeighty_title">180</div>
              <div class="liSub" data-i18n="priority_third_dart_sub">Priority on 3rd dart</div>
            </div>
            <label class="switch"><input type="checkbox" id="enable180" /><span class="slider"></span></label>
          </div>
          <div class="listToggle">
            <div class="liText">
              <div class="liTitle" data-i18n="washer_title">Waschmaschine (20, 1, 5)</div>
              <div class="liSub" data-i18n="washer_sub">Triggers when 20,1,5 in any order.</div>
            </div>
            <label class="switch"><input type="checkbox" id="enableWaschmaschine" /><span class="slider"></span></label>
          </div>
          <div class="listToggle">
            <div class="liText">
              <div class="liTitle" data-i18n="no_score_title">No Score</div>
              <div class="liSub" data-i18n="no_score_sub">Full visit scores 0</div>
            </div>
            <label class="switch"><input type="checkbox" id="enableNoScore" /><span class="slider"></span></label>
          </div>
        </div>

        <div class="divider"></div>
        <div class="sectionTitle" data-i18n="section_other">Other</div>
        <div class="list">
          <div class="listToggle">
            <div class="liText">
              <div class="liTitle" data-i18n="correction_title">Undo / Correction</div>
              <div class="liSub" data-i18n="correction_sub">Undo button trigger</div>
            </div>
            <label class="switch"><input type="checkbox" id="enableCorrection" /><span class="slider"></span></label>
          </div>
          <div class="listToggle">
            <div class="liText">
              <div class="liTitle" data-i18n="my_turn_start_title">Mein Zug</div>
              <div class="liSub" data-i18n="my_turn_start_sub">Trigger on your turn start</div>
            </div>
            <label class="switch"><input type="checkbox" id="enableMyTurnStart" /><span class="slider"></span></label>
          </div>
          <div class="listToggle">
            <div class="liText">
              <div class="liTitle" data-i18n="opponent_turn_start_title">Gegner Zug</div>
              <div class="liSub" data-i18n="opponent_turn_start_sub">Trigger on opponent turn</div>
            </div>
            <label class="switch"><input type="checkbox" id="enableOpponentTurnStart" /><span class="slider"></span></label>
          </div>
          <div class="listToggle">
            <div class="liText">
              <div class="liTitle" data-i18n="special_miss_title">Special Miss</div>
              <div class="liSub" data-i18n="special_miss_sub">Miss in finish range</div>
            </div>
            <label class="switch"><input type="checkbox" id="enableSpecialMiss" /><span class="slider"></span></label>
          </div>
        </div>

        <div class="spacer"></div>
        <div class="card">
          <div class="sectionHead">
            <div class="sectionTitle" style="margin:0;" data-i18n="custom_effects_title">Benutzerdefinierte Effekte</div>
          </div>
          <div class="hint" data-i18n="custom_effects_hint">Lege eigene Effekt-Trigger mit Namen, Autodarts-Auslöser und Schalter an.</div>
          <div class="formRow">
            <label class="label" for="customEffectName" data-i18n="custom_effects_name_label">Name</label>
            <input class="input" id="customEffectName" type="text" placeholder="z. B. Team Winner" />
          </div>
          <div class="formRow">
            <label class="label" for="customEffectTrigger" data-i18n="custom_effects_trigger_label">Autodarts Aktion</label>
            <select class="input" id="customEffectTrigger"></select>
          </div>
          <div class="rowSplit">
            <button id="addCustomEffectBtn" class="btnPrimary" type="button" data-i18n="custom_effects_add_btn">Effekt hinzufügen</button>
          </div>
          <div id="customEffectsStatus" class="hint" style="margin-top:8px;"></div>
          <div id="customEffectsListMount">${renderCustomEffectsList({ uiLanguage: "de", customEffectsJson: "[]" })}</div>
        </div>
        <div class="spacer"></div>
      `;
    },
    bind(api) {
      const root = api.root;
      const ids = [
        "enableMiss", "enableDouble", "enableTriple", "enableBull", "enableDBull",
        "enableT20", "enableT19", "enableT18", "enableT17",
        "enableHigh100", "enableHigh140", "enable180", "enableWaschmaschine", "enableNoScore",
        "enableCorrection", "enableMyTurnStart", "enableOpponentTurnStart", "enableSpecialMiss",
        "missGuardOnDoubleOut"
      ];
      ids.forEach((id) => api.bindAuto(root, id, id));
      api.bindAuto(root, "missGuardThreshold", "missGuardThreshold", "number");

      root.querySelector("#missGuardPopupToggle")?.addEventListener("click", () => {
        MISS_GUARD_POPUP_OPEN = !MISS_GUARD_POPUP_OPEN;
        scope.AD_SB_MODULES.effects.sync(api, api.getSettings?.() || {});
      });

      root.querySelector("#addCustomEffectBtn")?.addEventListener("click", async () => {
        const settings = api.getSettings?.() || {};
        const nameInput = root.querySelector("#customEffectName");
        const triggerInput = root.querySelector("#customEffectTrigger");
        const statusEl = root.querySelector("#customEffectsStatus");
        const name = String(nameInput?.value || "").trim();
        const trigger = String(triggerInput?.value || "").trim();
        if (!name || !trigger) {
          if (statusEl) statusEl.textContent = currentLang(settings) === "en"
            ? "Please enter a name and choose a trigger."
            : "Bitte Namen und Auslöser auswählen.";
          return;
        }

        const customEffects = parseCustomEffects(settings.customEffectsJson);
        const id = `fx_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
        const key = `custom_${id}`;
        const nextEffects = customEffects.concat([{ id, key, name, trigger, enabled: true }]);
        const nextActions = { ...(settings.actions || {}), [key]: name };

        await api.savePartial({
          customEffectsJson: JSON.stringify(nextEffects),
          actions: nextActions
        });

        if (nameInput) nameInput.value = "";
        if (triggerInput && !triggerInput.value) triggerInput.value = CUSTOM_EFFECT_TRIGGER_OPTIONS[0]?.value || "";
        if (statusEl) statusEl.textContent = currentLang(settings) === "en"
          ? "Custom effect added."
          : "Benutzerdefinierter Effekt hinzugefügt.";
      });

      root.addEventListener("change", async (ev) => {
        const target = ev.target;
        if (!target?.matches?.("[data-custom-effect-toggle]")) return;
        const settings = api.getSettings?.() || {};
        const id = String(target.dataset.customEffectToggle || "");
        const nextEffects = parseCustomEffects(settings.customEffectsJson).map((item) => (
          item.id === id ? { ...item, enabled: !!target.checked } : item
        ));
        await api.savePartial({ customEffectsJson: JSON.stringify(nextEffects) });
      });

      root.addEventListener("click", async (ev) => {
        const btn = ev.target?.closest?.("[data-custom-effect-delete]");
        if (!btn) return;
        const settings = api.getSettings?.() || {};
        const id = String(btn.dataset.customEffectDelete || "");
        const customEffects = parseCustomEffects(settings.customEffectsJson);
        const removeItem = customEffects.find((item) => item.id === id);
        if (!removeItem) return;
        const nextEffects = customEffects.filter((item) => item.id !== id);
        const nextActions = { ...(settings.actions || {}) };
        delete nextActions[removeItem.key];
        await api.savePartial({
          customEffectsJson: JSON.stringify(nextEffects),
          actions: nextActions
        });
      });
    },
    sync(api, settings) {
      const root = api.root;
      const s = settings || {};
      const ids = [
        "enableMiss", "enableDouble", "enableTriple", "enableBull", "enableDBull",
        "enableT20", "enableT19", "enableT18", "enableT17",
        "enableHigh100", "enableHigh140", "enable180", "enableWaschmaschine", "enableNoScore",
        "enableCorrection", "enableMyTurnStart", "enableOpponentTurnStart", "enableSpecialMiss",
        "missGuardOnDoubleOut"
      ];
      ids.forEach((id) => api.setChecked(root, id, !!s[id]));
      api.setValue(root, "missGuardThreshold", Number.isFinite(s.missGuardThreshold) ? s.missGuardThreshold : 40);
      const popupWrap = root.querySelector("#missGuardPopupWrap");
      if (popupWrap) popupWrap.classList.toggle("open", MISS_GUARD_POPUP_OPEN);
      const popupToggle = root.querySelector("#missGuardPopupToggle");
      if (popupToggle) {
        popupToggle.classList.toggle("active", MISS_GUARD_POPUP_OPEN);
        popupToggle.innerHTML = `<span class="ddArrow">${MISS_GUARD_POPUP_OPEN ? "▲" : "▼"}</span>`;
      }
      const triggerSelect = root.querySelector("#customEffectTrigger");
      if (triggerSelect) triggerSelect.innerHTML = renderCustomEffectTriggerOptions(s, triggerSelect.value || CUSTOM_EFFECT_TRIGGER_OPTIONS[0]?.value || "");
      const mount = root.querySelector("#customEffectsListMount");
      if (mount) mount.innerHTML = renderCustomEffectsList(s);
    }
  };
})(window);
