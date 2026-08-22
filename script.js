document.addEventListener('DOMContentLoaded', () => {
  const reviewGrid = document.querySelector('.reviews-grid');
  const products = window.REVIEW_HUBS_PRODUCTS || [];

  if (reviewGrid && products.length) {
    reviewGrid.innerHTML = products.map((product) => {
      const stars = Array.from({ length: 5 }, (_, index) =>
        `<span class="${index < product.rating ? '' : 'star-off'}">&#9733;</span>`
      ).join('');
      const logo = `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(product.domain)}`;

      return `
        <article class="review-card">
          <div class="review-top">
            <div class="review-avatar local-avatar" aria-hidden="true">${product.avatar}</div>
            <div class="review-user">
              <h3>${product.reviewer}</h3>
              <div class="stars" aria-label="${product.rating} out of 5 stars">${stars}</div>
            </div>
          </div>
          <p>${product.review}</p>
          <div class="review-brand">
            <div class="review-brand-mark">
              <img src="${logo}" alt="${product.name} logo" data-fallback="${product.name.charAt(0)}" />
            </div>
            <div>
              <div class="review-brand-name">${product.name}</div>
              <div class="review-domain">${product.domain}</div>
            </div>
          </div>
        </article>`;
    }).join('');

    reviewGrid.querySelectorAll('.review-brand-mark img').forEach((image) => {
      image.addEventListener('error', () => {
        const mark = image.parentElement;
        mark.textContent = image.dataset.fallback;
        mark.classList.add('logo-fallback');
      }, { once: true });
    });
  }

  const buttons = document.querySelectorAll('button');

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      button.classList.add('pulse');
      setTimeout(() => button.classList.remove('pulse'), 180);
    });
  });

  document.querySelectorAll('.category-grid button').forEach((button) => {
    button.addEventListener('click', () => {
      const search = encodeURIComponent(button.textContent.trim());
      window.location.href = `products.html?search=${search}`;
    });
  });

  const copyCouponCode = async (code) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(code);
      return;
    }

    const field = document.createElement('textarea');
    field.value = code;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    document.execCommand('copy');
    field.remove();
  };

  document.querySelectorAll('[data-copy-code]').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.dataset.copyCode;
      try {
        await copyCouponCode(code);
        const original = button.textContent;
        button.textContent = '✓';
        setTimeout(() => { button.textContent = original; }, 1200);
      } catch {
        button.title = `Code: ${code}`;
      }
    });
  });

  document.querySelectorAll('[data-reveal-code]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      const code = button.dataset.revealCode;
      if (!code) return;

      button.textContent = code;
      button.classList.add('code-revealed');
      button.setAttribute('aria-label', `Coupon code ${code}. Click to copy again.`);

      try {
        await copyCouponCode(code);
        button.title = `${code} copied`;
      } catch {
        button.title = `Coupon code: ${code}`;
      }
    });
  });

  const normalizeStoreLabel = (value) => String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const faviconForDomain = (domain) => {
    const cleanDomain = String(domain || '')
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split(/[/?#]/)[0];
    return cleanDomain
      ? `https://www.google.com/s2/favicons?sz=256&domain=${encodeURIComponent(cleanDomain)}`
      : '';
  };

  const renderFeaturedStores = (stores, offers) => {
    const track = document.querySelector('#featured-brands-track');
    if (!track || !Array.isArray(stores) || !Array.isArray(offers)) return;

    const offersByStore = new Map();
    offers.forEach((offer) => {
      if (offer.storeId && !offersByStore.has(offer.storeId)) offersByStore.set(offer.storeId, offer);
    });

    const seenLabels = new Set();
    const activeStores = stores.reduce((result, store) => {
      const label = normalizeStoreLabel(store.name || store.slug);
      if (!label || seenLabels.has(label)) return result;

      const offer = offersByStore.get(store.id)
        || offers.find((item) => normalizeStoreLabel(item.brand) === label);
      if (!offer) return result;

      seenLabels.add(label);
      result.push({ store, offer });
      return result;
    }, []);

    if (!activeStores.length) return;

    const buildGroup = (isClone = false) => {
      const group = document.createElement('div');
      group.className = 'featured-brands-group';
      if (isClone) group.setAttribute('aria-hidden', 'true');

      activeStores.forEach(({ store, offer }) => {
        const name = String(store.name || offer.brand || 'Store').trim();
        const domain = store.domain || offer.domain || '';
        const fallbackLogo = faviconForDomain(domain);
        const params = new URLSearchParams({
          id: offer.id || '',
          brand: name,
          offer: offer.discount || '',
          domain,
        });
        const link = document.createElement('a');
        link.className = 'brand-card-item';
        link.href = `deal.html?${params.toString()}`;
        link.setAttribute('aria-label', `View ${name} coupons and deals`);
        if (isClone) link.tabIndex = -1;

        const image = document.createElement('img');
        image.src = store.logo || offer.logo || fallbackLogo;
        image.alt = isClone ? '' : `${name} logo`;
        image.loading = 'lazy';
        image.addEventListener('error', () => {
          if (fallbackLogo && image.src !== fallbackLogo) {
            image.src = fallbackLogo;
            return;
          }
          const fallback = document.createElement('span');
          fallback.className = 'brand-card-logo-fallback';
          fallback.textContent = name.charAt(0).toUpperCase();
          fallback.setAttribute('aria-hidden', 'true');
          image.replaceWith(fallback);
        });

        const label = document.createElement('span');
        label.textContent = name;
        link.append(image, label);
        group.appendChild(link);
      });

      return group;
    };

    track.replaceChildren(buildGroup(), buildGroup(true));
    track.style.animationDuration = `${Math.max(12, activeStores.length * 2.2)}s`;
  };

  // Keep homepage stores and coupon links in sync with the admin-managed API.
  Promise.all([
    fetch('/api/stores', { cache: 'no-store' }).then((response) => response.ok ? response.json() : []),
    fetch('/api/offers', { cache: 'no-store' }).then((response) => response.ok ? response.json() : []),
  ])
    .then(([stores, offers]) => {
      renderFeaturedStores(stores, offers);
      document.querySelectorAll('a[href^="deal.html?"]').forEach((link) => {
        const current = new URL(link.href, window.location.href);
        const brand = current.searchParams.get('brand') || '';
        const offer = offers.find((item) => normalizeStoreLabel(item.brand) === normalizeStoreLabel(brand));
        if (!offer) return;
        current.searchParams.set('id', offer.id);
        current.searchParams.set('offer', offer.discount || '');
        current.searchParams.set('domain', offer.domain || '');
        link.href = `${current.pathname.split('/').pop()}?${current.searchParams.toString()}`;
      });
    })
    .catch(() => {});
});
