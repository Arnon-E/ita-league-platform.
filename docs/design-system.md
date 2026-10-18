# Design system ("Volt Night")

The website and the app share one visual language: a cool paper ground (near-black in dark mode), an electric volt accent, navy
ink (the blue of the ITA logo, chosen over black in 2026-10) for buttons and dark cards, large radii, flat bordered surfaces, and floating glass chrome for the things that float (top bar, dock, menus).

Sources of truth in code:
- Website: `apps/web/src/app/globals.css` (CSS custom properties on `:root`, dark values under `prefers-color-scheme: dark`).
- App: `mobile/src/theme.tsx` (`light` and `dark`, picked from the phone's theme at launch), icons and the ball mark.

## Figma

File: **ITA League Platform** — https://www.figma.com/design/4bveoAzLOZjuOGQ0IkFnSk

| Page | Content |
|---|---|
| Design System | Variables, text styles, shadows and the components below |
| Web | Website screens (desktop and phone) |
| App | App screens |

The team is on Figma's Starter plan, which allows 3 pages per file and one mode per variable collection. So the light theme is the
`Color` collection (the components are bound to it) and the dark values are a second collection, `Color · Dark`, with the same
names. Every color variable carries the CSS variable it mirrors as its web code syntax (`var(--surface)`).

The Figma variables still hold the old black `ink` / `btn` (#0C1210 / #0E1512); update them to navy (#0A1F44 / #13306E) when
Figma is available again. Status (2026-10-18): foundations and the atom and data components are built; the navigation components and the screens are
still to do (the Starter plan's limit on Figma calls from Claude stopped the build).

## Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | #EEF0EA | #070A09 | page |
| `surface` / `surface2` | #FFFFFF / #F5F6F1 | #111715 / #171E1B | cards, inputs / secondary fills |
| `line` / `line2` | #E0E3DA / #C9CEC3 | #222B27 / #33403A | borders, dividers / stronger borders, bracket lines |
| `text` / `muted` | #0E1512 / #59655E | #EDF1EE / #8E9B94 | text |
| `btn` / `btn-text` | #13306E / #FFFFFF | #D2FF2E / #0C1210 | primary button, selected chip, active dock tab |
| `volt` / `ink` | #D2FF2E / #0A1F44 | same | accent (call to action, my player, open registration) / dark hero and featured cards |
| `blue` / `blue2` | #2447F5 / #4A67FF | #8CA3FF / #A9BAFF | links, focus ring |
| `ok`, `warn`, `bad` (+ `-bg`) | #0B7A43, #8F4E00, #B3261E | #5BD58F, #F5B452, #FF8A7E | win / pending / loss and their tinted pills |

Spacing: 4, 6, 8, 12, 16, 24, 32. Radius: 12 (bracket boxes), 14 (inputs), 22 (cards, `--r`), 28 (tiles, hero), 999 (pills,
buttons, bars).

## Type

| Style | Font | Use |
|---|---|---|
| Display H1 / H2 / H3, Stat, Brand | Rubik ExtraBold / Bold / SemiBold (Hebrew); the website uses Bricolage Grotesque for Latin headings | page titles, section titles, big numbers |
| Body, Small, Caption, Label, Score | Heebo Regular / SemiBold / Bold | text, labels, scores (tabular figures) |

## Components

Button (Primary, Ghost, Volt × Default, Small) · Chip (Default, Selected) · Status Pill (Neutral, Ok, Warn, Bad, Volt) · Input ·
Avatar · Icons (24px line icons from `theme.tsx`) and the ball mark · Stat Tile · Result Row (Win, Loss) · Bracket Row (Winner ×
Me) and Bracket Match (Played, Pending) · Tournament Card · Featured Registration · Player Card (tournament page) · My Player
Card (home) · Top Bar (mobile and web), Dock, Menu, Hero.

Layout rules worth keeping: Hebrew lays out right to left and English left to right, so sides are always logical (start / end);
scores are read left to right in both languages; the viewer's own player is marked with a light volt tint.
