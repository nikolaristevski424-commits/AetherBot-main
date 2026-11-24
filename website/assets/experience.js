/* Aether motion enhancements for feature and guide cards. */
(() => {
  'use strict';
  // Motion stays one-shot and nonessential; layout remains readable when JS is off.
  document.querySelectorAll('.feature-card,.guide-step,.guide-choice').forEach((element,index)=>{
    element.style.setProperty('--aether-enter-delay',Math.min(index%4*70,280)+'ms');
  });
  // Scoped spotlight motion: moves just one CSS gradient per pointer frame,
  // not dozens of elements, and only when the user has not reduced motion.
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia?.('(pointer: fine)').matches;
  if (!reducedMotion && finePointer) {
    const cards = document.querySelectorAll('.feature-card,.guide-choice');
    cards.forEach(card => {
      let frame = 0;
      let x = 50, y = 50;
      card.addEventListener('pointermove', event => {
        const rect = card.getBoundingClientRect();
        x = Math.min(100, Math.max(0, (event.clientX - rect.left) / rect.width * 100));
        y = Math.min(100, Math.max(0, (event.clientY - rect.top) / rect.height * 100));
        if (!frame) frame = requestAnimationFrame(() => {
          card.style.setProperty('--pointer-x', x + '%');
          card.style.setProperty('--pointer-y', y + '%');
          frame = 0;
        });
      }, { passive:true });
      card.addEventListener('pointerleave', () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        card.style.removeProperty('--pointer-x');
        card.style.removeProperty('--pointer-y');
      });
    });
  }
})();
