// Helpers UI Wubo : modals cohérents avec le reste de l'app (.modal + .modal-content
// auto-wrappées par ModalSwipe, fermables en slide bas). Palette DA Wubo.
(function () {
  const { $el, $clear } = Dom;
  let modalCounter = 0;

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

  // ============ Menu profil : identité + vue + déconnexion ============
  function openProfileMenu() {
    const current = WuboGrist.getUser() || 'Taki';
    const view = WuboGrist.getViewMode();
    return showModal((content, close) => {
      content.appendChild($el('div', { class: 'modal-head' },
        $el('h3', {}, 'Profil')
      ));

      // Identité
      content.appendChild($el('label', {}, 'Identité'));
      const userRow = $el('div', { style: 'display:flex;gap:6px' });
      WuboGrist.USERS.forEach(u => {
        const isCurrent = u === current;
        const btn = $el('button', {
          class: 'user-tile ' + u.toLowerCase() + (isCurrent ? ' selected' : ''),
          style: 'flex:1',
          onclick: () => {
            if (isCurrent) return;
            WuboGrist.setUser(u);
            close('user-changed');
            location.reload();
          }
        });
        btn.appendChild($el('span', { class: 'user-tile-letter' }, u.charAt(0)));
        btn.appendChild($el('span', { class: 'user-tile-name' }, u));
        userRow.appendChild(btn);
      });
      content.appendChild(userRow);

      // Vue
      content.appendChild($el('label', {}, 'Vue'));
      const viewRow = $el('div', { style: 'display:flex;gap:6px' });
      [
        { id: 'mine', label: 'Moi', sub: 'mes tâches + Shared' },
        { id: 'team', label: 'Équipe', sub: 'tout le monde' }
      ].forEach(o => {
        const isActive = view === o.id;
        const btn = $el('button', {
          class: isActive ? 'primary' : 'ghost',
          style: 'flex:1;flex-direction:column;gap:2px;padding:12px;align-items:flex-start;text-align:left',
          onclick: () => {
            WuboGrist.setViewMode(o.id);
            close('view-changed');
            location.reload();
          }
        });
        btn.appendChild($el('span', { style: 'font-size:14px;font-weight:700' }, o.label));
        btn.appendChild($el('span', { style: 'font-size:11px;opacity:0.75;font-weight:500' }, o.sub));
        viewRow.appendChild(btn);
      });
      content.appendChild(viewRow);

      // Compte
      content.appendChild($el('label', {}, 'Compte Grist'));
      content.appendChild($el('button', {
        class: 'ghost small',
        onclick: async () => {
          const ok = await confirm({
            title: 'Déconnecter ?',
            message: 'La clé API sera effacée, tu devras la recoller.',
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

      content.appendChild($el('div', { class: 'sticky-save' },
        $el('button', { class: 'ghost small', onclick: () => close(null) }, 'Fermer')
      ));
    });
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

  window.WuboUI = {
    confirm, prompt, choice,
    showOnboarding, openProfileMenu, renderProfileButton, ensureUser
  };
})();
