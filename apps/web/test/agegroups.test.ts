import { describe, expect, it } from 'vitest';
import { inAgeGroup } from '@/services/public';

describe('junior age groups', () => {
  const asOf = new Date('2026-10-06');
  it('uses calendar-year age and includes everyone younger', () => {
    expect(inAgeGroup(new Date('2012-12-31'), 14, asOf)).toBe(true);  // turns 14 this year
    expect(inAgeGroup(new Date('2011-01-01'), 14, asOf)).toBe(false); // turns 15 this year
    expect(inAgeGroup(new Date('2016-05-05'), 14, asOf)).toBe(true);  // younger players may play up
    expect(inAgeGroup(new Date('2008-03-03'), 18, asOf)).toBe(true);
    expect(inAgeGroup(new Date('2007-03-03'), 18, asOf)).toBe(false);
  });
  it('no group means everyone', () => {
    expect(inAgeGroup(new Date('1980-01-01'), undefined, asOf)).toBe(true);
  });
});
