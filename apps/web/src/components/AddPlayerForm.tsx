'use client';
import { useState } from 'react';

type Action = (formData: FormData) => void | Promise<void>;
type L = Record<'newP' | 'existing' | 'first' | 'last' | 'birth' | 'gender' | 'male' | 'female' | 'nid' | 'reason' | 'mine' | 'add' | 'claim' | 'hint', string>;

export function AddPlayerForm({ addAction, claimAction, child, l }: { addAction: Action; claimAction: Action; child: boolean; l: L }) {
  const [mode, setMode] = useState<'new' | 'claim'>('new');
  const isNew = mode === 'new';
  return (
    <form action={isNew ? addAction : claimAction} className="card fform">
      <div className="seg full" role="tablist">
        <button type="button" role="tab" aria-selected={isNew} className={isNew ? 'on' : ''} onClick={() => setMode('new')}>{l.newP}</button>
        <button type="button" role="tab" aria-selected={!isNew} className={!isNew ? 'on' : ''} onClick={() => setMode('claim')}>{l.existing}</button>
      </div>
      {!isNew && <p className="muted full" style={{ margin: 0 }}>{l.hint}</p>}
      <label>{l.first}<input name="first" required /></label>
      <label>{l.last}<input name="last" required /></label>
      <label>{l.birth}<input name="birth" type="date" required /></label>
      {isNew && <label>{l.gender}<select name="gender"><option value="MALE">{l.male}</option><option value="FEMALE">{l.female}</option></select></label>}
      <label className="full">{l.nid}<input name="nid" inputMode="numeric" /></label>
      {!isNew && <label className="full">{l.reason}<input name="reason" /></label>}
      <label className="chk full"><input type="checkbox" name="child" value="1" defaultChecked={child} />{l.mine}</label>
      <button className="btn full">{isNew ? l.add : l.claim}</button>
    </form>
  );
}
