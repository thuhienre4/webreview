document.addEventListener('DOMContentLoaded', () => {
  const carousel = document.querySelector('#coupon-carousel');
  const previous = document.querySelector('.carousel-arrow.prev');
  const next = document.querySelector('.carousel-arrow.next');
  const dots = document.querySelector('.coupon-dots');
  const originalCards = [...carousel.querySelectorAll('.feature-coupon')];
  const originalCount = originalCards.length;
  let paused = false;
  let lastFrame = 0;
  let resumeTimer;

  originalCards.forEach((card) => {
    const clone = card.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('tabindex', '-1');
    carousel.append(clone);
  });

  const cardStep = () => {
    const card = carousel.querySelector('.feature-coupon');
    const gap = Number.parseFloat(getComputedStyle(carousel).columnGap) || 0;
    return card.getBoundingClientRect().width + gap;
  };

  originalCards.forEach((_, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.setAttribute('aria-label', `Show coupon ${index + 1}`);
    dot.addEventListener('click', () => {
      carousel.scrollTo({ left: cardStep() * index, behavior: 'smooth' });
      pauseBriefly();
    });
    dots.append(dot);
  });

  const paintDots = () => {
    const index = Math.floor((carousel.scrollLeft + cardStep() * .45) / cardStep()) % originalCount;
    [...dots.children].forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === index));
  };

  const pauseBriefly = () => {
    paused = true;
    clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(() => { paused = false; }, 1100);
  };

  const animate = (time) => {
    if (!lastFrame) lastFrame = time;
    const delta = Math.min(time - lastFrame, 40);
    lastFrame = time;

    if (!paused && !document.hidden) {
      carousel.scrollLeft += delta * .075;
      const loopWidth = cardStep() * originalCount;
      if (carousel.scrollLeft >= loopWidth) carousel.scrollLeft -= loopWidth;
    }
    paintDots();
    window.requestAnimationFrame(animate);
  };

  previous.addEventListener('click', () => {
    carousel.scrollBy({ left: -cardStep(), behavior: 'smooth' });
    pauseBriefly();
  });
  next.addEventListener('click', () => {
    carousel.scrollBy({ left: cardStep(), behavior: 'smooth' });
    pauseBriefly();
  });
  carousel.addEventListener('pointerdown', () => { paused = true; });
  carousel.addEventListener('pointerup', pauseBriefly);
  carousel.addEventListener('pointercancel', pauseBriefly);
  paintDots();
  window.requestAnimationFrame(animate);

  const toast = document.querySelector('.coupon-code-toast');
  const code = toast.querySelector('strong');
  document.querySelectorAll('.reveal-code').forEach((button) => button.addEventListener('click', () => {
    code.textContent = button.dataset.code;
    toast.classList.add('open');
  }));
  toast.querySelector('button').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
      toast.querySelector('button').textContent = 'Copied!';
    } catch {
      toast.querySelector('button').textContent = 'Copy manually';
    }
  });
});
