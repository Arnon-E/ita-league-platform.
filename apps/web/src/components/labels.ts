export const STATUS: Record<string, [string, string]> = {
  DRAFT: ['טיוטה', ''], REGISTRATION_OPEN: ['הרשמה פתוחה', 'ok'], REGISTRATION_CLOSED: ['הרשמה סגורה', 'warn'],
  DRAWN: ['הוגרל', 'lime'], IN_PROGRESS: ['מתנהלת', 'lime'], FINISHED: ['הסתיימה', ''], CANCELLED: ['בוטלה', 'bad'], PLANNED: ['מתוכננת', ''],
};
export const NEXT: Record<string, [string, string][]> = {
  DRAFT: [['REGISTRATION_OPEN', 'פתיחת הרשמה']],
  REGISTRATION_OPEN: [['REGISTRATION_CLOSED', 'סגירת הרשמה']],
  REGISTRATION_CLOSED: [['REGISTRATION_OPEN', 'פתיחה מחדש']],
  DRAWN: [['IN_PROGRESS', 'תחילת תחרות']],
  IN_PROGRESS: [['FINISHED', 'סיום תחרות']],
  CANCELLED: [['DRAFT', 'שחזור תחרות']],
};
/** Points tables as people read them (the keys are internal). */
export const POINTS_TABLE_LABEL: Record<string, string> = { NATIONAL_GRADE1: 'ארצית דרגה א׳ (עד 1000 נקודות)', NATIONAL_GRADE2: 'ארצית דרגה ב׳ (עד 750 נקודות)' };
export const LEVEL: Record<string, string> = { NATIONAL: 'ארצית', REGIONAL: 'אזורית', INTERNATIONAL: 'בינלאומית', CIRCUIT: 'סבב', LEAGUE: 'ליגה' };
export const FORMAT: Record<string, string> = { KNOCKOUT: 'הדחה', GROUPS_KNOCKOUT: 'בתים + הדחה', ROUND_ROBIN: 'ליגה (כולם נגד כולם)' };
export const GENDER: Record<string, string> = { MALE: 'בנים/גברים', FEMALE: 'בנות/נשים', OPEN: 'פתוח' };
export const MSTATUS: Record<string, string> = { SCHEDULED: 'טרם שוחק', COMPLETED: 'הסתיים', WALKOVER: 'ווק-אובר', RETIRED: 'פרישה', VOID: 'בוטל' };
/** Dates are shown in Israel time on the server too, so a tournament never ends "a day earlier" in one place than another. */
export const fmtDate = (d: Date) => d.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
export const fmtTime = (d: Date | null) => d ? d.toLocaleString('he-IL', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) : '—';

/** Set scores always read left to right (6-4 3-2), even inside right-to-left pages. */
export const fmtScore = (sets: { a: number; b: number }[], sep = ' ') => `\u2066${sets.map((x) => `${x.a}-${x.b}`).join(sep)}\u2069`;

export const ENTRY_STATUS: Record<string, [string, string]> = { PENDING: ['ממתין לאישור', 'warn'], CONFIRMED: ['מאושר', 'ok'], WAITLIST: ['ברשימת המתנה', 'warn'], WITHDRAWN: ['בוטל', ''], REJECTED: ['נדחה', 'bad'] };
export const PAY_STATUS: Record<string, [string, string]> = { UNPAID: ['לא שולם', 'warn'], PAID: ['שולם', 'ok'], REFUNDED: ['הוחזר', ''], PARTIALLY_REFUNDED: ['הוחזר חלקית', ''] };
