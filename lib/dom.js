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
})();
