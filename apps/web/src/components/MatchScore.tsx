import Link from 'next/link';

type SetScore = { a: number; b: number; superTb?: boolean };
interface Props {
  aName: string; bName: string;
  sets: SetScore[];
  status: string; // SCHEDULED | COMPLETED | WALKOVER | RETIRED | VOID
  winner: 'a' | 'b' | null;
  live?: boolean;
  href?: string;
  /** Footer line, e.g. tournament and category. */
  caption?: React.ReactNode;
  labels?: { walkover: string; retired: string; void: string; live: string; won: string };
}

const HE = { walkover: 'ווק-אובר', retired: 'פרישה', void: 'בוטל', live: 'חי', won: 'ניצח' };

/** A tennis scoreboard: one row per player, one column per set; the winner is bold with a check mark. */
export function MatchScore({ aName, bName, sets, status, winner, live, href, caption, labels = HE }: Props) {
  const done = status !== 'SCHEDULED' && status !== 'VOID';
  const row = (side: 'a' | 'b', name: string) => {
    const won = done && winner === side;
    return (
      <tr className={won ? 'won' : done && winner ? 'lost' : ''}>
        <td className="who">{won ? <span className="tick" title={labels.won} aria-label={labels.won}><svg aria-hidden viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span> : <span className="tick" />}{name}</td>
        {sets.map((s, i) => {
          const mine = side === 'a' ? s.a : s.b, other = side === 'a' ? s.b : s.a;
          return <td key={i} className={`set ${mine > other ? 'sw' : ''}`}>{mine}</td>;
        })}
      </tr>
    );
  };
  const note = status === 'WALKOVER' ? labels.walkover : status === 'RETIRED' ? labels.retired : status === 'VOID' ? labels.void : live ? labels.live : '';
  const body = (
    <div className="sb">
      <table><tbody>{row('a', aName)}{row('b', bName)}</tbody></table>
      {(note || caption) && <div className="sbf">{note && <span className={`pill ${live ? 'lime' : status === 'VOID' ? '' : 'warn'}`}>{note}</span>}{caption && <span className="muted">{caption}</span>}</div>}
    </div>
  );
  return href ? <Link href={href} className="card sbcard">{body}</Link> : body;
}
