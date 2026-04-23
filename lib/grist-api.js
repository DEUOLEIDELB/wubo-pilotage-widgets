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

  function getApiKey() {
    let key = localStorage.getItem('wubo_grist_api_key');
    if (!key) {
      key = prompt('Colle ta cle API Grist (Profil > API Key sur grist.playwubo.com). Elle sera stockee sur cet appareil uniquement.');
      if (key) { key = key.trim(); localStorage.setItem('wubo_grist_api_key', key); }
    }
    return key;
  }

  function resetApiKey() {
    localStorage.removeItem('wubo_grist_api_key');
  }

  async function restFetch(path, options = {}) {
    const key = getApiKey();
    if (!key) throw new Error('Pas de cle API');
    // Grist self-hosted CORS ne whitelist pas Authorization : on utilise ?auth= param
    const sep = path.includes('?') ? '&' : '?';
    const url = `${GRIST_BASE_URL}/api/docs/${GRIST_DOC_ID}${path}${sep}auth=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (res.status === 401 || res.status === 403) {
      resetApiKey();
      throw new Error('Cle API invalide. Recharge la page pour la redonner.');
    }
    if (!res.ok) throw new Error(`Grist ${res.status} : ${await res.text()}`);
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

  window.WuboGrist = {
    inGristIframe, initGrist, fetchRows, updateRecord, addRecord,
    refListIds, gristDateToISO, todayISO, dateToISO, nowUnix, resetApiKey
  };
})();
