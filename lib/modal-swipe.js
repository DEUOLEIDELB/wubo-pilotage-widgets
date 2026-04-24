// Swipe-to-close pour modals bottom-sheet style + auto-wrap du body.
// Usage : ModalSwipe.enable(modalId, closeFn)
// Le helper :
//   - wrap automatiquement les champs entre .modal-head et .sticky-save dans un .modal-body (scrollable)
//   - ajoute une poignée visuelle (.modal-grip) en haut de .modal-content
//   - attache les handlers tactiles qui détectent un swipe vers le bas
// Le swipe est piloté depuis la poignée + la zone modal-head uniquement (pas depuis le body)
// pour ne pas interférer avec le scroll interne.
(function () {
  const TRIGGER_DISTANCE = 100;   // pixels vers le bas pour déclencher close
  const MAX_DRAG_RATIO = 0.5;
  const VELOCITY_THRESHOLD = 0.5; // px/ms

  // Transforme un .modal-content pour séparer header / body scrollable / footer.
  function ensureFlexLayout(content) {
    if (content.dataset.flexWrapped === '1') return;
    content.dataset.flexWrapped = '1';

    const save = content.querySelector(':scope > .sticky-save');
    if (!save) return; // pas de sticky-save, rien à wrapper

    // Déplace le .modal-head et .modal-grip en premier (si présents)
    let grip = content.querySelector(':scope > .modal-grip');
    if (!grip) {
      grip = document.createElement('div');
      grip.className = 'modal-grip';
      grip.setAttribute('aria-hidden', 'true');
      content.insertBefore(grip, content.firstChild);
    } else if (content.firstChild !== grip) {
      content.insertBefore(grip, content.firstChild);
    }

    // Wrap tout ce qui est entre modal-head (ou grip) et sticky-save dans .modal-body
    const body = document.createElement('div');
    body.className = 'modal-body';
    const kids = Array.from(content.children);
    let reachedStart = false;
    kids.forEach(child => {
      if (child === grip) return;
      if (child.classList && child.classList.contains('modal-head')) {
        reachedStart = true;
        return;
      }
      if (child === save) return;
      if (child.classList && child.classList.contains('modal-body')) return;
      // Tout le reste : déplacer dans body
      body.appendChild(child);
    });
    // insère body juste avant sticky-save
    content.insertBefore(body, save);
  }

  function enable(modalId, closeFn) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const content = modal.querySelector('.modal-content');
    if (!content) return;

    ensureFlexLayout(content);

    if (content.dataset.swipeAttached === '1') return;
    content.dataset.swipeAttached = '1';

    content.style.transition = 'transform 0.22s ease-out';

    let startY = 0, startT = 0, dragging = false;

    // La zone qui déclenche le swipe : grip + modal-head (pas le body scrollable)
    const swipeHandles = [
      content.querySelector(':scope > .modal-grip'),
      content.querySelector(':scope > .modal-head')
    ].filter(Boolean);

    function start(e) {
      const t = e.touches ? e.touches[0] : e;
      startY = t.clientY;
      startT = performance.now();
      dragging = true;
      content.style.transition = 'none';
    }
    function move(e) {
      if (!dragging) return;
      const t = e.touches ? e.touches[0] : e;
      const dy = t.clientY - startY;
      if (dy < 0) {
        content.style.transform = '';
        return;
      }
      const max = window.innerHeight * MAX_DRAG_RATIO;
      const translate = Math.min(dy, max);
      content.style.transform = `translateY(${translate}px)`;
      if (e.cancelable) e.preventDefault();
    }
    function end(e) {
      if (!dragging) return;
      dragging = false;
      const t = (e.changedTouches && e.changedTouches[0]) || e;
      const dy = t.clientY - startY;
      const elapsed = Math.max(1, performance.now() - startT);
      const velocity = dy / elapsed;
      content.style.transition = 'transform 0.22s ease-out';
      if (dy > TRIGGER_DISTANCE || velocity > VELOCITY_THRESHOLD) {
        content.style.transform = `translateY(100%)`;
        setTimeout(() => {
          content.style.transform = '';
          try { closeFn && closeFn(); } catch (_) {}
        }, 200);
      } else {
        content.style.transform = '';
      }
    }

    swipeHandles.forEach(h => {
      h.addEventListener('touchstart', start, { passive: true });
      h.addEventListener('touchmove', move, { passive: false });
      h.addEventListener('touchend', end, { passive: true });
      h.addEventListener('touchcancel', () => { dragging = false; content.style.transform = ''; }, { passive: true });
    });

    // Fallback desktop : permettre fermer via souris sur la poignée (pas vital)
    const grip = content.querySelector(':scope > .modal-grip');
    if (grip) {
      grip.style.cursor = 'grab';
    }
  }

  // Passe sur toutes les .modal-content du document pour s'assurer que la structure flex
  // est appliquée même sur les modals où enable() n'a pas été appelé (edge case).
  function autoWrapAll() {
    document.querySelectorAll('.modal-content').forEach(ensureFlexLayout);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoWrapAll, { once: true });
  } else {
    autoWrapAll();
  }

  window.ModalSwipe = { enable, ensureFlexLayout, autoWrapAll };
})();
