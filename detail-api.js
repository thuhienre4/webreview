document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get('id');
  const requestedBrand = params.get('brand') || 'Glorious Daily';
  const domains = { 'lovo': 'lovo.ai', 'lala ai': 'lala.ai', 'travelstart': 'travelstart.com', 'booking.com': 'booking.com', 'fluentcrm': 'fluentcrm.com', 'fluent booking': 'fluentbooking.com' };
  const offers = await fetch('/api/offers', { signal: AbortSignal.timeout(8000) }).then((response) => response.ok ? response.json() : []).catch(() => []);
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

  const brandHref = primary?.id ? `/go/${encodeURIComponent(primary.id)}` : (primary?.link || `https://${domain}`);
  const storeLogoLink = logo.closest('.store-logo');
  if (storeLogoLink) {
    storeLogoLink.href = brandHref;
    storeLogoLink.setAttribute('aria-label', `Visit the official ${brand} website`);
  }
  document.querySelectorAll('.shop-now').forEach((shopNow) => { shopNow.href = brandHref; });

  document.querySelector('[data-saving]').textContent = discount.toLowerCase();
  document.querySelector('[data-primary-title]').textContent = primary?.title || `${discount} at ${brand}`;
  document.querySelector('[data-primary-value]').textContent = discount.toLowerCase().includes('shipping') ? 'FREE' : discount.replace(/\s*off/i, '');
  const codeCount = document.querySelector('[data-code-count]');
  if (codeCount) codeCount.textContent = String(brandOffers.filter((item) => item.hasCode).length);
  document.title = `${brand} Coupons & Promo Codes | Review Hubs`;

  if (brandOffers.length) {
    document.querySelector('.coupon-list').innerHTML = brandOffers.map((item, index) => {
      const value = (item.discount || 'DEAL').replace(/\s*off/i, '');
      const isTopPick = Boolean(item.featured);
      const canRevealCode = isTopPick && item.hasCode;
      const badges = isTopPick
        ? '<span>★ STAFF PICK</span><span class="dark">🔥 TOP PICK</span>'
        : '<span>✓ VERIFIED</span>';
      const actionLabel = canRevealCode ? 'Get Code' : 'Get Deal';
      const action = isTopPick
        ? `<span class="top-code-main">${actionLabel}</span><span class="top-code-peek">••</span>`
        : actionLabel;
      return `<article class="coupon-card" data-kind="${escapeHtml(item.type)}">
        <div class="coupon-value"><small>${item.type === 'code' ? 'UP TO' : 'ACTIVE'}</small><strong>${escapeHtml(value)}</strong><span>${/off/i.test(item.discount) ? 'OFF' : 'DEAL'}</span></div>
        <div class="coupon-copy"><h3>${escapeHtml(item.title)}</h3><div class="coupon-badges">${badges}</div><p>✓ ${8 + index} hours ago &nbsp; ♟ ${2315 + index} Uses</p><div class="verified">◉ Verified recently</div></div>
        <button class="get-code${isTopPick ? ' top-code' : ''}" type="button" data-offer-id="${escapeHtml(item.id)}" data-has-code="${canRevealCode ? 'true' : 'false'}">${action}</button>
      </article>`;
    }).join('');
  }

  const filters = document.querySelectorAll('[data-filter]');
  filters.forEach((filter) => filter.addEventListener('click', () => {
    filters.forEach((button) => button.classList.remove('active'));
    filter.classList.add('active');
    document.querySelectorAll('.coupon-card').forEach((card) => {
      card.hidden = filter.dataset.filter !== 'all' && card.dataset.kind !== filter.dataset.filter;
    });
  }));

  const modal = document.querySelector('.code-modal');
  const codeOutput = document.querySelector('.revealed-code');
  const copyButton = document.querySelector('.copy-code');
  let activeOfferId = '';
  const close = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  };

  document.querySelector('.coupon-list').addEventListener('click', async (event) => {
    const button = event.target.closest('.get-code');
    if (!button) return;
    const id = button.dataset.offerId;
    if (!id) {
      codeOutput.textContent = button.dataset.code || 'Check store';
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      return;
    }
    if (button.dataset.hasCode !== 'true') {
      window.location.href = `/go/${encodeURIComponent(id)}`;
      return;
    }

    button.disabled = true;
    try {
      const response = await fetch(`/api/offers/${encodeURIComponent(id)}/code`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Code unavailable');
      activeOfferId = id;
      codeOutput.textContent = result.code;
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    } catch (error) {
      alert(error.message);
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('.modal-close').addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(codeOutput.textContent);
      copyButton.textContent = 'Copied! Open Store';
      if (activeOfferId) window.open(`/go/${encodeURIComponent(activeOfferId)}`, '_blank', 'noopener');
      setTimeout(() => { copyButton.textContent = 'Copy Code'; }, 1800);
    } catch {
      copyButton.textContent = 'Select and copy the code above';
    }
  });
});
