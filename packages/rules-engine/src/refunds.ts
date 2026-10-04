import type { RefundPolicy } from './ruleset.js';

export interface Timeline {
  registrationCloses: Date;
  drawDone?: Date;
  startsAt: Date;
}

export type RefundStage = 'beforeClose' | 'afterCloseBeforeDraw' | 'afterDraw' | 'afterStart';

export interface RefundDecision {
  stage: RefundStage;
  fraction: number;
  amount: number;
  reason: string;
}

export function refundStage(now: Date, t: Timeline): RefundStage {
  if (now >= t.startsAt) return 'afterStart';
  if (t.drawDone && now >= t.drawDone) return 'afterDraw';
  if (now >= t.registrationCloses) return 'afterCloseBeforeDraw';
  return 'beforeClose';
}

/** Default refund for a withdrawal. Managers can always override with an explicit amount + reason. */
export function computeRefund(paid: number, now: Date, t: Timeline, p: RefundPolicy, medicalCertificate = false): RefundDecision {
  const stage = refundStage(now, t);
  let fraction = stage === 'beforeClose' ? p.beforeRegistrationClose
    : stage === 'afterCloseBeforeDraw' ? p.afterCloseBeforeDraw : p.afterDraw;
  let reason = `policy:${stage}`;
  if (stage !== 'beforeClose' && p.medicalCertificateOverride && medicalCertificate) { fraction = 1; reason = 'medical certificate'; }
  const amount = Math.round(paid * fraction * 100) / 100;
  return { stage, fraction, amount, reason };
}

/** Manual override by a manager: capped at what was paid, reason required. */
export function manualRefund(paid: number, alreadyRefunded: number, amount: number, reason: string): number {
  if (!reason.trim()) throw new Error('A refund reason is required');
  if (amount <= 0) throw new Error('Refund amount must be positive');
  if (amount + alreadyRefunded > paid + 1e-9) throw new Error('Refund exceeds the amount paid');
  return Math.round(amount * 100) / 100;
}
