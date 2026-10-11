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
