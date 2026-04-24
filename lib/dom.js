// DOM helpers sans innerHTML - IIFE pour eviter collisions globales
(function () {
  function $el(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else if (v === false || v == null) continue;
      else el.setAttribute(k, v);
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      if (typeof child === 'string' || typeof child === 'number') {
        el.appendChild(document.createTextNode(String(child)));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    }
    return el;
  }

  function $clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function $replace(node, ...children) {
    $clear(node);
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
      else node.appendChild(c);
    }
  }

  window.Dom = { $el, $clear, $replace };

  // Protection supplémentaire contre le pinch zoom iOS Safari (standalone PWA).
  // touch-action CSS ne suffit pas toujours ; on annule aussi les events gesturestart/double-tap.
  // N'affecte pas le scroll à un doigt ni les inputs focusables.
  document.addEventListener('gesturestart', (e) => { e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturechange', (e) => { e.preventDefault(); }, { passive: false });
  document.addEventListener('gestureend', (e) => { e.preventDefault(); }, { passive: false });

  // Empêche le double-tap zoom (Safari iOS)
  let lastTap = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTap < 300 && e.touches.length === 0) {
      const tgt = e.target;
      // Autoriser le double-tap dans les inputs/textareas (sélection mot)
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) {
        lastTap = now;
        return;
      }
      e.preventDefault();
    }
    lastTap = now;
  }, { passive: false });
})();
