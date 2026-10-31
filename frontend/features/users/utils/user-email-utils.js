(function attachAureumUserEmail(global) {
  function normalizeNamePart(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function derive(fullName, domain = 'aureum.com') {
    const firstName = String(fullName || '').trim().split(/\s+/)[0] || '';
    const localPart = normalizeNamePart(firstName);
    const host = String(domain || 'aureum.com').trim().toLowerCase();
    return localPart && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? `${localPart}@${host}` : '';
  }

  global.AureumUserEmail = { derive, normalizeNamePart };
})(window);
