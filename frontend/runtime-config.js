(() => {
  // Vercel deploys the app and its API together. Keep previews on their own
  // backend; a separately hosted frontend can supply an explicit API override.
  window.__AUREUM_API_BASE_URL__ = window.__AUREUM_API_BASE_URL__ || '';
})();
