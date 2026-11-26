(function installSearchFocusGuard(root) {
  if (!root || root.__aureumSearchFocusGuard) return;
  const render = root.render;
  if (typeof render !== 'function' || !root.AureumSearch) return;

  const searchSelectors = [
    '[data-leads-search]',
    '[data-lead-search]',
    '[data-customer-module-search]',
    '[data-customer-search]',
    '[data-followup-module-search]',
    '[data-followup-search]',
    '[data-task-search]',
    '[data-meta-intake-search]',
    '[data-global-search]',
    '[data-search]',
    '[data-agent-search]',
    '[data-chat-search]',
    '[data-users-search]'
  ];

  root.render = function guardedRender(...args) {
    const active = document.activeElement;
    const selector = searchSelectors.find(item => active?.matches?.(item));
    const snapshot = selector ? root.AureumSearch.capture(active) : null;
    const result = render.apply(this, args);
    if (selector && snapshot) root.AureumSearch.restore(selector, snapshot);
    return result;
  };
  root.__aureumSearchFocusGuard = true;
}(typeof window === 'object' ? window : globalThis));
