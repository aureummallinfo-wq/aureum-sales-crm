/* Aureum CRM shared table pagination — no network calls or data storage. */
(function attachPagination(global) {
  'use strict';
  const SIZES = Object.freeze([10, 25, 50, 100]);
  const DEFAULT_SIZE = 25;
  function asInt(value, fallback) {
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= 0 ? n : fallback;
  }
  function escapeText(value) {
    return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  }
  function normalizeMeta(value = {}) {
    const pageSize = SIZES.includes(asInt(value.pageSize, 0)) ? Number(value.pageSize) : DEFAULT_SIZE;
    const total = asInt(value.total, 0);
    const totalPages = Math.ceil(total / pageSize);
    const requested = asInt(value.page, 1);
    const page = Math.max(1, Math.min(totalPages || 1, requested));
    return { page, pageSize, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 && totalPages > 0 };
  }
  function pageWindow(meta, width = 5) {
    const max = meta.totalPages;
    if (max < 1) return [];
    const count = Math.min(width, max);
    const first = Math.max(1, Math.min(max - count + 1, meta.page - Math.floor(count / 2)));
    return Array.from({ length: count }, (_, i) => first + i);
  }
  function pageQuery(meta, filters = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value != null && String(value) !== '') params.set(key, String(value));
    }
    params.set('page', String(meta.page));
    params.set('pageSize', String(meta.pageSize));
    return params.toString();
  }
  function render(metaValue, key, { busy = false } = {}) {
    const meta = normalizeMeta(metaValue);
    const prefix = escapeText(key);
    const start = meta.total ? (meta.page - 1) * meta.pageSize + 1 : 0;
    const end = Math.min(meta.page * meta.pageSize, meta.total);
    const control = (label, dest, disabled, opts = '') => `<button type="button" class="aureum-page-btn" data-aureum-page="${dest}" ${disabled ? 'disabled' : ''} ${opts}>${label}</button>`;
    const sizes = SIZES.map(size => `<option value="${size}" ${size === meta.pageSize ? 'selected' : ''}>${size}</option>`).join('');
    const numbers = pageWindow(meta).map(page => control(String(page), page, false, `aria-label="Go to page ${page}" ${page === meta.page ? 'aria-current="page"' : ''}`)).join('');
    return `<nav class="aureum-pagination" aria-label="${prefix} pagination" data-aureum-pagination="${prefix}" ${busy ? 'aria-busy="true"' : ''}>
      <div class="aureum-pagination-info" aria-live="polite">Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${meta.total.toLocaleString()} records</div>
      <label class="aureum-pagination-size">Rows per page <select data-aureum-page-size aria-label="Rows per page">${sizes}</select></label>
      <div class="aureum-pagination-actions" aria-label="Page navigation">
      ${control('«', 1, meta.page <= 1 || !!busy, 'aria-label="First page"')}
      ${control('‹ Previous', meta.page - 1, meta.page <= 1 || !!busy, 'aria-label="Previous page"')}
      ${numbers}
      ${control('Next ›', meta.page + 1, meta.page >= meta.totalPages || !!busy, 'aria-label="Next page"')}
      ${control('»', meta.totalPages, meta.page >= meta.totalPages || !!busy, 'aria-label="Last page"')}
      </div>
      <form class="aureum-pagination-jump" data-aureum-jump><label>Go to page <input inputmode="numeric" type="number" name="page" min="1" max="${Math.max(1, meta.totalPages)}" value="${meta.page}" required aria-label="Go to page number"></label><button type="submit" ${busy || meta.totalPages < 1 ? 'disabled' : ''}>Go</button><span>of ${meta.totalPages}</span></form>
    </nav>`;
  }
  /**
   * Page host is a stable parent element of the pager. onChange receives
   * {page,pageSize}, and the caller must request a fresh server-side page.
   * Returns a remove-listeners cleanup function.
   */
  function attach(host, key, getMeta, onChange) {
    if (!host || typeof host.addEventListener !== 'function') throw new TypeError('Pager host is required');
    if (typeof getMeta !== 'function' || typeof onChange !== 'function') throw new TypeError('Pager callbacks required');
    function source(target) { return target?.closest?.(`[data-aureum-pagination="${key}"]`); }
    function click(event) {
      const button = event.target.closest?.('[data-aureum-page]');
      if (!button || button.disabled || !source(button)) return;
      const meta = normalizeMeta(getMeta());
      const page = Number(button.dataset.aureumPage);
      if (Number.isSafeInteger(page) && page >= 1 && page <= meta.totalPages && page !== meta.page) onChange({ page, pageSize: meta.pageSize });
    }
    function change(event) {
      const select = event.target.closest?.('[data-aureum-page-size]');
      if (!select || !source(select)) return;
      const size = Number(select.value);
      if (SIZES.includes(size) && size !== normalizeMeta(getMeta()).pageSize) onChange({ page: 1, pageSize: size });
    }
    function submit(event) {
      const form = event.target.closest?.('[data-aureum-jump]');
      if (!form || !source(form)) return;
      event.preventDefault();
      const meta = normalizeMeta(getMeta());
      const page = Number(new FormData(form).get('page'));
      if (!Number.isSafeInteger(page) || page < 1 || page > meta.totalPages) {
        const input = form.querySelector('input[name="page"]');
        input?.setCustomValidity('Enter a page between 1 and ' + meta.totalPages);
        input?.reportValidity();
        input?.addEventListener('input', () => input.setCustomValidity(''), { once: true });
        return;
      }
      if (page !== meta.page) onChange({ page, pageSize: meta.pageSize });
    }
    host.addEventListener('click', click);
    host.addEventListener('change', change);
    host.addEventListener('submit', submit);
    return () => { host.removeEventListener('click', click); host.removeEventListener('change', change); host.removeEventListener('submit', submit); };
  }
  const api = { SIZES, DEFAULT_SIZE, normalizeMeta, pageWindow, pageQuery, render, attach };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.AureumPagination = api;
}(typeof window === 'object' ? window : undefined));
