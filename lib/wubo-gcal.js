// Wubo Pilotage : sync Google Calendar (lecture seule en P1, push en P2).
// Multi-user : token OAuth scope par profil Pilotage (Taki / Numa / Lyes).
// Sync silencieuse par fenetre visible (Aujourd'hui = today, Semaine = window).
// API : window.WuboGCal = { connect, disconnect, isConnected, getEmail,
//                           syncWindow, dropEventLink, pushTask (P2) }
(function () {
  const CLIENT_ID = '115577851003-0c523jjh9h917g9uiqug9boig48ab3ag.apps.googleusercontent.com';
  // Scopes :
  // - calendar.events : lecture + ecriture des events (pour pull + push P2)
  // - calendar.calendarlist.readonly : lister les calendriers du user (multi-cal)
  // Si tu modifies le scope, force la deconnexion des users existants pour qu'ils
  // re-acceptent les nouveaux scopes au prochain Connect.
  const SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
  const GIS_SRC = 'https://accounts.google.com/gsi/client';

  // ============ Lazy-load Google Identity Services ============
  let _gisLoading = null;
  function loadGIS() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      return Promise.resolve();
    }
    if (_gisLoading) return _gisLoading;
    _gisLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Impossible de charger Google Identity Services'));
      document.head.appendChild(script);
    });
    return _gisLoading;
  }

  // ============ Storage du token (scope par profil) ============
  function tokenKey(user) {
    return `wubo_gcal_token_${(user || 'taki').toLowerCase()}`;
  }

  function getStoredToken(user) {
    try {
      const raw = localStorage.getItem(tokenKey(user));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      // Marge de 60s pour eviter les requetes avec un token sur le point d'expirer
      if (obj.expires_at && Date.now() > obj.expires_at) {
        localStorage.removeItem(tokenKey(user));
        return null;
      }
      return obj;
    } catch (_) {
      return null;
    }
  }

  function setStoredToken(user, tokenObj) {
    const expires_at = Date.now() + ((tokenObj.expires_in || 3600) - 60) * 1000;
    localStorage.setItem(tokenKey(user), JSON.stringify({
      access_token: tokenObj.access_token,
      expires_at,
      email: tokenObj.email || ''
    }));
  }

  function clearStoredToken(user) {
    localStorage.removeItem(tokenKey(user));
  }

  function isConnected(user) {
    return !!getStoredToken(user);
  }

  function getEmail(user) {
    const t = getStoredToken(user);
    return t ? t.email : '';
  }

  // ============ OAuth flow (GIS token client, popup) ============
  async function connect(user) {
    if (!user) throw new Error('User requis');
    await loadGIS();
    return new Promise((resolve, reject) => {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          callback: async (response) => {
            if (response.error) {
              reject(new Error('OAuth refusé : ' + response.error));
              return;
            }
            // Recupere l'email du compte authentifie pour affichage UI
            let email = '';
            try {
              const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: 'Bearer ' + response.access_token }
              });
              if (r.ok) {
                const info = await r.json();
                email = info.email || '';
              }
            } catch (_) {}
            setStoredToken(user, {
              access_token: response.access_token,
              expires_in: response.expires_in,
              email
            });
            resolve({ email });
          },
          error_callback: (err) => {
            reject(new Error('OAuth abandonné : ' + (err && err.type || 'unknown')));
          }
        });
        client.requestAccessToken({ prompt: 'consent' });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function disconnect(user) {
    const tok = getStoredToken(user);
    if (tok && tok.access_token) {
      // Best-effort : revoke cote Google
      try {
        await loadGIS();
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
          window.google.accounts.oauth2.revoke(tok.access_token, () => {});
        }
      } catch (_) {}
    }
    clearStoredToken(user);
  }

  // ============ Liste les calendriers du user ============
  // GET /users/me/calendarList. Renvoie array. Filtre les calendriers caches.
  async function fetchCalendarList(user) {
    const token = getStoredToken(user);
    if (!token) return null;
    const url = 'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader';
    const r = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token.access_token }
    });
    if (r.status === 401) {
      clearStoredToken(user);
      throw new Error('TOKEN_EXPIRED');
    }
    // 403 sur calendarList : scope OAuth insuffisant. Le scope a evolue (ajout
    // calendarlist.readonly), le token actuel n'a pas accepte ce nouveau scope.
    // On traite comme expire : force le user a re-consentir (qui inclut le nouveau scope).
    if (r.status === 403) {
      clearStoredToken(user);
      throw new Error('TOKEN_EXPIRED');
    }
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`gCal calendarList ${r.status} : ${body.slice(0, 200)}`);
    }
    const data = await r.json();
    return data.items || [];
  }

  // ============ Fetch events d'un calendrier dans la fenetre ============
  async function fetchEventsOfCalendar(user, calendarId, timeMin, timeMax) {
    const token = getStoredToken(user);
    if (!token) return null;
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250'
    });
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    const r = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token.access_token }
    });
    if (r.status === 401) {
      clearStoredToken(user);
      throw new Error('TOKEN_EXPIRED');
    }
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`gCal events ${r.status} : ${body.slice(0, 200)}`);
    }
    const data = await r.json();
    return data.items || [];
  }

  // ============ Fetch events de TOUS les calendriers visibles, dans la fenetre ============
  // Pour chaque event, on stocke son calendarId source dans _calendarId (utile au push P2).
  // Filtre les calendriers explicitement caches (hidden=true) ou avec deleted.
  async function fetchEvents(user, timeMin, timeMax) {
    const token = getStoredToken(user);
    if (!token) return null;
    const cals = await fetchCalendarList(user);
    if (!cals) return null;
    const visibleCals = cals.filter(c => !c.hidden && !c.deleted);
    const allEvents = [];
    for (const cal of visibleCals) {
      try {
        const items = await fetchEventsOfCalendar(user, cal.id, timeMin, timeMax);
        if (Array.isArray(items)) {
          items.forEach(e => {
            e._calendarId = cal.id;
            e._calendarName = cal.summary || cal.id;
          });
          allEvents.push(...items);
        }
      } catch (e) {
        // Re-throw TOKEN_EXPIRED, swallow autres (un calendrier en erreur ne doit pas bloquer les autres)
        if (e && e.message === 'TOKEN_EXPIRED') throw e;
        console.warn(`[gCal] erreur fetch calendrier ${cal.id}:`, e.message);
      }
    }
    return allEvents;
  }

  // ============ Conversion gCal event → fields Taches ============
  // Modele : on remplit le minimum (titre + horaires + note + gcal_event_id).
  // Scoring (cash/urgency/strat) = 0 pour ne pas polluer les priorites Pilotage.
  // statut = 'Pas commence' (defaut, mais NE pas ecraser au sync update).
  function eventToTaskFields(event, user) {
    const title = event.summary || '(sans titre)';
    const description = event.description || '';
    // Start/end peut etre 'date' (all-day) ou 'dateTime' (time-aware).
    let dateUnix = null, heureDebut = '', dureeMin = null;
    if (event.start && event.start.dateTime) {
      const start = new Date(event.start.dateTime);
      const end = event.end && event.end.dateTime ? new Date(event.end.dateTime) : null;
      // Date UTC midnight de la date locale (cohérent avec le reste de l'app)
      dateUnix = Math.floor(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) / 1000);
      heureDebut = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
      if (end) {
        dureeMin = Math.round((end.getTime() - start.getTime()) / 60000);
      }
    } else if (event.start && event.start.date) {
      // All-day : pas d'heure, pas de duree
      const [y, m, d] = event.start.date.split('-').map(Number);
      dateUnix = Math.floor(Date.UTC(y, m - 1, d) / 1000);
      heureDebut = '';
      dureeMin = null;
    }
    return {
      titre: title,
      note: description,
      heure_debut: heureDebut,
      duree_minutes: dureeMin,
      date_cible: dateUnix,
      proprietaire: user,
      gcal_event_id: event.id
    };
  }

  // ============ Sync de la fenetre [startISO, endISO) pour le user ============
  // - Pull events gCal du primary calendar
  // - Pour chaque event : si tache existe avec gcal_event_id → update champs minimum,
  //   sinon → cree tache minimale (scoring=0, statut Pas commence)
  // - Pour les taches Pilotage avec gcal_event_id mais event disparu : statut = Archive
  // Renvoie { added, updated, archived, errors }. Silencieux : pas de toast cote caller
  // (caller decide).
  async function syncWindow(user, startISO, endISO) {
    const result = { added: 0, updated: 0, archived: 0, errors: [], notConnected: false, tokenExpired: false };
    if (!isConnected(user)) {
      result.notConnected = true;
      return result;
    }
    let events;
    try {
      events = await fetchEvents(user, startISO, endISO);
    } catch (e) {
      if (e.message === 'TOKEN_EXPIRED') {
        result.tokenExpired = true;
        return result;
      }
      result.errors.push(e.message);
      return result;
    }
    if (!events) {
      result.notConnected = true;
      return result;
    }
    // Index par event id (skip events sans id)
    const byEventId = new Map();
    events.forEach(e => { if (e.id && e.status !== 'cancelled') byEventId.set(e.id, e); });

    // Charge les taches existantes du user (force: true pour ne pas rater une row
    // creee par une sync precedente trop recente — sinon on dupliquerait).
    let allTasks;
    try {
      allTasks = await window.WuboGrist.fetchRows('Taches', { force: true });
    } catch (e) {
      result.errors.push('Lecture Taches: ' + e.message);
      return result;
    }
    const startUnix = Math.floor(new Date(startISO).getTime() / 1000);
    const endUnix = Math.floor(new Date(endISO).getTime() / 1000);
    const tasksByEventId = new Map();
    allTasks.forEach(t => {
      if (!t.gcal_event_id) return;
      if (t.proprietaire !== user) return;
      tasksByEventId.set(t.gcal_event_id, t);
    });

    // Pass 1 : create / update
    for (const [eid, ev] of byEventId.entries()) {
      const fields = eventToTaskFields(ev, user);
      const existing = tasksByEventId.get(eid);
      if (existing) {
        // Update : seulement les champs source-of-truth-gcal (titre/horaires/note).
        // Ne pas toucher au statut (Pilotage), ni au scoring, ni au projet (peut avoir
        // ete enrichi par l'utilisateur).
        const patch = {
          titre: fields.titre,
          note: fields.note,
          heure_debut: fields.heure_debut,
          duree_minutes: fields.duree_minutes,
          date_cible: fields.date_cible
        };
        // Si statut Archive precedent (event re-cree apres avoir ete supprime), on remet en Pas commence
        if (existing.statut === 'Archive') patch.statut = 'Pas commence';
        try {
          await window.WuboGrist.updateRecord('Taches', existing.id, patch);
          result.updated++;
        } catch (e) {
          result.errors.push(`Update ${eid}: ${e.message}`);
        }
      } else {
        // Create : tache minimale, scoring 0
        const createFields = {
          ...fields,
          statut: 'Pas commence',
          cash_impact: 0,
          urgency: 0,
          strategic_value: 0,
          push_count: 0,
          date_creation: Math.floor(Date.now() / 1000),
          collaborateurs: ['L', user]
        };
        try {
          await window.WuboGrist.addRecord('Taches', createFields);
          result.added++;
        } catch (e) {
          result.errors.push(`Create ${eid}: ${e.message}`);
        }
      }
    }

    // Pass 2 : detect events disparus dans la fenetre. On itere sur les taches Pilotage
    // ayant un gcal_event_id, dont la date_cible est dans la fenetre, et qui ne sont
    // PAS dans byEventId (event supprime cote gCal). On archive.
    for (const [eid, t] of tasksByEventId.entries()) {
      if (byEventId.has(eid)) continue; // toujours present
      const tDateUnix = t.date_cible || 0;
      // On n'archive que si la tache tombe dans la fenetre fetchee (sinon on n'a pas
      // visibilite dessus, pas de raison d'agir).
      if (tDateUnix < startUnix || tDateUnix >= endUnix) continue;
      if (t.statut === 'Archive') continue;
      try {
        await window.WuboGrist.updateRecord('Taches', t.id, { statut: 'Archive' });
        result.archived++;
      } catch (e) {
        result.errors.push(`Archive ${eid}: ${e.message}`);
      }
    }
    if (result.added + result.updated + result.archived > 0) {
      window.WuboGrist.cacheInvalidate('Taches');
    }
    return result;
  }

  // ============ Detache une tache de gCal (cote Pilotage uniquement) ============
  // L'event reste dans gCal. La tache devient autonome cote Pilotage. Plus de sync.
  async function dropEventLink(taskId) {
    if (!taskId) return;
    try {
      await window.WuboGrist.updateRecord('Taches', taskId, { gcal_event_id: '' });
    } catch (e) {
      window.WuboGrist.toast('Erreur : ' + e.message, 'error');
    }
  }

  // ============ Helpers timezone / formatage local ============
  // TimeZone par defaut : Europe/Paris (l'app est utilisee en France).
  // Si Intl resout une autre TZ cote browser, on l'utilise (cas voyage / agent etranger).
  function defaultTimeZone() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return tz || 'Europe/Paris';
    } catch (_) {
      return 'Europe/Paris';
    }
  }

  // Formatte un Date local en chaine ISO 'YYYY-MM-DDTHH:MM:SS' SANS suffixe Z.
  // L'API gCal accepte ce format si timeZone est specifie cote body.
  function toLocalISOString(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
           `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // Formatte 'YYYY-MM-DD' depuis une date Unix UTC midnight (date_cible Pilotage).
  // date_cible est le timestamp UTC du midnight LOCAL : on l'extrait en UTC pour
  // recuperer YYYY-MM-DD coherent avec ce que l'utilisateur a saisi dans la modal.
  function unixUTCToYMD(unixSec) {
    const d = new Date(unixSec * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  // ============ Convertit une row Taches en body Google Calendar event ============
  // Cas geres :
  // - heure_debut + duree_minutes : event time-aware (start/end dateTime)
  // - heure_debut sans duree : duree par defaut 60 min
  // - sans heure_debut : event all-day (start.date + end.date = jour suivant, convention iCal)
  function taskToEventBody(task) {
    if (!task || !task.date_cible) {
      throw new Error('Date manquante');
    }
    const summary = (task.titre || '').toString().trim() || '(sans titre)';
    const description = (task.note || '').toString();
    const tz = defaultTimeZone();
    const ymd = unixUTCToYMD(task.date_cible);

    // All-day si pas d'heure
    if (!task.heure_debut) {
      const [y, m, d] = ymd.split('-').map(Number);
      // Jour suivant pour end (convention iCal : end.date est exclusif)
      const nextDay = new Date(Date.UTC(y, m - 1, d));
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const pad = (n) => String(n).padStart(2, '0');
      const endYmd = `${nextDay.getUTCFullYear()}-${pad(nextDay.getUTCMonth() + 1)}-${pad(nextDay.getUTCDate())}`;
      return {
        summary,
        description,
        start: { date: ymd },
        end: { date: endYmd }
      };
    }

    // Time-aware : on construit la date locale "ymd HH:MM" puis on calcule fin avec duree
    const [y, m, d] = ymd.split('-').map(Number);
    const [hh, mm] = task.heure_debut.split(':').map(Number);
    const startLocal = new Date(y, m - 1, d, hh, mm, 0, 0);
    const dureeMin = (task.duree_minutes != null && task.duree_minutes !== '')
      ? Number(task.duree_minutes) : 60;
    const endLocal = new Date(startLocal.getTime() + dureeMin * 60000);
    return {
      summary,
      description,
      start: { dateTime: toLocalISOString(startLocal), timeZone: tz },
      end: { dateTime: toLocalISOString(endLocal), timeZone: tz }
    };
  }

  // ============ Push d'une tache Pilotage vers Google Calendar ============
  // - Si task.gcal_event_id deja set : PATCH (update event existant).
  // - Sinon : POST (create), recupere event_id, met a jour la tache Grist.
  // - Verifie ownership : seul le proprietaire peut pousser dans son propre calendrier.
  // - 401 : clearStoredToken + throw 'TOKEN_EXPIRED' (le caller affichera "reconnecter").
  // Retour : { eventId, htmlLink } pour ouvrir l'event dans gCal cote caller.
  async function pushTask(user, task, calendarId = 'primary') {
    if (!user) throw new Error('User requis');
    if (!task) throw new Error('Tache requise');
    if (task.proprietaire && task.proprietaire !== user) {
      throw new Error('Non-proprietaire');
    }
    if (!task.date_cible) throw new Error('Date manquante');
    const token = getStoredToken(user);
    if (!token) throw new Error('Non connecte');

    const body = taskToEventBody(task);
    const isUpdate = !!task.gcal_event_id;
    const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const url = isUpdate
      ? `${baseUrl}/${encodeURIComponent(task.gcal_event_id)}`
      : baseUrl;
    const method = isUpdate ? 'PATCH' : 'POST';

    const r = await fetch(url, {
      method,
      headers: {
        Authorization: 'Bearer ' + token.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (r.status === 401) {
      clearStoredToken(user);
      throw new Error('TOKEN_EXPIRED');
    }
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`gCal push ${r.status} : ${txt.slice(0, 200)}`);
    }
    const data = await r.json();
    const eventId = data.id;
    const htmlLink = data.htmlLink || '';

    // Si create, on stocke le gcal_event_id cote Grist
    if (!isUpdate && eventId && task.id) {
      try {
        await window.WuboGrist.updateRecord('Taches', task.id, { gcal_event_id: eventId });
        if (window.WuboGrist.cacheInvalidate) {
          window.WuboGrist.cacheInvalidate('Taches');
        }
      } catch (e) {
        // L'event est cree cote gCal mais pas lie cote Grist : signaler proprement.
        throw new Error('Event cree dans gCal mais lien Grist echoue : ' + e.message);
      }
    }
    return { eventId, htmlLink };
  }

  // ============ Supprime un event gCal pousse depuis Pilotage ============
  // Optionnel pour P2 mais utile : permet de delier ET supprimer cote gCal en meme
  // temps. Le caller est responsable d'effacer task.gcal_event_id cote Grist (ou
  // d'appeler dropEventLink) apres un delete reussi.
  async function deletePushedEvent(user, eventId, calendarId = 'primary') {
    if (!user) throw new Error('User requis');
    if (!eventId) throw new Error('eventId requis');
    const token = getStoredToken(user);
    if (!token) throw new Error('Non connecte');
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    const r = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token.access_token }
    });
    if (r.status === 401) {
      clearStoredToken(user);
      throw new Error('TOKEN_EXPIRED');
    }
    // 410 Gone = event deja supprime cote gCal, on traite comme succes idempotent
    if (r.status === 410) return { ok: true, alreadyGone: true };
    if (!r.ok && r.status !== 204) {
      const txt = await r.text().catch(() => '');
      throw new Error(`gCal delete ${r.status} : ${txt.slice(0, 200)}`);
    }
    return { ok: true };
  }

  window.WuboGCal = {
    connect, disconnect, isConnected, getEmail,
    syncWindow, dropEventLink,
    fetchCalendarList,
    pushTask, deletePushedEvent,
    CLIENT_ID
  };
})();
