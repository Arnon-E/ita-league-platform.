import type { Actor, Role } from './auth';

export type Action =
  | 'user.manage' | 'ruleset.manage' | 'impersonate' | 'audit.read'
  | 'tournament.create' | 'tournament.manage' | 'tournament.view'
  | 'draw.run' | 'draw.edit' | 'result.enter' | 'result.override'
  | 'schedule.manage' | 'courts.manage'
  | 'entry.manage' | 'entry.registerSelf'
  | 'document.review' | 'document.upload'
  | 'payment.refund' | 'payment.view'
  | 'ranking.recalculate' | 'notification.send' | 'import.run';

const FED: Action[] = [
  'user.manage', 'ruleset.manage', 'audit.read', 'tournament.create', 'tournament.manage', 'tournament.view', 'draw.run', 'draw.edit',
  'result.enter', 'result.override', 'schedule.manage', 'courts.manage', 'entry.manage', 'document.review', 'payment.refund',
  'payment.view', 'ranking.recalculate', 'notification.send', 'import.run', 'entry.registerSelf', 'document.upload',
];

const MANAGER: Action[] = [
  'tournament.manage', 'tournament.view', 'draw.run', 'draw.edit', 'result.enter', 'result.override', 'schedule.manage',
  'courts.manage', 'entry.manage', 'payment.refund', 'payment.view', 'notification.send',
];

const MATRIX: Record<Role, Action[] | 'all'> = {
  SUPER_ADMIN: 'all',
  FEDERATION_ADMIN: FED,
  TOURNAMENT_MANAGER: ['tournament.create', ...MANAGER],
  REFEREE: ['tournament.view', 'result.enter'],
  CLUB_MANAGER: ['tournament.view', 'entry.registerSelf', 'document.upload'],
  PLAYER: ['tournament.view', 'entry.registerSelf', 'document.upload'],
};

/** Actions a tournament manager may only do in tournaments they are staff of. */
const SCOPED: Action[] = [...MANAGER, 'result.enter'];

export interface Scope {
  /** Roles the actor holds in the tournament in question (from tournament_staff). */
  staffRoles?: Role[];
  /** Player ids the actor may act for (self + children). */
  ownedPlayerIds?: string[];
  playerId?: string;
}

export function can(actor: Actor, action: Action, scope: Scope = {}): boolean {
  if (action === 'impersonate') return actor.role === 'SUPER_ADMIN' && !actor.impersonatedBy;
  const allowed = MATRIX[actor.role];
  if (allowed === 'all') return true;
  const staffGrants = (scope.staffRoles ?? []).some((r) => {
    const g = MATRIX[r];
    return g !== 'all' && g.includes(action);
  });
  if (actor.role === 'TOURNAMENT_MANAGER' && SCOPED.includes(action)) {
    return staffGrants && allowed.includes(action);
  }
  if (actor.role === 'REFEREE' && action === 'result.enter') return staffGrants;
  if (!allowed.includes(action)) return staffGrants && SCOPED.includes(action);
  if ((action === 'entry.registerSelf' || action === 'document.upload') && actor.role !== 'FEDERATION_ADMIN') {
    return !scope.playerId || (scope.ownedPlayerIds ?? []).includes(scope.playerId);
  }
  return true;
}

export class Forbidden extends Error {
  constructor(public action: Action) { super(`Forbidden: ${action}`); }
}

export function assertCan(actor: Actor, action: Action, scope: Scope = {}): void {
  if (!can(actor, action, scope)) throw new Forbidden(action);
}
