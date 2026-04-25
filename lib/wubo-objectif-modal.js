// Modal de création / édition d'objectif, partagé entre Dashboard, Échéances.
// Usage :
//   const r = await WuboObjectifModal.open({ mode: 'new' });
//   const r = await WuboObjectifModal.open({ mode: 'edit', objectif });
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
    const { mode = 'new', objectif = null } = options;

    return new Promise(resolve => {
      const modalId = 'wubo-objectif-modal-' + Date.now();
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

      const titleText = mode === 'edit' ? 'Modifier l\'objectif' : 'Nouvel objectif';
      content.appendChild($el('div', { class: 'modal-head' },
        $el('h3', {}, titleText),
        $el('button', { class: 'ghost small', onclick: () => close({ action: 'cancelled' }) }, 'Annuler')
      ));

      // Pré-coche union proprietaire + collaborateurs (cohérent avec WuboTaskModal)
      let collabs = Array.isArray(objectif && objectif.collaborateurs) ? objectif.collaborateurs.slice() : ['L'];
      if (mode === 'edit' && objectif && objectif.proprietaire && WuboGrist.USERS.includes(objectif.proprietaire)) {
        if (!collabs.includes(objectif.proprietaire)) collabs.push(objectif.proprietaire);
      }
      if (mode === 'new' && (!collabs || collabs.length <= 1)) {
        collabs = ['L', WuboGrist.getUser() || 'Taki'];
      }

      const titreInput = $el('input', { type: 'text', placeholder: 'Ex: Sécuriser le financement Q3' });
      if (objectif && objectif.titre) titreInput.value = objectif.titre;
      content.appendChild(field('Titre', titreInput));

      const descInput = $el('textarea', { placeholder: 'Pourquoi cet objectif', style: 'min-height:70px' });
      if (objectif && objectif.description) descInput.value = objectif.description;
      content.appendChild(field('Description', descInput));

      const trimestreSelect = $el('select', {});
      [['', '—'], ['2026-Q2', '2026-Q2'], ['2026-Q3', '2026-Q3'], ['2026-Q4', '2026-Q4'], ['2027-Q1', '2027-Q1']].forEach(([v, lbl]) => {
        const opt = $el('option', { value: v }, lbl);
        if (objectif && objectif.trimestre === v) opt.selected = true;
        trimestreSelect.appendChild(opt);
      });
      const prioriteInput = $el('input', { type: 'number', min: '1', max: '5', placeholder: '1-5' });
      if (objectif && objectif.priorite) prioriteInput.value = objectif.priorite;
      content.appendChild($el('div', { class: 'field', style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' },
        $el('div', {}, $el('label', {}, 'Trimestre'), trimestreSelect),
        $el('div', {}, $el('label', {}, 'Priorité'), prioriteInput)
      ));

      const deadlineInput = $el('input', { type: 'date' });
      if (objectif && objectif.deadline) deadlineInput.value = unixToInputDate(objectif.deadline);
      content.appendChild(field('Échéance', deadlineInput));

      const extInput = $el('input', { type: 'checkbox', style: 'width:auto;margin:0' });
      if (objectif && objectif.est_deadline_externe) extInput.checked = true;
      content.appendChild($el('div', { class: 'field' },
        $el('label', { style: 'display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0;color:var(--text);font-weight:600;cursor:pointer' },
          extInput,
          $el('span', {}, 'Deadline externe (non repoussable)')
        )
      ));

      const collabsDiv = $el('div', { class: 'collab-chips' });
      content.appendChild(field('Qui travaille dessus ?', collabsDiv));
      WuboUI.renderCollaborateursPicker(collabsDiv, collabs, list => { collabs = list; });

      const kpiViseInput = $el('input', { type: 'text', placeholder: 'ex: 3 ateliers' });
      if (objectif && objectif.kpi_vise) kpiViseInput.value = objectif.kpi_vise;
      const kpiActuelInput = $el('input', { type: 'text', placeholder: 'ex: 1 atelier' });
      if (objectif && objectif.kpi_actuel) kpiActuelInput.value = objectif.kpi_actuel;
      content.appendChild($el('div', { class: 'field', style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' },
        $el('div', {}, $el('label', {}, 'KPI visé'), kpiViseInput),
        $el('div', {}, $el('label', {}, 'KPI actuel'), kpiActuelInput)
      ));

      const stickySave = $el('div', { class: 'sticky-save' });
      stickySave.appendChild($el('button', { class: 'ghost small', onclick: () => close({ action: 'cancelled' }) }, 'Annuler'));

      if (mode === 'edit' && objectif && objectif.id) {
        stickySave.appendChild($el('button', {
          class: 'danger small',
          onclick: async () => {
            const ok = await WuboUI.confirm({
              title: 'Supprimer l\'objectif ?',
              message: 'Irréversible. Les projets liés perdront leur rattachement. Préfère "Archiver".',
              yesLabel: 'Supprimer',
              danger: true
            });
            if (!ok) return;
            try {
              await WuboGrist.deleteRecord('Objectifs', objectif.id);
              WuboGrist.toast('Objectif supprimé', 'info');
              close({ action: 'deleted', id: objectif.id });
            } catch (e) {
              WuboGrist.toast('Erreur : ' + e.message, 'error');
            }
          }
        }, 'Supprimer'));
        stickySave.appendChild($el('button', {
          class: 'ghost small',
          onclick: async () => {
            const ok = await WuboUI.confirm({
              title: 'Archiver l\'objectif ?',
              message: 'Il disparaît des listes mais reste dans Grist.',
              yesLabel: 'Archiver'
            });
            if (!ok) return;
            try {
              await WuboGrist.archiveRecord('Objectifs', objectif.id);
              WuboGrist.toast('Objectif archivé', 'info');
              close({ action: 'archived', id: objectif.id });
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
            trimestre: trimestreSelect.value || null,
            priorite: parseInt(prioriteInput.value, 10) || null,
            est_deadline_externe: !!extInput.checked,
            kpi_vise: kpiViseInput.value,
            kpi_actuel: kpiActuelInput.value,
            statut: 'Actif',
            collaborateurs: collabs,
            proprietaire: propriotaireValue
          };
          if (deadlineInput.value) fields.deadline = inputDateToUnix(deadlineInput.value);

          try {
            if (mode === 'edit' && objectif && objectif.id) {
              await WuboGrist.updateRecord('Objectifs', objectif.id, fields);
              WuboGrist.toast('Objectif mis à jour', 'success');
              close({ action: 'saved', id: objectif.id });
            } else {
              const { id: newId } = await WuboGrist.addRecord('Objectifs', fields);
              WuboGrist.toast('Objectif créé', 'success');
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

  window.WuboObjectifModal = { open };
})();
