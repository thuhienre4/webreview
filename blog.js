document.addEventListener('DOMContentLoaded', () => {
  const searchForm = document.querySelector('#company-search');
  const searchInput = searchForm.querySelector('input');
  const topicButtons = [...document.querySelectorAll('[data-topic]')];
  const cards = [...document.querySelectorAll('.story-card')];
  const empty = document.querySelector('.stories-empty');

  const filterStories = (term) => {
    const query = term.trim().toLowerCase();
    let count = 0;
    cards.forEach((card) => {
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
});
