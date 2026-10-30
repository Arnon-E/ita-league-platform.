// The Tennis Europe tournament search (te.tournamentsoftware.com/find): one page of results, and the search itself with its own paging.
const decode = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const text = (h) => decode(h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** One page of search results -> [{ id, name, venue, city, country, start, end, surface, category, age, closed }]. */
export function parseSearch(html) {
  const out = [];
  for (const block of html.split(/<li class="list__item">\s*<div class="media">/).slice(1)) {
    const id = block.match(/\/sport\/tournament\?id=([0-9A-Fa-f-]{36})/)?.[1];
    const name = block.match(/<span class="nav-link__value">([\s\S]*?)<\/span>\s*<\/a>\s*<\/h4>/)?.[1];
    const place = block.match(/icon-marker[\s\S]*?<span class="nav-link__value">([\s\S]*?)<\/span>/)?.[1];
    const dates = [...block.matchAll(/<time datetime="(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
    if (!id || !name || !place || dates.length < 2) continue;
    const [venue, where = ''] = decode(place.replace(/<img[^>]*>/g, '')).replace(/\s+/g, ' ').trim().split(/\s*\|\s*/);
    const comma = where.lastIndexOf(',');
    const tags = [...block.matchAll(/<span class="tag[^"]*">([\s\S]*?)<\/span>/g)].map((m) => text(m[1]));
    const surface = text(block.match(/icon-court[\s\S]*?<span class="nav-link__value">([\s\S]*?)<\/span>/)?.[1] ?? '');
    const title = text(name);
    out.push({
      id: id.toUpperCase(), name: title.replace(/\s*\(closed event\)\s*/i, '').trim(), venue: venue ?? '', city: (comma < 0 ? where : where.slice(0, comma)).trim(), country: (comma < 0 ? '' : where.slice(comma + 1)).trim(),
      start: dates[0], end: dates[1], surface, category: tags.find((t) => !/^\d+\s*&?U/i.test(t)) ?? '', age: Number(tags.find((t) => /^\d+\s*&?U/i.test(t))?.match(/\d+/)?.[0]) || null, closed: /closed event/i.test(title),
    });
  }
  return out;
}

const ajax = { 'x-requested-with': 'XMLHttpRequest', 'content-type': 'application/x-www-form-urlencoded' };

/** Every listed tournament starting from `from` to `to` (ISO dates): the search page's own paging (20 results a page). */
export async function searchTournaments(ts, from, to, log = console.log, { country = '' } = {}) {
  const page = await ts.get(`/find?StartDate=${from}&EndDate=${to}&StatusFilterID=0`);
  const form = page.match(/<form[^>]*action="\/find\/tournament\/DoSearch"[\s\S]*?<\/form>/i)?.[0] ?? '';
  const body = new URLSearchParams();
  for (const m of form.matchAll(/<input[^>]*>/gi)) {
    const tag = m[0], name = tag.match(/name="([^"]+)"/)?.[1], type = tag.match(/type="([^"]+)"/)?.[1] ?? 'text';
    if (name && !['checkbox', 'radio', 'submit', 'button'].includes(type)) body.set(name, tag.match(/value="([^"]*)"/)?.[1] ?? '');
  }
  body.set('TournamentFilter.StartDate', from); body.set('TournamentFilter.EndDate', to); body.set('TournamentExtendedFilter.StatusFilterID', '0');
  // a country ("ISR") narrows the search to the tournaments held there
  if (country) body.set('TournamentExtendedFilter.CountryCode', country);
  const all = new Map();
  for (let p = 1; p <= 40; p++) {
    body.set('Page', String(p));
    if (p > 1) body.set('LoadMoreResults', 'LoadMoreResults');
    const html = await ts.get('/find/tournament/DoSearch', { method: 'POST', headers: ajax, body });
    const got = parseSearch(html);
    for (const e of got) all.set(e.id, e);
    if (got.length < 20) break;
  }
  log(`  search ${from}..${to}: ${all.size} tournaments`);
  return [...all.values()];
}

