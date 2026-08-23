document.addEventListener('DOMContentLoaded', async () => {
  const carousel = document.querySelector('#coupon-carousel');
  const previous = document.querySelector('.carousel-arrow.prev');
  const next = document.querySelector('.carousel-arrow.next');
  const dots = document.querySelector('.coupon-dots');
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const offers = await fetch('/api/offers', { signal: AbortSignal.timeout(8000) }).then((response) => response.ok ? response.json() : []).catch(() => []);
  const dealUrl = (offer) => `deal.html?id=${encodeURIComponent(offer.id)}&brand=${encodeURIComponent(offer.brand)}&offer=${encodeURIComponent(offer.discount)}&domain=${encodeURIComponent(offer.domain || '')}`;
  const logoUrl = (offer) => offer.logo || `https://www.google.com/s2/favicons?sz=256&domain=${encodeURIComponent(offer.domain || '')}`;

  if (offers.length) {
    const featured = offers.filter((offer) => offer.featured).slice(0, 8);
    const carouselOffers = featured.length ? featured : offers.slice(0, 8);
    carousel.innerHTML = carouselOffers.map((offer) => `
      <a class="feature-coupon" href="${dealUrl(offer)}">
        <img src="${escapeHtml(logoUrl(offer))}" alt="${escapeHtml(offer.brand)} logo" />
        <small>${escapeHtml(offer.brand)}</small><h2>${escapeHtml(offer.title)}</h2>
      </a>`).join('');

    const brandStrip = document.querySelector('.coupon-brand-strip');
    if (brandStrip) brandStrip.innerHTML = offers.slice(0, 6).map((offer) => `
      <a href="${dealUrl(offer)}"><img src="${escapeHtml(logoUrl(offer))}" alt="${escapeHtml(offer.brand)}" />
      <span>${escapeHtml(offer.brand)}</span><strong>${escapeHtml(offer.discount)}</strong></a>`).join('');

    const trending = document.querySelector('.trending-list');
    if (trending) trending.innerHTML = offers.slice(0, 10).map((offer) => {
      const discountParts = String(offer.discount || 'Deal').split(/\s+/);
      return `<article class="trending-row"><img src="${escapeHtml(logoUrl(offer))}" alt="${escapeHtml(offer.brand)}" />
        <div class="discount"><strong>${escapeHtml(discountParts[0])}</strong><span>${escapeHtml(discountParts.slice(1).join(' ') || 'DEAL')}</span></div>
        <div class="trend-copy"><h3>${escapeHtml(offer.title)}</h3><a href="products.html?search=${encodeURIComponent(offer.brand)}">${escapeHtml(offer.brand)}</a></div>
        <a class="trend-button" href="${dealUrl(offer)}">${offer.hasCode ? 'Get Code' : 'Get Deal'}</a></article>`;
    }).join('');
  }

  const originalCards = [...carousel.querySelectorAll('.feature-coupon')];
  const originalCount = originalCards.length;
  let paused = false;
  let lastFrame = 0;
  let resumeTimer;
  originalCards.forEach((card) => { const clone = card.cloneNode(true); clone.setAttribute('aria-hidden', 'true'); clone.setAttribute('tabindex', '-1'); carousel.append(clone); });
  const cardStep = () => { const card = carousel.querySelector('.feature-coupon'); const gap = Number.parseFloat(getComputedStyle(carousel).columnGap) || 0; return card ? card.getBoundingClientRect().width + gap : 0; };
  const pauseBriefly = () => { paused = true; clearTimeout(resumeTimer); resumeTimer = window.setTimeout(() => { paused = false; }, 1100); };
  originalCards.forEach((_, index) => { const dot = document.createElement('button'); dot.type = 'button'; dot.setAttribute('aria-label', `Show coupon ${index + 1}`); dot.addEventListener('click', () => { carousel.scrollTo({ left: cardStep() * index, behavior: 'smooth' }); pauseBriefly(); }); dots.append(dot); });
  const paintDots = () => { if (!originalCount || !cardStep()) return; const index = Math.floor((carousel.scrollLeft + cardStep() * .45) / cardStep()) % originalCount; [...dots.children].forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === index)); };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animate = (time) => { if (!lastFrame) lastFrame = time; const delta = Math.min(time - lastFrame, 40); lastFrame = time; if (!paused && !document.hidden && originalCount > 1) { carousel.scrollLeft += delta * .075; const loopWidth = cardStep() * originalCount; if (loopWidth && carousel.scrollLeft >= loopWidth) carousel.scrollLeft -= loopWidth; } paintDots(); window.requestAnimationFrame(animate); };
  previous?.addEventListener('click', () => { carousel.scrollBy({ left: -cardStep(), behavior: 'smooth' }); pauseBriefly(); });
  next?.addEventListener('click', () => { carousel.scrollBy({ left: cardStep(), behavior: 'smooth' }); pauseBriefly(); });
  carousel.addEventListener('pointerdown', () => { paused = true; });
  carousel.addEventListener('pointerup', pauseBriefly);
  carousel.addEventListener('pointercancel', pauseBriefly);
  paintDots();
  if (!reduceMotion && originalCount > 1) window.requestAnimationFrame(animate);
});
