# אפליקציית מובייל (Expo, אנדרואיד / iPhone / iPad)

לקוח דק מעל `/api/v1` של אפליקציית ה-Web. עוד לא הורצה על מכשיר.

```bash
cd mobile && npm install
# עדכנו extra.apiUrl ב-app.json לכתובת השרת
npx expo start
```

מסכים: כניסה, רשימת תחרויות, משחקי תחרות, הזנת תוצאה מהירה. נדרש להוסיף: רישום push (expo-notifications → POST /api/v1/devices), מסך "האזור שלי".
