// Modal de création / édition de projet, partagé entre Dashboard, Échéances.
// Usage :
//   const r = await WuboProjetModal.open({ mode: 'new', objectifId: 5 });
//   const r = await WuboProjetModal.open({ mode: 'edit', projet });
// Retourne : { action: 'saved'|'deleted'|'archived'|'cancelled', id }
(function () {
  const { $el } = Dom;

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
  function field(labelText, inputEl) {
    return $el('div', { class: 'field' },
      $el('label', {}, labelText),
      inputEl
    );
  }

  function open(options = {}) {
    const { mode = 'new', projet = null, objectifId = null } = options;

    return new Promise(async resolve => {
      const modalId = 'wubo-projet-modal-' + Date.now();
      const container = $el('div', { id: modalId, class: 'modal' });
      document.body.appendChild(container);

      let resolved = false;
      function close(result) {
        if (resolved) return;
        resolved = true;
        container.classList.add('hidden');
        WuboGrist.unlockBody();
        setTimeout(() => container.remove(), 240);
        resolve(result || { action: 'cancelled' });
      }

      const content = $el('div', { class: 'modal-content', onclick: e => e.stopPropagation() });
      container.onclick = e => { if (e.target === container) close({ action: 'cancelled' }); };

      const titleText = mode === 'edit' ? 'Modifier le projet' : 'Nouveau projet';
      content.appendChild($el('div', { class: 'modal-head' },
        $el('h3', {}, titleText),
        $el('button', { class: 'ghost small', onclick: () => close({ action: 'cancelled' }) }, 'Annuler')
      ));

      // Récupère le titre de l'objectif parent (pour le hint)
      const targetObjId = (projet && projet.objectif) || objectifId || null;
      const parentInfo = $el('div', { style: 'font-size:11px;color:var(--text-dim);font-style:italic' });
      content.appendChild(parentInfo);
      if (targetObjId) {
        WuboGrist.fetchRows('Objectifs').then(objs => {
          const obj = objs.find(o => o.id === targetObjId);
          parentInfo.textContent = obj ? `Sous l'objectif : ${obj.titre || ''}` : 'Sans objectif';
        }).catch(() => {});
      } else {
        parentInfo.textContent = 'Sans objectif';
      }

      let collabs = Array.isArray(projet && projet.collaborateurs) ? projet.collaborateurs.slice() : ['L'];
      if (mode === 'edit' && projet && projet.proprietaire && WuboGrist.USERS.includes(projet.proprietaire)) {
        if (!collabs.includes(projet.proprietaire)) collabs.push(projet.proprietaire);
      }
      if (mode === 'new' && (!collabs || collabs.length <= 1)) {
        collabs = ['L', WuboGrist.getUser() || 'Taki'];
      }

      // Méta info en édition (date_creation si présente)
      if (mode === 'edit' && projet && projet.date_creation) {
        const created = unixToInputDate(projet.date_creation);
        if (created) {
          content.appendChild($el('div', {
            style: 'font-size:11px;color:var(--text-dim)'
          }, `Créé le ${created}`));
        }
      }

      const titreInput = $el('input', { type: 'text', placeholder: 'Titre du projet' });
      if (projet && projet.titre) titreInput.value = projet.titre;
      content.appendChild(field('Titre', titreInput));

      const descInput = $el('textarea', { style: 'min-height:60px' });
      if (projet && projet.description) descInput.value = projet.description;
      content.appendChild(field('Description', descInput));

      const dateInput = $el('input', { type: 'date' });
      if (projet && projet.date_cible) dateInput.value = unixToInputDate(projet.date_cible);
      content.appendChild(field('Échéance', dateInput));

      const extInput = $el('input', { type: 'checkbox', style: 'width:auto;margin:0' });
      if (projet && projet.est_deadline_externe) extInput.checked = true;
      content.appendChild($el('div', { class: 'field' },
        $el('label', { style: 'display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0;color:var(--text);font-weight:600;cursor:pointer' },
          extInput,
          $el('span', {}, 'Deadline externe')
        )
      ));

      const collabsDiv = $el('div', { class: 'collab-chips' });
      content.appendChild(field('Qui travaille dessus ?', collabsDiv));
      WuboUI.renderCollaborateursPicker(collabsDiv, collabs, list => { collabs = list; });

      const stickySave = $el('div', { class: 'sticky-save' });
      stickySave.appendChild($el('button', { class: 'ghost small', onclick: () => close({ action: 'cancelled' }) }, 'Annuler'));

      if (mode === 'edit' && projet && projet.id) {
        stickySave.appendChild($el('button', {
          class: 'danger small',
          onclick: async () => {
            const ok = await WuboUI.confirm({
              title: 'Supprimer le projet ?',
              message: 'Irréversible. Les tâches liées resteront mais perdront leur rattachement.',
              yesLabel: 'Supprimer',
              danger: true
            });
            if (!ok) return;
            try {
              await WuboGrist.deleteRecord('Projets', projet.id);
              WuboGrist.toast('Projet supprimé', 'info');
              close({ action: 'deleted', id: projet.id });
            } catch (e) {
              WuboGrist.toast('Erreur : ' + e.message, 'error');
            }
          }
        }, 'Supprimer'));
        stickySave.appendChild($el('button', {
          class: 'ghost small',
          onclick: async () => {
            const ok = await WuboUI.confirm({
              title: 'Archiver le projet ?',
              message: 'Il disparaît des listes mais reste dans Grist.',
              yesLabel: 'Archiver'
            });
            if (!ok) return;
            try {
              await WuboGrist.archiveRecord('Projets', projet.id);
              WuboGrist.toast('Projet archivé', 'info');
              close({ action: 'archived', id: projet.id });
            } catch (e) {
              WuboGrist.toast('Erreur : ' + e.message, 'error');
            }
          }
        }, 'Archiver'));
      }

      stickySave.appendChild($el('button', {
        class: 'primary',
        onclick: async () => {
          const titre = titreInput.value.trim();
          if (!titre) { WuboGrist.toast('Titre obligatoire', 'warn'); return; }

          const currentUser = WuboGrist.getUser() || 'Taki';
          const collabsList = (collabs || []).slice(1).filter(u => WuboGrist.USERS.includes(u));
          let propriotaireValue;
          if (collabsList.length === 0) propriotaireValue = currentUser;
          else if (collabsList.includes(currentUser)) propriotaireValue = currentUser;
          else propriotaireValue = collabsList[0];

          const fields = {
            titre,
            description: descInput.value,
            est_deadline_externe: !!extInput.checked,
            statut: 'Actif',
            collaborateurs: collabs,
            proprietaire: propriotaireValue
          };
          if (dateInput.value) fields.date_cible = inputDateToUnix(dateInput.value);
          if (targetObjId) fields.objectif = targetObjId;

          try {
            if (mode === 'edit' && projet && projet.id) {
              await WuboGrist.updateRecord('Projets', projet.id, fields);
              WuboGrist.toast('Projet mis à jour', 'success');
              close({ action: 'saved', id: projet.id });
            } else {
              // Création : auto-set date_creation à aujourd'hui (la colonne peut ne pas exister
              // côté Grist, dans ce cas le champ est ignoré silencieusement par l'API REST)
              fields.date_creation = WuboGrist.daysFromToday(0);
              const { id: newId } = await WuboGrist.addRecord('Projets', fields);
              WuboGrist.toast('Projet créé', 'success');
              close({ action: 'saved', id: newId });
            }
          } catch (e) {
            WuboGrist.toast('Erreur : ' + e.message, 'error');
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

  window.WuboProjetModal = { open };
})();
