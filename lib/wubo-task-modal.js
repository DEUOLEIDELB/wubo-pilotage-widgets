// Modal de création / édition de tâche, partagé entre Jour, Semaine, Objectifs, Échéances.
// UNE SEULE source : mêmes champs, même comportement partout.
// Usage :
//   const r = await WuboTaskModal.open({ mode: 'new', defaultDate?, parentTaskId?, projetId? });
//   const r = await WuboTaskModal.open({ mode: 'edit', task });
// defaultDate (Unix sec UTC midnight) : pre-remplit la date en mode 'new'.
// Sans defaultDate, mode 'new' utilise aujourd'hui.
// Retourne : { action: 'saved'|'deleted'|'archived'|'cancelled', taskId }
(function () {
  const { $el, $clear } = Dom;

  function unixToInputDate(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }
  function inputDateToUnix(s) {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    return Math.floor(Date.UTC(y, m-1, d) / 1000);
  }
  function daysFromToday(n) {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + n);
    return Math.floor(d.getTime() / 1000);
  }

  function field(labelText, inputEl) {
    return $el('div', { class: 'field' },
      $el('label', {}, labelText),
      inputEl
    );
  }

  function statutClass(s) {
    if (!s) return 'todo';
    const k = s.toLowerCase();
    if (k.includes('archive')) return 'archived';
    if (k.includes('fait')) return 'done';
    if (k.includes('en cours')) return 'wip';
    if (k.includes('bloque') || k.includes('bloqu')) return 'blocked';
    if (k.includes('abandon')) return 'abandoned';
    return 'todo';
  }

  // Helper : récupère toutes les sous-tâches d'un parent depuis Grist
  async function fetchSubtasksOf(parentId) {
    const all = await WuboGrist.fetchRows('Taches');
    return all.filter(t => t.parent_tache === parentId && t.statut !== 'Archive');
  }

  // Ouvre le modal et retourne une Promise
  function open(options = {}) {
    const {
      mode = 'new',
      task = null,
      blocId = null,
      parentTaskId = null,
      projetId = null,
      defaultDate = null  // Unix sec UTC midnight pour pre-fill date en mode 'new'
    } = options;

    return new Promise(async (resolve) => {
      const modalId = 'wubo-task-modal-' + Date.now();
      const container = $el('div', { id: modalId, class: 'modal' });
      document.body.appendChild(container);

      let resolved = false;
      function close(result) {
        if (resolved) return;
        resolved = true;
        container.classList.add('hidden');
        WuboGrist.unlockBody();
        setTimeout(() => container.remove(), 240);
        resolve(result);
      }

      const content = $el('div', { class: 'modal-content', onclick: e => e.stopPropagation() });
      container.onclick = (e) => { if (e.target === container) close({ action: 'cancelled' }); };

      const titleText = mode === 'edit'
        ? 'Modifier la tâche'
        : parentTaskId ? 'Nouvelle sous-tâche' : 'Nouvelle tâche';

      content.appendChild($el('div', { class: 'modal-head' },
        $el('h3', {}, titleText),
        $el('button', { class: 'ghost small', onclick: () => close({ action: 'cancelled' }) }, 'Annuler')
      ));

      // État éditable
      const isNew = mode === 'new';

      // ============ MODE SOUS-TACHE : modal ultra-light ============
      // Sous-tache = juste un titre rapide a saisir. Pas de date/heure/projet/etc.
      // (la sous-tache herite du contexte de sa tache parent.) Pas de friction.
      if (isNew && parentTaskId) {
        const titreInput = $el('input', { type: 'text', placeholder: 'Titre court de la sous-tâche', autocomplete: 'off' });
        content.appendChild($el('div', { class: 'field' },
          $el('label', {}, 'Titre'),
          titreInput
        ));
        async function saveSubtask() {
          const titre = titreInput.value.trim();
          if (!titre) { WuboGrist.toast('Titre obligatoire', 'warn'); return; }
          try {
            const fields = {
              titre,
              parent_tache: parentTaskId,
              statut: 'Pas commence',
              date_creation: daysFromToday(0),
              proprietaire: WuboGrist.getUser() || 'Taki',
              cash_impact: 1, urgency: 1, strategic_value: 1,
              push_count: 0
            };
            const { id } = await WuboGrist.addRecord('Taches', fields);
            WuboGrist.toast('Sous-tâche créée', 'success');
            close({ action: 'saved', taskId: id });
          } catch (e) {
            WuboGrist.toast('Erreur : ' + e.message, 'error');
          }
        }
        titreInput.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); saveSubtask(); }
          if (e.key === 'Escape') { e.preventDefault(); close({ action: 'cancelled' }); }
        });
        content.appendChild($el('div', { class: 'sticky-save' },
          $el('button', { class: 'ghost small', onclick: () => close({ action: 'cancelled' }) }, 'Annuler'),
          $el('button', { class: 'primary', onclick: saveSubtask }, 'Créer')
        ));
        container.appendChild(content);
        WuboGrist.lockBody();
        if (window.ModalSwipe) ModalSwipe.enable(modalId, () => close({ action: 'cancelled' }));
        setTimeout(() => { try { titreInput.focus(); } catch (_) {} }, 150);
        return; // exit de open(), reste de la fonction (modal complete) zappe
      }

      // ============ STATUT : chips visuels en haut (mode EDIT uniquement) ============
      // En edit, le statut est l'action #1 que l'user vient faire (passer En cours, marquer Fait...).
      // On le promeut au-dessus du formulaire avec des chips colores cliquables, plutot que
      // de l'enterrer dans un <select> au milieu. Un click = update visuel immediat (le save final
      // synchronise vers Grist).
      // En new, le statut est implicite 'Pas commence' : pas d'UI necessaire.
      const STATUTS = [
        { id: 'Pas commence', label: 'Pas commencé', cls: 'todo' },
        { id: 'En cours', label: 'En cours', cls: 'wip' },
        { id: 'Bloque', label: 'Bloqué', cls: 'blocked' },
        { id: 'Fait', label: 'Fait', cls: 'done' },
        { id: 'Abandonne', label: 'Abandonné', cls: 'abandoned' }
      ];
      let currentStatut = (task && task.statut) || 'Pas commence';
      let statutChipsRow = null;
      let isSavingStatut = false;
      function paintStatutChips() {
        if (!statutChipsRow) return;
        $clear(statutChipsRow);
        STATUTS.forEach(s => {
          const isActive = currentStatut === s.id;
          const btn = $el('button', {
            type: 'button',
            class: 'task-statut-chip ' + s.cls + (isActive ? ' active' : ''),
            'aria-pressed': isActive ? 'true' : 'false',
            disabled: isSavingStatut ? true : null,
            onclick: async () => {
              if (isActive || isSavingStatut) return;
              const previous = currentStatut;
              currentStatut = s.id;
              isSavingStatut = true;
              paintStatutChips();
              // Mode edit : save direct (optimiste). L'user voit le changement
              // immediatement, et peut fermer la modal sans cliquer Enregistrer.
              // En cas d'echec, on revert visuellement.
              if (mode === 'edit' && task && task.id) {
                try {
                  const fields = { statut: s.id };
                  if (s.id === 'Fait' && WuboGrist.nowUnix) {
                    fields.date_fait = WuboGrist.nowUnix();
                  }
                  await WuboGrist.updateRecord('Taches', task.id, fields);
                  WuboGrist.toast('Statut → ' + s.label, 'success', 1200);
                  // Synchronise l'objet task local pour que d'autres champs (date_fait)
                  // soient dispos si l'user enregistre derriere.
                  task.statut = s.id;
                  if (fields.date_fait) task.date_fait = fields.date_fait;
                } catch (e) {
                  currentStatut = previous;
                  WuboGrist.toast('Erreur : ' + e.message, 'error');
                }
              }
              isSavingStatut = false;
              paintStatutChips();
            }
          }, s.label);
          statutChipsRow.appendChild(btn);
        });
      }
      if (mode === 'edit') {
        content.appendChild($el('label', { class: 'task-statut-label' }, 'Statut'));
        statutChipsRow = $el('div', { class: 'task-statut-chips', role: 'radiogroup', 'aria-label': 'Statut' });
        content.appendChild(statutChipsRow);
        paintStatutChips();
      }
      let collabs = Array.isArray(task && task.collaborateurs) ? task.collaborateurs.slice() : ['L'];
      // En édition : pré-coche aussi le proprietaire (sinon il apparaît en pastille mais
      // décocher ne le retire pas car il n'est pas dans le picker)
      if (mode === 'edit' && task && task.proprietaire && WuboGrist.USERS.includes(task.proprietaire)) {
        if (!collabs.includes(task.proprietaire)) collabs.push(task.proprietaire);
      }
      if (isNew && (!collabs || collabs.length <= 1)) {
        const u = WuboGrist.getUser() || 'Taki';
        collabs = ['L', u];
      }
      let pendingSubtasks = []; // pour création de parent avec sous-tâches en batch
      let currentPushCount = (task && task.push_count) || 0;
      const originalDate = task && task.date_cible ? task.date_cible : null;

      // Meta info
      if (mode === 'edit' && task) {
        const metaBits = [];
        if (task.score) metaBits.push(`score ${task.score}`);
        if (currentPushCount > 0) metaBits.push(`reportée ${currentPushCount}x`);
        if (task.times_missed) metaBits.push(`manquée ${task.times_missed}x`);
        if (metaBits.length) {
          content.appendChild($el('div', {
            style: 'font-size:11px;color:var(--text-dim)'
          }, metaBits.join(' · ')));
        }
      }

      // Champs
      const titreInput = $el('input', { type: 'text', placeholder: 'Titre court' });
      if (task && task.titre) titreInput.value = task.titre;
      content.appendChild(field('Titre', titreInput));

      // Note : champ libre pour les details / bullets de la tache.
      const descInput = $el('textarea', { placeholder: '- point 1\n- point 2', style: 'min-height:70px' });
      if (task && task.note) descInput.value = task.note;
      content.appendChild(field('Note', descInput));

      // Sous-taches : positionnees juste apres la Note (parcours utilisateur naturel,
      // titre + note + decomposition en sous-taches avant les details secondaires).
      // Seulement pour une tache racine (pas si on edite ou cree une sous-tache).
      const isRootTask = !(task && task.parent_tache) && !parentTaskId;
      const subsWrap = $el('div', { class: 'field' });
      const subsLabel = $el('label', {}, 'Sous-tâches');
      const subsList = $el('div', { class: 'task-list-mini', style: 'display:flex;flex-direction:column;gap:4px' });
      const addSubBtn = $el('button', {
        type: 'button',
        class: 'ghost small',
        style: 'margin-top:6px;align-self:flex-start;border-style:dashed',
        onclick: () => {
          if (mode === 'edit' && task && task.id) {
            // Inline input direct (pas de re-ouverture de modal). Focus auto.
            renderInlineSubInput();
          } else {
            pendingSubtasks.push({ titre: '' });
            renderPendingSubs();
          }
        }
      }, '+ Sous-tâche');

      // Affiche un input vierge a la fin de subsList. Enter = save direct + nouvel input vide
      // pour saisir la suivante. Esc ou blur sans contenu = retire l'input.
      function renderInlineSubInput() {
        // Si un input inline existe deja, focus dessus au lieu d'en creer un autre
        const existing = subsList.querySelector('.inline-sub-input');
        if (existing) { try { existing.focus(); } catch (_) {} return; }
        const inp = $el('input', {
          type: 'text', placeholder: 'Titre de la sous-tâche',
          class: 'inline-sub-input',
          style: 'flex:1;font-size:13px;padding:6px 8px;width:100%;border:1px solid var(--current);border-radius:4px',
          autocomplete: 'off'
        });
        const wrap = $el('div', {
          style: 'display:flex;gap:6px;align-items:center;padding:4px 6px'
        }, inp);
        async function commit() {
          const titre = inp.value.trim();
          if (!titre) { wrap.remove(); return; }
          inp.disabled = true;
          try {
            await WuboGrist.addRecord('Taches', {
              titre,
              parent_tache: task.id,
              projet: task.projet || null,
              statut: 'Pas commence',
              date_creation: daysFromToday(0),
              proprietaire: WuboGrist.getUser() || 'Taki',
              cash_impact: 1, urgency: 1, strategic_value: 1,
              push_count: 0
            });
            WuboGrist.toast('Sous-tâche créée', 'success', 1200);
            wrap.remove();
            await renderExistingSubs();
            // Re-ouvre un input vide pour saisir la suivante (workflow rapide)
            renderInlineSubInput();
          } catch (e) {
            inp.disabled = false;
            WuboGrist.toast('Erreur : ' + e.message, 'error');
          }
        }
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); wrap.remove(); }
        });
        inp.addEventListener('blur', () => {
          // Si vide au blur, on retire silencieusement
          if (!inp.value.trim()) wrap.remove();
        });
        subsList.appendChild(wrap);
        setTimeout(() => { try { inp.focus(); } catch (_) {} }, 50);
      }
      if (isRootTask) {
        subsWrap.appendChild(subsLabel);
        subsWrap.appendChild(subsList);
        subsWrap.appendChild(addSubBtn);
        content.appendChild(subsWrap);
        if (mode === 'edit' && task && task.id) {
          renderExistingSubs();
        } else {
          renderPendingSubs();
        }
      }

      const livrableInput = $el('input', { type: 'text', placeholder: 'Ce qui sera livré à la fin' });
      if (task && task.livrable) livrableInput.value = task.livrable;
      content.appendChild(field('Livrable (DoD)', livrableInput));

      // Projet dropdown (groupé par objectif)
      const projetSelect = $el('select', {});
      projetSelect.appendChild($el('option', { value: '' }, 'Aucun projet'));
      content.appendChild(field('Projet', projetSelect));
      const preselectProjet = (task && task.projet) || projetId || null;
      WuboGrist.populateProjetSelect(projetSelect, preselectProjet).catch(() => {});

      // Statut : en mode edit, gere par les chips en haut (currentStatut).
      // En mode new, hardcode 'Pas commence' au save (pas d'UI).

      // Date + Heure + Durée : modèle calendrier classique. Heure/durée optionnelles
      // (tâche peut rester "Sans créneau" sur sa date).
      // Pre-fill date :
      // - Edit : task.date_cible
      // - New + defaultDate fourni : utilise defaultDate (ex jour clique dans Semaine)
      // - New sans defaultDate : aujourd'hui
      const dateInput = $el('input', { type: 'date' });
      if (task && task.date_cible) {
        dateInput.value = unixToInputDate(task.date_cible);
      } else if (isNew) {
        if (defaultDate != null) {
          dateInput.value = unixToInputDate(defaultDate);
        } else {
          dateInput.value = unixToInputDate(daysFromToday(0));
        }
      }

      const heureDebutInput = $el('input', { type: 'time', step: 300 });
      if (task && task.heure_debut) heureDebutInput.value = task.heure_debut;

      content.appendChild($el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' },
        field('Date', dateInput),
        field('Heure', heureDebutInput)
      ));

      // Duree : 2 lignes groupees par unite (min en haut, h en bas). Tout est visible
      // d'un coup, plus de scroll horizontal. Le label d'unite est affiche a droite
      // de chaque ligne. Hint "→ fin HH:MM" calcule live en fonction de heure_debut
      // + duree pour donner du sens au choix.
      const DUREES_MIN = [
        { v: null, label: '—',  title: 'Sans durée' },
        { v: 15,   label: '15', title: '15 min' },
        { v: 30,   label: '30', title: '30 min' },
        { v: 45,   label: '45', title: '45 min' }
      ];
      const DUREES_H = [
        { v: 60,   label: '1',    title: '1 h' },
        { v: 90,   label: '1:30', title: '1 h 30' },
        { v: 120,  label: '2',    title: '2 h' },
        { v: 180,  label: '3',    title: '3 h' },
        { v: 240,  label: '4',    title: '4 h' }
      ];
      let currentDuree = (task && task.duree_minutes != null && task.duree_minutes !== '')
        ? task.duree_minutes : null;

      function computeFin(hh, dd) {
        if (!hh || !dd) return '';
        const [h, m] = hh.split(':').map(Number);
        const t = h * 60 + m + dd;
        const fh = Math.floor(t / 60) % 24;
        const fm = t % 60;
        return `${String(fh).padStart(2, '0')}:${String(fm).padStart(2, '0')}`;
      }

      const dureeWrap = $el('div', { class: 'field task-duree-field' });
      const dureeLabel = $el('label', {}, 'Durée');
      const dureeFinHint = $el('span', { class: 'task-duree-fin-hint' });
      dureeWrap.appendChild($el('div', { class: 'task-duree-label-row' }, dureeLabel, dureeFinHint));
      const dureeChipsRow = $el('div', { class: 'task-duree-chips' });
      dureeWrap.appendChild(dureeChipsRow);
      content.appendChild(dureeWrap);

      function paintDureeFinHint() {
        const fin = computeFin(heureDebutInput.value, currentDuree);
        dureeFinHint.textContent = fin ? `→ fin ${fin}` : '';
      }
      function paintDureeChips() {
        $clear(dureeChipsRow);
        function buildRow(items, unit) {
          const row = $el('div', { class: 'task-duree-row' });
          items.forEach(d => {
            const isActive = currentDuree === d.v;
            const cls = ['task-duree-chip'];
            if (isActive) cls.push('active');
            if (d.v == null) cls.push('nil');
            const btn = $el('button', {
              type: 'button',
              class: cls.join(' '),
              title: d.title,
              'aria-pressed': isActive ? 'true' : 'false',
              onclick: () => {
                currentDuree = d.v;
                paintDureeChips();
                paintDureeFinHint();
              }
            }, d.label);
            row.appendChild(btn);
          });
          row.appendChild($el('span', { class: 'task-duree-row-unit' }, unit));
          return row;
        }
        dureeChipsRow.appendChild(buildRow(DUREES_MIN, 'min'));
        dureeChipsRow.appendChild(buildRow(DUREES_H, 'h'));
      }
      paintDureeChips();
      paintDureeFinHint();
      heureDebutInput.addEventListener('input', paintDureeFinHint);
      heureDebutInput.addEventListener('change', paintDureeFinHint);


      // Variables pour detection de changements (cache existant des assignees, juste pour edit)
      const originalAssignees = (task && WuboGrist.getAssignees) ? WuboGrist.getAssignees(task).slice() : [];

      // Plus de logique blocs : les champs heure_debut/duree_minutes
      // viennent directement de la tâche en mode edit, vides en mode new.

      // Ext deadline
      const extInput = $el('input', { type: 'checkbox', style: 'width:auto;margin:0' });
      if (task && task.est_deadline_externe) extInput.checked = true;
      const extField = $el('div', { class: 'field' },
        $el('label', { style: 'display:flex;gap:8px;align-items:center;font-size:13px;text-transform:none;letter-spacing:0;color:var(--text);font-weight:600;cursor:pointer' },
          extInput,
          $el('span', {}, 'Deadline externe dure (AAP, event, atelier école)')
        )
      );
      content.appendChild(extField);

      // Collaborateurs picker
      const collabsDiv = $el('div', { class: 'collab-chips' });
      content.appendChild(field('Qui travaille dessus ?', collabsDiv));
      WuboUI.renderCollaborateursPicker(collabsDiv, collabs, list => { collabs = list; });

      // Reporter (édition avec date existante uniquement)
      let pushCountInfo = null;
      if (mode === 'edit' && task && task.date_cible) {
        const reporterWrap = $el('div', { class: 'field' });
        reporterWrap.appendChild($el('label', {}, 'Reporter'));
        const btnRow = $el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' });
        [
          { n: 1, label: '+1 jour' },
          { n: 3, label: '+3 jours' },
          { n: 7, label: '+1 semaine' }
        ].forEach(({ n, label }) => {
          btnRow.appendChild($el('button', {
            type: 'button',
            class: 'ghost small',
            onclick: () => {
              dateInput.value = unixToInputDate(daysFromToday(n));
              currentPushCount = currentPushCount + 1;
              pushCountInfo.textContent = `Report noté. push_count = ${currentPushCount} (bonus score +${Math.min(currentPushCount * 3, 10)})`;
            }
          }, label));
        });
        reporterWrap.appendChild(btnRow);
        pushCountInfo = $el('div', { style: 'font-size:11px;color:var(--warning);margin-top:4px' });
        if (currentPushCount > 0) pushCountInfo.textContent = `Déjà reportée ${currentPushCount}x (bonus score +${Math.min(currentPushCount * 3, 10)})`;
        reporterWrap.appendChild(pushCountInfo);
        content.appendChild(reporterWrap);
      }

      // Lien Google Calendar : visible si la tache a un gcal_event_id (importée de gCal
      // ou poussée depuis Pilotage). Bouton "Délier" reset le lien : la tâche reste
      // dans Pilotage mais devient autonome (plus de sync auto).
      if (mode === 'edit' && task && task.gcal_event_id && window.WuboGCal) {
        const gcalWrap = $el('div', { class: 'field' });
        gcalWrap.appendChild($el('label', {}, 'Google Calendar'));
        gcalWrap.appendChild($el('div', {
          style: 'font-size:12px;color:var(--text-dim);margin-bottom:4px;display:flex;gap:6px;align-items:center'
        },
          $el('span', {}, '📅'),
          $el('span', {}, 'Synchronisée avec Google Calendar')
        ));
        gcalWrap.appendChild($el('button', {
          type: 'button',
          class: 'ghost small',
          style: 'align-self:flex-start',
          onclick: async () => {
            await window.WuboGCal.dropEventLink(task.id);
            task.gcal_event_id = '';
            WuboGrist.toast('Tâche déliée de Google Calendar', 'info');
            close({ action: 'saved', taskId: task.id });
          }
        }, 'Délier de Google Calendar'));
        content.appendChild(gcalWrap);
      }

      // Sous-taches : helpers renderPendingSubs/renderExistingSubs definis ici.
      // Le DOM (subsWrap, subsList, addSubBtn) est cree plus haut juste apres la Note.

      function renderPendingSubs() {
        $clear(subsList);
        if (pendingSubtasks.length === 0) {
          subsList.appendChild($el('div', { class: 'empty', style: 'font-size:12px' }, 'Aucune sous-tâche'));
          return;
        }
        pendingSubtasks.forEach((sub, idx) => {
          const row = $el('div', { style: 'display:flex;gap:6px;align-items:center;padding:4px 6px;border:1px solid var(--border);border-radius:4px' });
          const inp = $el('input', {
            type: 'text', value: sub.titre || '',
            placeholder: 'Titre sous-tâche',
            style: 'flex:1;font-size:13px;padding:6px 8px',
            oninput: e => { pendingSubtasks[idx].titre = e.target.value; }
          });
          row.appendChild(inp);
          row.appendChild($el('button', {
            type: 'button', class: 'ghost small',
            style: 'padding:4px 8px',
            onclick: () => { pendingSubtasks.splice(idx, 1); renderPendingSubs(); }
          }, '✕'));
          subsList.appendChild(row);
        });
      }

      async function renderExistingSubs() {
        $clear(subsList);
        const subs = await fetchSubtasksOf(task.id);
        if (subs.length === 0) {
          subsList.appendChild($el('div', { class: 'empty', style: 'font-size:12px' }, 'Aucune sous-tâche'));
          return;
        }
        subs.forEach(s => {
          const isDone = s.statut === 'Fait';
          const row = $el('div', {
            style: 'display:flex;gap:8px;align-items:center;padding:7px 8px;border:1px solid var(--border);border-radius:4px;cursor:pointer',
            onclick: async (e) => {
              if (e.target.closest('.sub-del')) return;
              // Toggle fait <-> pas commencé
              const next = isDone ? 'Pas commence' : 'Fait';
              const fields = { statut: next };
              if (next === 'Fait') fields.date_fait = WuboGrist.nowUnix();
              try {
                await WuboGrist.updateRecord('Taches', s.id, fields);
                WuboGrist.toast(next === 'Fait' ? 'Sous-tâche faite' : 'Sous-tâche ré-ouverte', 'success', 1200);
                await renderExistingSubs();
              } catch (err) {
                WuboGrist.toast('Erreur : ' + err.message, 'error');
              }
            }
          });
          row.appendChild($el('span', { class: 'status-pill ' + statutClass(s.statut) }));
          row.appendChild($el('span', {
            style: `flex:1;font-size:13px;${isDone ? 'text-decoration:line-through;color:var(--text-faint)' : ''}`
          }, s.titre || '(sans titre)'));
          row.appendChild($el('button', {
            type: 'button', class: 'sub-del ghost small',
            style: 'padding:4px 8px;color:var(--danger);border-color:var(--danger)',
            onclick: async (e) => {
              e.stopPropagation();
              const ok = await WuboUI.confirm({
                title: 'Supprimer la sous-tâche ?',
                message: `"${s.titre || '(sans titre)'}"`,
                yesLabel: 'Supprimer',
                danger: true
              });
              if (!ok) return;
              try {
                await WuboGrist.deleteRecord('Taches', s.id);
                WuboGrist.toast('Sous-tâche supprimée', 'info');
                await renderExistingSubs();
              } catch (err) {
                WuboGrist.toast('Erreur : ' + err.message, 'error');
              }
            }
          }, '✕'));
          subsList.appendChild(row);
        });
      }

      // Sticky save : Annuler | (Supprimer) | (Archiver) | Enregistrer
      const stickySave = $el('div', { class: 'sticky-save' });
      stickySave.appendChild($el('button', { class: 'ghost small', onclick: () => close({ action: 'cancelled' }) }, 'Annuler'));
      if (mode === 'edit' && task && task.id) {
        stickySave.appendChild($el('button', {
          class: 'danger small',
          onclick: async () => {
            const ok = await WuboUI.confirm({
              title: 'Supprimer la tâche ?',
              message: `"${task.titre || '(sans titre)'}" — irréversible`,
              yesLabel: 'Supprimer', danger: true
            });
            if (!ok) return;
            try {
              // Retirer des blocs
              const blocs = await WuboGrist.fetchRows('Blocs_temps');
              for (const b of blocs) {
                const ids = WuboGrist.refListIds(b.taches_liees);
                if (ids.includes(task.id)) {
                  const next = ids.filter(x => x !== task.id);
                  try { await WuboGrist.updateRecord('Blocs_temps', b.id, { taches_liees: ['L', ...next] }); } catch (_) {}
                }
              }
              await WuboGrist.deleteRecord('Taches', task.id);
              WuboGrist.toast('Tâche supprimée', 'info');
              close({ action: 'deleted', taskId: task.id });
            } catch (err) {
              WuboGrist.toast('Erreur : ' + err.message, 'error');
            }
          }
        }, 'Supprimer'));
        stickySave.appendChild($el('button', {
          class: 'ghost small',
          onclick: async () => {
            // Archive directe + cooldown undo 8s. Pas de confirm() prealable :
            // l'undo permet de revenir en arriere sans friction. Snapshot des
            // valeurs precedentes (statut + date_fait) pour le restore.
            const prevStatut = task.statut || 'Pas commence';
            const prevDateFait = (task.date_fait != null && task.date_fait !== '')
              ? task.date_fait : null;
            try {
              await WuboGrist.archiveTask(task.id);
              const titre = task.titre || 'Tâche';
              WuboUI.cooldownNotice({
                message: `« ${titre} » archivée`,
                durationMs: 8000,
                onCancel: async () => {
                  try {
                    await WuboGrist.updateRecord('Taches', task.id, {
                      statut: prevStatut,
                      date_fait: prevDateFait
                    });
                    WuboGrist.toast('Restaurée', 'info');
                  } catch (e) {
                    WuboGrist.toast('Erreur restore : ' + e.message, 'error');
                  }
                }
              });
              close({ action: 'archived', taskId: task.id });
            } catch (err) {
              WuboGrist.toast('Erreur : ' + err.message, 'error');
            }
          }
        }, 'Archiver'));
      }
      stickySave.appendChild($el('button', {
        class: 'primary',
        onclick: async () => {
          const titre = titreInput.value.trim();
          if (!titre) { WuboGrist.toast('Titre obligatoire', 'warn'); return; }
          // Safety net : en CRÉATION, si user a effacé la date, on force aujourd'hui
          // pour que la tâche atterrisse au moins dans Jour today / Semaine current.
          // Sans date_cible, la tâche est invisible partout sauf Objectifs.
          let dateUnix = inputDateToUnix(dateInput.value);
          if (!dateUnix && mode === 'new') dateUnix = daysFromToday(0);
          const projetVal = projetSelect.value ? parseInt(projetSelect.value, 10) : null;
          const currentUser = WuboGrist.getUser() || 'Taki';
          const collabsList = (collabs || []).slice(1).filter(u => WuboGrist.USERS.includes(u));
          // Si l'utilisateur courant a décoché lui-même, propriétaire transféré au premier collab
          // Si aucun collab cochée → on garde current user en proprio (la tâche reste à toi)
          let propriotaireValue;
          if (collabsList.length === 0) {
            propriotaireValue = currentUser;
          } else if (collabsList.includes(currentUser)) {
            propriotaireValue = currentUser;
          } else {
            propriotaireValue = collabsList[0];
          }
          // Champs heure_debut + duree_minutes (modele calendrier).
          // Si heure renseignee sans date, on force date_cible=aujourd'hui (la tache doit
          // avoir une date pour avoir une heure).
          const heureDebutVal = heureDebutInput.value || '';
          const dureeVal = currentDuree;
          if (heureDebutVal && !dateUnix) dateUnix = daysFromToday(0);

          const fields = {
            titre,
            note: descInput.value,
            livrable: livrableInput.value,
            statut: currentStatut,
            est_deadline_externe: !!extInput.checked,
            collaborateurs: collabs,
            proprietaire: propriotaireValue,
            heure_debut: heureDebutVal || '',
            duree_minutes: dureeVal != null ? dureeVal : null
          };
          if (projetVal) fields.projet = projetVal;
          if (dateUnix) fields.date_cible = dateUnix;

          const allAssigneesNew = (collabs || []).slice(1).filter(u => WuboGrist.USERS.includes(u));
          const otherAssigneesNew = allAssigneesNew.filter(u => u !== currentUser);

          try {
            if (mode === 'edit' && task && task.id) {
              const wasReported = originalDate && dateUnix && dateUnix > originalDate;
              if (wasReported) fields.push_count = currentPushCount;
              await WuboGrist.updateRecord('Taches', task.id, fields);
              WuboGrist.toast(wasReported ? 'Tâche reportée' : 'Tâche mise à jour', 'success');
              close({ action: 'saved', taskId: task.id });
            } else {
              // Création
              fields.date_creation = daysFromToday(0);
              fields.push_count = 0;
              if (!fields.cash_impact) fields.cash_impact = 2;
              if (!fields.urgency) fields.urgency = 2;
              if (!fields.strategic_value) fields.strategic_value = 2;
              if (parentTaskId) fields.parent_tache = parentTaskId;
              const { id: newId } = await WuboGrist.addRecord('Taches', fields);

              // Créer sous-tâches pending
              let subCount = 0;
              if (!parentTaskId && newId && pendingSubtasks.length > 0) {
                for (const sub of pendingSubtasks) {
                  const subTitre = (sub.titre || '').trim();
                  if (!subTitre) continue;
                  try {
                    await WuboGrist.addRecord('Taches', {
                      titre: subTitre,
                      parent_tache: newId,
                      projet: projetVal || null,
                      statut: 'Pas commence',
                      date_creation: daysFromToday(0),
                      proprietaire: WuboGrist.getUser() || 'Taki',
                      cash_impact: 1, urgency: 1, strategic_value: 1,
                      push_count: 0,
                      collaborateurs: collabs
                    });
                    subCount++;
                  } catch (_) {}
                }
              }

              if (subCount > 0) {
                WuboGrist.toast(`Tâche + ${subCount} sous-tâche(s) créées`, 'success');
              } else if (parentTaskId) {
                WuboGrist.toast('Sous-tâche créée', 'success');
              } else {
                WuboGrist.toast('Tâche créée', 'success');
              }

              // Cooldown notice 10s si assignation cross-user (sans relation aux blocs)
              if (otherAssigneesNew.length > 0 && window.WuboUI && WuboUI.cooldownNotice) {
                const names = otherAssigneesNew.join(' & ');
                const heureBit = heureDebutVal ? ` à ${heureDebutVal}` : '';
                const msg = `Assigné à ${names}${heureBit}.`;
                WuboUI.cooldownNotice({
                  message: msg,
                  durationMs: 10000,
                  onCancel: async () => {
                    try { await WuboGrist.deleteRecord('Taches', newId); } catch (_) {}
                    WuboGrist.toast('Assignation annulée', 'info');
                  },
                  onEdit: async () => {
                    try {
                      const all = await WuboGrist.fetchRows('Taches', { force: true });
                      const t = all.find(x => x.id === newId);
                      if (t) WuboTaskModal.open({ mode: 'edit', task: t });
                    } catch (_) {}
                  }
                });
              }
              close({ action: 'saved', taskId: newId });
            }
          } catch (err) {
            WuboGrist.toast('Erreur : ' + err.message, 'error');
          }
        }
      }, 'Enregistrer'));

      content.appendChild(stickySave);
      container.appendChild(content);

      WuboGrist.lockBody();
      if (window.ModalSwipe) ModalSwipe.enable(modalId, () => close({ action: 'cancelled' }));
      setTimeout(() => { try { titreInput.focus(); } catch (_) {} }, 150);
    });
  }

  // Gère le flow "add subtask from within edit" : réouvre en create avec parentTaskId
  async function openSmart(options) {
    let currentOptions = options;
    while (true) {
      const r = await open(currentOptions);
      if (r && r.action === 'reopen-with-sub-parent') {
        // Récupérer la tâche parent fraiche pour afficher le contexte
        currentOptions = {
          mode: 'new',
          parentTaskId: r.parentTaskId
        };
        continue;
      }
      // Si l'utilisateur a sauvé/archivé/supprimé/annulé, on ressort
      return r;
    }
  }

  window.WuboTaskModal = { open: openSmart };
})();
