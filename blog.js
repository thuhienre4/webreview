document.addEventListener('DOMContentLoaded', () => {
  const searchForm = document.querySelector('#company-search');
  const searchInput = searchForm.querySelector('input');
  const topicButtons = [...document.querySelectorAll('[data-topic]')];
  const empty = document.querySelector('.stories-empty');

  const filterStories = (term) => {
    const query = term.trim().toLowerCase();
    let count = 0;
    document.querySelectorAll('.story-card').forEach((card) => {
      const match = !query || card.dataset.topics.includes(query) || card.textContent.toLowerCase().includes(query);
      card.hidden = !match;
      if (match) count += 1;
    });
    empty.hidden = count !== 0;
    document.querySelector('.latest-stories').scrollIntoView({ behavior: 'smooth' });
  };

  searchForm.addEventListener('submit', (event) => { event.preventDefault(); filterStories(searchInput.value); });
  topicButtons.forEach((button) => button.addEventListener('click', () => {
    topicButtons.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    searchInput.value = button.dataset.topic;
    filterStories(button.dataset.topic);
  }));

  const escapeHtml = (input) => String(input || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const imageMarkup = (post, featured = false) => {
    const photo = post.image ? `<img class="product-shot" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.brand || post.title)} official image" loading="lazy">` : '';
    const badge = post.brand ? `<span class="story-brand-badge"><strong>${escapeHtml(post.brand)}</strong></span>` : '';
    return `<div class="story-image brand-story${photo ? ' has-product-shot' : ''}">${featured ? '<span>EDITOR\'S PICK</span>' : ''}${photo}${badge}</div>`;
  };
  const cardMarkup = (post, featured = false) => {
    const topics = [post.brand, post.category, post.title].filter(Boolean).join(' ').toLowerCase();
    const copy = `<small>${escapeHtml(post.category || 'Review')}</small><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.excerpt)}</p><a href="/">Explore ${escapeHtml(post.brand || 'story')} &rarr;</a>`;
    return featured
      ? `${imageMarkup(post, true)}<div class="story-copy">${copy}</div>`
      : `<article class="small-story story-card" data-topics="${escapeHtml(topics)}">${imageMarkup(post)}<div>${copy}</div></article>`;
  };
  fetch('/api/blog')
    .then((response) => response.ok ? response.json() : Promise.reject())
    .then((posts) => {
      if (!Array.isArray(posts) || !posts.length) return;
      const featured = posts.find((post) => post.featured) || posts[0];
      const featuredRoot = document.querySelector('.featured-story');
      featuredRoot.dataset.topics = [featured.brand, featured.category, featured.title].filter(Boolean).join(' ').toLowerCase();
      featuredRoot.innerHTML = cardMarkup(featured, true);
      document.querySelector('.story-grid').innerHTML = posts
        .filter((post) => post.id !== featured.id)
        .map((post) => cardMarkup(post))
        .join('');
    })
    .catch(() => {});
});
