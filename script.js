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

  document.querySelectorAll('[data-copy-code]').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.dataset.copyCode;
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
        else {
          const field = document.createElement('textarea');
          field.value = code;
          field.style.position = 'fixed';
          field.style.opacity = '0';
          document.body.appendChild(field);
          field.select();
          document.execCommand('copy');
          field.remove();
        }
        const original = button.textContent;
        button.textContent = '✓';
        setTimeout(() => { button.textContent = original; }, 1200);
      } catch {
        button.title = `Code: ${code}`;
      }
    });
  });

  // Keep homepage coupon links in sync with the admin-managed API.
  fetch('/api/offers', { cache: 'no-store' })
    .then((response) => response.ok ? response.json() : [])
    .then((offers) => {
      document.querySelectorAll('a[href^="deal.html?"]').forEach((link) => {
        const current = new URL(link.href, window.location.href);
        const brand = current.searchParams.get('brand') || '';
        const offer = offers.find((item) => item.brand.toLowerCase() === brand.toLowerCase());
        if (!offer) return;
        current.searchParams.set('id', offer.id);
        current.searchParams.set('offer', offer.discount || '');
        current.searchParams.set('domain', offer.domain || '');
        link.href = `${current.pathname.split('/').pop()}?${current.searchParams.toString()}`;
      });
    })
    .catch(() => {});
});
