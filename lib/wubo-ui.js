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

  window.WuboUI = { confirm, prompt, choice };
})();
