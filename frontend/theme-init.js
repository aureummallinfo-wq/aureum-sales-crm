(function () {
  try {
    var saved = JSON.parse(localStorage.getItem('aureum.crm.preferences.v1') || '{}');
    var theme = ['light', 'dark', 'system'].includes(saved.theme) ? saved.theme : 'light';
    var dark = theme === 'dark' || (theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (_) {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.colorScheme = 'light';
  }
}());
