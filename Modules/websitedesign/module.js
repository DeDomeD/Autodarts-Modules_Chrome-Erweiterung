(function initWebsiteDesignModule(scope) {
  scope.AD_SB_MODULES = scope.AD_SB_MODULES || {};
  let CUSTOM_DROPDOWN_OPEN = false;
  let COMMUNITY_GALLERY_OPEN = false;
  let COMMUNITY_GALLERY_FAVORITES_ONLY = false;
  let HUE_MODAL_OPEN = false;

  function getThemeSets() {
    const fallback = {
      horizontal: [{ id: "classic", label: "Classic" }],
      vertical: [{ id: "stack", label: "Stack" }]
    };
    const src = scope.AD_SB_WEBSITE_THEME_SETS || fallback;
    return {
      horizontal: Array.isArray(src.horizontal) && src.horizontal.length ? src.horizontal : fallback.horizontal,
      vertical: Array.isArray(src.vertical) && src.vertical.length ? src.vertical : fallback.vertical
    };
  }

  function parseCustomThemes(raw) {
    try {
      const arr = JSON.parse(String(raw || "[]"));
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((x) => x && typeof x === "object")
        .map((x) => ({
          id: String(x.id || "").toLowerCase(),
          label: String(x.label || x.name || "").trim() || "Custom",
          css: String(x.css || ""),
          builderData: (x.builderData && typeof x.builderData === "object") ? x.builderData : {},
          sourceName: String(x.sourceName || ""),
          sourceUrl: String(x.sourceUrl || "")
        }))
        .filter((x) => !!x.id);
    } catch {
      return [];
    }
  }

  function getAllThemesForLayout(layout, settings) {
    const base = getThemeSets()[layout] || [];
    const customRaw = layout === "vertical"
      ? settings?.websiteCustomThemesVertical
      : settings?.websiteCustomThemesHorizontal;
    const custom = parseCustomThemes(customRaw);
    const out = [...base, ...custom];
    const used = new Set();
    return out.filter((t) => {
      const id = String(t?.id || "").toLowerCase();
      if (!id || used.has(id)) return false;
      used.add(id);
      return true;
    });
  }

  function getCustomThemesForLayout(layout, settings) {
    const customRaw = layout === "vertical"
      ? settings?.websiteCustomThemesVertical
      : settings?.websiteCustomThemesHorizontal;
    return parseCustomThemes(customRaw);
  }

  function normalizeLayout(raw) {
    return String(raw || "").toLowerCase() === "vertical" ? "vertical" : "horizontal";
  }

  function normalizeTheme(layout, rawTheme, settings) {
    const themes = getAllThemesForLayout(layout, settings);
    let wanted = String(rawTheme || "").toLowerCase();
    if (wanted === "arena") wanted = "hue";
    if (themes.some((t) => t.id === wanted)) return wanted;
    return themes[0]?.id || "";
  }

  function themeSupportsColorPopup(layout, theme) {
    const normalizedLayout = normalizeLayout(layout);
    const normalizedTheme = String(theme || "").toLowerCase();
    return (normalizedLayout === "horizontal" && normalizedTheme === "hue")
      || (normalizedLayout === "vertical" && normalizedTheme === "vertical-scores");
  }

  function normalizeHue(raw, fallback) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(360, Math.round(n)));
  }

  function tr(settings, keyDe, keyEn) {
    return String(settings?.uiLanguage || "de").toLowerCase().startsWith("de") ? keyDe : keyEn;
  }

  function parseJsonIdList(raw) {
    try {
      const arr = JSON.parse(String(raw || "[]"));
      if (!Array.isArray(arr)) return [];
      return arr
        .map((x) => String(x || "").trim().toLowerCase())
        .filter((x, idx, list) => !!x && list.indexOf(x) === idx);
    } catch {
      return [];
    }
  }

  function getCommunityThemes() {
    const horizontal = (getThemeSets().horizontal || []).map((x) => ({ ...x, __layout: "horizontal" }));
    const vertical = (getThemeSets().vertical || []).map((x) => ({ ...x, __layout: "vertical" }));
    const list = [...horizontal, ...vertical];
    return list
      .filter((x) => x && typeof x === "object" && x.id)
      .filter((x) => !!x.libraryOnly)
      .map((x) => ({
        id: String(x.id || "").toLowerCase(),
        label: String(x.label || x.id || "").trim() || "Community Theme",
        layout: normalizeLayout(x.layout || x.__layout),
        sourceName: String(x.sourceName || "Community"),
        sourceUrl: String(x.sourceUrl || ""),
        author: String(x.author || ""),
        description: String(x.description || ""),
        tags: Array.isArray(x.tags) ? x.tags.map((t) => String(t || "").trim()).filter(Boolean) : [],
        preview: x.preview && typeof x.preview === "object" ? x.preview : {},
        css: String(x.css || "")
      }));
  }

  function getCommunityFavorites(settings) {
    return parseJsonIdList(settings?.websiteCommunityFavorites);
  }

  function isCommunityThemeActive(theme, settings) {
    if (!theme) return false;
    const layout = normalizeLayout(settings?.websiteLayout);
    const activeTheme = String(settings?.websiteTheme || "").toLowerCase();
    return layout === theme.layout && activeTheme === String(theme.id || "").toLowerCase();
  }

  function getCommunityThemeCards(settings) {
    const favorites = getCommunityFavorites(settings);
    const favoriteSet = new Set(favorites);
    let list = getCommunityThemes().sort((a, b) => {
      const aFav = favoriteSet.has(a.id) ? 1 : 0;
      const bFav = favoriteSet.has(b.id) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      return a.label.localeCompare(b.label);
    });
    if (COMMUNITY_GALLERY_FAVORITES_ONLY) {
      list = list.filter((x) => favoriteSet.has(x.id));
    }
    return list;
  }

  function getVisibleThemesForLayout(layout, settings) {
    const all = getThemeSets()[layout] || [];
    const favorites = new Set(getCommunityFavorites(settings));
    const standard = all.filter((theme) => !theme?.libraryOnly);
    const extra = all.filter((theme) => theme?.libraryOnly && favorites.has(String(theme.id || "").toLowerCase()));
    const out = [...standard, ...extra];
    const used = new Set();
    return out.filter((theme) => {
      const id = String(theme?.id || "").toLowerCase();
      if (!id || used.has(id)) return false;
      used.add(id);
      return true;
    });
  }

  function getThemeScreenshotSrc(theme) {
    const id = String(theme?.id || "").trim().toLowerCase();
    if (!id) return "";
    return `../Modules/websitedesign/assets/${id}.png`;
  }

  function bindCommunityPreviewImageFallbacks(root) {
    if (!root) return;
    root.querySelectorAll(".communityPreviewImage").forEach((img) => {
      if (img.dataset.errorBound === "1") return;
      img.dataset.errorBound = "1";
      img.addEventListener("error", () => {
        img.style.display = "none";
        const fallback = img.parentElement?.querySelector(".communityPreviewFallback");
        if (fallback) fallback.style.display = "block";
      });
    });
  }

  function renderFavoriteStrip(settings) {
    const themes = getCommunityThemes();
    const favoriteSet = new Set(getCommunityFavorites(settings));
    const favorites = themes.filter((theme) => favoriteSet.has(theme.id)).slice(0, 3);
    if (!favorites.length) {
      return `<div class="hint" style="margin-top:0;">${tr(settings, "Noch keine Favoriten markiert.", "No favorites marked yet.")}</div>`;
    }
    return favorites.map((theme) => {
      const preview = theme.preview || {};
      return `
        <button type="button" class="communityMiniCard${isCommunityThemeActive(theme, settings) ? " active" : ""}" data-community-apply="${theme.id}">
          <span class="communityMiniSwatch" style="--preview-bg:${preview.bg || "#14233a"}; --preview-accent:${preview.accent || "#19c7ff"};"></span>
          <span class="communityMiniText">${theme.label}</span>
        </button>
      `;
    }).join("");
  }

  function renderCommunityPreview(theme) {
    const preview = theme.preview || {};
    const previewKind = String(preview.kind || theme.id || "").toLowerCase();
    const tags = [
      `<span class="communityTag">Community</span>`,
      ...(theme.tags || []).slice(0, 2).map((tag) => `<span class="communityTag">${tag}</span>`)
    ].join("");
    return `
      <div class="communityThemeCard${isCommunityThemeActive(theme, SETTINGS_SNAPSHOT) ? " active" : ""}" data-community-card="${theme.id}" data-community-apply="${theme.id}">
        <button type="button" class="communityStarBtn" data-community-favorite="${theme.id}" title="${favoriteTitleFor(theme.id, SETTINGS_SNAPSHOT)}">${favoriteGlyphFor(theme.id, SETTINGS_SNAPSHOT)}</button>
        <div class="communityPreview preview-${previewKind}" style="--preview-bg:${preview.bg || "#16243a"}; --preview-panel:${preview.panel || "rgba(11,18,28,.78)"}; --preview-accent:${preview.accent || "#19c7ff"}; --preview-accent-soft:${preview.accentSoft || "rgba(25,199,255,.18)"}; --preview-glow:${preview.glow || "rgba(25,199,255,.22)"};">
          <img class="communityPreviewImage" src="${getThemeScreenshotSrc(theme)}" alt="" />
          <div class="communityPreviewLabelRow">
            <span class="communityPreviewLabel">${theme.label}</span>
            <span class="communityPreviewLayout">${theme.layout === "vertical" ? "Vertical" : "Horizontal"}</span>
          </div>
          <div class="communityPreviewFallback" style="display:none;">
          <div class="communityPreviewTop">
            <span class="communityDot"></span>
            <span class="communityLine short"></span>
            <span class="communityPill"></span>
          </div>
          <div class="communityPreviewBoard">
            <div class="communityPreviewPlayer active">
              <span class="communityAvatar"></span>
              <span class="communityLine"></span>
              <span class="communityScore"></span>
            </div>
            <div class="communityPreviewPlayer">
              <span class="communityAvatar"></span>
              <span class="communityLine"></span>
              <span class="communityScore dim"></span>
            </div>
          </div>
          <div class="communityPreviewBoard vertical">
            <div class="communityPreviewPlayer tall">
              <span class="communityAvatar portrait"></span>
              <span class="communityLine"></span>
              <span class="communityScore"></span>
            </div>
            <div class="communityPreviewPlayer tall active">
              <span class="communityAvatar portrait"></span>
              <span class="communityLine"></span>
              <span class="communityScore"></span>
            </div>
          </div>
          <div class="communityPreviewCounters">
            <span class="communityCounter">Sets</span>
            <span class="communityCounter accent">180</span>
            <span class="communityCounter">Legs</span>
          </div>
          <div class="communityPreviewBoardRing"></div>
          <div class="communityPreviewFooter">
            <span class="communityChip"></span>
            <span class="communityChip wide"></span>
            <span class="communityChip"></span>
          </div>
          </div>
        </div>
        <div class="communityThemeBody">
          <div class="communityThemeDesc">${theme.description}</div>
          <div class="communityThemeSource">Erstellt von: ${theme.author || theme.sourceName || "Community"}</div>
          <div class="communityTagRow">${tags}</div>
          <div class="communityThemeActions">
            <button type="button" class="btnPrimary" data-community-apply="${theme.id}">${isCommunityThemeActive(theme, SETTINGS_SNAPSHOT) ? tr(SETTINGS_SNAPSHOT, "Aktiv", "Active") : tr(SETTINGS_SNAPSHOT, "Anwenden", "Apply")}</button>
            <button type="button" class="btn" data-community-source="${theme.id}">${tr(SETTINGS_SNAPSHOT, "Quelle", "Source")}</button>
          </div>
        </div>
      </div>
    `;
  }

  let SETTINGS_SNAPSHOT = {};

  function favoriteGlyphFor(themeId, settings) {
    return getCommunityFavorites(settings).includes(String(themeId || "").toLowerCase()) ? "★" : "☆";
  }

  function favoriteTitleFor(themeId, settings) {
    const active = getCommunityFavorites(settings).includes(String(themeId || "").toLowerCase());
    return active
      ? tr(settings, "Favorit entfernen", "Remove favorite")
      : tr(settings, "Als Favorit markieren", "Add favorite");
  }

  function renderCommunityGallery(settings) {
    const cards = getCommunityThemeCards(settings);
    const countText = COMMUNITY_GALLERY_FAVORITES_ONLY
      ? tr(settings, "Nur Favoriten", "Favorites only")
      : tr(settings, "Alle Themes", "All themes");
    const body = cards.length
      ? cards.map((theme) => renderCommunityPreview(theme)).join("")
      : `<div class="communityEmpty">${tr(settings, "Keine Favoriten vorhanden.", "No favorites yet.")}</div>`;
    return `
      <div class="communityModalBackdrop${COMMUNITY_GALLERY_OPEN ? " open" : ""}" id="websiteCommunityThemeModal">
        <div class="communityModalDialog">
          <div class="communityModalHeader">
            <div>
              <div class="communityModalTitle">${tr(settings, "Themes", "Themes")}</div>
              <div class="communityModalSub">${countText}</div>
            </div>
            <div class="communityModalHeaderActions">
              <button type="button" class="btnMini${COMMUNITY_GALLERY_FAVORITES_ONLY ? " active" : ""}" data-community-filter="favorites">${tr(settings, "Nur Favoriten", "Favorites only")}</button>
              <button type="button" class="btnMini" data-community-close="1">X</button>
            </div>
          </div>
          <div class="communityModalGrid">${body}</div>
        </div>
      </div>
    `;
  }

  function renderThemeButtons(layout, activeTheme, settings) {
    const baseThemes = getThemeSets()[layout] || [];
    const customThemes = getCustomThemesForLayout(layout, settings);
    const customLabel = tr(settings, "Benutzerdefiniert", "Custom");
    const isCustomActive = customThemes.some((t) => t.id === activeTheme);
    const baseHtml = baseThemes
      .map((theme) => {
        const active = theme.id === activeTheme;
        return `
          <button type="button" class="choiceBtn${active ? " active" : ""}" data-theme="${theme.id}">
            ${theme.label || theme.id}
          </button>
        `;
      })
      .join("");
    if (!customThemes.length) return baseHtml;
    return `
      <button type="button" class="choiceBtn choiceBtnWide${isCustomActive ? " active" : ""}" data-theme="__custom__">
        ${customLabel} <span class="ddArrow">${CUSTOM_DROPDOWN_OPEN ? "▲" : "▼"}</span>
      </button>
      ${baseHtml}
    `;
  }

  function renderCustomThemeButtons(layout, activeTheme, settings) {
    const customThemes = getCustomThemesForLayout(layout, settings);
    if (!customThemes.length) return "";
    return customThemes
      .map((theme) => {
        const active = theme.id === activeTheme;
        return `
          <div class="customThemeRow${active ? " active" : ""}">
            <button type="button" class="choiceBtn customThemeSelect${active ? " active" : ""}" data-custom-theme="${theme.id}">
              ${theme.label}
            </button>
            <button type="button" class="customThemeDelete" data-custom-delete="${theme.id}" title="${tr(settings, "Theme löschen", "Delete theme")}">X</button>
          </div>
        `;
      })
      .join("");
  }

  function renderThemeButtons(layout, activeTheme, settings) {
    const visibleThemes = getVisibleThemesForLayout(layout, settings);
    return visibleThemes
      .map((theme) => {
        const id = String(theme?.id || "").toLowerCase();
        const active = id === activeTheme;
        const preview = theme?.preview || {};
        return `
          <button type="button" class="choiceBtn${active ? " active" : ""}" data-theme="${id}">
            ${theme.label || id}${theme?.libraryOnly ? ' <span class="ddArrow">★</span>' : ""}
          </button>
        `;
      })
      .join("");
  }

  function renderThemeButtons(layout, activeTheme, settings) {
    const visibleThemes = getVisibleThemesForLayout(layout, settings);
    return visibleThemes
      .map((theme) => {
        const id = String(theme?.id || "").toLowerCase();
        const active = id === activeTheme;
        return `
          <button type="button" class="choiceBtn${active ? " active" : ""}" data-theme="${id}">
            ${theme.label || id}
          </button>
        `;
      })
      .join("");
  }

  function paint(root, settings) {
    if (!root) return;
    SETTINGS_SNAPSHOT = settings || {};
    const layout = normalizeLayout(settings?.websiteLayout);
    const theme = normalizeTheme(layout, settings?.websiteTheme, settings);
    const primaryHue = normalizeHue(settings?.websiteArenaPrimaryHue, 210);
    const secondaryHue = normalizeHue(settings?.websiteArenaSecondaryHue, 155);

    root.querySelectorAll("[data-layout]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.layout === layout);
    });

    const themeWrap = root.querySelector("#websiteThemeButtons");
    if (themeWrap) {
      themeWrap.innerHTML = renderThemeButtons(layout, theme, settings);
    }
    if (!themeSupportsColorPopup(layout, theme)) HUE_MODAL_OPEN = false;
    const hueModal = root.querySelector("#websiteHueModalMount");
    if (hueModal) {
      const visible = themeSupportsColorPopup(layout, theme) && HUE_MODAL_OPEN;
      hueModal.style.display = visible ? "" : "none";
    }
    const hueTitle = root.querySelector("#websiteHueModalTitle");
    const hueMeta = root.querySelector("#websiteHueModalMeta");
    if (hueTitle) hueTitle.textContent = theme === "vertical-scores" ? "Vertikal Scores Farben" : "HUE Farben";
    if (hueMeta) hueMeta.textContent = theme === "vertical-scores"
      ? "Akzent und Glow für Vertikal Scores anpassen"
      : "Schnelle Farbanpassung für das HUE Theme";

    const primary = root.querySelector("#websiteArenaPrimaryHue");
    const secondary = root.querySelector("#websiteArenaSecondaryHue");
    const primaryVal = root.querySelector("#websiteArenaPrimaryHueValue");
    const secondaryVal = root.querySelector("#websiteArenaSecondaryHueValue");
    if (primary) primary.value = String(primaryHue);
    if (secondary) secondary.value = String(secondaryHue);
    if (primary) primary.style.setProperty("--hue", String(primaryHue));
    if (secondary) secondary.style.setProperty("--hue", String(secondaryHue));
    const galleryWrap = root.querySelector("#websiteCommunityGalleryMount");
    if (galleryWrap) galleryWrap.innerHTML = renderCommunityGallery(settings);
    bindCommunityPreviewImageFallbacks(root);
    if (primaryVal) primaryVal.textContent = `${primaryHue}°`;
    if (secondaryVal) secondaryVal.textContent = `${secondaryHue}°`;
  }

  async function applyCommunityTheme(api, settings, themeId) {
    const theme = getCommunityThemes().find((x) => x.id === String(themeId || "").toLowerCase());
    if (!theme) return;
    await api.savePartial({
      websiteDesignEnabled: true,
      websiteLayout: theme.layout,
      websiteTheme: theme.id
    });
  }

  scope.AD_SB_MODULES.websitedesign = {
    id: "websitedesign",
    icon: "D",
    navLabelKey: "nav_websitedesign",
    needs: { streamerbot: false, obs: false },
    render() {
      return `
        <h2 class="title"><span data-i18n="title_websitedesign">Website Design</span><span class="titleMeta">Autodarts Web</span></h2>
        <div class="card">
          <div class="list">
            <div class="listToggle">
              <div class="liText">
                <div class="liTitle">Theme aktiv</div>
                <div class="liSub">Aendert das Website-Theme direkt im Browser</div>
              </div>
              <label class="switch">
                <input id="websiteDesignEnabled" type="checkbox" />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="formRow">
            <label class="label">Layout</label>
            <div class="choiceRow">
              <button type="button" class="choiceBtn" data-layout="horizontal">Horizontal</button>
              <button type="button" class="choiceBtn" data-layout="vertical">Vertikal</button>
            </div>
          </div>
          <div class="formRow">
            <label class="label">Theme</label>
            <div id="websiteThemeButtons" class="choiceGrid"></div>
            <div class="hint">Themes werden nach Layout gefiltert und direkt gespeichert.</div>
          </div>

          <div class="formRow">
            <div class="sectionHead">
              <div class="sectionTitle" style="margin:0;">Themes</div>
              <button id="openCommunityThemeGallery" class="btnMini" type="button">Themes durchsuchen</button>
            </div>
            <div class="hint">Sammlung aus Stylebot- und Community-Themes mit Vorschau, Favoriten und direktem Uebernehmen.</div>
          </div>

          <div id="websiteHueModalMount" style="display:none">
            <div class="hueModalBackdrop" data-hue-backdrop="1">
              <div class="hueModalDialog">
                <div class="communityModalHeader">
                  <div>
                    <div id="websiteHueModalTitle" class="communityModalTitle">HUE Farben</div>
                    <div id="websiteHueModalMeta" class="communityModalMeta">Schnelle Farbanpassung für das HUE Theme</div>
                  </div>
                  <div class="communityModalHeaderActions">
                    <button class="btnMini" type="button" data-hue-close="1">Schließen</button>
                  </div>
                </div>
                <div class="hueModalBody">
                  <div class="list">
                    <div class="listToggle">
                      <div class="liText">
                        <div class="liTitle">Hauptfarbe (dunkel)</div>
                        <div class="liSub">Hue: <span id="websiteArenaPrimaryHueValue">210°</span></div>
                      </div>
                      <input id="websiteArenaPrimaryHue" class="hueSlider" type="range" min="0" max="360" step="1" />
                    </div>
                    <div class="listToggle">
                      <div class="liText">
                        <div class="liTitle">Sekundaerfarbe</div>
                        <div class="liSub">Hue: <span id="websiteArenaSecondaryHueValue">155°</span></div>
                      </div>
                      <input id="websiteArenaSecondaryHue" class="hueSlider" type="range" min="0" max="360" step="1" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="formRow">
            <button id="startThemeBuilderBtn" class="btnPrimary" type="button">Theme Builder (WIP) starten</button>
            <div class="hint">Work in Progress. Startet den Builder direkt auf der Website. Popup wird geschlossen.</div>
          </div>

          <div class="list" style="margin-top:14px;">
            <div class="listToggle">
              <div class="liText">
                <div class="liTitle">Scheiben-Glow anzeigen</div>
                <div class="liSub">Status-Glow hinter der Dartscheibe ein-/ausschalten</div>
              </div>
              <label class="switch">
                <input id="websiteDartboardGlowEnabled" type="checkbox" />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          <div class="formRow">
            <button id="resetWebsiteThemesBtn" class="btn" type="button">Alles zurücksetzen</button>
            <div class="hint">Schaltet das Website-Theme aus und setzt nur verschobene Theme-/Builder-Reste zurück.</div>
          </div>
          <div id="websiteCommunityGalleryMount"></div>
        </div>
        <div class="spacer"></div>
      `;
    },
    bind(api) {
      const root = api.root;
      api.bindAuto(root, "websiteDesignEnabled", "websiteDesignEnabled");
      api.bindAuto(root, "websiteDartboardGlowEnabled", "websiteDartboardGlowEnabled");
      api.bindAuto(root, "websiteArenaPrimaryHue", "websiteArenaPrimaryHue", "number");
      api.bindAuto(root, "websiteArenaSecondaryHue", "websiteArenaSecondaryHue", "number");

      root.querySelector("#websiteArenaPrimaryHue")?.addEventListener("input", (ev) => {
        const v = normalizeHue(ev.target?.value, 210);
        const out = root.querySelector("#websiteArenaPrimaryHueValue");
        ev.target?.style?.setProperty?.("--hue", String(v));
        if (out) out.textContent = `${v}°`;
      });
      root.querySelector("#websiteArenaSecondaryHue")?.addEventListener("input", (ev) => {
        const v = normalizeHue(ev.target?.value, 155);
        const out = root.querySelector("#websiteArenaSecondaryHueValue");
        ev.target?.style?.setProperty?.("--hue", String(v));
        if (out) out.textContent = `${v}°`;
      });

      root.querySelector("#startThemeBuilderBtn")?.addEventListener("click", async () => {
        const settings = api.getSettings?.() || {};
        if (!settings.websiteDesignEnabled) {
          await api.savePartial({ websiteDesignEnabled: true });
        }
        try {
          if (chrome?.tabs?.query && chrome?.tabs?.sendMessage) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              const tabId = tabs?.[0]?.id;
              if (!Number.isInteger(tabId)) {
                try { window.close(); } catch {}
                return;
              }
              chrome.tabs.sendMessage(tabId, { type: "AD_SB_START_THEME_BUILDER" }, () => {
                void chrome.runtime?.lastError;
                try { window.close(); } catch {}
              });
            });
            return;
          }
        } catch {}
        try { window.close(); } catch {}
      });

      root.querySelector("#openCommunityThemeGallery")?.addEventListener("click", () => {
        COMMUNITY_GALLERY_OPEN = true;
        paint(root, api.getSettings?.() || {});
      });
      root.querySelector("#resetWebsiteThemesBtn")?.addEventListener("click", async () => {
        COMMUNITY_GALLERY_OPEN = false;
        COMMUNITY_GALLERY_FAVORITES_ONLY = false;
        HUE_MODAL_OPEN = false;
        await api.savePartial({
          websiteDesignEnabled: false,
          websiteThemeBuilderEnabled: false,
          websiteThemeBuilderData: "{}"
        });
      });

      root.addEventListener("click", async (ev) => {
        const target = ev.target;
        if (!target || !target.closest) return;
        const settings = api.getSettings?.() || {};

        const closeGalleryBtn = target.closest("[data-community-close]");
        if (closeGalleryBtn) {
          COMMUNITY_GALLERY_OPEN = false;
          paint(root, settings);
          return;
        }

        const galleryBackdrop = target.closest(".communityModalBackdrop");
        if (galleryBackdrop && target === galleryBackdrop) {
          COMMUNITY_GALLERY_OPEN = false;
          paint(root, settings);
          return;
        }

        const closeHueBtn = target.closest("[data-hue-close]");
        if (closeHueBtn) {
          HUE_MODAL_OPEN = false;
          paint(root, settings);
          return;
        }

        const hueBackdrop = target.closest(".hueModalBackdrop");
        if (hueBackdrop && target === hueBackdrop) {
          HUE_MODAL_OPEN = false;
          paint(root, settings);
          return;
        }

        const filterBtn = target.closest("[data-community-filter]");
        if (filterBtn) {
          COMMUNITY_GALLERY_FAVORITES_ONLY = !COMMUNITY_GALLERY_FAVORITES_ONLY;
          paint(root, settings);
          return;
        }

        const favoriteBtn = target.closest("[data-community-favorite]");
        if (favoriteBtn) {
          const id = String(favoriteBtn.dataset.communityFavorite || "").toLowerCase();
          if (!id) return;
          const current = getCommunityFavorites(settings);
          const next = current.includes(id)
            ? current.filter((x) => x !== id)
            : [id, ...current];
          await api.savePartial({ websiteCommunityFavorites: JSON.stringify(next) });
          return;
        }

        const sourceBtn = target.closest("[data-community-source]");
        if (sourceBtn) {
          const id = String(sourceBtn.dataset.communitySource || "").toLowerCase();
          const theme = getCommunityThemes().find((x) => x.id === id);
          const url = String(theme?.sourceUrl || "").trim();
          if (!url) return;
          if (chrome?.tabs?.create) chrome.tabs.create({ url });
          else window.open(url, "_blank");
          return;
        }

        const applyCommunityBtn = target.closest("[data-community-apply]");
        if (applyCommunityBtn) {
          const id = String(applyCommunityBtn.dataset.communityApply || "").toLowerCase();
          if (!id) return;
          await applyCommunityTheme(api, settings, id);
          return;
        }

        const layoutBtn = target.closest("[data-layout]");
        if (layoutBtn) {
          const layout = normalizeLayout(layoutBtn.dataset.layout);
          const nextTheme = normalizeTheme(layout, settings?.websiteTheme, settings);
          HUE_MODAL_OPEN = themeSupportsColorPopup(layout, nextTheme);
          await api.savePartial({ websiteLayout: layout, websiteTheme: nextTheme });
          return;
        }

        const themeBtn = target.closest("[data-theme]");
        if (themeBtn) {
          const layout = normalizeLayout(settings?.websiteLayout);
          const wanted = String(themeBtn.dataset.theme || "");
          const nextTheme = normalizeTheme(layout, wanted, settings);
          HUE_MODAL_OPEN = themeSupportsColorPopup(layout, nextTheme);
          await api.savePartial({ websiteLayout: layout, websiteTheme: nextTheme });
          return;
        }
      });
    },
    sync(api, settings) {
      const root = api.root;
      const s = settings || {};
      api.setChecked(root, "websiteDesignEnabled", !!s.websiteDesignEnabled);
      api.setChecked(root, "websiteDartboardGlowEnabled", s.websiteDartboardGlowEnabled !== false);
      paint(root, s);
    }
  };
})(window);
