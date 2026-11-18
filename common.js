/* רכיבים משותפים: בניית DOM בטוחה, מיתוג, תחתית וסרגל נגישות. */
(function () {
  'use strict';
  const C = window.SKILLS_CONFIG || {};

  // יצירת אלמנטים — טקסט תמיד כ-textContent, ללא HTML
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function applyBranding() {
    const col = C.colors || {};
    const root = document.documentElement.style;
    if (col.primary) root.setProperty('--primary', col.primary);
    if (col.primaryDark) root.setProperty('--primary-dark', col.primaryDark);
    if (col.accent) root.setProperty('--accent', col.accent);
    const logo = document.getElementById('site-logo');
    if (logo && C.logo && C.logo.src) { logo.src = C.logo.src; logo.alt = C.logo.alt || 'מכללת סקילס'; }
    else if (logo) { logo.replaceWith(h('span', { class: 'wordmark' }, (C.logo && C.logo.text) || 'מכללת סקילס')); }
    if (C.demo) {
      document.body.prepend(h('div', { class: 'demo-banner', role: 'note' }, C.demoText || 'גרסת הדגמה — נתונים פיקטיביים בלבד. אין להזין מידע אמיתי.'));
    }
  }

  function renderFooter() {
    const f = document.getElementById('site-footer');
    if (!f) return;
    const inner = h('div', { class: 'inner' });
    const approved = (C.partners || []).filter((p) => p && p.approved && p.src);
    if (approved.length) {
      inner.append(h('div', { class: 'partners', role: 'list', 'aria-label': 'לוגואים' },
        approved.map((p) => h('div', { role: 'listitem' }, h('img', { src: p.src, alt: p.name || '' })))));
      if (C.partnersDisclaimer) inner.append(h('p', { class: 'legal small' }, C.partnersDisclaimer));
    } else if (C.demo) {
      inner.append(h('div', { class: 'partners', 'aria-label': 'מציין מקום ללוגואים' },
        h('span', { class: 'partner-placeholder' }, 'מציין מקום — לוגואים יוצגו רק לאחר אישור שימוש')));
    }
    const L = C.legal || {};
    const legalParts = [];
    if (L.companyName) legalParts.push(L.companyName);
    if (L.companyId) legalParts.push('ח״פ ' + L.companyId);
    if (L.institutionCode) legalParts.push('סמל מוסד ' + L.institutionCode);
    if (L.approvalType) legalParts.push(L.approvalType);
    if (legalParts.length) inner.append(h('p', { class: 'legal' }, legalParts.join(' · ')));
    inner.append(h('nav', { class: 'footer-links', 'aria-label': 'קישורים' },
      h('a', { href: C.privacyUrl || 'privacy.html', target: '_blank', rel: 'noopener' }, 'מדיניות פרטיות'),
      h('a', { href: C.accessibilityUrl || 'accessibility.html', target: '_blank', rel: 'noopener' }, 'הצהרת נגישות')));
    f.append(inner);
  }

  // ───── סרגל נגישות ─────
  const A11Y_KEY = 'skills_a11y_prefs';
  const OPTIONS = [
    ['contrast', 'ניגודיות גבוהה'], ['links', 'הדגשת קישורים'], ['font', 'גופן קריא'], ['still', 'עצירת אנימציות'],
  ];
  function loadPrefs() { try { return JSON.parse(localStorage.getItem(A11Y_KEY) || '{}'); } catch (e) { return {}; } }
  function savePrefs(p) { try { localStorage.setItem(A11Y_KEY, JSON.stringify(p)); } catch (e) { /* אחסון חסום */ } }
  function applyPrefs(p) {
    const html = document.documentElement;
    OPTIONS.forEach(([k]) => html.classList.toggle('a11y-' + k, !!p[k]));
    html.style.setProperty('--scale', String(p.scale || 1));
  }

  function buildA11y() {
    let prefs = loadPrefs();
    applyPrefs(prefs);
    const panelId = 'a11y-panel';
    const toggle = h('button', { type: 'button', class: 'a11y-toggle', 'aria-expanded': 'false', 'aria-controls': panelId, 'aria-label': 'תפריט נגישות' });
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="4" r="2" fill="currentColor"/><path fill="currentColor" d="M20 8.5c-2.6.6-5.3.9-8 .9s-5.4-.3-8-.9l-.5 1.9c2.1.5 4.3.8 6.5 1v3.2L8.3 21l1.9.7L12 16.3l1.8 5.4 1.9-.7-1.7-6.4v-3.2c2.2-.2 4.4-.5 6.5-1z"/></svg>';
    const status = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    const buttons = OPTIONS.map(([k, label]) => {
      const b = h('button', { type: 'button', 'aria-pressed': prefs[k] ? 'true' : 'false' }, label);
      b.addEventListener('click', () => {
        prefs[k] = !prefs[k]; b.setAttribute('aria-pressed', prefs[k] ? 'true' : 'false');
        applyPrefs(prefs); savePrefs(prefs); status.textContent = label + (prefs[k] ? ' הופעל' : ' בוטל');
      });
      return b;
    });
    const sizeBtn = (label, delta) => h('button', { type: 'button', onclick: () => {
      prefs.scale = Math.min(1.6, Math.max(0.9, Math.round(((prefs.scale || 1) + delta) * 10) / 10));
      applyPrefs(prefs); savePrefs(prefs); status.textContent = 'גודל טקסט ' + Math.round(prefs.scale * 100) + '%';
    } }, label);
    const reset = h('button', { type: 'button', onclick: () => {
      prefs = {}; applyPrefs(prefs); savePrefs(prefs);
      buttons.forEach((b) => b.setAttribute('aria-pressed', 'false')); status.textContent = 'הגדרות הנגישות אופסו';
    } }, 'איפוס');
    const closeBtn = h('button', { type: 'button', onclick: () => close() }, 'סגירה');
    const panel = h('div', { class: 'a11y-panel', id: panelId, role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'a11y-title', hidden: true },
      h('h2', { id: 'a11y-title' }, 'התאמות נגישות'),
      h('div', { class: 'grid' }, sizeBtn('הגדלת טקסט', 0.1), sizeBtn('הקטנת טקסט', -0.1), buttons, reset, closeBtn),
      h('div', { class: 'a11y-foot' }, h('a', { href: C.accessibilityUrl || 'accessibility.html', target: '_blank', rel: 'noopener' }, 'הצהרת נגישות')),
      status);
    function open() { panel.hidden = false; toggle.setAttribute('aria-expanded', 'true'); panel.querySelector('button').focus(); }
    function close() { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); }
    toggle.addEventListener('click', () => (panel.hidden ? open() : close()));
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.body.append(toggle, panel);
  }

  window.Skills = { h, C, applyBranding, renderFooter, buildA11y };
  document.addEventListener('DOMContentLoaded', () => { applyBranding(); renderFooter(); buildA11y(); });
})();
