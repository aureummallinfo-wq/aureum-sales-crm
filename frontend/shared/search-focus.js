(function (root) {
  function resolve(targetOrSelector) {
    if (!targetOrSelector) return null;
    if (typeof targetOrSelector === 'string') return document.querySelector(targetOrSelector);
    return targetOrSelector instanceof Element ? targetOrSelector : null;
  }

  function capture(targetOrSelector) {
    const input = resolve(targetOrSelector);
    if (!input) return null;
    return {
      selectionStart: Number.isFinite(input.selectionStart) ? input.selectionStart : input.value.length,
      selectionEnd: Number.isFinite(input.selectionEnd) ? input.selectionEnd : input.value.length,
      selectionDirection: input.selectionDirection || 'none'
    };
  }

  function restore(targetOrSelector, snapshot) {
    const input = resolve(targetOrSelector);
    if (!input || !snapshot) return;
    input.focus({ preventScroll: true });
    const max = input.value.length;
    const start = Math.max(0, Math.min(max, snapshot.selectionStart ?? max));
    const end = Math.max(start, Math.min(max, snapshot.selectionEnd ?? start));
    input.setSelectionRange(start, end, snapshot.selectionDirection || 'none');
  }

  root.AureumSearch = Object.freeze({ capture, restore });
}(typeof window === 'object' ? window : globalThis));
