document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get('id');
  const requestedBrand = params.get('brand') || 'Glorious Daily';
  const domains = { 'lovo': 'lovo.ai', 'lala ai': 'lala.ai', 'travelstart': 'travelstart.com', 'booking.com': 'booking.com', 'fluentcrm': 'fluentcrm.com', 'fluent booking': 'fluentbooking.com' };
  const offers = await fetch('/api/offers', { cache: 'no-store' }).then((response) => response.ok ? response.json() : []).catch(() => []);
  const primary = offers.find((item) => item.id === requestedId) || offers.find((item) => item.brand.toLowerCase() === requestedBrand.toLowerCase());
  const brand = primary?.brand || requestedBrand;
  const discount = primary?.discount || params.get('offer') || '20% Off';
  const domain = primary?.domain || params.get('domain') || domains[brand.toLowerCase()] || `${brand.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`;
  const brandOffers = offers.filter((item) => item.brand.toLowerCase() === brand.toLowerCase());
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  document.querySelectorAll('[data-brand]').forEach((node) => { node.textContent = brand; });
  const logo = document.querySelector('[data-logo-image]');
  logo.src = primary?.logo || `https://www.google.com/s2/favicons?sz=256&domain=${encodeURIComponent(domain)}`;
  logo.alt = `${brand} logo`;
  document.querySelector('[data-saving]').textContent = discount.toLowerCase();
  document.querySelector('[data-primary-title]').textContent = primary?.title || `${discount} at ${brand}`;
  document.querySelector('[data-primary-value]').textContent = discount.toLowerCase().includes('shipping') ? 'FREE' : discount.replace(/\s*off/i, '');
  document.title = `${brand} Coupons & Promo Codes | Review Hubs`;

  if (brandOffers.length) {
    document.querySelector('.coupon-list').innerHTML = brandOffers.map((item, index) => {
      const value = (item.discount || 'DEAL').replace(/\s*off/i, '');
      return `<article class="coupon-card" data-kind="${escapeHtml(item.type)}">
        <div class="coupon-value"><small>${item.type === 'code' ? 'UP TO' : 'ACTIVE'}</small><strong>${escapeHtml(value)}</strong><span>${/off/i.test(item.discount) ? 'OFF' : 'DEAL'}</span></div>
        <div class="coupon-copy"><h3>${escapeHtml(item.title)}</h3><div class="coupon-badges">${index === 0 ? '<span>⭐ STAFF PICK</span><span class="dark">🔥 TOP PICK</span>' : '<span>✓ VERIFIED</span>'}</div><p>${escapeHtml(item.description || 'Current promotion from this store.')}</p><div class="verified">✓ Verified offer</div></div>
        <button class="get-code${index === 0 ? ' top-code' : ''}" type="button" data-offer-id="${escapeHtml(item.id)}" data-has-code="${item.hasCode ? 'true' : 'false'}">${item.hasCode ? '<span class="top-code-main">Get Code</span><span class="top-code-peek">••</span>' : 'Get Deal'}</button>
      </article>`;
    }).join('');
  }

  const filters = document.querySelectorAll('[data-filter]');
  filters.forEach((filter) => filter.addEventListener('click', () => {
    filters.forEach((button) => button.classList.remove('active')); filter.classList.add('active');
    document.querySelectorAll('.coupon-card').forEach((card) => { card.hidden = filter.dataset.filter !== 'all' && card.dataset.kind !== filter.dataset.filter; });
  }));

  const modal = document.querySelector('.code-modal');
  const codeOutput = document.querySelector('.revealed-code');
  const copyButton = document.querySelector('.copy-code');
  let activeOfferId = '';
  const close = () => { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); };
  document.querySelector('.coupon-list').addEventListener('click', async (event) => {
    const button = event.target.closest('.get-code'); if (!button) return;
    const id = button.dataset.offerId;
    if (!id) { codeOutput.textContent = button.dataset.code || 'Check store'; modal.classList.add('open'); return; }
    if (button.dataset.hasCode !== 'true') { window.location.href = `/go/${encodeURIComponent(id)}`; return; }
    button.disabled = true;
    try {
      const response = await fetch(`/api/offers/${encodeURIComponent(id)}/code`, { cache: 'no-store' });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Code unavailable');
      activeOfferId = id; codeOutput.textContent = result.code; modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
    } catch (error) { alert(error.message); } finally { button.disabled = false; }
  });
  document.querySelector('.modal-close').addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  copyButton.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(codeOutput.textContent); copyButton.textContent = 'Copied! Open Store'; if (activeOfferId) window.open(`/go/${encodeURIComponent(activeOfferId)}`, '_blank', 'noopener'); setTimeout(() => { copyButton.textContent = 'Copy Code'; }, 1800); }
    catch { copyButton.textContent = 'Select and copy the code above'; }
  });
});
