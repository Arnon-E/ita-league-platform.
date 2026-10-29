/**
 * Countries as Tennis Europe and the ITF spell them in their tournament lists -> [ISO 3166 alpha-2 code, Hebrew name].
 * The code gives the flag (an image on the site, an emoji in the app); a country missing here shows as written, without a flag.
 */
const LIST: [string, string, string][] = [
  ['Albania', 'al', 'אלבניה'], ['Andorra', 'ad', 'אנדורה'], ['Armenia', 'am', 'ארמניה'], ['Austria', 'at', 'אוסטריה'], ['Azerbaijan', 'az', 'אזרבייג׳ן'], ['Belarus', 'by', 'בלארוס'], ['Belgium', 'be', 'בלגיה'],
  ['Bosnia/Herzegovina', 'ba', 'בוסניה והרצגובינה'], ['Bosnia and Herzegovina', 'ba', 'בוסניה והרצגובינה'], ['Bulgaria', 'bg', 'בולגריה'], ['Croatia', 'hr', 'קרואטיה'], ['Cyprus', 'cy', 'קפריסין'],
  ['Czechia', 'cz', 'צ׳כיה'], ['Czech Republic', 'cz', 'צ׳כיה'], ['Denmark', 'dk', 'דנמרק'], ['Estonia', 'ee', 'אסטוניה'], ['Faroe Islands', 'fo', 'איי פארו'], ['Finland', 'fi', 'פינלנד'], ['France', 'fr', 'צרפת'],
  ['Georgia', 'ge', 'גאורגיה'], ['Germany', 'de', 'גרמניה'], ['Great Britain', 'gb', 'בריטניה'], ['United Kingdom', 'gb', 'בריטניה'], ['Greece', 'gr', 'יוון'], ['Hungary', 'hu', 'הונגריה'], ['Iceland', 'is', 'איסלנד'],
  ['Ireland', 'ie', 'אירלנד'], ['Israel', 'il', 'ישראל'], ['Italy', 'it', 'איטליה'], ['Kosovo', 'xk', 'קוסובו'], ['Latvia', 'lv', 'לטביה'], ['Liechtenstein', 'li', 'ליכטנשטיין'], ['Lithuania', 'lt', 'ליטא'],
  ['Luxembourg', 'lu', 'לוקסמבורג'], ['Malta', 'mt', 'מלטה'], ['Moldova', 'md', 'מולדובה'], ['Monaco', 'mc', 'מונקו'], ['Montenegro', 'me', 'מונטנגרו'], ['Netherlands', 'nl', 'הולנד'], ['North Macedonia', 'mk', 'צפון מקדוניה'],
  ['Norway', 'no', 'נורווגיה'], ['Poland', 'pl', 'פולין'], ['Portugal', 'pt', 'פורטוגל'], ['Romania', 'ro', 'רומניה'], ['Russia', 'ru', 'רוסיה'], ['San Marino', 'sm', 'סן מרינו'], ['Serbia', 'rs', 'סרביה'],
  ['Slovak Republic', 'sk', 'סלובקיה'], ['Slovakia', 'sk', 'סלובקיה'], ['Slovenia', 'si', 'סלובניה'], ['Spain', 'es', 'ספרד'], ['Sweden', 'se', 'שוודיה'], ['Switzerland', 'ch', 'שווייץ'], ['Turkiye', 'tr', 'טורקיה'],
  ['Turkey', 'tr', 'טורקיה'], ['Ukraine', 'ua', 'אוקראינה'],
  // ITF's list reaches beyond Europe
  ['Egypt', 'eg', 'מצרים'], ['Tunisia', 'tn', 'תוניסיה'], ['Morocco', 'ma', 'מרוקו'], ['Algeria', 'dz', 'אלג׳יריה'], ['Jordan', 'jo', 'ירדן'], ['Lebanon', 'lb', 'לבנון'], ['Kenya', 'ke', 'קניה'], ['Nigeria', 'ng', 'ניגריה'],
  ['South Africa', 'za', 'דרום אפריקה'], ['Zimbabwe', 'zw', 'זימבבואה'], ['Uganda', 'ug', 'אוגנדה'], ['Rwanda', 'rw', 'רואנדה'], ['USA', 'us', 'ארצות הברית'], ['United States', 'us', 'ארצות הברית'], ['Canada', 'ca', 'קנדה'],
  ['Mexico', 'mx', 'מקסיקו'], ['Brazil', 'br', 'ברזיל'], ['Argentina', 'ar', 'ארגנטינה'], ['Chile', 'cl', 'צ׳ילה'], ['Colombia', 'co', 'קולומביה'], ['Peru', 'pe', 'פרו'], ['Ecuador', 'ec', 'אקוודור'], ['Uruguay', 'uy', 'אורוגוואי'],
  ['Paraguay', 'py', 'פרגוואי'], ['Bolivia', 'bo', 'בוליביה'], ['Venezuela', 've', 'ונצואלה'], ['Costa Rica', 'cr', 'קוסטה ריקה'], ['Dominican Republic', 'do', 'הרפובליקה הדומיניקנית'], ['Guatemala', 'gt', 'גואטמלה'],
  ['Japan', 'jp', 'יפן'], ['China', 'cn', 'סין'], ['Chinese Taipei', 'tw', 'טאיוואן'], ['Hong Kong, China', 'hk', 'הונג קונג'], ['India', 'in', 'הודו'], ['Thailand', 'th', 'תאילנד'], ['Indonesia', 'id', 'אינדונזיה'],
  ['Malaysia', 'my', 'מלזיה'], ['Singapore', 'sg', 'סינגפור'], ['Philippines', 'ph', 'הפיליפינים'], ['Vietnam', 'vn', 'וייטנאם'], ['Korea, Rep.', 'kr', 'דרום קוריאה'], ['Kazakhstan', 'kz', 'קזחסטן'], ['Uzbekistan', 'uz', 'אוזבקיסטן'],
  ['Sri Lanka', 'lk', 'סרי לנקה'], ['Pakistan', 'pk', 'פקיסטן'], ['Bangladesh', 'bd', 'בנגלדש'], ['Nepal', 'np', 'נפאל'], ['United Arab Emirates', 'ae', 'איחוד האמירויות'], ['Qatar', 'qa', 'קטאר'], ['Bahrain', 'bh', 'בחריין'],
  ['Saudi Arabia', 'sa', 'ערב הסעודית'], ['Kuwait', 'kw', 'כווית'], ['Oman', 'om', 'עומאן'], ['Australia', 'au', 'אוסטרליה'], ['New Zealand', 'nz', 'ניו זילנד'], ['Fiji', 'fj', 'פיג׳י'],
];
const BY_NAME = new Map(LIST.map(([name, cc, he]) => [name.toLowerCase(), { cc, he }]));

export function countryInfo(name: string): { cc: string | null; he: string } {
  const hit = BY_NAME.get(name.trim().toLowerCase());
  return { cc: hit?.cc ?? null, he: hit?.he ?? name };
}

/** ISO alpha-2 code -> the flag emoji (two regional-indicator letters); empty for a missing code. */
export const flagEmoji = (cc: string | null) => (cc && /^[a-z]{2}$/i.test(cc) ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '');
