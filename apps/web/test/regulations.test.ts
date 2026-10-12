import { beforeAll, describe, expect, it } from 'vitest';
import { db, schema } from '@/db';
import { resetDb } from './helpers';
import { importRegulations, validateRegulationsImport } from '@/services/regulations';

beforeAll(resetDb);

describe('regulations list', () => {
  it('accepts only links to the federation site, replaces the list and drops removed documents', async () => {
    const first = validateRegulationsImport({
      kind: 'regulations',
      items: [
        { title: 'תקנון האיגוד', url: 'https://ita.co.il/wp-content/uploads/a.pdf', category: 'תקנוני האיגוד', sort: 1 },
        { title: 'נהלי נוער', url: 'https://ita.co.il/wp-content/uploads/b.pdf', category: 'נוער', sort: 2 },
        { title: 'זדוני', url: 'https://evil.example/x.pdf', category: 'אחר', sort: 3 },
        { title: 'כפול', url: 'https://ita.co.il/wp-content/uploads/a.pdf', category: 'אחר', sort: 4 },
      ],
    });
    expect(first.items.map((i) => i.title)).toEqual(['תקנון האיגוד', 'נהלי נוער']);
    expect(await importRegulations(db, first)).toEqual({ items: 2 });
    await importRegulations(db, validateRegulationsImport({ kind: 'regulations', items: [{ title: 'תקנון האיגוד (מעודכן)', url: 'https://ita.co.il/wp-content/uploads/a.pdf', category: 'תקנוני האיגוד', sort: 1 }] }));
    const rows = await db.select().from(schema.regulations);
    expect(rows.map((r) => r.title)).toEqual(['תקנון האיגוד (מעודכן)']);
  });
  it('rejects malformed payloads', () => {
    expect(() => validateRegulationsImport({ kind: 'x' })).toThrow();
  });
});

import { importClubs, importSiteInfo, validateClubsImport, validateSiteInfoImport } from '@/services/loglig-app';

describe('app data: clubs and site info', () => {
  it('stores club contact details and updates them in place; site info replaces by key', async () => {
    await importClubs(db, validateClubsImport({ kind: 'clubs', items: [{ logligId: 1, name: 'מועדון חדש', area: 2, address: 'רחוב 1', phone: '03', roster: [{ name: 'א ב', age: 12 }] }, { name: '' }] }));
    await importClubs(db, validateClubsImport({ kind: 'clubs', items: [{ logligId: 1, name: 'מועדון חדש', area: 2, address: 'רחוב 2', phone: '04' }] }));
    const rows = await db.select().from(schema.clubs);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.city).toBe('רחוב 2');
    expect((rows[0]!.info as { phone: string }).phone).toBe('04');

    await importSiteInfo(db, validateSiteInfoImport({ kind: 'site-info', key: 'events', data: [{ title: 'אירוע', url: 'https://x.example/a' }, { title: 'זדוני', url: 'javascript:alert(1)' }] }));
    await importSiteInfo(db, validateSiteInfoImport({ kind: 'site-info', key: 'events', data: [{ title: 'אירוע 2' }] }));
    const info = await db.select().from(schema.siteInfo);
    expect(info).toHaveLength(1);
    expect((info[0]!.data as { title: string }[])[0]!.title).toBe('אירוע 2');
    expect(() => validateSiteInfoImport({ kind: 'site-info', key: 'secrets', data: [] })).toThrow();
  });
});
