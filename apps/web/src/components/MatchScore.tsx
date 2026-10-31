import Link from 'next/link';

type SetScore = { a: number; b: number; superTb?: boolean };
interface Props {
  /** A player's name, or the two names of a doubles pair. */
  aName: React.ReactNode | React.ReactNode[]; bName: React.ReactNode | React.ReactNode[];
  sets: SetScore[];
  status: string; // SCHEDULED | COMPLETED | WALKOVER | RETIRED | VOID
  winner: 'a' | 'b' | null;
  live?: boolean;
  href?: string;
  /** Footer line, e.g. tournament and category. */
  caption?: React.ReactNode;
  /** When it was played: date and time, with "St" / "NB" in front. */
  when?: string;
  /** The viewer's own side, shown in full colour even when it lost. */
  mine?: 'a' | 'b';
  labels?: { walkover: string; retired: string; void: string; live: string; won: string };
}

const HE = { walkover: 'ווק-אובר', retired: 'פרישה', void: 'בוטל', live: 'חי', won: 'ניצח' };

/**
 * The one match card of the site (matches page, tournament results, "my home"): a row per side (a pair on two lines in doubles),
 * a column per set, the winner bold with a check mark; the footer holds the status, competition and category, and the time.
 */
export function MatchScore({ aName, bName, sets, status, winner, live, href, caption, when, mine, labels = HE }: Props) {
  const done = status !== 'SCHEDULED' && status !== 'VOID';
  const row = (side: 'a' | 'b', name: React.ReactNode | React.ReactNode[]) => {
    const won = done && winner === side;
    const names = Array.isArray(name) ? name : [name];
    return (
      <tr className={[won ? 'won' : done && winner ? 'lost' : '', mine === side ? 'mine' : ''].join(' ')}>
        <td className="who"><span className="whoin">
          {won ? <span className="tick" title={labels.won} aria-label={labels.won}><svg aria-hidden viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span> : <span className="tick" />}
          <span className="names">{names.map((n, i) => <span key={i}>{n}</span>)}</span>
        </span></td>
        {sets.map((s, i) => {
          const mineScore = side === 'a' ? s.a : s.b, other = side === 'a' ? s.b : s.a;
          return <td key={i} className={`set ${mineScore > other ? 'sw' : ''}`}>{mineScore}</td>;
        })}
      </tr>
    );
  };
  const note = status === 'WALKOVER' ? labels.walkover : status === 'RETIRED' ? labels.retired : status === 'VOID' ? labels.void : live ? labels.live : '';
  const body = (
    <div className="sb">
      <table><tbody>{row('a', aName)}{row('b', bName)}</tbody></table>
      {(note || caption || when) && (
        <div className="sbf">
          {note && <span className={`pill ${live ? 'lime' : status === 'VOID' ? '' : 'warn'}`}>{note}</span>}
          {caption && <span className="muted cap">{caption}</span>}
          {when && <span className="muted when" dir="ltr">{when}</span>}
        </div>
      )}
    </div>
  );
  return href ? <Link href={href} className="card sbcard">{body}</Link> : body;
}

/** "St 2.10.2026 10:00": a match time as the cards show it (Israel time). */
export function matchWhen(d: Date | string | null | undefined, kind?: string | null) {
  if (!d) return undefined;
  const x = new Date(d);
  const date = x.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const time = x.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
  return `${kind ? `${kind} ` : ''}${date} ${time}`;
}
