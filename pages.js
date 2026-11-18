/* מילוי ערכים מ-config.js בדפי הפרטיות והנגישות */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  const C = window.SKILLS_CONFIG || {};
  document.querySelectorAll('[data-fill]').forEach(function (el) {
    const v = el.getAttribute('data-fill').split('.').reduce(function (o, k) { return o && o[k]; }, C);
    if (v) { el.textContent = v; }
    else { el.textContent = el.getAttribute('data-fallback') || ''; if (el.getAttribute('data-fallback')) el.classList.add('placeholder-mark'); }
  });
});
