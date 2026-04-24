// Helpers UI Wubo : remplace les prompt/confirm iOS natifs par des modals stylées Wubo.
// API :
//   WuboUI.confirm({ title, message, danger }) -> Promise<boolean>
//   WuboUI.prompt({ title, placeholder, defaultValue, multiline }) -> Promise<string|null>
//   WuboUI.choice({ title, message, options: [{id,label,sub,danger}] }) -> Promise<string|null>
(function () {
  const { $el, $clear } = Dom;

  function ensureContainer() {
    let c = document.getElementById('wubo-ui-modal');
    if (!c) {
      c = document.createElement('div');
      c.id = 'wubo-ui-modal';
      c.className = 'modal hidden';
      document.body.appendChild(c);
    }
    return c;
  }

  function showModal(buildContent) {
    return new Promise(resolve => {
      const container = ensureContainer();
      $clear(container);
      container.classList.remove('hidden');
      WuboGrist.lockBody();

      function close(value) {
        container.classList.add('hidden');
        WuboGrist.unlockBody();
        $clear(container);
        resolve(value);
      }

      const content = $el('div', { class: 'modal-content', onclick: e => e.stopPropagation() });
      container.onclick = (e) => { if (e.target === container) close(null); };

      buildContent(content, close);
      container.appendChild(content);
    });
  }

  function confirm({ title, message, danger = false, yesLabel = 'Confirmer', noLabel = 'Annuler' }) {
    return showModal((content, close) => {
      content.appendChild($el('div', { class: 'modal-head' },
        $el('h3', {}, title || 'Confirmer')
      ));
      if (message) {
        content.appendChild($el('div', {
          style: { fontSize: '14px', color: 'var(--text-dim)', lineHeight: '1.4' }
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
        ? $el('textarea', { placeholder: placeholder || '', style: { minHeight: '100px' } })
        : $el('input', { type: 'text', placeholder: placeholder || '', autocomplete: 'off' });
      if (defaultValue) input.value = defaultValue;
      content.appendChild(input);
      const errMsg = $el('div', { style: { fontSize: '12px', color: 'var(--danger)', minHeight: '14px' } });
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
      setTimeout(() => { try { input.focus(); } catch (_) {} }, 100);
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

  // Choix multi-options. Renvoie l'id choisi ou null.
  function choice({ title, message, options = [] }) {
    return showModal((content, close) => {
      content.appendChild($el('div', { class: 'modal-head' },
        $el('h3', {}, title || '')
      ));
      if (message) {
        content.appendChild($el('div', {
          style: { fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.4' }
        }, message));
      }
      const list = $el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
      options.forEach(opt => {
        const btn = $el('button', {
          class: opt.danger ? 'danger' : 'ghost',
          style: {
            textAlign: 'left',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            lineHeight: '1.3',
            width: '100%'
          },
          onclick: () => close(opt.id)
        });
        btn.appendChild($el('span', { style: { fontSize: '14px', fontWeight: '700' } }, opt.label));
        if (opt.sub) btn.appendChild($el('span', { style: { fontSize: '12px', opacity: '0.75' } }, opt.sub));
        list.appendChild(btn);
      });
      content.appendChild(list);
      content.appendChild($el('div', { class: 'sticky-save' },
        $el('button', { class: 'ghost small', onclick: () => close(null) }, 'Annuler')
      ));
    });
  }

  // ============ Onboarding + menu profil ============
  // Appelle showOnboarding() si user non défini. Retourne l'user choisi.
  function showOnboarding() {
    return showModal((content, close) => {
      content.appendChild($el('div', { class: 'modal-head' },
        $el('h3', {}, 'Qui es-tu ?')
      ));
      content.appendChild($el('div', {
        style: { fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.4' }
      }, 'Pour personnaliser ton pilotage.'));
      const row = $el('div', { style: { display: 'flex', gap: '8px' } });
      WuboGrist.USERS.forEach(u => {
        const initial = u.charAt(0);
        const btn = $el('button', {
          class: 'profile-btn ' + u.toLowerCase(),
          style: {
            width: '80px', height: '80px', fontSize: '28px',
            flexDirection: 'column', gap: '4px', borderRadius: '10px',
            flex: '1'
          },
          onclick: () => {
            WuboGrist.setUser(u);
            close(u);
          }
        });
        btn.appendChild($el('span', {}, initial));
        btn.appendChild($el('span', { style: { fontSize: '11px', fontWeight: '600', opacity: '0.9' } }, u));
        row.appendChild(btn);
      });
      content.appendChild(row);
    });
  }

  // Menu profil : switch user, toggle view, déconnexion clé API
  function openProfileMenu() {
    const current = WuboGrist.getUser() || 'Taki';
    const view = WuboGrist.getViewMode();
    return showModal((content, close) => {
      content.appendChild($el('div', { class: 'modal-head' },
        $el('h3', {}, 'Profil'),
        $el('button', { class: 'ghost small', onclick: () => close(null) }, 'Fermer')
      ));

      // Identité
      content.appendChild($el('div', { style: { fontSize: '11px', fontWeight: '700', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' } }, 'Identité'));
      const row = $el('div', { style: { display: 'flex', gap: '6px' } });
      WuboGrist.USERS.forEach(u => {
        const btn = $el('button', {
          class: 'profile-btn ' + u.toLowerCase() + (u === current ? ' selected' : ''),
          style: {
            width: 'auto', flex: '1', height: '52px', fontSize: '13px',
            flexDirection: 'column', gap: '2px', borderRadius: '8px',
            border: u === current ? '3px solid var(--text)' : '2px solid var(--border-strong)'
          },
          onclick: () => {
            WuboGrist.setUser(u);
            close('user-changed');
            location.reload();
          }
        });
        btn.appendChild($el('span', { style: { fontSize: '18px' } }, u.charAt(0)));
        btn.appendChild($el('span', { style: { fontSize: '11px', opacity: '0.85' } }, u));
        row.appendChild(btn);
      });
      content.appendChild(row);

      // Vue
      content.appendChild($el('div', { style: { fontSize: '11px', fontWeight: '700', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '6px' } }, 'Vue'));
      const viewRow = $el('div', { style: { display: 'flex', gap: '6px' } });
      const viewOpts = [
        { id: 'mine', label: 'Mes tâches', sub: 'moi + Shared' },
        { id: 'team', label: 'Toute l\'équipe', sub: 'tous les users' }
      ];
      viewOpts.forEach(o => {
        const btn = $el('button', {
          class: view === o.id ? 'primary' : 'ghost',
          style: { flex: '1', flexDirection: 'column', gap: '2px', padding: '12px' },
          onclick: () => {
            WuboGrist.setViewMode(o.id);
            close('view-changed');
            location.reload();
          }
        });
        btn.appendChild($el('span', { style: { fontSize: '13px', fontWeight: '700' } }, o.label));
        btn.appendChild($el('span', { style: { fontSize: '11px', opacity: '0.75' } }, o.sub));
        viewRow.appendChild(btn);
      });
      content.appendChild(viewRow);

      // Clé API
      content.appendChild($el('div', { style: { fontSize: '11px', fontWeight: '700', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '6px' } }, 'Compte Grist'));
      content.appendChild($el('button', {
        class: 'ghost',
        onclick: () => {
          WuboGrist.resetApiKey();
          close('apikey-reset');
          location.reload();
        }
      }, 'Déconnecter (effacer clé API)'));

      content.appendChild($el('div', { class: 'sticky-save' },
        $el('button', { class: 'ghost small', onclick: () => close(null) }, 'Fermer')
      ));
    });
  }

  // Retourne le HTML d'un profile-btn à poser dans la page-header
  function renderProfileButton(container) {
    const user = WuboGrist.getUser() || 'Taki';
    const initial = user.charAt(0);
    const view = WuboGrist.getViewMode();
    const classList = ['profile-btn', user.toLowerCase()];
    if (view === 'team') classList.push('team');
    const btn = $el('button', {
      class: classList.join(' '),
      title: `${user} · ${view === 'mine' ? 'mes tâches' : 'équipe'}`,
      onclick: openProfileMenu
    }, initial);
    if (container) container.appendChild(btn);
    return btn;
  }

  // À appeler au boot : si pas d'user défini, lance l'onboarding, sinon pose le bouton profil
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
