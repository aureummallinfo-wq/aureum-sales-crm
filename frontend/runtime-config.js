(() => {
  // Production UI deployments on Vercel use the VPS API and its PostgreSQL
  // database. Preview hosts remain same-origin so they cannot touch production.
  const vpsFrontendHosts = new Set([
    'aureum-sales-crm.vercel.app',
    'aureum-sales-crm-frontend.vercel.app',
    'aureum-sales-crm-aureummallinfo-6133.vercel.app',
    'aureum-sales-crm-frontend-aureummallinfo-6133.vercel.app',
    'aureum-sales-crm-git-main-aureummallinfo-6133.vercel.app',
    'aureum-sales-crm-frontend-git-main-aureummallinfo-6133.vercel.app'
  ]);
  const isVpsBackedVercelHost = vpsFrontendHosts.has(window.location.hostname);
  window.__AUREUM_API_BASE_URL__ = window.__AUREUM_API_BASE_URL__ || (isVpsBackedVercelHost ? 'https://crm.aureummall.info' : '');
})();
