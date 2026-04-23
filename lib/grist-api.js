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
    if (!key) throw new Error('Pas de cle API (clique "Changer de cle API")');
    // Grist self-hosted : CORS n'accepte pas Authorization, on utilise ?auth= URL param
    const sep = path.includes('?') ? '&' : '?';
    const url = `${GRIST_BASE_URL}/api/docs/${GRIST_DOC_ID}${path}${sep}auth=${encodeURIComponent(key)}`;
    const method = options.method || 'GET';
    const fetchOpts = { ...options, method };
    if (method !== 'GET' && method !== 'HEAD') {
      fetchOpts.headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    }
    let res;
    try {
      res = await fetch(url, fetchOpts);
    } catch (e) {
      // Typiquement : CORS block, reseau, DNS. Navigateur ne donne pas de details pour raisons de securite.
      throw new Error(`Connexion Grist echouee (reseau ou CORS). Details : ${e.message}`);
    }
    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => '');
      resetApiKey();
      throw new Error(`Cle API refusee par Grist (${res.status}). ${body}. Clique "Changer de cle API" et recolle-la.`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Grist ${res.status} ${res.statusText} : ${body}`);
    }
    return res.json();
  }

  async function fetchRows(tableId) {
    if (inGristIframe()) {
      const table = await grist.docApi.fetchTable(tableId);
      return table.id.map((id, i) => {
        const row = { id };
        Object.keys(table).forEach(col => { row[col] = table[col][i]; });
        return row;
      });
    }
    const data = await restFetch(`/tables/${tableId}/records`);
    return data.records.map(r => ({ id: r.id, ...r.fields }));
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
  }

  async function addRecord(tableId, fields) {
    if (inGristIframe()) {
      await grist.docApi.applyUserActions([['AddRecord', tableId, null, fields]]);
      return;
    }
    await restFetch(`/tables/${tableId}/records`, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields }] })
    });
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

  // Modal body-lock helpers (empeche scroll body quand modal ouvert sur mobile)
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

  window.WuboGrist = {
    inGristIframe, initGrist, fetchRows, updateRecord, addRecord,
    refListIds, gristDateToISO, todayISO, dateToISO, nowUnix, daysFromToday,
    resetApiKey, lockBody, unlockBody, archiveTask,
    saveDumpDraft, loadDumpDraft, clearDumpDraft
  };
})();
