// Helpers UI Wubo : modals cohérents avec le reste de l'app (.modal + .modal-content
// auto-wrappées par ModalSwipe, fermables en slide bas). Palette DA Wubo.
(function () {
  const { $el, $clear } = Dom;
  let modalCounter = 0;

  // YYYY-MM-DD (input type=date) → unix sec UTC midnight. '' / null → null.
  function inputDateToUnix(s) {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return null;
    return Math.floor(Date.UTC(y, m - 1, d) / 1000);
  }
  // Inverse : unix sec → 'YYYY-MM-DD' (UTC). null/undefined → ''.
  function unixToInputDate(u) {
    if (u == null || u === '') return '';
    const d = new Date(u * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  function createModalShell() {
    modalCounter++;
    const id = `wubo-ui-modal-${modalCounter}`;
    const container = document.createElement('div');
    container.id = id;
    container.className = 'modal';
    document.body.appendChild(container);
    return { container, id };
  }

  // Ouvre un modal générique, retourne promise qui résout avec la valeur passée à close().
  // Utilise le même pattern que les modals des widgets : .modal-content avec modal-head
  // + children auto-wrappés dans .modal-body par ModalSwipe + .sticky-save footer.
  function showModal(buildContent) {
    return new Promise(resolve => {
      const { container, id } = createModalShell();

      let resolved = false;
      function close(value) {
        if (resolved) return;
        resolved = true;
        container.classList.add('hidden');
        WuboGrist.unlockBody();
        setTimeout(() => { container.remove(); }, 240);
        resolve(value);
      }

      const content = $el('div', { class: 'modal-content', onclick: e => e.stopPropagation() });
      container.onclick = (e) => { if (e.target === container) close(null); };
      buildContent(content, close);
      container.appendChild(content);

      WuboGrist.lockBody();
      // Enable swipe-to-close (auto-wrap body + touch handlers) en utilisant ModalSwipe.
      // Le modal est déjà visible car pas de classe .hidden.
      if (window.ModalSwipe) ModalSwipe.enable(id, () => close(null));
    });
  }

  function confirm({ title, message, danger = false, yesLabel = 'Confirmer', noLabel = 'Annuler' }) {
    return showModal((content, close) => {
      content.appendChild($el('div', { class: 'modal-head' },
        $el('h3', {}, title || 'Confirmer')
      ));
      if (message) {
        content.appendChild($el('div', {
          style: 'font-size:14px;color:var(--text-dim);line-height:1.4'
        }, message));
      }
      content.appendChild($el('div', { class: 'sticky-save' },
        $el('button', { class: 'ghost small', onclick: () => close(false) }, noLabel),
        $el('button', {
          class: (danger ? 'danger' : 'primary'),
          onclick: () => close(true)
        }, yesLabel)
      ));
    });
  }

  function prompt({ title, placeholder, defaultValue = '', multiline = false, validate }) {
    return showModal((content, close) => {
      content.appendChild($el('div', { class: 'modal-head' },
        $el('h3', {}, title || '')
      ));
      const input = multiline
        ? $el('textarea', { placeholder: placeholder || '', style: 'min-height:100px' })
        : $el('input', { type: 'text', placeholder: placeholder || '', autocomplete: 'off' });
      if (defaultValue) input.value = defaultValue;
      content.appendChild(input);
      const errMsg = $el('div', { style: 'font-size:12px;color:var(--pink);min-height:14px' });
      content.appendChild(errMsg);
      content.appendChild($el('div', { class: 'sticky-save' },
        $el('button', { class: 'ghost small', onclick: () => close(null) }, 'Annuler'),
        $el('button', {
          class: 'primary',
          onclick: () => {
            const val = input.value;
            if (validate) {
              const err = validate(val);
              if (err) { errMsg.textContent = err; return; }
            }
            close(val);
          }
        }, 'OK')
      ));
      setTimeout(() => { try { input.focus(); } catch (_) {} }, 120);
      input.addEventListener('keydown', e => {
        if (!multiline && e.key === 'Enter') {
          e.preventDefault();
          const val = input.value;
          if (validate) {
            const err = validate(val);
            if (err) { errMsg.textContent = err; return; }
          }
          close(val);
        }
        if (e.key === 'Escape') { e.preventDefault(); close(null); }
      });
    });
  }

  function choice({ title, message, options = [] }) {
    return showModal((content, close) => {
      content.appendChild($el('div', { class: 'modal-head' },
        $el('h3', {}, title || '')
      ));
      if (message) {
        content.appendChild($el('div', { style: 'font-size:13px;color:var(--text-dim);line-height:1.4' }, message));
      }
      const list = $el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
      options.forEach(opt => {
        const btn = $el('button', {
          class: opt.danger ? 'danger' : 'ghost',
          style: 'text-align:left;padding:14px;display:flex;flex-direction:column;gap:2px;line-height:1.3;width:100%;align-items:flex-start',
          onclick: () => close(opt.id)
        });
        btn.appendChild($el('span', { style: 'font-size:14px;font-weight:700' }, opt.label));
        if (opt.sub) btn.appendChild($el('span', { style: 'font-size:12px;opacity:0.75;font-weight:500' }, opt.sub));
        list.appendChild(btn);
      });
      content.appendChild(list);
      content.appendChild($el('div', { class: 'sticky-save' },
        $el('button', { class: 'ghost small', onclick: () => close(null) }, 'Fermer')
      ));
    });
  }

  // ============ Onboarding : première sélection d'utilisateur ============
  function showOnboarding() {
    return showModal((content, close) => {
      content.appendChild($el('div', { class: 'modal-head' },
        $el('h3', {}, 'Bienvenue')
      ));
      content.appendChild($el('div', { style: 'font-size:14px;color:var(--text-dim);line-height:1.4' },
        'Qui es-tu ?'
      ));
      const row = $el('div', { style: 'display:flex;gap:8px;margin-top:6px' });
      WuboGrist.USERS.forEach(u => {
        const btn = $el('button', {
          class: 'user-tile ' + u.toLowerCase(),
          onclick: () => {
            WuboGrist.setUser(u);
            close(u);
          }
        });
        btn.appendChild($el('span', { class: 'user-tile-letter' }, u.charAt(0)));
        btn.appendChild($el('span', { class: 'user-tile-name' }, u));
        row.appendChild(btn);
      });
      content.appendChild(row);
      content.appendChild($el('div', { class: 'sticky-save' },
        $el('span', { style: 'font-size:12px;color:var(--text-faint);align-self:center;padding:0 6px' },
          'Choisis pour commencer')
      ));
    });
  }

  // ============ Menu profil : identite + theme + compte ============
  // Layout :
  //   [Profil] X
  //   [Avatar large] Taki / connecte
  //
  //   APPARENCE
  //   [Auto | Clair | Sombre]   (segmented control)
  //
  //   IDENTITE
  //   [T] [N] [L]               (chips compactes horizontales)
  //   "Tu vois tout..." (hint)
  //
  //   COMPTE
  //   [Effacer la cle API]
  //
  //   ----
  //   Wubo Pilotage v1
  function openProfileMenu() {
    const current = WuboGrist.getUser() || 'Taki';
    return showModal((content, close) => {
      // Pas de croix en haut : la modal se ferme par swipe-down (ModalSwipe), backdrop tap,
      // ou bouton "Fermer" en bas. Trois facons cohabitent inutilement avec une croix en plus.
      content.appendChild($el('div', { class: 'modal-head' },
        $el('h3', {}, 'Profil')
      ));

      // Bandeau identite courante : avatar + nom + statut
      const me = $el('div', { class: 'profile-me' });
      me.appendChild($el('div', { class: 'profile-avatar ' + current.toLowerCase() }, current.charAt(0)));
      const meBody = $el('div', { class: 'profile-me-body' });
      meBody.appendChild($el('div', { class: 'profile-me-name' }, current));
      meBody.appendChild($el('div', { class: 'profile-me-sub' }, 'Connecté'));
      me.appendChild(meBody);
      content.appendChild(me);

      // ============ APPARENCE : toggle theme ============
      content.appendChild($el('label', { class: 'profile-section-label' }, 'Apparence'));
      const themeRow = $el('div', { class: 'theme-toggle', role: 'radiogroup', 'aria-label': 'Theme' });
      const currentTheme = (window.WuboTheme && WuboTheme.get()) || 'auto';
      [
        { id: 'auto', label: 'Auto', icon: '◐' },
        { id: 'light', label: 'Clair', icon: '☀' },
        { id: 'dark', label: 'Sombre', icon: '☾' }
      ].forEach(opt => {
        const isActive = currentTheme === opt.id;
        const btn = $el('button', {
          class: 'theme-toggle-btn' + (isActive ? ' active' : ''),
          role: 'radio',
          'aria-checked': isActive ? 'true' : 'false',
          onclick: () => {
            if (window.WuboTheme) WuboTheme.set(opt.id);
            // Re-render le toggle pour update visual
            themeRow.querySelectorAll('.theme-toggle-btn').forEach(b => {
              const isThisActive = b.dataset.themeId === opt.id;
              b.classList.toggle('active', isThisActive);
              b.setAttribute('aria-checked', isThisActive ? 'true' : 'false');
            });
          }
        });
        btn.dataset.themeId = opt.id;
        btn.appendChild($el('span', { class: 'theme-toggle-icon' }, opt.icon));
        btn.appendChild($el('span', { class: 'theme-toggle-label' }, opt.label));
        themeRow.appendChild(btn);
      });
      content.appendChild(themeRow);

      // ============ IDENTITE : switch user ============
      content.appendChild($el('label', { class: 'profile-section-label' }, 'Utilisateur'));
      const userRow = $el('div', { class: 'profile-user-row' });
      WuboGrist.USERS.forEach(u => {
        const isCurrent = u === current;
        const btn = $el('button', {
          class: 'profile-user-chip ' + u.toLowerCase() + (isCurrent ? ' selected' : ''),
          'aria-pressed': isCurrent ? 'true' : 'false',
          onclick: () => {
            if (isCurrent) return;
            WuboGrist.setUser(u);
            close('user-changed');
            location.reload();
          }
        });
        btn.appendChild($el('span', { class: 'profile-user-chip-letter' }, u.charAt(0)));
        btn.appendChild($el('span', { class: 'profile-user-chip-name' }, u));
        userRow.appendChild(btn);
      });
      content.appendChild(userRow);
      content.appendChild($el('div', { class: 'profile-hint' },
        'Vue unifiée : tu vois tout. Les pastilles sur chaque tâche indiquent qui est assigné.'
      ));

      // ============ MES BLOCS : config tranches personnelles ============
      // Modele : N blocs par tranche (Matin/Aprem/Soir). Affichage groupe par tranche.
      content.appendChild($el('label', { class: 'profile-section-label' }, 'Mes blocs'));
      content.appendChild($el('div', { class: 'profile-hint' },
        'Tes blocs personnels groupes par tranche. Tu peux avoir plusieurs blocs dans une meme tranche (ex : Atelier 7h-9h + Matin 9h-12h).'
      ));
      const blocsListEl = $el('div', { class: 'profil-blocs-list' });
      content.appendChild(blocsListEl);

      const TRANCHES_ORDRE = ['Matin', 'Aprem', 'Soir'];
      const JOURS_CODES = (WuboGrist.JOURS_CODES) || ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

      // State : array de { id?, user, tranche, ordre, label, debut_heure, fin_heure, actif,
      //                    bloque, jours_semaine (array string), date_debut (unix|null),
      //                    date_fin (unix|null), _new?, _deleted?, _dirty?, _showRecur? }
      let blocsState = [];
      // Reference au bouton primary du sticky-save (cree plus bas), pilote par
      // updateStickySaveBtn() en fonction du dirty state.
      let stickySaveBtn = null;
      let isSavingBlocs = false;

      function dirtyBlocsCount() {
        return blocsState.filter(b => b._new || b._deleted || b._dirty).length;
      }
      function updateStickySaveBtn() {
        if (!stickySaveBtn) return;
        if (isSavingBlocs) {
          stickySaveBtn.disabled = true;
          stickySaveBtn.textContent = 'Enregistrement…';
          return;
        }
        const count = dirtyBlocsCount();
        stickySaveBtn.disabled = count === 0;
        stickySaveBtn.textContent = count === 0
          ? 'Aucun changement'
          : (count === 1 ? 'Enregistrer 1 bloc' : `Enregistrer ${count} blocs`);
      }

      // Normalise une row Profils_blocs Grist en state local mutable.
      // - jours_semaine ChoiceList ['L', 'Lun', ...] → array de strings
      // - date_debut / date_fin restent unix sec (ou null)
      function normalizeProfilBloc(p) {
        const jours = (WuboGrist.choiceListValues
          ? WuboGrist.choiceListValues(p.jours_semaine)
          : (Array.isArray(p.jours_semaine) && p.jours_semaine[0] === 'L'
              ? p.jours_semaine.slice(1)
              : []));
        return {
          ...p,
          jours_semaine: jours,
          date_debut: (p.date_debut === '' || p.date_debut == null) ? null : p.date_debut,
          date_fin: (p.date_fin === '' || p.date_fin == null) ? null : p.date_fin,
          // Capture l'ordre original (depuis Grist) pour pouvoir migrer les Blocs_temps
          // existants si l'ordre intra-tranche shift au save.
          _originalOrdre: p.ordre || 1,
          _originalTranche: p.tranche
        };
      }

      function paintBlocs() {
        while (blocsListEl.firstChild) blocsListEl.removeChild(blocsListEl.firstChild);
        TRANCHES_ORDRE.forEach(tranche => {
          const sectionEl = $el('div', { class: 'profil-bloc-section' });
          sectionEl.appendChild($el('div', { class: 'profil-bloc-section-title' }, tranche));
          // Tri par debut_heure intra-tranche (auto, l'utilisateur ne gere pas l'ordre manuellement).
          const visible = blocsState
            .filter(b => !b._deleted && b.tranche === tranche)
            .sort((a, b) => (a.debut_heure || '').localeCompare(b.debut_heure || ''));
          visible.forEach((b, idx) => {
            const isPrivate = b.cross_user_visible === false;
            const rowClasses = ['profil-bloc-row-wrap'];
            if (b.bloque) rowClasses.push('bloque');
            if (isPrivate) rowClasses.push('private');
            const rowWrap = $el('div', { class: rowClasses.join(' ') });
            const row = $el('div', { class: 'profil-bloc-row' });
            const labelInp = $el('input', {
              type: 'text', value: b.label || '', placeholder: 'Label',
              class: 'profil-bloc-label-input',
              oninput: (e) => { b.label = e.target.value; b._dirty = true; updateStickySaveBtn(); }
            });
            const debutInp = $el('input', {
              type: 'time', value: b.debut_heure || '09:00',
              class: 'profil-bloc-time-input',
              onchange: (e) => { b.debut_heure = e.target.value; b._dirty = true; paintBlocs(); }
            });
            const finInp = $el('input', {
              type: 'time', value: b.fin_heure || '12:00',
              class: 'profil-bloc-time-input',
              onchange: (e) => { b.fin_heure = e.target.value; b._dirty = true; paintBlocs(); }
            });
            const delBtn = $el('button', {
              class: 'ghost small profil-bloc-arrow danger-text',
              title: 'Supprimer ce bloc',
              onclick: async () => {
                const ok = await confirm({
                  title: 'Supprimer ce bloc ?',
                  message: `Le bloc "${b.label || b.tranche}" sera retire au prochain enregistrement.`,
                  yesLabel: 'Supprimer',
                  danger: true
                });
                if (ok) { b._deleted = true; paintBlocs(); }
              }
            }, '×');
            row.appendChild(labelInp);
            row.appendChild($el('div', { class: 'profil-bloc-times' }, debutInp, $el('span', { class: 'profil-bloc-arrow-sep' }, '→'), finInp));
            row.appendChild($el('div', { class: 'profil-bloc-actions' }, delBtn));
            rowWrap.appendChild(row);

            // Ligne badges (recurrence + private). Affichee seulement si au moins un actif.
            const recurSummary = (WuboGrist.summarizeRecurrence
              ? WuboGrist.summarizeRecurrence({
                  jours_semaine: (Array.isArray(b.jours_semaine) && b.jours_semaine.length)
                    ? ['L', ...b.jours_semaine] : null,
                  date_debut: b.date_debut,
                  date_fin: b.date_fin
                })
              : '');
            if (recurSummary || isPrivate) {
              const badgesRow = $el('div', { class: 'profil-bloc-badges-row' });
              if (recurSummary) {
                badgesRow.appendChild($el('div', { class: 'profil-bloc-recur-badge' },
                  $el('span', { class: 'profil-bloc-recur-icon' }, '↻'),
                  $el('span', {}, recurSummary)
                ));
              }
              if (isPrivate) {
                badgesRow.appendChild($el('div', { class: 'profil-bloc-private-badge' },
                  $el('span', {}, '🔒 Privé')
                ));
              }
              rowWrap.appendChild(badgesRow);
            }

            // Toggle bloque : checkbox sur 2e ligne pour mobile
            const blocControlsRow = $el('div', { class: 'profil-bloc-controls' });
            const blocLabel = $el('label', { class: 'profil-bloc-checkbox-label' });
            const blocCheckbox = $el('input', {
              type: 'checkbox',
              onchange: (e) => {
                b.bloque = e.target.checked;
                b._dirty = true;
                rowWrap.classList.toggle('bloque', !!b.bloque);
                updateStickySaveBtn();
              }
            });
            if (b.bloque) blocCheckbox.checked = true;
            blocLabel.appendChild(blocCheckbox);
            blocLabel.appendChild($el('span', {}, 'Bloqué'));
            blocControlsRow.appendChild(blocLabel);
            // Toggle visible cross-user (default true). Si false : les autres users
            // ne peuvent pas auto-placer de tâche dans ce sous-bloc (privé).
            const crossLabel = $el('label', { class: 'profil-bloc-checkbox-label' });
            const crossCheckbox = $el('input', {
              type: 'checkbox',
              onchange: (e) => {
                b.cross_user_visible = e.target.checked;
                b._dirty = true;
                paintBlocs();
              }
            });
            if (b.cross_user_visible !== false) crossCheckbox.checked = true;
            crossLabel.appendChild(crossCheckbox);
            crossLabel.appendChild($el('span', {}, 'Visible cross-user'));
            blocControlsRow.appendChild(crossLabel);
            // Toggle ouverture/fermeture du panneau Recurrence
            const recurToggleBtn = $el('button', {
              type: 'button',
              class: 'ghost small profil-bloc-recur-toggle' + (b._showRecur ? ' open' : ''),
              onclick: () => { b._showRecur = !b._showRecur; paintBlocs(); }
            }, b._showRecur ? '▾ Récurrence' : '▸ Récurrence');
            blocControlsRow.appendChild(recurToggleBtn);
            rowWrap.appendChild(blocControlsRow);

            // Panneau recurrence deplie : jours, presets, dates, hint.
            if (b._showRecur) {
              const recurPanel = $el('div', { class: 'profil-bloc-recur-panel' });

              // Mini chips jours (cliquer toggle)
              const joursRow = $el('div', { class: 'profil-bloc-jours-row' });
              const currentJours = new Set(Array.isArray(b.jours_semaine) ? b.jours_semaine : []);
              JOURS_CODES.forEach(code => {
                const isOn = currentJours.has(code);
                const jourBtn = $el('button', {
                  type: 'button',
                  class: 'profil-bloc-jour-chip' + (isOn ? ' picked' : ''),
                  'aria-pressed': isOn ? 'true' : 'false',
                  onclick: () => {
                    if (currentJours.has(code)) currentJours.delete(code);
                    else currentJours.add(code);
                    b.jours_semaine = JOURS_CODES.filter(c => currentJours.has(c));
                    b._dirty = true;
                    paintBlocs();
                  }
                }, code);
                joursRow.appendChild(jourBtn);
              });
              recurPanel.appendChild(joursRow);

              // Presets rapides
              function applyPreset(jours) {
                b.jours_semaine = jours;
                b._dirty = true;
                paintBlocs();
              }
              const presetsRow = $el('div', { class: 'profil-bloc-presets-row' });
              presetsRow.appendChild($el('button', {
                type: 'button', class: 'ghost small',
                onclick: () => applyPreset([])
              }, 'Tous les jours'));
              presetsRow.appendChild($el('button', {
                type: 'button', class: 'ghost small',
                onclick: () => applyPreset(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'])
              }, 'Lun-Ven'));
              presetsRow.appendChild($el('button', {
                type: 'button', class: 'ghost small',
                onclick: () => applyPreset(['Sam', 'Dim'])
              }, 'Week-end'));
              recurPanel.appendChild(presetsRow);

              // Dates de validite
              const datesRow = $el('div', { class: 'profil-bloc-dates-row' });
              const dStartLabel = $el('label', { class: 'profil-bloc-date-label' });
              dStartLabel.appendChild($el('span', { class: 'profil-bloc-date-caption' }, 'Début'));
              const dStartInp = $el('input', {
                type: 'date',
                class: 'profil-bloc-date-input',
                value: unixToInputDate(b.date_debut),
                onchange: (e) => {
                  b.date_debut = inputDateToUnix(e.target.value);
                  b._dirty = true;
                  paintBlocs();
                }
              });
              dStartLabel.appendChild(dStartInp);
              datesRow.appendChild(dStartLabel);

              const dEndLabel = $el('label', { class: 'profil-bloc-date-label' });
              dEndLabel.appendChild($el('span', { class: 'profil-bloc-date-caption' }, 'Fin'));
              const dEndInp = $el('input', {
                type: 'date',
                class: 'profil-bloc-date-input',
                value: unixToInputDate(b.date_fin),
                onchange: (e) => {
                  b.date_fin = inputDateToUnix(e.target.value);
                  b._dirty = true;
                  paintBlocs();
                }
              });
              dEndLabel.appendChild(dEndInp);
              datesRow.appendChild(dEndLabel);
              recurPanel.appendChild(datesRow);

              recurPanel.appendChild($el('div', { class: 'profil-bloc-recur-hint' },
                'Vide : sous-bloc permanent. Avec dates : sous-bloc temporaire (atelier 2 mois, etc.).'
              ));
              rowWrap.appendChild(recurPanel);
            }
            sectionEl.appendChild(rowWrap);
          });
          const addBtn = $el('button', {
            class: 'ghost small',
            style: 'border-style:dashed;align-self:flex-start;margin-top:4px',
            onclick: () => {
              const defaults = {
                Matin: { debut: '08:00', fin: '12:00' },
                Aprem: { debut: '13:00', fin: '17:00' },
                Soir: { debut: '18:00', fin: '22:00' }
              }[tranche];
              blocsState.push({
                user: current,
                tranche,
                ordre: 999, // recalculé au save
                label: tranche,
                debut_heure: defaults.debut,
                fin_heure: defaults.fin,
                actif: true,
                jours_semaine: [],
                date_debut: null,
                date_fin: null,
                _new: true,
                _dirty: true
              });
              paintBlocs();
            }
          }, `+ Ajouter dans ${tranche}`);
          sectionEl.appendChild(addBtn);
          blocsListEl.appendChild(sectionEl);
        });
        // Le bouton de save vit dans le sticky-save (footer modal). On synchronise.
        updateStickySaveBtn();
      }

      async function saveBlocs() {
        if (isSavingBlocs) return;
        isSavingBlocs = true;
        updateStickySaveBtn();
        // Recompute ordre intra-tranche selon position triee par debut_heure
        TRANCHES_ORDRE.forEach(tranche => {
          const visible = blocsState
            .filter(b => !b._deleted && b.tranche === tranche)
            .sort((a, b) => (a.debut_heure || '').localeCompare(b.debut_heure || ''));
          visible.forEach((b, idx) => {
            if (b.ordre !== idx + 1) { b.ordre = idx + 1; b._dirty = true; }
          });
        });

        // Construit la table de migration des Blocs_temps : pour chaque bloc existant
        // dont l'ordre OU la tranche a change, capture (oldTranche, oldOrdre) → (newTranche, newOrdre).
        // Les nouveaux (_new) et supprimes (_deleted) ne migrent rien (pas d'historique commun).
        const ordreShifts = []; // [{ oldTranche, oldOrdre, newTranche, newOrdre }]
        blocsState.forEach(b => {
          if (b._new || b._deleted || !b.id) return;
          const oldT = b._originalTranche;
          const oldO = b._originalOrdre || 1;
          const newT = b.tranche;
          const newO = b.ordre || 1;
          if (oldT !== newT || oldO !== newO) {
            ordreShifts.push({ oldTranche: oldT, oldOrdre: oldO, newTranche: newT, newOrdre: newO });
          }
        });

        try {
          for (const b of blocsState) {
            if (b._deleted && b.id) {
              try { await WuboGrist.deleteRecord('Profils_blocs', b.id); } catch (_) {}
            }
          }
          for (const b of blocsState.filter(x => !x._deleted)) {
            const joursList = (Array.isArray(b.jours_semaine) && b.jours_semaine.length)
              ? ['L', ...b.jours_semaine] : null;
            const dDebut = (b.date_debut == null || b.date_debut === '') ? null : b.date_debut;
            const dFin = (b.date_fin == null || b.date_fin === '') ? null : b.date_fin;
            if (b._new) {
              const fields = {
                user: current, tranche: b.tranche, ordre: b.ordre, label: b.label,
                debut_heure: b.debut_heure, fin_heure: b.fin_heure,
                actif: true, bloque: !!b.bloque,
                cross_user_visible: b.cross_user_visible !== false,
                jours_semaine: joursList,
                date_debut: dDebut,
                date_fin: dFin
              };
              await WuboGrist.addRecord('Profils_blocs', fields);
            } else if (b._dirty && b.id) {
              const fields = {
                tranche: b.tranche, ordre: b.ordre, label: b.label,
                debut_heure: b.debut_heure, fin_heure: b.fin_heure,
                bloque: !!b.bloque,
                cross_user_visible: b.cross_user_visible !== false,
                jours_semaine: joursList,
                date_debut: dDebut,
                date_fin: dFin
              };
              await WuboGrist.updateRecord('Profils_blocs', b.id, fields);
            }
          }

          // Migration Blocs_temps : si des ordres ont shift, on remap les rows existantes.
          // Logique : pour chaque shift (oldT/oldO → newT/newO), on update les rows qui
          // matchent encore (proprietaire=current, tranche=oldT, tranche_ordre=oldO).
          // Procede en 2 passes via valeur temporaire negative pour eviter les collisions.
          if (ordreShifts.length > 0) {
            try {
              const allBT = await WuboGrist.fetchRows('Blocs_temps', { force: true });
              const mine = allBT.filter(r => r.proprietaire === current);
              // Pass 1 : tag avec valeur temporaire (-1, -2, ...) pour eviter collisions
              const tempMap = []; // [{id, finalTranche, finalOrdre}]
              for (let i = 0; i < ordreShifts.length; i++) {
                const sh = ordreShifts[i];
                const matching = mine.filter(r =>
                  r.tranche === sh.oldTranche && (r.tranche_ordre || 1) === sh.oldOrdre
                );
                for (const r of matching) {
                  tempMap.push({ id: r.id, finalTranche: sh.newTranche, finalOrdre: sh.newOrdre });
                  // Tag temporaire (negatif) pour eviter qu'une autre passe matche cette row
                  try {
                    await WuboGrist.updateRecord('Blocs_temps', r.id, { tranche_ordre: -(i + 1) });
                  } catch (_) {}
                }
              }
              // Pass 2 : ecrire les valeurs finales
              for (const t of tempMap) {
                try {
                  await WuboGrist.updateRecord('Blocs_temps', t.id, {
                    tranche: t.finalTranche,
                    tranche_ordre: t.finalOrdre
                  });
                } catch (_) {}
              }
              WuboGrist.cacheInvalidate('Blocs_temps');
            } catch (e) {
              console.warn('Migration Blocs_temps partielle :', e);
            }
          }

          WuboGrist.clearProfilsBlocsCache();
          WuboGrist.toast(ordreShifts.length > 0
            ? `Blocs sauvegardés (${ordreShifts.length} reordonnés)`
            : 'Blocs sauvegardés', 'success');
          blocsState = (await WuboGrist.getProfilBlocs(current)).map(normalizeProfilBloc);
          isSavingBlocs = false;
          paintBlocs();
        } catch (e) {
          isSavingBlocs = false;
          updateStickySaveBtn();
          WuboGrist.toast('Erreur : ' + e.message, 'error');
        }
      }

      // Tente de fermer la modal : si modifs blocs non sauvegardees, demande confirmation.
      async function tryClose() {
        if (dirtyBlocsCount() > 0) {
          const ok = await confirm({
            title: 'Quitter sans enregistrer ?',
            message: `Tu as ${dirtyBlocsCount()} modif(s) de bloc non sauvegardee(s). Elles seront perdues.`,
            yesLabel: 'Quitter sans enregistrer',
            noLabel: 'Continuer l\'edition',
            danger: true
          });
          if (!ok) return;
        }
        close(null);
      }

      // Chargement initial async
      (async () => {
        try {
          blocsState = (await WuboGrist.getProfilBlocs(current)).map(normalizeProfilBloc);
          paintBlocs();
        } catch (_) {
          blocsState = [];
          paintBlocs();
        }
      })();

      // ============ COMPTE ============
      content.appendChild($el('label', { class: 'profile-section-label' }, 'Compte'));
      content.appendChild($el('button', {
        class: 'ghost small',
        style: 'align-self:flex-start',
        onclick: async () => {
          const ok = await confirm({
            title: 'Déconnecter ?',
            message: 'La clé API sera effacée.',
            yesLabel: 'Déconnecter',
            danger: true
          });
          if (ok) {
            WuboGrist.resetApiKey();
            close('apikey-reset');
            location.reload();
          }
        }
      }, 'Effacer la clé API'));

      // Footer version
      content.appendChild($el('div', { class: 'profile-footer' }, 'Wubo Pilotage'));

      // Sticky-save : Fermer (ghost, gauche) + Enregistrer mes blocs (primary, principal).
      // stickySaveBtn pilote par updateStickySaveBtn() : disabled si pas de dirty,
      // texte dynamique avec compteur, "Enregistrement…" pendant l'await.
      stickySaveBtn = $el('button', {
        class: 'primary',
        style: 'flex:1',
        disabled: true,
        onclick: saveBlocs
      }, 'Aucun changement');
      content.appendChild($el('div', { class: 'sticky-save' },
        $el('button', { class: 'ghost', onclick: tryClose }, 'Fermer'),
        stickySaveBtn
      ));
      // Premiere synchronisation au cas ou paintBlocs n'a pas encore tourne
      // (les blocs se chargent en async).
      updateStickySaveBtn();
    });
  }

  // ============ Pastilles assignees (rendu mini-stack) ============
  // record peut être Tache/Projet/Objectif. Les pastilles affichent proprietaire + collaborateurs.
  // Taille 'sm' (15px, listes denses) ou 'md' (22px, headers).
  function renderAssignees(record, { size = 'sm' } = {}) {
    const assignees = WuboGrist.getAssignees(record);
    if (!assignees.length) return null;
    const stack = $el('span', { class: 'assignee-stack ' + size });
    assignees.forEach(u => {
      stack.appendChild($el('span', {
        class: 'assignee-pill ' + u.toLowerCase(),
        title: u
      }, u.charAt(0)));
    });
    return stack;
  }

  // ============ Multi-select des collaborateurs (utilisé dans les modals) ============
  // container = élément où injecter les boutons. initialList = ['L', 'Numa'] format Grist.
  // onChange(['L', 'Numa']) appelé à chaque changement.
  function renderCollaborateursPicker(container, initialList, onChange) {
    const picked = new Set();
    if (Array.isArray(initialList) && initialList[0] === 'L') {
      initialList.slice(1).forEach(u => { if (WuboGrist.USERS.includes(u)) picked.add(u); });
    }
    function emit() {
      const next = ['L', ...Array.from(picked)];
      if (typeof onChange === 'function') onChange(next);
    }
    function paint() {
      while (container.firstChild) container.removeChild(container.firstChild);
      WuboGrist.USERS.forEach(u => {
        const isPicked = picked.has(u);
        const chip = $el('button', {
          type: 'button',
          class: 'collab-chip ' + u.toLowerCase() + (isPicked ? ' picked' : ''),
          onclick: () => {
            if (isPicked) picked.delete(u);
            else picked.add(u);
            emit();
            paint();
          }
        });
        chip.appendChild($el('span', { class: 'collab-chip-letter' }, u.charAt(0)));
        chip.appendChild($el('span', { class: 'collab-chip-name' }, u));
        container.appendChild(chip);
      });
    }
    paint();
  }

  function renderProfileButton(container) {
    const user = WuboGrist.getUser() || 'Taki';
    const initial = user.charAt(0);
    const classList = ['profile-btn', user.toLowerCase()];
    const btn = $el('button', {
      class: classList.join(' '),
      title: `${user}`,
      onclick: openProfileMenu
    }, initial);
    if (container) container.appendChild(btn);
    return btn;
  }

  async function ensureUser(profileContainer) {
    if (!WuboGrist.getUser()) {
      await showOnboarding();
    }
    if (profileContainer) {
      while (profileContainer.firstChild) profileContainer.removeChild(profileContainer.firstChild);
      renderProfileButton(profileContainer);
    }
  }

  // ============ Layout helpers ============
  // Mesure dynamique de la hauteur d'un header fixed/sticky.
  // Injecte --sticky-h sur :root pour que #app puisse calculer son padding-top
  // sans magic number. Surveille les changements (resize, orientation, contenu).
  function syncStickyHeight(selector) {
    const el = document.querySelector(selector);
    if (!el) return null;
    const apply = () => {
      const h = el.getBoundingClientRect().height;
      // Math.ceil pour eviter les sous-pixels qui creent un jour visuel
      document.documentElement.style.setProperty('--sticky-h', `${Math.ceil(h)}px`);
    };
    apply();
    // Reagit au redimensionnement viewport + rotation iOS + changement contenu interne
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(apply);
      ro.observe(el);
      return () => { ro.disconnect(); window.removeEventListener('resize', apply); window.removeEventListener('orientationchange', apply); };
    }
    return () => { window.removeEventListener('resize', apply); window.removeEventListener('orientationchange', apply); };
  }

  // ============ Cooldown notice ============
  // Affiche une barre flottante avec message + Modifier + Annuler + progress bar décroissante.
  // Après durationMs, disparaît silencieusement (commit définitif).
  // onEdit et onCancel : callbacks, reçus quand l'user clique.
  // Retourne un objet { dismiss(), isLive() } au cas où on veut forcer la fin.
  function cooldownNotice({ message, onEdit, onCancel, durationMs = 10000 }) {
    const existing = document.getElementById('wubo-cooldown');
    if (existing) existing.remove();

    const notice = $el('div', { id: 'wubo-cooldown', class: 'cooldown-notice' });
    const row = $el('div', { class: 'cooldown-row' });
    row.appendChild($el('div', { class: 'cooldown-msg' }, message || 'Action effectuée'));
    const actions = $el('div', { class: 'cooldown-actions' });

    let live = true;
    let timer = null;
    function dismiss(silent) {
      if (!live) return;
      live = false;
      if (timer) clearInterval(timer);
      notice.remove();
      if (!silent && typeof onExpire === 'function') onExpire();
    }

    if (onEdit) {
      actions.appendChild($el('button', {
        class: 'cooldown-btn',
        onclick: () => { dismiss(true); onEdit(); }
      }, 'Modifier'));
    }
    if (onCancel) {
      actions.appendChild($el('button', {
        class: 'cooldown-btn danger',
        onclick: () => { dismiss(true); onCancel(); }
      }, 'Annuler'));
    }
    row.appendChild(actions);
    notice.appendChild(row);

    const progress = $el('div', { class: 'cooldown-progress' });
    const progressFill = $el('div', { class: 'cooldown-progress-fill' });
    progress.appendChild(progressFill);
    notice.appendChild(progress);

    document.body.appendChild(notice);

    const start = Date.now();
    timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, durationMs - elapsed);
      progressFill.style.width = (remaining / durationMs * 100) + '%';
      if (remaining <= 0) {
        clearInterval(timer);
        if (live) { live = false; notice.remove(); }
      }
    }, 60);

    return {
      dismiss: () => dismiss(true),
      isLive: () => live
    };
  }

  window.WuboUI = {
    confirm, prompt, choice,
    showOnboarding, openProfileMenu, renderProfileButton, ensureUser,
    syncStickyHeight,
    renderAssignees, renderCollaborateursPicker,
    cooldownNotice
  };
})();
