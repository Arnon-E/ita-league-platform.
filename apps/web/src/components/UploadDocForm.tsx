'use client';
import { useState } from 'react';

type Action = (formData: FormData) => void | Promise<void>;

export function UploadDocForm({ action, player, types, labels }: { action: Action; player: string; types: [string, string][]; labels: { type: string; expires: string; upload: string } }) {
  const [hasFile, setHasFile] = useState(false);
  return (
    <form action={action} className="fform">
      <input type="hidden" name="player" value={player} />
      <select name="type" aria-label={labels.type}>{types.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <input name="file" type="file" accept="image/jpeg,image/png,application/pdf" required className="full" onChange={(e) => setHasFile(!!e.target.files?.length)} />
      <label>{labels.expires}<input name="expires" type="date" /></label>
      <button className="btn small full" disabled={!hasFile}>{labels.upload}</button>
    </form>
  );
}
