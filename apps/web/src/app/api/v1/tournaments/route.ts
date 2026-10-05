import { db } from '@/db';
import { handle } from '@/lib/api';
import { listTournaments } from '@/services/queries';

export const GET = (req: Request) => handle(req, async () => (await listTournaments(db)).map((t) => ({
  id: t.id, name: t.name, status: t.status, format: t.format, startDate: t.startDate, endDate: t.endDate, feeAgorot: t.feeAgorot,
})));
