# אפליקציית מובייל (Expo, Android / iPhone / iPad)

לקוח מעל ה-API של האתר (`/api/v1`). הכתובת מוגדרת ב-`extra.apiUrl` ב-`app.json` (כרגע האתר החי).

```bash
cd mobile && npm install
npx expo start          # פותחים ב-Expo Go בטלפון
npx tsc --noEmit        # typecheck
```

בנייה לחנויות: `docs/vercel-deploy.md` (סעיף 6).

## מסכים

הניווט זהה לאתר: פס עליון (לוגו, כפתור שפה, אווטאר החשבון, תפריט המבורגר) ודוק תחתון (בית, משחקים, דירוג, שחקנים, חיפוש).

| מסך | תוכן |
|---|---|
| בית | הירו עם חיפוש, ההרשמה הקרובה, אריחים מהירים, "הבית שלי" לשחקנים ולהורים, רשימת תחרויות עם סינון |
| תחרות | כרטיס השחקן שלי, הרשמה (ב-Loglig), משתתפים, **עץ התחרות** (או רשימת משחקים), הזנת תוצאה לשופטים |
| משחקים | חי עכשיו, קרובים, תוצאות אחרונות |
| דירוג, שחקנים, חיפוש | דירוג לפי מין וגיל; חיפוש שחקנים; חיפוש אחד על שחקנים, מועדונים ותחרויות |
| תפריט | מועדונים, ליגות, תקנונים, סטטיסטיקות, אודות, חשבון, בחירת שפה |
| חשבון | כניסה / הרשמה, שחקנים וילדים בחשבון, מסמכים, הרשמות, התראות, כניסת ילד |

## מבנה

| קובץ | תוכן |
|---|---|
| `App.tsx` | הניווט ורוב המסכים |
| `src/api.ts` | קריאות ל-API, שמירת הכניסה (SecureStore) |
| `src/i18n/` | שפות: `index.ts` (רשימת השפות, `tr()`), `en.ts` (אנגלית). ראו `docs/i18n.md` |
| `src/Bracket.tsx`, `src/bracketLayout.ts` | עץ התחרות; הפריסה זהה ל-`apps/web/src/services/bracket.ts` (נבדקת שם) ויש לשמור עליהן מסונכרנות |
| `src/MyHome.tsx`, `src/More.tsx` | "הבית שלי", ומסכי התפריט (ליגות, תקנונים, מועדונים, סטטיסטיקות, אודות) |
| `src/theme.tsx` | צבעים (בהיר / כהה, לפי הטלפון), פונטים Heebo / Rubik, אייקונים. זהה לאתר, ראו `docs/design-system.md` |

## כיוון הכתיבה

הכיוון נקבע לפי השפה ולא לפי הגדרת הטלפון: עברית מימין לשמאל, אנגלית משמאל לימין (`direction` על שורש העץ, עובד גם ב-Expo Go).
שדות טקסט מיושרים עם `startAlign()`; כשצריך צד, משתמשים ב-`start` / `end` ולא ב-`left` / `right`.

## Release build for a phone (APK, no Metro)

Needs the Android SDK, a JDK 17+ (Android Studio's bundled JBR works) and about 15 minutes the first time.

```powershell
cd mobile
npx expo prebuild --platform android --no-install        # generates mobile/android (git-ignored)
# Expo's Compose compiler asks for Kotlin 1.9.25 while this React Native ships 1.9.24. Append to android/build.gradle:
#   allprojects { tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
#     kotlinOptions.freeCompilerArgs += ["-P", "plugin:androidx.compose.compiler.plugins.kotlin:suppressKotlinVersionCompatibilityCheck=true"] } }
cd android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
adb install -r app\build\outputs\apk\release\app-release.apk
```

`newArchEnabled` is on in `app.json` so the release build lays out right to left like Expo Go does. The APK is signed with the debug key: fine for testing on your own phone, not for the store (use EAS Build for that).
