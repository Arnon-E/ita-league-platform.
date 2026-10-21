import { db } from '@/db';
import { handlePublic } from '@/lib/api';
import { listClubs } from '@/services/public';

export const GET = () => handlePublic(async () => (await listClubs(db)).map(({ c, n }) => ({ id: c.id, name: c.name, city: c.city, players: n })), 60);
