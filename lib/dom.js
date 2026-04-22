// Helpers DOM pour widgets Wubo Pilotage
// Evite innerHTML avec donnees non escapees

function $el(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
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

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function $replace(node, ...children) {
  clearNode(node);
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
    else node.appendChild(c);
  }
}

function gristTableToRows(table) {
  return table.id.map((id, i) => {
    const row = { id };
    Object.keys(table).forEach(col => { row[col] = table[col][i]; });
    return row;
  });
}

function gristDateToISO(val) {
  if (!val) return null;
  if (typeof val === 'number') return new Date(val * 1000).toISOString().split('T')[0];
  if (typeof val === 'string') return val.split('T')[0];
  return null;
}

function gristDateToDate(val) {
  if (!val) return null;
  if (typeof val === 'number') return new Date(val * 1000);
  return new Date(val);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function refListIds(val) {
  if (Array.isArray(val) && val[0] === 'L') return val.slice(1);
  return [];
}
