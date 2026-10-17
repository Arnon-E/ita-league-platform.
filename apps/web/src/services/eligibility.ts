/**
 * Minimum age by competition section, from the federation's own regulations:
 *  - MASTERS (seniors circuit): "men and women from age 18 up to 90+, in 5-year categories"; under 18 only through a special
 *    open category set up ad hoc (תקנון סניורים / נהלי תחרויות סניורים 2022, section 5.1).
 *  - ADULTS (Israel adult championship): "open to registered players, boys from age 14 and girls from age 13 on competition day"
 *    (אליפות ישראל לבוגרים 2021, section 1.1.1).
 * Youth competitions keep using each category's own birth-year limits. A staff member can still register someone below the floor
 * (the "open" category exception), a parent or player cannot.
 */
export type Section = 'YOUTH' | 'ADULTS' | 'MASTERS' | 'OTHER';

export function minAgeFor(section: string | null | undefined, gender: 'MALE' | 'FEMALE' | 'OPEN'): number | null {
  if (section === 'MASTERS') return 18;
  if (section === 'ADULTS') return gender === 'FEMALE' ? 13 : 14;
  return null;
}

/** Age in whole years on a given day. */
export function ageOn(birth: Date, day: Date): number {
  let a = day.getUTCFullYear() - birth.getUTCFullYear();
  const m = day.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && day.getUTCDate() < birth.getUTCDate())) a--;
  return a;
}

/** Why a player may not enter a category of this competition, or null when they may. Gender and birth-year limits plus the section's minimum age. */
export function ineligibleReason(
  p: { gender: 'MALE' | 'FEMALE' | 'OPEN'; birthDate: Date },
  c: { gender: 'MALE' | 'FEMALE' | 'OPEN'; minBirthYear: number | null; maxBirthYear: number | null },
  t: { section: string | null; startDate: Date },
  opts: { ignoreSectionFloor?: boolean } = {},
): string | null {
  if (c.gender !== 'OPEN' && c.gender !== p.gender) return 'הקטגוריה אינה מתאימה למין השחקן';
  const by = p.birthDate.getUTCFullYear();
  if ((c.minBirthYear && by < c.minBirthYear) || (c.maxBirthYear && by > c.maxBirthYear)) return 'שנת הלידה אינה מתאימה לקטגוריה';
  const min = minAgeFor(t.section, p.gender);
  if (!opts.ignoreSectionFloor && min && ageOn(p.birthDate, t.startDate) < min) {
    return t.section === 'MASTERS' ? `תחרות מאסטרס (סניורים) מגיל ${min}` : `תחרות בוגרים מגיל ${min}`;
  }
  return null;
}

/** The birth-year ceiling a category effectively has, so clients that only know birth years do not offer it to someone too young. */
export function effectiveMaxBirthYear(c: { gender: 'MALE' | 'FEMALE' | 'OPEN'; maxBirthYear: number | null }, t: { section: string | null; startDate: Date }): number | null {
  const min = minAgeFor(t.section, c.gender);
  if (!min) return c.maxBirthYear;
  const ceiling = t.startDate.getUTCFullYear() - min;
  return c.maxBirthYear == null ? ceiling : Math.min(c.maxBirthYear, ceiling);
}
