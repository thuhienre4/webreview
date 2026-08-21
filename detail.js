document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const brand = params.get('brand') || 'Glorious Daily';
  const offer = params.get('offer') || '20% Off';
  const brandDomains = {
    'lovo': 'lovo.ai',
    'lala ai': 'lala.ai',
    'travelstart': 'travelstart.com',
    'booking.com': 'booking.com',
    'fluentcrm': 'fluentcrm.com',
    'fluent booking': 'fluentbooking.com'
  };
  const domain = params.get('domain') || brandDomains[brand.toLowerCase()] || `${brand.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`;
  const initials = brand
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  document.querySelectorAll('[data-brand]').forEach((node) => {
    node.textContent = brand;
  });

  const logoImage = document.querySelector('[data-logo-image]');
  logoImage.src = `https://www.google.com/s2/favicons?sz=256&domain=${encodeURIComponent(domain)}`;
  logoImage.alt = `${brand} logo`;
  document.querySelector('[data-saving]').textContent = offer.toLowerCase();
  document.querySelector('[data-primary-title]').textContent = `${offer} at ${brand}`;
  document.querySelector('[data-primary-value]').textContent = offer.toLowerCase().includes('shipping')
    ? 'FREE'
    : offer.replace(/\s*off/i, '');
  document.title = `${brand} Coupons & Promo Codes | Review Hubs`;

  const filters = document.querySelectorAll('[data-filter]');
  const cards = document.querySelectorAll('.coupon-card');

  filters.forEach((filter) => {
    filter.addEventListener('click', () => {
      filters.forEach((button) => button.classList.remove('active'));
      filter.classList.add('active');
      const kind = filter.dataset.filter;
      cards.forEach((card) => {
        card.hidden = kind !== 'all' && card.dataset.kind !== kind;
      });
    });
  });

  const modal = document.querySelector('.code-modal');
  const revealedCode = document.querySelector('.revealed-code');
  const copyButton = document.querySelector('.copy-code');

  const closeModal = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  };

  document.querySelectorAll('.get-code').forEach((button) => {
    button.addEventListener('click', () => {
      revealedCode.textContent = button.dataset.code;
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    });
  });

  document.querySelector('.modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });

  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(revealedCode.textContent);
      copyButton.textContent = 'Copied!';
      setTimeout(() => { copyButton.textContent = 'Copy Code'; }, 1400);
    } catch {
      copyButton.textContent = 'Select and copy the code above';
    }
  });
});
