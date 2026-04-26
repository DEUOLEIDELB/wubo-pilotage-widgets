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

      // (Section "Mes blocs" supprimee : modele calendrier — pas de sous-blocs config.)

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

      content.appendChild($el('div', { class: 'sticky-save' },
        $el('button', { class: 'primary', style: 'flex:1', onclick: () => close(null) }, 'Fermer')
      ));
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
