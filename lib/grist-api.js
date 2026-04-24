// Wubo Pilotage - couche Grist unifiee (IIFE)
// Fonctionne dans Grist (iframe plugin API) ou standalone (REST API + cle localStorage)
(function () {
  const GRIST_BASE_URL = 'https://grist.playwubo.com';
  const GRIST_DOC_ID = 'cmTvfM75iZzS8eRsPAJdpy';

  function inGristIframe() {
    try {
      return typeof grist !== 'undefined' && window.top !== window.self;
    } catch (_) { return true; }
  }

  function looksLikeApiKey(s) {
    // Grist API keys sont typiquement >= 32 chars alphanumeriques (souvent 64 hex)
    return /^[A-Za-z0-9_\-]{24,}$/.test(s);
  }

  function getApiKey() {
    let key = localStorage.getItem('wubo_grist_api_key');
    if (!key) {
      const msg = [
        'Colle ta cle API Grist ici.',
        '',
        'Ou la trouver :',
        '1. Va sur https://grist.playwubo.com',
        '2. Clique ton avatar (haut droite)',
        '3. Profile Settings > section API Key > Create',
        '4. COPIE LA LONGUE CHAINE (pas le User ID, pas le Doc ID)',
        '',
        'La cle est une longue chaine type : abc123def456...'
      ].join('\n');
      key = prompt(msg);
      if (key) {
        key = key.trim();
        if (!looksLikeApiKey(key)) {
          alert('Format invalide : une cle API fait au moins 24 caracteres alphanumeriques. Tu as peut-etre colle ton User ID ou Doc ID par erreur. Reessaie.');
          return null;
        }
        localStorage.setItem('wubo_grist_api_key', key);
      }
    }
    return key;
  }

  function resetApiKey() {
    localStorage.removeItem('wubo_grist_api_key');
  }

  async function restFetch(path, options = {}) {
    const key = getApiKey();
    if (!key) throw new Error('Pas de clé API (clique "Changer de clé API")');
    // Grist self-hosted n'accepte PAS ?auth= en query param, uniquement Authorization: Bearer.
    // Le fix CORS serveur (23/04/2026) autorise Authorization dans les preflights depuis deuoleidelb.github.io.
    const url = `${GRIST_BASE_URL}/api/docs/${GRIST_DOC_ID}${path}`;
    const method = options.method || 'GET';
    const headers = {
      'Authorization': `Bearer ${key}`,
      ...(options.headers || {})
    };
    if (method !== 'GET' && method !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
    }
    const fetchOpts = { ...options, method, headers };
    let res;
    try {
      res = await fetch(url, fetchOpts);
    } catch (e) {
      throw new Error(`Connexion Grist échouée (réseau ou CORS). Détails : ${e.message}`);
    }
    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => '');
      resetApiKey();
      throw new Error(`Clé API refusée par Grist (${res.status}). ${body}. Clique "Changer de clé API" et recolle-la.`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Grist ${res.status} ${res.statusText} : ${body}`);
    }
    return res.json();
  }

  // ============ Cache SWR (stale-while-revalidate) ============
  // Affichage instantané entre pages grâce à sessionStorage.
  // Background refresh automatique + event 'wubo-data-fresh' si changement.
  const CACHE_PREFIX = 'wubo_cache_';
  let cacheGeneration = 0;
  function cacheKeyOf(tableId) { return CACHE_PREFIX + tableId; }
  function cacheRead(tableId) {
    try {
      const raw = sessionStorage.getItem(cacheKeyOf(tableId));
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function cacheWrite(tableId, rows) {
    try { sessionStorage.setItem(cacheKeyOf(tableId), JSON.stringify(rows)); } catch (_) {}
  }
  function cacheInvalidate(tableId) {
    cacheGeneration++;
    try { sessionStorage.removeItem(cacheKeyOf(tableId)); } catch (_) {}
  }
  function cacheInvalidateAll() {
    cacheGeneration++;
    try {
      Object.keys(sessionStorage)
        .filter(k => k.startsWith(CACHE_PREFIX))
        .forEach(k => sessionStorage.removeItem(k));
    } catch (_) {}
  }

  async function _restFetchRows(tableId) {
    const data = await restFetch(`/tables/${tableId}/records`);
    return data.records.map(r => ({ id: r.id, ...r.fields }));
  }

  async function fetchRows(tableId, opts = {}) {
    const { force = false } = opts;
    if (inGristIframe()) {
      const table = await grist.docApi.fetchTable(tableId);
      return table.id.map((id, i) => {
        const row = { id };
        Object.keys(table).forEach(col => { row[col] = table[col][i]; });
        return row;
      });
    }
    // Hors iframe Grist : stratégie SWR
    if (!force) {
      const cached = cacheRead(tableId);
      if (cached) {
        // Lance un refresh en arrière-plan
        const genAtStart = cacheGeneration;
        (async () => {
          try {
            const fresh = await _restFetchRows(tableId);
            // Si une écriture a invalidé le cache entre temps, on ne l'écrase pas
            if (cacheGeneration !== genAtStart) return;
            cacheWrite(tableId, fresh);
            // Si data a changé → notifie le widget pour re-render
            if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
              window.dispatchEvent(new CustomEvent('wubo-data-fresh', {
                detail: { tableId, rows: fresh }
              }));
            }
          } catch (_) { /* silencieux : pas de rafraîchissement si offline/erreur */ }
        })();
        return cached;
      }
    }
    // Pas de cache (ou force=true) : network direct
    const rows = await _restFetchRows(tableId);
    cacheWrite(tableId, rows);
    return rows;
  }

  async function updateRecord(tableId, id, fields) {
    if (inGristIframe()) {
      await grist.docApi.applyUserActions([['UpdateRecord', tableId, id, fields]]);
      return;
    }
    await restFetch(`/tables/${tableId}/records`, {
      method: 'PATCH',
      body: JSON.stringify({ records: [{ id, fields }] })
    });
    cacheInvalidate(tableId);
  }

  async function addRecord(tableId, fields) {
    if (inGristIframe()) {
      const res = await grist.docApi.applyUserActions([['AddRecord', tableId, null, fields]]);
      const id = res && res.retValues && res.retValues[0];
      return { id };
    }
    const resp = await restFetch(`/tables/${tableId}/records`, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields }] })
    });
    const id = resp && resp.records && resp.records[0] && resp.records[0].id;
    cacheInvalidate(tableId);
    return { id };
  }

  async function initGrist() {
    if (inGristIframe()) {
      try { grist.ready({ requiredAccess: 'full' }); } catch (_) {}
    } else {
      getApiKey();
    }
  }

  function refListIds(val) {
    if (Array.isArray(val) && val[0] === 'L') return val.slice(1);
    return [];
  }

  function gristDateToISO(val) {
    if (!val) return null;
    if (typeof val === 'number') {
      const d = new Date(val * 1000);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
    if (typeof val === 'string') return val.split('T')[0];
    return null;
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function dateToISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function nowUnix() { return Math.floor(Date.now() / 1000); }

  function daysFromToday(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return Math.floor(d.getTime() / 1000);
  }

  // Archive une tâche (statut Archive + date_fait si non défini)
  async function archiveTask(taskId) {
    const fields = { statut: 'Archive' };
    fields.date_fait = Math.floor(Date.now() / 1000);
    await updateRecord('Taches', taskId, fields);
  }

  // Supprime définitivement une ligne (DELETE Grist). Utiliser avec confirmation côté UI.
  async function deleteRecord(tableId, id) {
    if (inGristIframe()) {
      await grist.docApi.applyUserActions([['RemoveRecord', tableId, id]]);
      return;
    }
    await restFetch(`/tables/${tableId}/records`, {
      method: 'DELETE',
      body: JSON.stringify({ records: [id] })
    });
    cacheInvalidate(tableId);
  }

  // Récupère la liste des projets formatée pour dropdown "Objectif > Projet"
  // Retourne [{id, label, objectifId, objectifTitre, projetTitre}] triés par objectif puis projet
  async function fetchProjetsDropdown() {
    const [projets, objectifs] = await Promise.all([
      fetchRows('Projets'),
      fetchRows('Objectifs')
    ]);
    const objById = {};
    objectifs.forEach(o => { objById[o.id] = o; });
    const items = projets
      .filter(p => p.statut !== 'Archive' && p.statut !== 'Abandonne')
      .map(p => {
        const obj = objById[p.objectif];
        const objTitre = obj ? obj.titre : 'Sans objectif';
        const projTitre = p.titre || 'Sans nom';
        return {
          id: p.id,
          label: `${objTitre} > ${projTitre}`,
          objectifId: p.objectif,
          objectifTitre: objTitre,
          projetTitre: projTitre
        };
      });
    items.sort((a, b) => {
      if (a.objectifTitre !== b.objectifTitre) return a.objectifTitre.localeCompare(b.objectifTitre);
      return a.projetTitre.localeCompare(b.projetTitre);
    });
    return items;
  }

  // Remplit un <select> avec les projets groupés par objectif
  async function populateProjetSelect(selectEl, selectedId) {
    const items = await fetchProjetsDropdown();
    while (selectEl.firstChild) selectEl.removeChild(selectEl.firstChild);
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = 'Aucun projet';
    selectEl.appendChild(emptyOpt);
    const groups = {};
    items.forEach(it => {
      if (!groups[it.objectifTitre]) groups[it.objectifTitre] = [];
      groups[it.objectifTitre].push(it);
    });
    Object.keys(groups).sort().forEach(objTitre => {
      const og = document.createElement('optgroup');
      og.label = objTitre;
      groups[objTitre].forEach(it => {
        const opt = document.createElement('option');
        opt.value = String(it.id);
        opt.textContent = it.projetTitre;
        if (selectedId && Number(selectedId) === it.id) opt.selected = true;
        og.appendChild(opt);
      });
      selectEl.appendChild(og);
    });
  }

  // Dump draft persist (cross-widget) - stocké dans localStorage
  const DUMP_DRAFT_KEY = 'wubo_dump_draft';
  function saveDumpDraft(content, contexte) {
    if (!content || !content.trim()) {
      localStorage.removeItem(DUMP_DRAFT_KEY);
      return;
    }
    localStorage.setItem(DUMP_DRAFT_KEY, JSON.stringify({
      content, contexte: contexte || 'Libre', ts: Date.now()
    }));
  }
  function loadDumpDraft() {
    try {
      const raw = localStorage.getItem(DUMP_DRAFT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) { return null; }
  }
  function clearDumpDraft() {
    localStorage.removeItem(DUMP_DRAFT_KEY);
  }

  // Binde un textarea + select contexte à la persistance du brouillon.
  // Restaure à l'appel, sauve à chaque input (debounced), écoute les changements cross-tab.
  // Retourne { reset(): void } pour effacer après envoi.
  function bindDumpTextarea(textareaEl, contexteEl) {
    if (!textareaEl) return { reset() {} };
    // Restauration
    const draft = loadDumpDraft();
    if (draft && draft.content) {
      textareaEl.value = draft.content;
      if (contexteEl && draft.contexte) {
        const opts = Array.from(contexteEl.options).map(o => o.value);
        if (opts.includes(draft.contexte)) contexteEl.value = draft.contexte;
      }
    }
    let timer = null;
    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const content = textareaEl.value;
        const ctx = contexteEl ? contexteEl.value : 'Libre';
        if (content.trim()) saveDumpDraft(content, ctx);
        else clearDumpDraft();
      }, 400);
    }
    textareaEl.addEventListener('input', schedule);
    if (contexteEl) contexteEl.addEventListener('change', schedule);
    // Sync cross-tab
    window.addEventListener('storage', (e) => {
      if (e.key !== DUMP_DRAFT_KEY) return;
      const d = loadDumpDraft();
      if (d && d.content !== textareaEl.value) {
        textareaEl.value = d.content || '';
        if (contexteEl && d.contexte) {
          const opts = Array.from(contexteEl.options).map(o => o.value);
          if (opts.includes(d.contexte)) contexteEl.value = d.contexte;
        }
      } else if (!d) {
        textareaEl.value = '';
      }
    });
    return {
      reset() {
        textareaEl.value = '';
        clearDumpDraft();
      }
    };
  }

  // Modal body-lock helpers (empêche scroll body quand modal ouvert sur mobile)
  let savedScrollY = 0;
  function lockBody() {
    savedScrollY = window.scrollY;
    document.body.classList.add('modal-open');
    document.body.style.top = `-${savedScrollY}px`;
  }
  function unlockBody() {
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    window.scrollTo(0, savedScrollY);
  }

  // Toast système - feedback visuel après action
  // kind: 'success' | 'info' | 'warn' | 'error'
  function toast(message, kind = 'success', durationMs = 2500) {
    let container = document.getElementById('wubo-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'wubo-toast-container';
      container.style.cssText = 'position:fixed;top:calc(10px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:500;display:flex;flex-direction:column;gap:6px;pointer-events:none;max-width:92vw;';
      document.body.appendChild(container);
    }
    const bg = { success: '#188038', info: '#5914D0', warn: '#E87722', error: '#D93025' }[kind] || '#188038';
    const toastEl = document.createElement('div');
    toastEl.style.cssText = `background:${bg};color:white;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:500;box-shadow:0 4px 14px rgba(0,0,0,0.18);animation:toastSlide 0.25s ease-out;pointer-events:auto;max-width:92vw;word-break:break-word;`;
    toastEl.textContent = message;
    if (!document.getElementById('wubo-toast-anim')) {
      const style = document.createElement('style');
      style.id = 'wubo-toast-anim';
      style.textContent = '@keyframes toastSlide{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}@keyframes toastOut{to{opacity:0;transform:translateY(-10px)}}';
      document.head.appendChild(style);
    }
    container.appendChild(toastEl);
    setTimeout(() => {
      toastEl.style.animation = 'toastOut 0.2s ease-in forwards';
      setTimeout(() => toastEl.remove(), 220);
    }, durationMs);
  }

  window.WuboGrist = {
    inGristIframe, initGrist, fetchRows, updateRecord, addRecord, deleteRecord,
    refListIds, gristDateToISO, todayISO, dateToISO, nowUnix, daysFromToday,
    resetApiKey, lockBody, unlockBody, archiveTask, toast,
    saveDumpDraft, loadDumpDraft, clearDumpDraft, bindDumpTextarea,
    fetchProjetsDropdown, populateProjetSelect,
    cacheInvalidate, cacheInvalidateAll
  };
})();
