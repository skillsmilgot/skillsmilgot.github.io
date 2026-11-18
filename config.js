/*
 * הגדרות הטופס — זה הקובץ היחיד שצריך לערוך באתר.
 * אין כאן סודות: הכתובת של השרת ציבורית ממילא, והאבטחה נאכפת בשרת.
 */
window.SKILLS_CONFIG = {
  // כתובת ה-Web App של Google Apps Script (מסתיימת ב-/exec). ראו מדריך ההתקנה, שלב 4.
  apiUrl: 'https://script.google.com/macros/s/AKfycbyvAN-db5DoxBM0OWtsfdL4gFd6kiTqnrTdWiskKaFr0FLaXygP_qdFe0VqyyxU0Cv5uA/exec',

  // true = פס "גרסת הדגמה" בראש הטופס. להפעלה אמיתית: false
  demo: false,

  // לוגו: כרגע שם המכללה כטקסט. ללוגו רשמי — שמרו קובץ בתיקייה assets והגדירו src.
  logo: { src: '', alt: 'מכללת סקילס', text: 'מכללת סקילס' },

  // צבעי מותג — מציין מקום! יש להחליף בקודי הצבע הרשמיים מאתר המכללה.
  colors: { primary: '#1f3a5f', primaryDark: '#152a45', accent: '#e8eef6' },

  // פרטי פיקוח ורישוי — מוצגים בתחתית רק אם מולאו. אין להמציא מספרים.
  legal: { companyName: '', companyId: '', institutionCode: '', approvalType: '' },

  // לוגואים של גופים. מוצג רק לוגו עם approved: true (לאחר אישור הקשר והשימוש).
  // לדוגמה: { name: 'שם הגוף', src: 'assets/partners/body1.png', approved: false }
  partners: [],
  partnersDisclaimer: 'הצגת הלוגואים אינה מעידה כי הגופים מממנים את המלגה או מאשרים אותה.',

  // פרטיות
  privacy: {
    retentionText: '12 חודשים ממועד ההגשה',
    contactEmail: '',   // כתובת לפניות בנושא פרטיות
    updated: '17/11/2026',
  },

  // רכז/ת נגישות — חובה בהצהרת נגישות
  accessibility: { coordinatorName: '', phone: '', email: '', updated: '17/11/2026' },
};
