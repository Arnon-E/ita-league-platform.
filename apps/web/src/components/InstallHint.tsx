'use client';
import { useEffect, useState } from 'react';

const KEY = 'ita_install_hint_dismissed';

/**
 * iPhone and iPad give no install prompt: a site is added to the home screen by hand from Safari's share menu.
 * So on iOS, when the site is not already running from the home screen, show a small dismissible hint saying how.
 */
export function InstallHint({ l }: { l: { title: string; step: string; close: string } }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const installed = (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    let dismissed = false;
    try { dismissed = localStorage.getItem(KEY) === '1'; } catch { /* private mode: just show it */ }
    setShow(ios && !installed && !dismissed);
  }, []);
  if (!show) return null;
  return (
    <div className="installhint" role="note">
      <div>
        <strong>{l.title}</strong>
        <span>
          {l.step.split('{share}')[0]}
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-3px' }}><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
          {l.step.split('{share}')[1]}
        </span>
      </div>
      <button type="button" aria-label={l.close} onClick={() => { try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } setShow(false); }}>×</button>
    </div>
  );
}
