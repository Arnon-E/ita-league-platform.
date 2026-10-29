import { db } from '@/db';
import { handlePublic } from '@/lib/api';
import { abroadCatalog } from '@/services/abroad';
import { countryInfo } from '@/lib/countries';

/** Junior tournaments outside Israel (Tennis Europe and ITF) that have not ended: the website's "abroad" page as data. Events closed to other nations are left out. */
export const GET = () => handlePublic(async () =>
  (await abroadCatalog(db)).filter((e) => !e.closed).map((e) => ({
    id: e.id, name: e.name, venue: e.venue, city: e.city, country: e.country, cc: countryInfo(e.country).cc, start: e.start, end: e.end, surface: e.surface, category: e.category, age: e.age, circuit: e.circuit,
    entryOpens: e.entryOpens, entryDeadline: e.entryDeadline, withdrawalDeadline: e.withdrawalDeadline, fee: e.fee, hospitality: e.hospitality, indoor: e.indoor, url: e.url,
  })));
