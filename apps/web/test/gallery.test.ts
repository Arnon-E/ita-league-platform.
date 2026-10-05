import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { mkUser, resetDb } from './helpers';
import { createTournament } from '@/services/tournaments';
import { addPhoto, listPhotos, removePhoto } from '@/services/gallery';
import { Forbidden } from '@/lib/permissions';

beforeAll(resetDb);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PDF = new TextEncoder().encode('%PDF-1.4 fake');

describe('tournament gallery', () => {
  it('staff add real images only, anyone can list them, players cannot upload, staff can remove', async () => {
    const { actor: fed } = await mkUser('FEDERATION_ADMIN', `fed${Math.random()}@x.il`);
    const t = await createTournament(db, fed, { name: 'גלריה', startDate: new Date('2026-11-01'), endDate: new Date('2026-11-02'), feeAgorot: 0, format: 'KNOCKOUT' });

    const p = await addPhoto(db, fed, t.id, PNG, '  גמר  ');
    expect(p.mime).toBe('image/png');
    expect(p.caption).toBe('גמר');
    await expect(addPhoto(db, fed, t.id, PDF)).rejects.toThrow(); // a PDF is not a photo
    await expect(addPhoto(db, fed, t.id, new Uint8Array())).rejects.toThrow();
    // an image renamed .jpg but with other content is rejected by content, not name
    await expect(addPhoto(db, fed, t.id, new TextEncoder().encode('<script>alert(1)</script>'))).rejects.toThrow();

    const { actor: player } = await mkUser('PLAYER', `pl${Math.random()}@x.il`);
    await expect(addPhoto(db, player, t.id, PNG)).rejects.toBeInstanceOf(Forbidden);
    await expect(removePhoto(db, player, p.id)).rejects.toBeInstanceOf(Forbidden);

    expect((await listPhotos(db, t.id)).length).toBe(1);
    await removePhoto(db, fed, p.id);
    expect((await listPhotos(db, t.id)).length).toBe(0);
  });
});
