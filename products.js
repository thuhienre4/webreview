document.addEventListener('DOMContentLoaded', () => {
  const input = document.querySelector('#product-search');
  const headerInput = document.querySelector('#header-product-search');
  const sort = document.querySelector('#product-sort');
  const grid = document.querySelector('#product-grid');
  const filters = [...document.querySelectorAll('[data-category]')];
  const cards = [...document.querySelectorAll('.product-card')];
  const empty = document.querySelector('.products-empty');
  let category = 'all';

  const initialSearch = new URLSearchParams(window.location.search).get('search');
  if (initialSearch && headerInput) headerInput.value = initialSearch;

  const update = () => {
    const query = (headerInput?.value || input?.value || '').trim().toLowerCase();
    let visible = 0;
    cards.forEach((card) => {
      const categoryMatch = category === 'all' || card.dataset.category.split(' ').includes(category);
      const searchMatch = !query || card.dataset.search.includes(query) || card.textContent.toLowerCase().includes(query);
      card.hidden = !(categoryMatch && searchMatch);
      if (!card.hidden) visible += 1;
    });
    empty.hidden = visible !== 0;
  };

  filters.forEach((button) => button.addEventListener('click', () => {
    category = button.dataset.category;
    filters.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    update();
  }));
  headerInput?.addEventListener('input', update);
  input?.addEventListener('input', update);
  sort?.addEventListener('change', () => {
    const sorted = [...cards].sort((a, b) => {
      if (sort.value === 'name') return a.querySelector('h2').textContent.localeCompare(b.querySelector('h2').textContent);
      if (sort.value === 'reviews') {
        const reviews = (card) => Number((card.querySelector('.product-rating small').textContent.match(/[\d,]+/)?.[0] || '0').replaceAll(',', ''));
        return reviews(b) - reviews(a);
      }
      return Number(b.querySelector('.product-rating strong').textContent) - Number(a.querySelector('.product-rating strong').textContent);
    });
    sorted.forEach((card) => grid.append(card));
  });
  update();
});
