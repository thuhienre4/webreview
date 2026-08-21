document.addEventListener('DOMContentLoaded', () => {
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
});
