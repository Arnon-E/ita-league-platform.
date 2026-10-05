import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { can } from '@/lib/permissions';
import { getActor } from '@/lib/session';

type Report = { file: string; headers: string[]; query: ReturnType<typeof sql> };

const REPORTS: Record<string, Report> = {
  players: {
    file: 'players', headers: ['שם פרטי', 'שם משפחה', 'מין', 'שנת לידה', 'מועדון'],
    query: sql`select p.first_name, p.last_name, p.gender::text, extract(year from p.birth_date)::int, c.name
      from players p left join clubs c on c.id = p.club_id order by p.last_name, p.first_name`,
  },
  results: {
    file: 'results', headers: ['תחרות', 'קטגוריה', 'שלב', 'סיבוב', 'שחקן א', 'שחקן ב', 'סטטוס', 'תוצאה', 'מנצח'],
    query: sql`select t.name, c.name, m.stage, m.round, pa.first_name || ' ' || pa.last_name, pb.first_name || ' ' || pb.last_name, m.status::text,
        (select string_agg((s->>'a') || '-' || (s->>'b'), ' ') from jsonb_array_elements(m.sets) s),
        pw.first_name || ' ' || pw.last_name
      from matches m join categories c on c.id = m.category_id join tournaments t on t.id = c.tournament_id
      left join entries ea on ea.id = m.a_entry_id left join players pa on pa.id = ea.player_id
      left join entries eb on eb.id = m.b_entry_id left join players pb on pb.id = eb.player_id
      left join entries ew on ew.id = m.winner_entry_id left join players pw on pw.id = ew.player_id
      order by t.start_date desc, c.name, m.stage, m.round, m.index`,
  },
  points: {
    file: 'ranking-points', headers: ['שחקן', 'תחרות', 'נקודות', 'תאריך'],
    query: sql`select p.first_name || ' ' || p.last_name, t.name, a.points, to_char(a.date, 'YYYY-MM-DD')
      from points_awards a join players p on p.id = a.player_id left join tournaments t on t.id = a.tournament_id order by a.date desc, p.last_name`,
  },
  entries: {
    file: 'entries', headers: ['תחרות', 'קטגוריה', 'שחקן', 'מועדון', 'סטטוס', 'תשלום'],
    query: sql`select t.name, c.name, p.first_name || ' ' || p.last_name, cl.name, e.status::text, e.payment_status::text
      from entries e join categories c on c.id = e.category_id join tournaments t on t.id = c.tournament_id
      join players p on p.id = e.player_id left join clubs cl on cl.id = p.club_id order by t.start_date desc, c.name, p.last_name`,
  },
};

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(actor, 'audit.read')) return Response.json({ error: 'forbidden' }, { status: 403 });
  const r = REPORTS[(await ctx.params).kind];
  if (!r) return Response.json({ error: 'not found' }, { status: 404 });
  const rows = (await db.execute(r.query)) as unknown as Record<string, unknown>[];
  const lines = [r.headers.map(cell).join(','), ...rows.map((row) => Object.values(row).map(cell).join(','))];
  // BOM so Excel opens Hebrew correctly.
  return new Response('﻿' + lines.join('\r\n'), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${r.file}.csv"` },
  });
}
