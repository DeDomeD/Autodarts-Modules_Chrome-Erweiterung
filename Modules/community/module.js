(function initCommunityModule(scope) {
  scope.AD_SB_MODULES = scope.AD_SB_MODULES || {};

  let COMMUNITY_LIST_OPEN = true;

  function parseJsonArray(raw) {
    try {
      const list = JSON.parse(String(raw || "[]"));
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function getUploadQueue(settings) {
    return parseJsonArray(settings?.communityWebsiteUploadsJson)
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: String(item.id || ""),
        name: String(item.name || "Datei"),
        type: String(item.type || "application/octet-stream"),
        size: Number(item.size || 0),
        uploadedAt: String(item.uploadedAt || ""),
        content: String(item.content || "")
      }))
      .filter((item) => !!item.id);
  }

  function getPushQueue(settings) {
    return parseJsonArray(settings?.communityWebsitePushQueueJson)
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: String(item.id || ""),
        title: String(item.title || "").trim(),
        body: String(item.body || "").trim(),
        createdAt: String(item.createdAt || "")
      }))
      .filter((item) => !!item.id);
  }

  function formatBytes(bytes) {
    const size = Number(bytes || 0);
    if (!Number.isFinite(size) || size <= 0) return "0 B";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getProjects() {
    return Array.isArray(scope.AD_SB_COMMUNITY_PROJECTS) ? scope.AD_SB_COMMUNITY_PROJECTS : [];
  }

  function normalizeInstalledModules(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x) => String(x || "").trim().toLowerCase())
      .filter((x, idx, list) => !!x && list.indexOf(x) === idx);
  }

  function renderProjects(settings) {
    const installed = new Set(normalizeInstalledModules(settings?.installedModules));
    const knownModules = new Set(Object.keys(scope.AD_SB_MODULE_CONFIGS || {}));
    if (!getProjects().length) {
      return `<div class="hint">Aktuell sind keine Community-Projekte hinterlegt.</div>`;
    }
    const rows = getProjects().map((project) => {
      const moduleId = String(project?.moduleId || "").trim().toLowerCase();
      const isKnown = moduleId && knownModules.has(moduleId);
      const isInstalled = moduleId && installed.has(moduleId);
      return `
        <div class="listToggle" style="align-items:flex-start; gap:12px;">
          <div class="liText" style="min-width:0;">
            <button type="button" class="btn" data-community-link="${project.id}" style="padding:8px 12px; margin-bottom:8px;">
              ${project.name}
            </button>
            <div class="liSub">${project.description || ""}</div>
            <div class="hint" style="margin-top:6px;">Quelle: ${project.sourceName || "Community"}</div>
          </div>
          <button
            type="button"
            class="${isInstalled ? "btn" : "btnPrimary"}"
            data-community-add="${project.id}"
            ${(!isKnown || isInstalled) ? "disabled" : ""}
          >
            ${isInstalled ? "Installiert" : (isKnown ? "Hinzufügen" : "Bald")}
          </button>
        </div>
      `;
    }).join("");
    return rows;
  }

  function renderUploads(settings) {
    const uploads = getUploadQueue(settings);
    if (!uploads.length) {
      return `<div class="hint">Noch keine Dateien für die Website hochgeladen.</div>`;
    }
    return uploads.map((file) => `
      <div class="listToggle" style="align-items:flex-start; gap:12px;">
        <div class="liText">
          <div class="liTitle">${file.name}</div>
          <div class="liSub">${file.type} • ${formatBytes(file.size)}</div>
          <div class="hint" style="margin-top:6px;">Vorgemerkt am ${file.uploadedAt || "-"}</div>
        </div>
        <button type="button" class="btnMini" data-community-upload-remove="${file.id}">Entfernen</button>
      </div>
    `).join("");
  }

  function renderPushQueue(settings) {
    const queue = getPushQueue(settings);
    if (!queue.length) {
      return `<div class="hint">Noch keine Push-Benachrichtigung vorgemerkt.</div>`;
    }
    return queue.map((item) => `
      <div class="listToggle" style="align-items:flex-start; gap:12px;">
        <div class="liText">
          <div class="liTitle">${item.title || "Ohne Titel"}</div>
          <div class="liSub">${item.body || "-"}</div>
          <div class="hint" style="margin-top:6px;">Erstellt am ${item.createdAt || "-"}</div>
        </div>
        <button type="button" class="btnMini" data-community-push-remove="${item.id}">Entfernen</button>
      </div>
    `).join("");
  }

  function paint(root, settings) {
    const mount = root.querySelector("#communityProjectsMount");
    const toggle = root.querySelector("#communityProjectsToggle");
    if (!mount || !toggle) return;
    toggle.textContent = COMMUNITY_LIST_OPEN ? "Community-Projekte ausblenden" : "Community-Projekte anzeigen";
    mount.style.display = COMMUNITY_LIST_OPEN ? "" : "none";
    mount.innerHTML = renderProjects(settings);

    const uploadsMount = root.querySelector("#communityUploadsMount");
    if (uploadsMount) uploadsMount.innerHTML = renderUploads(settings);

    const pushMount = root.querySelector("#communityPushMount");
    if (pushMount) pushMount.innerHTML = renderPushQueue(settings);
  }

  scope.AD_SB_MODULES.community = {
    id: "community",
    icon: "C",
    navLabelKey: "nav_community",
    needs: { streamerbot: false, obs: false },
    render() {
      return `
        <h2 class="title"><span data-i18n="title_community">Community</span><span class="titleMeta">Modules</span></h2>
        <div class="card">
          <div class="formRow">
            <div class="sectionHead">
              <div class="sectionTitle" style="margin:0;">Community Website Setup</div>
              <button id="communityUploadBtn" class="btnPrimary" type="button">Dateien hochladen</button>
            </div>
            <div class="hint">Lädt Dateien in eine lokale Warteschlange, damit wir sie später an eure Website anbinden können.</div>
            <input id="communityFileInput" type="file" multiple style="display:none;" />
          </div>
          <div id="communityUploadsMount" class="list"></div>

          <div class="formRow" style="margin-top:14px;">
            <div class="sectionHead">
              <div class="sectionTitle" style="margin:0;">Push-Benachrichtigung</div>
              <button id="communityPushAddBtn" class="btnPrimary" type="button">Vormerken</button>
            </div>
            <div class="hint">Bereitet eine Push-Nachricht für die spätere Website-Anbindung des Addons vor.</div>
          </div>
          <div class="formRow">
            <label class="label" for="communityPushTitle">Titel</label>
            <input class="input" id="communityPushTitle" type="text" placeholder="Neues Update" />
          </div>
          <div class="formRow">
            <label class="label" for="communityPushBody">Nachricht</label>
            <textarea class="input" id="communityPushBody" rows="4" placeholder="Kurztext für die spätere Push-Benachrichtigung"></textarea>
          </div>
          <div id="communityPushMount" class="list"></div>

          <div class="formRow">
            <div class="sectionHead">
              <div class="sectionTitle" style="margin:0;">Community Hub</div>
              <button id="communityProjectsToggle" class="btnMini" type="button">Community-Projekte ausblenden</button>
            </div>
            <div class="hint">Hier kannst du Community-Projekte öffnen und bekannte Module direkt in dein Projekt einbinden.</div>
          </div>
          <div id="communityProjectsMount" class="list"></div>
        </div>
        <div class="spacer"></div>
      `;
    },
    bind(api) {
      const root = api.root;
      root.querySelector("#communityUploadBtn")?.addEventListener("click", () => {
        root.querySelector("#communityFileInput")?.click();
      });

      root.querySelector("#communityFileInput")?.addEventListener("change", async (ev) => {
        const files = Array.from(ev?.target?.files || []);
        if (!files.length) return;
        const settings = api.getSettings?.() || {};
        const current = getUploadQueue(settings);
        const next = [...current];
        for (const file of files) {
          const content = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(reader.error || new Error("Datei konnte nicht gelesen werden"));
            reader.readAsDataURL(file);
          }).catch(() => "");
          next.push({
            id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: String(file.name || "Datei"),
            type: String(file.type || "application/octet-stream"),
            size: Number(file.size || 0),
            uploadedAt: new Date().toLocaleString("de-DE"),
            content
          });
        }
        await api.savePartial({ communityWebsiteUploadsJson: JSON.stringify(next) });
        ev.target.value = "";
      });

      root.querySelector("#communityPushAddBtn")?.addEventListener("click", async () => {
        const title = String(root.querySelector("#communityPushTitle")?.value || "").trim();
        const body = String(root.querySelector("#communityPushBody")?.value || "").trim();
        if (!title && !body) return;
        const settings = api.getSettings?.() || {};
        const next = [...getPushQueue(settings), {
          id: `push-${Date.now()}`,
          title,
          body,
          createdAt: new Date().toLocaleString("de-DE")
        }];
        await api.savePartial({ communityWebsitePushQueueJson: JSON.stringify(next) });
        const titleEl = root.querySelector("#communityPushTitle");
        const bodyEl = root.querySelector("#communityPushBody");
        if (titleEl) titleEl.value = "";
        if (bodyEl) bodyEl.value = "";
      });

      root.querySelector("#communityProjectsToggle")?.addEventListener("click", () => {
        COMMUNITY_LIST_OPEN = !COMMUNITY_LIST_OPEN;
        paint(root, api.getSettings?.() || {});
      });

      root.addEventListener("click", async (ev) => {
        const target = ev.target;
        if (!target || !target.closest) return;
        const settings = api.getSettings?.() || {};

        const linkBtn = target.closest("[data-community-link]");
        if (linkBtn) {
          const id = String(linkBtn.dataset.communityLink || "").trim().toLowerCase();
          const project = getProjects().find((x) => String(x?.id || "").trim().toLowerCase() === id);
          const url = String(project?.sourceUrl || "").trim();
          if (!url) return;
          if (chrome?.tabs?.create) chrome.tabs.create({ url });
          else window.open(url, "_blank");
          return;
        }

        const addBtn = target.closest("[data-community-add]");
        if (addBtn) {
          const id = String(addBtn.dataset.communityAdd || "").trim().toLowerCase();
          const project = getProjects().find((x) => String(x?.id || "").trim().toLowerCase() === id);
          const moduleId = String(project?.moduleId || "").trim().toLowerCase();
          if (!moduleId) return;
          const installed = normalizeInstalledModules(settings?.installedModules);
          if (installed.includes(moduleId)) return;
          await api.savePartial({ installedModules: [...installed, moduleId] });
          return;
        }

        const removeUploadBtn = target.closest("[data-community-upload-remove]");
        if (removeUploadBtn) {
          const id = String(removeUploadBtn.dataset.communityUploadRemove || "").trim();
          if (!id) return;
          const settings = api.getSettings?.() || {};
          const next = getUploadQueue(settings).filter((item) => item.id !== id);
          await api.savePartial({ communityWebsiteUploadsJson: JSON.stringify(next) });
          return;
        }

        const removePushBtn = target.closest("[data-community-push-remove]");
        if (removePushBtn) {
          const id = String(removePushBtn.dataset.communityPushRemove || "").trim();
          if (!id) return;
          const settings = api.getSettings?.() || {};
          const next = getPushQueue(settings).filter((item) => item.id !== id);
          await api.savePartial({ communityWebsitePushQueueJson: JSON.stringify(next) });
        }
      });
    },
    sync(api, settings) {
      paint(api.root, settings || {});
    }
  };
})(window);
