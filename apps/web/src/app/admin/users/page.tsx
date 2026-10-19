import { db } from '@/db';
import { Flash, Shell } from '@/components/Shell';
import { requireActor } from '@/lib/session';
import { listUsers } from '@/services/users';
import { impersonateAction, roleAction } from '@/app/actions3';
import { tr } from '@/lib/i18n';

const ROLES = { SUPER_ADMIN: 'מנהל על', FEDERATION_ADMIN: 'מנהל איגוד', TOURNAMENT_MANAGER: 'מנהל טורניר', REFEREE: 'שופט', CLUB_MANAGER: 'מנהל מועדון', PLAYER: 'שחקן/הורה' };

export default async function Users({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const t = await tr();
  const { err, ok } = await searchParams;
  const a = await requireActor();
  let rows: Awaited<ReturnType<typeof listUsers>> = [];
  let denied = false;
  try { rows = await listUsers(db, a); } catch { denied = true; }
  return (
    <Shell nav="users">
      <h1>{t('משתמשים והרשאות')}</h1>
      <Flash err={denied ? t('אין הרשאה') : err} ok={ok} />
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>{t('שם')}</th><th>{t('אימייל')}</th><th>{t('תפקיד')}</th><th>{t('פעיל')}</th><th /></tr></thead><tbody>
          {rows.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td><td>{u.email}</td>
              <td><form action={roleAction} className="row"><input type="hidden" name="user" value={u.id} />
                <select name="role" defaultValue={u.role}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
                <button className="btn small ghost">{t('עדכון')}</button></form></td>
              <td><form action={roleAction}><input type="hidden" name="user" value={u.id} /><input type="hidden" name="op" value="active" /><input type="hidden" name="value" value={u.active ? '0' : '1'} />
                <button className="btn small ghost">{u.active ? t('השבתה') : t('הפעלה')}</button></form></td>
              <td>{a.role === 'SUPER_ADMIN' && u.id !== a.id && <form action={impersonateAction}><input type="hidden" name="user" value={u.id} /><button className="btn small ghost">{t('התחזות')}</button></form>}</td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </Shell>
  );
}
