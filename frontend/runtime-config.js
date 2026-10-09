(() => {
  const localHosts = new Set(['localhost', '127.0.0.1']);
  const configuredApiBase = window.__AUREUM_API_BASE_URL__ || '';
  window.__AUREUM_API_BASE_URL__ = configuredApiBase || (localHosts.has(window.location.hostname) ? '' : 'https://aureum-sales-crm.vercel.app');
})();
