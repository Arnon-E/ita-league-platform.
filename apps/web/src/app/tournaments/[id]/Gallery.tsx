import { db } from '@/db';
import { addPhotoAction, removePhotoAction } from '@/app/actions8';
import { listPhotos } from '@/services/gallery';

export async function Gallery({ tournamentId, manage }: { tournamentId: string; manage: boolean }) {
  const photos = await listPhotos(db, tournamentId);
  return (
    <>
      {manage && (
        <form action={addPhotoAction} encType="multipart/form-data" className="card row" style={{ marginBottom: 16 }}>
          <input type="hidden" name="id" value={tournamentId} />
          <label style={{ flex: 1, minWidth: 200 }}>תמונות (JPG / PNG, עד 8MB)<input name="photo" type="file" accept="image/jpeg,image/png" multiple required /></label>
          <label style={{ flex: 1, minWidth: 160 }}>כיתוב (אופציונלי)<input name="caption" maxLength={200} /></label>
          <button className="btn">העלאה</button>
        </form>
      )}
      <div className="grid cols">
        {photos.map((p) => (
          <figure key={p.id} className="card" style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
            <a href={`/api/gallery/${p.id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/gallery/${p.id}`} alt={p.caption ?? 'תמונה מהתחרות'} loading="lazy" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }} />
            </a>
            {(p.caption || manage) && (
              <figcaption className="row" style={{ padding: '10px 14px', justifyContent: 'space-between' }}>
                <span className="muted">{p.caption ?? ''}</span>
                {manage && <form action={removePhotoAction}><input type="hidden" name="id" value={tournamentId} /><input type="hidden" name="photo" value={p.id} /><button className="btn small ghost">הסרה</button></form>}
              </figcaption>
            )}
          </figure>
        ))}
        {!photos.length && <div className="card muted">אין עדיין תמונות בגלריה.</div>}
      </div>
    </>
  );
}
