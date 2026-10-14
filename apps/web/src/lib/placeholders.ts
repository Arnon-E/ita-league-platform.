/** Draw placeholders the source emits instead of a player: "Bye Bye", "Loser Loser", "Winner 3", "W.O". */
export const PLACEHOLDER_NAME = /^\s*(bye|loser|winner|w\.?\s?o\.?|tbd|qualifier)\b/i;
/** Same rule for Postgres: `(first_name || ' ' || last_name) ~* ${PLACEHOLDER_SQL}`. `\y` is Postgres' word boundary. */
export const PLACEHOLDER_SQL = String.raw`^\s*(bye|loser|winner|w\.?\s?o\.?|tbd|qualifier)\y`;
