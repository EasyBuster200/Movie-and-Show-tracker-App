// Applies the active profile's theme and accent colour (Settings > Appearance) to <html>
// before the page paints. Loaded as a plain, non-deferred script right after the stylesheets,
// so it can't use profiles.js (deferred) - it reads the same localStorage keys directly.
// tokens.css defines both themes (data-theme="dark"/"light") and every accent palette; picking
// an accent repoints the --accent* tokens at that palette.
(function () {
  function readActiveProfile() {
    try {
      const id = localStorage.getItem('tvtc_active_profile_id');
      const profiles = JSON.parse(localStorage.getItem('tvtc_profiles')) || [];
      return profiles.find(p => p.id === id) || null;
    } catch (error) {
      return null;
    }
  }

  const ACCENT_TOKENS = { '--accent': '', '--accent-hover': '-hover', '--accent-text': '-text', '--accent-subtle': '-subtle', '--on-accent': '-on', '--accent-mark': '-mark' };
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function applyTheme(prefs) {
    const root = document.documentElement;
    const choice = (prefs && prefs.theme) || 'dark';
    const theme = choice === 'system' ? (media && media.matches ? 'light' : 'dark') : choice;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const accent = (prefs && prefs.accent) || 'burgundy';
    Object.keys(ACCENT_TOKENS).forEach(token => {
      root.style.setProperty(token, `var(--${accent}${ACCENT_TOKENS[token]})`);
    });
  }

  // Settings calls this after a change; a "Match device" theme also follows the phone live.
  window.applyProfileTheme = function () {
    const profile = readActiveProfile();
    applyTheme(profile && profile.prefs);
  };
  if (media && media.addEventListener) media.addEventListener('change', window.applyProfileTheme);
  window.applyProfileTheme();
})();
