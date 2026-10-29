import { relations } from 'drizzle-orm';
import {
  boolean, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';

const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum('role', ['SUPER_ADMIN', 'FEDERATION_ADMIN', 'TOURNAMENT_MANAGER', 'REFEREE', 'CLUB_MANAGER', 'PLAYER']);
export const genderEnum = pgEnum('gender', ['MALE', 'FEMALE', 'OPEN']);
export const tournamentStatusEnum = pgEnum('tournament_status', ['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'DRAWN', 'IN_PROGRESS', 'FINISHED', 'CANCELLED', 'PLANNED']);
export const formatEnum = pgEnum('tournament_format', ['KNOCKOUT', 'GROUPS_KNOCKOUT', 'ROUND_ROBIN']);
export const entryStatusEnum = pgEnum('entry_status', ['PENDING', 'CONFIRMED', 'WAITLIST', 'WITHDRAWN', 'REJECTED']);
export const paymentStatusEnum = pgEnum('payment_status', ['UNPAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED']);
export const matchStatusEnum = pgEnum('match_status', ['SCHEDULED', 'COMPLETED', 'WALKOVER', 'RETIRED', 'VOID']);
export const scheduleKindEnum = pgEnum('schedule_kind', ['EXACT', 'NOT_BEFORE']);
export const docTypeEnum = pgEnum('doc_type', ['ID_PHOTO', 'PARENT_CONSENT', 'MEDICAL_CERTIFICATE', 'OTHER']);
export const docStatusEnum = pgEnum('doc_status', ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']);
export const channelEnum = pgEnum('channel', ['PUSH', 'EMAIL', 'SMS']);

export const clubs = pgTable('clubs', {
  id: id(), name: text('name').notNull().unique(), city: text('city'),
  /** Mirrored from the Loglig app: area, contact details, officials, teams and registered players. */
  info: jsonb('info'),
});

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('PLAYER'),
  clubId: text('club_id').references(() => clubs.id),
  active: boolean('active').notNull().default(true),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  /** "Sign out everywhere": sessions issued before this moment are no longer valid. */
  sessionsValidAfter: timestamp('sessions_valid_after', { withTimezone: true }),
  createdAt: createdAt(),
});

export const players = pgTable('players', {
  id: id(),
  accountId: text('account_id').references(() => users.id),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  birthDate: timestamp('birth_date', { withTimezone: true }).notNull(),
  gender: genderEnum('gender').notNull(),
  dominantHand: text('dominant_hand'),
  clubId: text('club_id').references(() => clubs.id),
  /** Hash of the national ID for duplicate detection. The number itself is never stored. */
  idHash: text('id_hash').unique(),
  logligId: text('loglig_id').unique(),
  /** Loglig's own user id and profile photo file (public, shown with the federation's approval). */
  logligUserId: text('loglig_user_id').unique(),
  photo: text('photo'),
  createdAt: createdAt(),
}, (t) => [index('players_name_idx').on(t.lastName, t.firstName)]);

export const guardians = pgTable('guardians', {
  id: id(),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  relation: text('relation'),
}, (t) => [uniqueIndex('guardian_uq').on(t.playerId, t.userId)]);

/** A user asking to be linked to an existing player (or to a child) when the ID + birth date could not be matched automatically. */
export const claimRequests = pgTable('claim_requests', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** Candidate player found by the system, if any. The admin may pick another one on approval. */
  playerId: text('player_id').references(() => players.id, { onDelete: 'set null' }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  birthDate: timestamp('birth_date', { withTimezone: true }).notNull(),
  /** Hash only, same as players.id_hash. */
  idHash: text('id_hash'),
  forChild: boolean('for_child').notNull().default(false),
  reason: text('reason'),
  status: text('status').notNull().default('PENDING'),
  reviewedById: text('reviewed_by_id'),
  reviewNote: text('review_note'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('claim_requests_status_idx').on(t.status)]);

export const documents = pgTable('documents', {
  id: id(),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  type: docTypeEnum('type').notNull(),
  status: docStatusEnum('status').notNull().default('PENDING'),
  /** Key in private object storage. Never a public URL. */
  storageKey: text('storage_key').notNull(),
  mime: text('mime').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  reviewedById: text('reviewed_by_id'),
  reviewNote: text('review_note'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('documents_status_idx').on(t.status)]);

export const venues = pgTable('venues', { id: id(), name: text('name').notNull(), city: text('city') });
export const courts = pgTable('courts', {
  id: id(),
  venueId: text('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
}, (t) => [uniqueIndex('court_uq').on(t.venueId, t.name)]);

export const ruleSets = pgTable('rule_sets', {
  id: id(), key: text('key').notNull(), version: integer('version').notNull(), name: text('name').notNull(),
  data: jsonb('data').notNull(), createdAt: createdAt(),
}, (t) => [uniqueIndex('ruleset_uq').on(t.key, t.version)]);

export const tournaments = pgTable('tournaments', {
  id: id(),
  name: text('name').notNull(),
  venueId: text('venue_id').references(() => venues.id),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  status: tournamentStatusEnum('status').notNull().default('DRAFT'),
  format: formatEnum('format').notNull().default('KNOCKOUT'),
  ruleSetId: text('rule_set_id').notNull().references(() => ruleSets.id),
  setsToWin: integer('sets_to_win').notNull().default(2),
  decider: text('decider').notNull().default('superTb'),
  registrationOpens: timestamp('registration_opens', { withTimezone: true }),
  registrationCloses: timestamp('registration_closes', { withTimezone: true }),
  feeAgorot: integer('fee_agorot').notNull().default(0),
  refundPolicy: jsonb('refund_policy'),
  /** Key into the rule set's pointsTables; 'DEFAULT' uses rules.points. */
  pointsTableKey: text('points_table_key').notNull().default('DEFAULT'),
  /** Calendar level: NATIONAL | REGIONAL | INTERNATIONAL | CIRCUIT | LEAGUE. */
  level: text('level').notNull().default('NATIONAL'),
  /** Mirrored competitions: the federation's page and the sign-up form where players really register. */
  /** YOUTH | ADULTS | MASTERS | OTHER: the federation's competition section. */
  section: text('section').notNull().default('YOUTH'),
  sourceUrl: text('source_url'),
  registerUrl: text('register_url'),
  /** Tournament director(s) per venue, from the federation's page. */
  /** Players accepted so far, by event ("BS14"), as a federation's own site lists them: [{ label, active, updated, players: [{ draw, n, name, nation, born, rank, wtn }] }]. */
  acceptance: jsonb('acceptance').$type<{ label: string; active: number; updated: string | null; players: { draw: string; n: number; name: string; nation: string; born: number | null; rank: string; wtn: string }[] }[] | null>(),
  contacts: jsonb('contacts').$type<{ area: string; club: string; name: string; phone: string }[]>(),
  createdAt: createdAt(),
});

/** Federation-wide information mirrored from the Loglig app: about text, events, registration forms, sponsors. */
export const siteInfo = pgTable('site_info', {
  key: text('key').primaryKey(),
  data: jsonb('data').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Doubles matches mirrored from a competition's doubles draws ("בנים 12 זוגות"). Kept apart from the singles model (entries, draws,
 * rankings): each side is a pair of players, so a player's results can include their doubles. Rebuilt on every import of the competition.
 */
export const doublesMatches = pgTable('doubles_matches', {
  id: id(),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  stage: text('stage').notNull(), // GROUP | KO
  groupName: text('group_name'), // "בית 1" for a group match
  round: integer('round').notNull(),
  a1: text('a1').references(() => players.id, { onDelete: 'set null' }),
  a2: text('a2').references(() => players.id, { onDelete: 'set null' }),
  b1: text('b1').references(() => players.id, { onDelete: 'set null' }),
  b2: text('b2').references(() => players.id, { onDelete: 'set null' }),
  aName: text('a_name').notNull(),
  bName: text('b_name').notNull(),
  status: text('status').notNull(), // SCHEDULED | COMPLETED | RETIRED | WALKOVER | VOID
  sets: jsonb('sets').notNull().default([]),
  winner: text('winner'), // 'a' | 'b'
  scheduleKind: text('schedule_kind'), // St | NB
  scheduledStart: timestamp('scheduled_start', { withTimezone: true }),
  court: text('court'),
}, (t) => [index('doubles_tournament_idx').on(t.tournamentId), index('doubles_a1_idx').on(t.a1), index('doubles_a2_idx').on(t.a2), index('doubles_b1_idx').on(t.b1), index('doubles_b2_idx').on(t.b2)]);

/** The knockout tree of a doubles category as Loglig draws it: { n: pair or winner's name ('' until decided), c: [two children] }. Rebuilt with the doubles. */
export const doublesBrackets = pgTable('doubles_brackets', {
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  tree: jsonb('tree').notNull(),
}, (t) => [primaryKey({ columns: [t.tournamentId, t.category] })]);

/**
 * A result corrected by hand where the federation's page cannot tell it (a match retired at a tied score, "6-6 Ret"). Matched by
 * competition and the two players' names, and re-applied on every import so the sync never undoes it.
 */
export const resultOverrides = pgTable('result_overrides', {
  id: id(),
  tournament: text('tournament').notNull(),
  playerA: text('player_a').notNull(),
  playerB: text('player_b').notNull(),
  winner: text('winner').notNull(),
  note: text('note'),
  createdAt: createdAt(),
});

/** Public regulations, procedures and forms (links to the federation's own documents). */
export const regulations = pgTable('regulations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  category: text('category').notNull().default('אחר'),
  sort: integer('sort').notNull().default(100),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Tennis Europe tournaments held outside Israel, so players can see when and where junior tournaments take place and until when they can enter.
 * Name, place, dates, level and conditions only: no draws or players. Read from te.tournamentsoftware.com (id = its tournament id).
 */
export const abroadEvents = pgTable('abroad_events', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  venue: text('venue').notNull().default(''),
  city: text('city').notNull().default(''),
  country: text('country').notNull().default(''),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  surface: text('surface').notNull().default(''),
  /** "Category 1" | "Category 2" | "Category 3" | "Super Category" | "Masters" ... as Tennis Europe names it. */
  category: text('category').notNull().default(''),
  /** 12 | 14 | 16 (the tournament's "12&U" group); null when not stated. */
  ageGroup: integer('age_group'),
  /** Where the tournament comes from: 'TE' (Tennis Europe) or 'ITF' (ITF World Tennis Tour Juniors). */
  circuit: text('circuit').notNull().default('TE'),
  /** Closed to players of other nations ("closed event"). */
  closed: boolean('closed').notNull().default(false),
  entryOpens: timestamp('entry_opens', { withTimezone: true }),
  entryDeadline: timestamp('entry_deadline', { withTimezone: true }),
  withdrawalDeadline: timestamp('withdrawal_deadline', { withTimezone: true }),
  /** As the fact sheet words it ("80 Euro MD 70 Euro QD"), and what the organizer offers ("Hospitality"). */
  fee: text('fee').notNull().default(''),
  hospitality: text('hospitality').notNull().default(''),
  indoor: boolean('indoor'),
  url: text('url').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ startIdx: index('abroad_events_start_idx').on(t.startDate) }));

/** Team leagues mirrored from the federation's public pages (standings and fixtures kept as one document). */
export const externalLeagues = pgTable('external_leagues', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  gender: genderEnum('gender').notNull().default('OPEN'),
  data: jsonb('data').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tournamentStaff = pgTable('tournament_staff', {
  id: id(),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  role: roleEnum('role').notNull(),
}, (t) => [uniqueIndex('staff_uq').on(t.tournamentId, t.userId)]);

/** A court allocated to one tournament, with an identifier the manager controls. */
export const tournamentCourts = pgTable('tournament_courts', {
  id: id(),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  courtId: text('court_id').references(() => courts.id),
  label: text('label').notNull(),
  position: integer('position').notNull().default(0),
}, (t) => [uniqueIndex('tcourt_uq').on(t.tournamentId, t.label)]);

export const categories = pgTable('categories', {
  id: id(),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  gender: genderEnum('gender').notNull(),
  minBirthYear: integer('min_birth_year'),
  maxBirthYear: integer('max_birth_year'),
  capacity: integer('capacity'),
  format: formatEnum('format'),
  groupConfig: jsonb('group_config'),
});

export const entries = pgTable('entries', {
  id: id(),
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull().references(() => players.id),
  status: entryStatusEnum('status').notNull().default('PENDING'),
  paymentStatus: paymentStatusEnum('payment_status').notNull().default('UNPAID'),
  rankAtDraw: integer('rank_at_draw'),
  /** 'loglig' when the registration is mirrored from Loglig: payment and cancellation happen there, not in this app. */
  source: text('source'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('entry_uq').on(t.categoryId, t.playerId)]);

/** A child's request to join a category. The parent sees it on their home and either registers (DONE) or dismisses it. */
export const entrySuggestions = pgTable('entry_suggestions', {
  id: id(),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('PENDING'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('entry_suggestion_uq').on(t.playerId, t.categoryId)]);

export const draws = pgTable('draws', {
  id: id(),
  categoryId: text('category_id').notNull().unique().references(() => categories.id, { onDelete: 'cascade' }),
  code: integer('code').notNull(),
  ruleSetKey: text('rule_set_key').notNull(),
  ruleSetVersion: integer('rule_set_version').notNull(),
  size: integer('size').notNull(),
  /** Array by position of { entryId: string | null (bye), seed?: number }. */
  slots: jsonb('slots').notNull(),
  /** Knockout slots after a group stage, and the code used to draw them. */
  koSlots: jsonb('ko_slots'),
  koCode: integer('ko_code'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const drawLogs = pgTable('draw_logs', {
  id: id(),
  drawId: text('draw_id').notNull().references(() => draws.id, { onDelete: 'cascade' }),
  userId: text('user_id'),
  action: text('action').notNull(),
  detail: jsonb('detail'),
  createdAt: createdAt(),
});

export const groups = pgTable('groups', {
  id: id(),
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: integer('position').notNull(),
});

export const groupMembers = pgTable('group_members', {
  id: id(),
  groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  entryId: text('entry_id').notNull().unique().references(() => entries.id, { onDelete: 'cascade' }),
  withdrawn: boolean('withdrawn').notNull().default(false),
});

export const matches = pgTable('matches', {
  id: id(),
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
  stage: text('stage').notNull(), // GROUP | KO
  round: integer('round').notNull(),
  index: integer('index').notNull(),
  nodeId: text('node_id'),
  aEntryId: text('a_entry_id'),
  bEntryId: text('b_entry_id'),
  status: matchStatusEnum('status').notNull().default('SCHEDULED'),
  /** True while the referee is pushing partial set scores; the match is still SCHEDULED until a result is recorded. */
  live: boolean('live').notNull().default(false),
  sets: jsonb('sets').notNull().default([]),
  absentEntryId: text('absent_entry_id'),
  /** NO_NOTICE | NOTICE | NOTICE_MEDICAL | INJURY | NON_INJURY (decides points and discipline). */
  absentReason: text('absent_reason'),
  winnerEntryId: text('winner_entry_id'),
  durationMin: integer('duration_min').notNull().default(90),
  /** Previous matches (KO feeders) that must finish first. */
  feederIds: jsonb('feeder_ids').notNull().default([]),
  courtLabel: text('court_label'),
  scheduleKind: scheduleKindEnum('schedule_kind'),
  scheduledStart: timestamp('scheduled_start', { withTimezone: true }),
  notBefore: timestamp('not_before', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedById: text('updated_by_id'),
}, (t) => [index('matches_cat_idx').on(t.categoryId, t.stage, t.round), index('matches_status_start_idx').on(t.status, t.scheduledStart)]);

export const pointsAwards = pgTable('points_awards', {
  id: id(),
  playerId: text('player_id').notNull().references(() => players.id),
  tournamentId: text('tournament_id').references(() => tournaments.id),
  points: doublePrecision('points').notNull(),
  multiplier: doublePrecision('multiplier').notNull().default(1),
  kind: text('kind').notNull().default('singles'),
  date: timestamp('date', { withTimezone: true }).notNull(),
  logligKey: text('loglig_key').unique(),
}, (t) => [index('awards_player_idx').on(t.playerId, t.date)]);

export const payments = pgTable('payments', {
  id: id(),
  entryId: text('entry_id').notNull().references(() => entries.id),
  amountAgorot: integer('amount_agorot').notNull(),
  status: paymentStatusEnum('status').notNull().default('UNPAID'),
  provider: text('provider').notNull().default('manual'),
  providerRef: text('provider_ref').unique(),
  createdAt: createdAt(),
});

export const refunds = pgTable('refunds', {
  id: id(),
  paymentId: text('payment_id').notNull().references(() => payments.id),
  amountAgorot: integer('amount_agorot').notNull(),
  reason: text('reason').notNull(),
  byUserId: text('by_user_id').notNull(),
  createdAt: createdAt(),
});

export const ledger = pgTable('ledger', {
  id: id(),
  kind: text('kind').notNull(), // CHARGE | REFUND
  amountAgorot: integer('amount_agorot').notNull(),
  paymentId: text('payment_id'),
  refundId: text('refund_id'),
  createdAt: createdAt(),
});

/** Tournament photo gallery. Uploaded by staff only; shown publicly. */
export const galleryItems = pgTable('gallery_items', {
  id: id(),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull(),
  mime: text('mime').notNull(),
  caption: text('caption'),
  uploadedById: text('uploaded_by_id').references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('gallery_tournament_idx').on(t.tournamentId, t.createdAt)]);

/** Fans: a user follows a player, a club or a tournament and gets notified about schedule changes and results. */
export const follows = pgTable('follows', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // PLAYER | CLUB | TOURNAMENT
  targetId: text('target_id').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('follow_uq').on(t.userId, t.kind, t.targetId), index('follow_target_idx').on(t.kind, t.targetId)]);

/**
 * The national ranking, computed ahead of time (services/ranking-sql.ts refreshRankingSnapshot): one row per ranked player, boys and girls in
 * the same table (the gender column and its index keep them apart). It is rebuilt after anything that changes ranking points and once a day,
 * because the 52-week window slides. Pages read it instead of adding up every award of the season on each visit.
 */
export const rankingSnapshot = pgTable('ranking_snapshot', {
  gender: genderEnum('gender').notNull(),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  /** National rank inside the gender. */
  rank: integer('rank').notNull(),
  /** Whole cents (points x 100), so sums and ties are exact. */
  pointsCents: integer('points_cents').notNull(),
  bestCents: integer('best_cents').notNull(),
  counted: integer('counted').notNull(),
}, (t) => [primaryKey({ columns: [t.gender, t.playerId] }), index('ranking_snapshot_rank_idx').on(t.gender, t.rank), index('ranking_snapshot_player_idx').on(t.playerId)]);

/** When the snapshot was last rebuilt (one row), so a stale or missing snapshot rebuilds itself on the next read. */
export const rankingSnapshotMeta = pgTable('ranking_snapshot_meta', { id: integer('id').primaryKey(), computedAt: timestamp('computed_at', { withTimezone: true }).notNull() });

export const notifications = pgTable('notifications', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id),
  channel: channelEnum('channel').notNull(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  status: text('status').notNull().default('QUEUED'),
  attempts: integer('attempts').notNull().default(0),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('notif_user_idx').on(t.userId, t.status)]);

export const notificationPrefs = pgTable('notification_prefs', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id),
  channel: channelEnum('channel').notNull(),
  kind: text('kind').notNull(),
  enabled: boolean('enabled').notNull().default(true),
}, (t) => [uniqueIndex('pref_uq').on(t.userId, t.channel, t.kind)]);

export const deviceTokens = pgTable('device_tokens', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  platform: text('platform').notNull(), // ios | android | web
  createdAt: createdAt(),
});

export const auditLog = pgTable('audit_log', {
  id: id(),
  userId: text('user_id'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  detail: jsonb('detail'),
  impersonatedBy: text('impersonated_by'),
  createdAt: createdAt(),
}, (t) => [index('audit_entity_idx').on(t.entity, t.entityId)]);

export const tournamentRelations = relations(tournaments, ({ many }) => ({ categories: many(categories) }));
export const categoryRelations = relations(categories, ({ many, one }) => ({
  entries: many(entries), tournament: one(tournaments, { fields: [categories.tournamentId], references: [tournaments.id] }),
}));
