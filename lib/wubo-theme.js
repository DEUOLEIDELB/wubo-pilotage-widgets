// Wubo Theme : gestion du mode clair/sombre/auto.
// Persiste le choix en localStorage. Synchronise <meta name="theme-color">
// avec --bg pour la barre OS iOS/Android (status bar et bottom safe-area).
//
// Usage :
//   WuboTheme.apply()                  // applique au boot (depuis localStorage ou auto)
//   WuboTheme.set('dark'|'light'|'auto') // change et persiste
//   WuboTheme.get()                    // -> 'auto' | 'light' | 'dark'
//   WuboTheme.effective()              // -> 'light' | 'dark' (resolu, ce que l'OS verra)
//
// IMPORTANT : pour eviter le flash de couleurs claires au chargement,
// chaque widget appelle WuboTheme.apply() en INLINE script dans <head>
// AVANT le link CSS. Ce fichier doit etre charge a ce moment-la.
(function () {
  const STORAGE_KEY = 'wubo_theme';
  const VALID = ['auto', 'light', 'dark'];

  function get() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return VALID.includes(v) ? v : 'auto';
    } catch (_) { return 'auto'; }
  }

  function effective() {
    const t = get();
    if (t === 'light' || t === 'dark') return t;
    // auto : suit prefers-color-scheme
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
  }

  function syncMetaThemeColor() {
    // Lit la valeur calculee de --theme-color (qui change selon dark/light)
    // et l'applique au meta theme-color (barre OS).
    const cs = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim();
    if (!cs) return;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', cs);
  }

  function apply() {
    const t = get();
    document.documentElement.setAttribute('data-theme', t);
    // Sync apres le prochain repaint pour que --theme-color ait la bonne valeur
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(syncMetaThemeColor);
    } else {
      setTimeout(syncMetaThemeColor, 0);
    }
  }

  function set(theme) {
    if (!VALID.includes(theme)) return;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
    apply();
    // Notifie les composants qui veulent reagir (ex: profile menu re-render)
    window.dispatchEvent(new CustomEvent('wubo-theme-change', { detail: { theme, effective: effective() } }));
  }

  // Si l'OS change de preference (auto -> dark/light system), reapplique si on est en mode auto
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (get() === 'auto') { apply(); } };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  }

  // Sync cross-tab : si un autre widget change le theme, on s'aligne
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) apply();
  });

  // Application immediate (le plus tot possible pour eviter FOUC clair->sombre)
  apply();

  window.WuboTheme = { get, set, apply, effective };
})();
