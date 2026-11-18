/* טופס הלקוח: אימות במייל → הסבר → מילוי (24 שעות) → הגשה. כל הכללים נאכפים גם בשרת. */
(function () {
  'use strict';
  const { h, C } = window.Skills;
  const main = document.getElementById('main');
  const timerSlot = document.getElementById('timer-slot');

  const TITLE = 'בקשה למלגה ולסיוע בשכר לימוד — מכללת סקילס';
  const OPENING = 'מלאו את הפרטים והשאלון לצורך בחינת הבקשה. הבקשה תועבר לבחינת מכללת סקילס. התשובה וגובה הסיוע יימסרו באמצעות יועץ הלימודים. הגשת הבקשה אינה מחייבת הרשמה ואינה מבטיחה אישור.';
  const DETAILS_NOTICE = 'מצאת טעות בפרטים? בקש מיועץ הלימודים לעדכן אותם לפני השליחה.';

  // פלטפורמה: GitHub Pages (ברירת מחדל) או הגשה מתוך Google Apps Script (SKILLS_PLATFORM)
  const PLATFORM = window.SKILLS_PLATFORM || null;
  // האסימון נמצא אחרי # — חלק זה של הכתובת אינו נשלח לשום שרת ואינו נשמר ביומנים
  let token = '';
  let SESSION_KEY = '';
  let session = null;
  async function initToken() {
    token = PLATFORM && PLATFORM.getToken ? String(await PLATFORM.getToken() || '') : (location.hash || '');
    token = token.replace(/^#/, '').trim();
    SESSION_KEY = 'skills_sess_' + token.slice(0, 12);
    try { session = sessionStorage.getItem(SESSION_KEY); } catch (e) { /* */ }
  }
  let clockOffset = 0;
  let me = null;
  let answers = {};
  let timerHandle = null;
  const submitKey = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()).slice(2);

  function saveSession(s) { session = s; try { sessionStorage.setItem(SESSION_KEY, s); } catch (e) { /* */ } }
  function clearSession() { session = null; try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* */ } }

  // ───── תקשורת ─────
  async function api(action, data, { retries = 1 } = {}) {
    const body = JSON.stringify(Object.assign({ action, token, session }, data || {}));
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      try {
        // ללא Content-Type מותאם — מונע בקשת preflight מול Google Apps Script
        let json;
        if (PLATFORM && PLATFORM.call) json = await PLATFORM.call(body);
        else {
          const res = await fetch(C.apiUrl, { method: 'POST', body, redirect: 'follow', cache: 'no-store', credentials: 'omit' });
          json = await res.json();
        }
        if (json.serverNow) clockOffset = json.serverNow - Date.now();
        return json;
      } catch (e) { lastErr = e; if (i < retries) await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
    }
    const err = new Error('network'); err.network = true; err.cause = lastErr; throw err;
  }
  const NET_MSG = 'לא הצלחנו להתחבר. בדקו את החיבור לאינטרנט ונסו שוב. התשובות שכבר מילאת לא נמחקו.';

  // ───── מסכים כלליים ─────
  function show(...nodes) {
    main.replaceChildren(...nodes);
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  function header() { return [h('h1', null, TITLE), h('p', { class: 'lead' }, OPENING)]; }
  function message(title, text, kind) {
    stopTimer();
    show(h('section', { class: 'card', 'aria-labelledby': 'msg-title' },
      h('h1', { id: 'msg-title' }, title),
      h('p', { class: kind === 'ok' ? 'lead' : 'lead' }, text)));
  }
  function showExpired(msg) { clearSession(); message('תוקף הקישור הסתיים', msg || 'תוקף הקישור הסתיים. ניתן לפנות ליועץ הלימודים לחידושו.'); }
  function showInvalid() { message('הקישור אינו תקין', 'הקישור אינו תקין. ניתן לפנות ליועץ הלימודים.'); }
  function showSuccess(requestNo) {
    stopTimer(); clearSession();
    show(h('section', { class: 'card', 'aria-labelledby': 'ok-title' },
      h('h1', { id: 'ok-title' }, 'הבקשה שלך התקבלה'),
      h('p', { class: 'lead' }, 'מספר הבקשה שלך: ', h('span', { class: 'success-number' }, requestNo)),
      h('p', { class: 'lead' }, 'התשובה לבקשה תימסר באמצעות יועץ הלימודים.')));
  }
  function showNetError(retry) {
    show(h('section', { class: 'card' }, h('h1', null, 'תקלת תקשורת'),
      h('p', { class: 'lead' }, NET_MSG), h('button', { class: 'btn', type: 'button', onclick: retry }, 'ניסיון חוזר')));
  }

  // טיפול אחיד בתשובות שגיאה מהשרת
  function handleCommon(res) {
    if (res.ok) return false;
    if (res.code === 'invalid') { showInvalid(); return true; }
    if (res.code === 'expired') { showExpired(res.error); return true; }
    if (res.code === 'submitted') { showSuccess(res.requestNo); return true; }
    if (res.code === 'auth') { clearSession(); boot(); return true; }
    return false;
  }

  // ───── אתחול ─────
  async function boot() {
    if (!/^[a-f0-9]{64}$/.test(token)) return showInvalid();
    let res;
    try { res = await api('open', {}); } catch (e) { return showNetError(boot); }
    if (!res.ok) return handleCommon(res) || showInvalid();
    if (res.state === 'submitted') return showSuccess(res.requestNo);
    if (res.state === 'expired') return showExpired(res.message);
    if (res.state === 'authed') return loadMe();
    return showAuth(res.emailMasked);
  }

  // ───── אימות במייל ─────
  function showAuth(emailMasked) {
    const status = h('div', { role: 'status', 'aria-live': 'polite' });
    const errBox = h('div', { role: 'alert' });
    const codeInput = h('input', { id: 'otp', class: 'otp-input', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', pattern: '[0-9]*', 'aria-describedby': 'otp-help' });
    const verifyBtn = h('button', { class: 'btn', type: 'submit' }, 'אימות');
    const codeForm = h('form', { novalidate: true, hidden: true },
      h('label', { for: 'otp', class: 'q-label' }, 'קוד אימות'),
      h('p', { id: 'otp-help', class: 'hint' }, 'הקוד בן 6 ספרות ותקף ל־10 דקות. אם הוא לא הגיע, כדאי לבדוק גם בתיקיית הספאם.'),
      h('div', { class: 'otp-row' }, codeInput, verifyBtn),
      h('button', { class: 'btn-link', type: 'button', onclick: () => send(true) }, 'שליחת קוד חדש'));
    const sendBtn = h('button', { class: 'btn btn-lg', type: 'button', onclick: () => send(false) }, 'שליחת קוד אימות');

    async function send(again) {
      errBox.replaceChildren(); sendBtn.disabled = true;
      let res;
      try { res = await api('sendOtp', {}); } catch (e) { sendBtn.disabled = false; errBox.replaceChildren(h('div', { class: 'alert alert-error' }, NET_MSG)); return; }
      sendBtn.disabled = false;
      if (!res.ok) { if (handleCommon(res)) return; errBox.replaceChildren(h('div', { class: 'alert alert-error' }, res.error)); return; }
      if (res.state === 'submitted') return showSuccess(res.requestNo);
      sendBtn.hidden = true; codeForm.hidden = false;
      status.replaceChildren(h('div', { class: 'alert alert-ok' }, (again ? 'נשלח קוד חדש' : 'נשלח קוד אימות') + ' לכתובת ' + res.emailMasked + '.'));
      if (res.demoCode) status.append(h('div', { class: 'alert alert-demo' }, 'הדגמה בלבד — במצב אמיתי הקוד נשלח במייל. הקוד: ' + res.demoCode));
      codeInput.focus();
    }
    codeForm.addEventListener('submit', async (e) => {
      e.preventDefault(); errBox.replaceChildren();
      const code = codeInput.value.replace(/\D/g, '');
      if (code.length !== 6) { errBox.replaceChildren(h('div', { class: 'alert alert-error' }, 'יש להזין קוד בן 6 ספרות.')); codeInput.focus(); return; }
      verifyBtn.disabled = true;
      let res;
      try { res = await api('verifyOtp', { code }); } catch (err) { verifyBtn.disabled = false; errBox.replaceChildren(h('div', { class: 'alert alert-error' }, NET_MSG)); return; }
      verifyBtn.disabled = false;
      if (!res.ok) { if (handleCommon(res)) return; errBox.replaceChildren(h('div', { class: 'alert alert-error' }, res.error)); codeInput.select(); return; }
      saveSession(res.session);
      loadMe();
    });

    show(h('section', { class: 'card', 'aria-labelledby': 'auth-title' },
      h('h1', { id: 'auth-title' }, TITLE), h('p', { class: 'lead' }, OPENING),
      h('div', { class: 'info-box' },
        h('h2', null, 'אימות זהות'),
        h('p', null, 'לשמירה על פרטיותך, לפני הצגת הפרטים נשלח קוד אימות לכתובת הדוא״ל ', h('bdi', null, emailMasked), '.')),
      errBox, status, sendBtn, codeForm));
  }

  // ───── טעינת הבקשה ─────
  async function loadMe() {
    let res;
    try { res = await api('me', {}); } catch (e) { return showNetError(loadMe); }
    if (!res.ok) return handleCommon(res) || showInvalid();
    me = res;
    answers = Object.assign({}, res.draft || {}, answers); // תשובות שבזיכרון גוברות (למשל אחרי אימות מחדש)
    if (res.state === 'intro') showIntro(); else showForm();
  }

  function showIntro() {
    const btn = h('button', { class: 'btn btn-lg', type: 'button' }, 'התחלת מילוי הבקשה');
    const err = h('div', { role: 'alert' });
    btn.addEventListener('click', async () => {
      btn.disabled = true; err.replaceChildren();
      let res;
      try { res = await api('start', {}); } catch (e) { btn.disabled = false; err.replaceChildren(h('div', { class: 'alert alert-error' }, NET_MSG)); return; }
      if (!res.ok) { btn.disabled = false; if (!handleCommon(res)) err.replaceChildren(h('div', { class: 'alert alert-error' }, res.error)); return; }
      me.startedAt = res.startedAt; me.deadlineAt = res.deadlineAt; me.state = 'filling';
      showForm();
    });
    show(h('section', { class: 'card', 'aria-labelledby': 'intro-title' },
      h('h1', { id: 'intro-title' }, TITLE), h('p', { class: 'lead' }, OPENING),
      h('div', { class: 'info-box' },
        h('p', null, h('strong', null, 'הקישור למילוי הטופס פעיל למשך ' + me.fillHours + ' שעות מתחילת המילוי.')),
        h('p', null, 'הטופס כולל שלושה חלקים: פרטים אישיים, רקע ובקשת סיוע, ומטרות ומוכנות. המילוי נשמר אוטומטית, ואפשר לחזור אליו מאותו קישור עד לשליחה.')),
      err, btn));
  }

  // ───── שעון ─────
  function stopTimer() { if (timerHandle) clearInterval(timerHandle); timerHandle = null; timerSlot.replaceChildren(); }
  function fmtRemaining(ms) {
    if (ms <= 0) return 'הזמן הסתיים';
    const totalMin = Math.ceil(ms / 60000);
    const hrs = Math.floor(totalMin / 60), min = totalMin % 60;
    if (hrs === 0) return min + ' דקות';
    return hrs + ':' + String(min).padStart(2, '0') + ' שעות';
  }
  function startTimer(onExpire) {
    stopTimer();
    const value = h('span', { class: 'timer-value' });
    const announcer = h('span', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    const extBtn = h('button', { class: 'btn-link', type: 'button' }, me.extensionRequested ? 'בקשת ההארכה נשלחה' : 'בקשת הארכת זמן');
    if (me.extensionRequested) extBtn.disabled = true;
    extBtn.addEventListener('click', async () => {
      extBtn.disabled = true;
      try {
        const res = await api('requestExtension', {});
        if (!res.ok) { extBtn.disabled = false; handleCommon(res); return; }
        me.extensionRequested = true; extBtn.textContent = 'בקשת ההארכה נשלחה';
        announcer.textContent = 'בקשת ההארכה נשלחה ליועץ הלימודים.';
      } catch (e) { extBtn.disabled = false; announcer.textContent = NET_MSG; }
    });
    const saveState = h('span', { class: 'save-state', id: 'save-state' }, 'התשובות נשמרות אוטומטית');
    timerSlot.replaceChildren(h('div', { class: 'timer-bar' }, h('div', { class: 'inner' },
      h('span', null, 'זמן שנותר: ', value), extBtn, saveState, announcer)));
    const announced = {};
    const tick = () => {
      const left = me.deadlineAt - (Date.now() + clockOffset);
      value.textContent = fmtRemaining(left);
      [60, 15, 5].forEach((m) => { if (left <= m * 60000 && left > 0 && !announced[m]) { announced[m] = 1; announcer.textContent = 'נותרו ' + m + ' דקות למילוי הטופס.'; } });
      if (left <= 0) { stopTimer(); onExpire(); }
    };
    tick();
    timerHandle = setInterval(tick, 15000);
  }

  // ───── הטופס ─────
  const fieldErrors = {};
  function showForm() {
    const q = me.form;
    const byId = Object.fromEntries(q.questions.map((x) => [x.id, x]));
    const d = me.details;

    const fmtDate = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : s; };
    const addr = [d.street + ' ' + d.houseNo, d.apartment ? 'דירה ' + d.apartment : '', d.city].filter(Boolean).join(', ');
    const item = (label, value, ltr) => h('div', null, h('dt', null, label), h('dd', null, ltr ? h('bdi', { dir: 'ltr' }, value) : value));

    const detailsSection = h('section', { class: 'card', 'aria-labelledby': 's-personal' },
      h('h2', { id: 's-personal' }, 'פרטים אישיים'),
      h('dl', { class: 'details' },
        item('שם מלא', d.fullName), item('טלפון נייד', d.phone, true), item('כתובת דוא״ל', d.email, true),
        item('תעודת זהות', d.idNumber, true), item('תאריך לידה', fmtDate(d.birthDate), true), item('כתובת', addr),
        item('מסלול הלימודים', d.track)),
      h('p', { class: 'info-box small' }, DETAILS_NOTICE));

    const summary = h('div', { tabindex: '-1', id: 'error-summary' });
    const sections = q.sections.map((s) => h('section', { class: 'card', 'aria-labelledby': 's-' + s.id },
      h('h2', { id: 's-' + s.id }, s.title), s.questions.map((id) => renderQuestion(byId[id]))));

    const truth = h('input', { type: 'checkbox', id: 'confirmTruth', 'aria-describedby': 'err-confirmTruth' });
    const lock = h('input', { type: 'checkbox', id: 'confirmLock', 'aria-describedby': 'err-confirmLock' });
    const submitBtn = h('button', { class: 'btn btn-lg', type: 'submit' }, 'שליחת בקשה לבדיקת זכאות');
    const submitStatus = h('div', { role: 'status', 'aria-live': 'polite' });
    const P = C.privacy || {};
    const sendSection = h('section', { class: 'card', 'aria-labelledby': 's-send' },
      h('h2', { id: 's-send' }, 'אישור ושליחה'),
      h('div', { id: 'wrap-confirmTruth' },
        h('label', { class: 'confirm', for: 'confirmTruth' }, truth, h('span', null, 'אני מאשר/ת שהמידע שמסרתי נכון למיטב ידיעתי.')),
        h('div', { class: 'field-error', id: 'err-confirmTruth' })),
      h('div', { id: 'wrap-confirmLock' },
        h('label', { class: 'confirm', for: 'confirmLock' }, lock, h('span', null, 'ידוע לי שלאחר שליחת הבקשה, הבקשה למלגה ננעלת לשנה ממועד השליחה.')),
        h('div', { class: 'field-error', id: 'err-confirmLock' })),
      h('p', { class: 'small muted' },
        'המידע נאסף לצורך בחינת בקשתך למלגה ולסיוע בשכר לימוד בלבד, ונגיש לצוות מכללת סקילס המטפל בבקשות. המידע יישמר ' + (P.retentionText || 'לתקופה מוגדרת') + ' ולאחר מכן יימחק. ',
        h('a', { href: C.privacyUrl || 'privacy.html', target: '_blank', rel: 'noopener' }, 'למדיניות הפרטיות המלאה')),
      submitStatus, submitBtn);

    const form = h('form', { novalidate: true, 'aria-label': 'טופס בקשה למלגה' }, summary, detailsSection, sections, sendSection);
    form.addEventListener('input', onChange);
    form.addEventListener('change', onChange);
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(truth, lock, submitBtn, submitStatus, summary); });

    show(h('h1', { class: 'sr-only' }, TITLE), form);
    syncFollowUps(answers);
    startTimer(() => showExpired());
  }

  function errEl(id) { return h('div', { class: 'field-error', id: 'err-' + id }); }
  function renderQuestion(q) {
    const req = h('span', { class: 'req' }, ' (חובה)');
    const num = h('span', { class: 'q-num' }, q.num + '.');
    let node;
    if (q.type === 'text') {
      const ta = h('textarea', { id: q.id, name: q.id, maxlength: '3000', 'aria-required': 'true', 'aria-describedby': (q.hint ? 'hint-' + q.id + ' ' : '') + 'err-' + q.id });
      ta.value = answers[q.id] || '';
      node = h('div', { class: 'q', id: 'wrap-' + q.id },
        h('label', { class: 'q-label', for: q.id }, num, q.label, req),
        q.hint ? h('p', { class: 'hint', id: 'hint-' + q.id }, q.hint) : null, ta, errEl(q.id));
    } else {
      const multi = q.type === 'multi';
      const cur = answers[q.id];
      const choices = q.options.map(([value, label]) => {
        const input = h('input', { type: multi ? 'checkbox' : 'radio', name: q.id, value });
        input.checked = multi ? (cur || []).includes(value) : cur === value;
        return h('label', { class: 'choice' }, input, h('span', null, label));
      });
      node = h('fieldset', { class: 'q', id: 'wrap-' + q.id, 'aria-describedby': 'err-' + q.id, 'aria-required': 'true', role: multi ? 'group' : 'radiogroup' },
        h('legend', null, num, q.label, req),
        q.hint ? h('p', { class: 'hint' }, q.hint) : null,
        h('div', { class: 'choices-grid' }, choices), errEl(q.id));
      if (q.followUp) {
        const f = q.followUp;
        const field = f.multiline
          ? h('textarea', { id: f.id, name: f.id, maxlength: String(f.max), 'aria-describedby': 'err-' + f.id })
          : h('input', { type: 'text', id: f.id, name: f.id, maxlength: String(f.max), 'aria-describedby': 'err-' + f.id });
        field.value = answers[f.id] || '';
        if (f.required) field.setAttribute('aria-required', 'true');
        const wrap = h('div', { class: 'follow-up', id: 'wrap-' + f.id },
          h('label', { for: f.id }, f.label, f.required ? h('span', { class: 'req' }, ' (חובה)') : null), field, errEl(f.id));
        node.append(wrap);
      }
      if (q.note) node.append(h('p', { class: 'note' }, q.note));
    }
    return node;
  }

  function collect() {
    const a = {};
    for (const q of me.form.questions) {
      if (q.type === 'text') a[q.id] = (document.getElementById(q.id) || {}).value || '';
      else if (q.type === 'multi') a[q.id] = Array.from(document.querySelectorAll('input[name="' + q.id + '"]:checked')).map((i) => i.value);
      else { const c = document.querySelector('input[name="' + q.id + '"]:checked'); a[q.id] = c ? c.value : ''; }
      if (q.followUp) a[q.followUp.id] = (document.getElementById(q.followUp.id) || {}).value || '';
    }
    return a;
  }
  function followUpActive(q, a) {
    const v = a[q.id];
    return q.type === 'multi' ? (v || []).some((x) => q.followUp.when.includes(x)) : q.followUp.when.includes(v);
  }
  function syncFollowUps(a) {
    for (const q of me.form.questions) {
      if (!q.followUp) continue;
      const wrap = document.getElementById('wrap-' + q.followUp.id);
      if (wrap) wrap.hidden = !followUpActive(q, a);
    }
  }

  // שמירת טיוטה אוטומטית בשרת
  let saveTimer = null, saving = false, pending = false;
  function onChange(e) {
    answers = collect();
    syncFollowUps(answers);
    const id = e && e.target && (e.target.name || e.target.id);
    if (id && fieldErrors[id]) setError(id, ''); // השגיאה נעלמת ברגע שמתחילים לתקן
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 1500);
  }
  async function saveDraft() {
    if (saving) { pending = true; return; }
    saving = true;
    const st = document.getElementById('save-state');
    try {
      const res = await api('draft', { answers }, { retries: 0 });
      if (!res.ok) { handleCommon(res); }
      else if (st) st.textContent = 'נשמר אוטומטית ' + new Date(Date.now()).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { if (st) st.textContent = 'השמירה האוטומטית תנסה שוב'; pending = true; setTimeout(saveDraft, 8000); }
    saving = false;
    if (pending) { pending = false; clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 1500); }
  }

  function setError(id, msg) {
    fieldErrors[id] = msg || '';
    const el = document.getElementById('err-' + id);
    const wrap = document.getElementById('wrap-' + id);
    if (el) el.textContent = msg || '';
    if (wrap) wrap.classList.toggle('has-error', !!msg);
    const input = document.getElementById(id);
    if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function localValidate(a, truth, lock) {
    const e = {};
    for (const q of me.form.questions) {
      const v = a[q.id];
      if (q.type === 'multi' && !v.length) e[q.id] = 'יש לבחור לפחות אפשרות אחת.';
      if (q.type === 'single' && !v) e[q.id] = 'יש לבחור אפשרות.';
      if (q.type === 'text' && !v.trim()) e[q.id] = 'זהו שדה חובה. יש לכתוב תשובה.';
      if (q.followUp && q.followUp.required && followUpActive(q, a) && !String(a[q.followUp.id]).trim()) e[q.followUp.id] = 'זהו שדה חובה. יש למלא פירוט.';
    }
    if (!truth) e.confirmTruth = 'יש לאשר שהמידע נכון.';
    if (!lock) e.confirmLock = 'יש לאשר שידוע לך על נעילת הבקשה לשנה.';
    return e;
  }

  function showErrors(errors, summary) {
    Object.keys(fieldErrors).forEach((k) => setError(k, ''));
    const keys = Object.keys(errors);
    keys.forEach((k) => setError(k, errors[k]));
    if (!keys.length) { summary.replaceChildren(); return; }
    const labelFor = (k) => {
      const q = me.form.questions.find((x) => x.id === k || (x.followUp && x.followUp.id === k));
      if (k === 'confirmTruth') return 'אישור נכונות המידע';
      if (k === 'confirmLock') return 'אישור נעילת הבקשה לשנה';
      return q ? 'שאלה ' + q.num + (q.id !== k ? ' — ' + q.followUp.label : '') : k;
    };
    summary.replaceChildren(h('div', { class: 'alert alert-error', role: 'alert' },
      h('strong', null, 'יש להשלים ' + keys.length + ' שדות לפני השליחה:'),
      h('ul', null, keys.map((k) => h('li', null, h('a', { href: '#wrap-' + k, onclick: (ev) => {
        ev.preventDefault();
        const t = document.getElementById(k) || document.querySelector('#wrap-' + k + ' input');
        if (t) t.focus();
      } }, labelFor(k) + ': ' + errors[k]))))));
    summary.focus();
    summary.scrollIntoView({ block: 'start' });
  }

  let submitting = false;
  async function submit(truth, lock, btn, status, summary) {
    if (submitting) return; // מניעת לחיצה כפולה
    answers = collect();
    const errors = localValidate(answers, truth.checked, lock.checked);
    if (Object.keys(errors).length) return showErrors(errors, summary);
    showErrors({}, summary);
    submitting = true; btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'שולח…';
    status.replaceChildren();
    let res;
    try {
      res = await api('submit', { answers, confirmTruth: true, confirmLock: true, submitKey }, { retries: 2 });
    } catch (e) {
      submitting = false; btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = 'שליחת בקשה לבדיקת זכאות';
      status.replaceChildren(h('div', { class: 'alert alert-error', role: 'alert' }, 'השליחה לא הושלמה בגלל תקלת תקשורת. התשובות שלך לא נמחקו — אפשר ללחוץ שוב על כפתור השליחה. לחיצה חוזרת לא תיצור בקשה כפולה.'));
      return;
    }
    submitting = false; btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = 'שליחת בקשה לבדיקת זכאות';
    if (res.ok && res.state === 'submitted') return showSuccess(res.requestNo);
    if (handleCommon(res)) return;
    if (res.code === 'validation' && res.errors) return showErrors(res.errors, summary);
    status.replaceChildren(h('div', { class: 'alert alert-error', role: 'alert' }, res.error || 'אירעה תקלה. נסו שוב.'));
  }

  document.addEventListener('DOMContentLoaded', () => { initToken().then(boot, () => showInvalid()); });
  if (!PLATFORM) window.addEventListener('hashchange', () => location.reload());
})();
