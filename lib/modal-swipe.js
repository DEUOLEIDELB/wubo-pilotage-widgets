// Swipe-to-close pour modals bottom-sheet style.
// Usage : ModalSwipe.enable(modalId, closeFn)
// Le helper attache handlers tactiles sur le modal-content qui détectent un swipe vers le bas.
(function () {
  const TRIGGER_DISTANCE = 120;   // pixels vers le bas pour déclencher close
  const MAX_DRAG_RATIO = 0.5;     // limite drag visuel à 50% hauteur écran
  const VELOCITY_THRESHOLD = 0.6; // px/ms : si vitesse > seuil, ferme même si distance < trigger

  function enable(modalId, closeFn) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const content = modal.querySelector('.modal-content');
    if (!content) return;
    if (content.dataset.swipeAttached === '1') return;
    content.dataset.swipeAttached = '1';

    // S'assure que le content est animable (transform)
    content.style.transition = 'transform 0.22s ease-out';

    let startY = 0;
    let startT = 0;
    let dragging = false;
    let scrollAtStart = 0;

    function start(e) {
      const t = e.touches ? e.touches[0] : e;
      // Ne pas commencer le drag si l'user démarre depuis un élément scrollable qui a encore du contenu à scroller
      if (content.scrollTop > 0) {
        dragging = false;
        return;
      }
      startY = t.clientY;
      startT = performance.now();
      dragging = true;
      scrollAtStart = content.scrollTop;
      content.style.transition = 'none';
    }
    function move(e) {
      if (!dragging) return;
      const t = e.touches ? e.touches[0] : e;
      const dy = t.clientY - startY;
      if (dy < 0) {
        // swipe vers le haut : on n'autorise pas (laisse le scroll natif reprendre)
        content.style.transform = '';
        return;
      }
      // Suit le doigt, capé à MAX_DRAG
      const max = window.innerHeight * MAX_DRAG_RATIO;
      const translate = Math.min(dy, max);
      content.style.transform = `translateY(${translate}px)`;
      // Empêche scroll pendant le drag
      e.preventDefault && e.preventDefault();
    }
    function end(e) {
      if (!dragging) return;
      dragging = false;
      const t = (e.changedTouches && e.changedTouches[0]) || e;
      const dy = t.clientY - startY;
      const elapsed = Math.max(1, performance.now() - startT);
      const velocity = dy / elapsed; // px/ms
      content.style.transition = 'transform 0.22s ease-out';
      if (dy > TRIGGER_DISTANCE || velocity > VELOCITY_THRESHOLD) {
        // Ferme : anime hors-écran puis appelle closeFn
        content.style.transform = `translateY(100%)`;
        setTimeout(() => {
          content.style.transform = '';
          try { closeFn && closeFn(); } catch (_) {}
        }, 200);
      } else {
        // Snap back
        content.style.transform = '';
      }
    }

    content.addEventListener('touchstart', start, { passive: true });
    content.addEventListener('touchmove', move, { passive: false });
    content.addEventListener('touchend', end, { passive: true });
    content.addEventListener('touchcancel', () => { dragging = false; content.style.transform = ''; }, { passive: true });

    // Ajoute une petite "poignée" visuelle en haut du content si pas déjà présente
    if (!content.querySelector('.modal-grip')) {
      const grip = document.createElement('div');
      grip.className = 'modal-grip';
      grip.setAttribute('aria-hidden', 'true');
      content.insertBefore(grip, content.firstChild);
    }
  }

  window.ModalSwipe = { enable };
})();
