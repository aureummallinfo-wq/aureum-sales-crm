(function installLeadSearchFocusGuard(root) {
  if (!root || root.__aureumLeadSearchFocusGuard) return;
  const render = root.render;
  if (typeof render !== 'function' || !root.AureumSearch) return;

  root.render = function guardedRender(...args) {
    const active = document.activeElement;
    const snapshot = active?.matches?.('[data-leads-search]')
      ? root.AureumSearch.capture(active)
      : null;
    const result = render.apply(this, args);
    if (snapshot) root.AureumSearch.restore('[data-leads-search]', snapshot);
    return result;
  };
  root.__aureumLeadSearchFocusGuard = true;
}(typeof window === 'object' ? window : globalThis));
