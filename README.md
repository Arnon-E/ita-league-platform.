# ita-league-platform

מערכת חלופית ללוגליג לניהול תחרויות, שחקנים, דירוגים, תשלומים והתראות של איגוד הטניס בישראל.
Web, iPhone, iPad ו-Android.

## מה יש כאן

| נתיב | תוכן |
|---|---|
| `docs/PRD.md` | מסמך דרישות מוצר מלא (18 סעיפים) |
| `docs/ita-sources.md` | מקורות התקנונים ופערים ידועים |
| `design/mockups/` | 14 מסכי mock אינטראקטיביים (`*.dc.html`) ו-`canvas.json` עם מיקומם בקנבס |

## על ה-mocks
קבצי ה-`.dc.html` נוצרו בקנבס Design של Claude וזקוקים ל-`support.js` של הקנבס, ולכן נפתחים שם ולא ישירות בדפדפן.
הם משמשים כמקור עיצובי לבנייה. כל הנתונים בהם נתוני דמה.

## מסמכים נוספים
ה-PRD נכתב ב-Claude Docs, וגרסת ה-Markdown בתיקיית `docs` היא העתק מתאריך 4.10.2026.

## מצב המימוש

| רכיב | מצב |
|---|---|
| מנוע חוקים (הגרלה עם זריעה, בתים חלקיים, שיבוץ, דירוג, החזרים) | ✅ 27 בדיקות |
| בסיס נתונים, התחברות, הרשאות, התחזות, ביקורת | ✅ |
| רישום, מסמכים (אחסון פרטי), תשלומים + webhook, החזרים | ✅ |
| הגרלה, בתים, הדחה, תוצאות (ווק-אובר/פרישה), נקודות דירוג | ✅ |
| מגרשים לכל תחרות, שיבוץ אוטומטי וידני (שעה מדויקת / לא לפני) | ✅ |
| התראות (תור, העדפות, retry) | ✅ — חסרים מתאמי שליחה אמיתיים (אימייל/SMS/push) |
| ייבוא מלוגליג (CSV) | ✅ — ייבוא ישיר מה-DB של לוגליג תלוי בגישה |
| Web (RTL) + API למובייל + PWA | ✅ |
| אפליקציית Expo (Android / iPhone / iPad) | 🟡 שלד, לא הורץ על מכשיר |
| ספק סליקה אמיתי | 🟡 מוכן ל-webhook חתום, נדרש ספק וחשבון |
| **אימות מספרי תקנון האיגוד מול ה-PDF המקוריים** | ⚠️ חובה לפני שימוש (docs/ita-sources.md) |

## הרצה מקומית (Web)

```bash
pnpm install
createdb ita && createdb ita_test
cd apps/web
cp .env.example .env
DATABASE_URL=postgresql://postgres@localhost:5432/ita npx drizzle-kit push --force
DATABASE_URL=postgresql://postgres@localhost:5432/ita pnpm db:seed   # משתמשי דמו, סיסמה Passw0rd!!
DATABASE_URL=postgresql://postgres@localhost:5432/ita pnpm dev
pnpm test        # בדיקות אינטגרציה מול ita_test
```

משתמשי דמו: `super@ita.test`, `fed@ita.test`, `manager@ita.test`, `ref@ita.test`.
