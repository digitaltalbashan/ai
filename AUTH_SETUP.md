# 🔐 הוראות הגדרת אימות Gmail

## שלב 1: הגדרת Google OAuth

1. לך ל-[Google Cloud Console](https://console.cloud.google.com/)
2. צור פרויקט חדש או בחר פרויקט קיים
3. לך ל-APIs & Services > Credentials
4. לחץ על "Create Credentials" > "OAuth client ID"
5. בחר "Web application"
6. הוסף Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (פיתוח)
   - `https://yourdomain.com/api/auth/callback/google` (פרודקשן)
7. העתק את Client ID ו-Client Secret

## שלב 2: עדכון משתני סביבה

הוסף לקובץ `.env`:

```env
# NextAuth
AUTH_SECRET="no47T4mkGTUsejfNLxuf9xVEpF30EziQYLIXYcA2hgQ="
AUTH_URL="http://localhost:3000"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id-here"
GOOGLE_CLIENT_SECRET="your-google-client-secret-here"
```

**חשוב:** החלף את `AUTH_SECRET` ב-secret אקראי משלך (ניתן ליצור עם `openssl rand -base64 32`)

## שלב 3: הרצת Migration

```bash
pnpm prisma migrate deploy
```

או אם אתה בפיתוח:

```bash
pnpm prisma db push
```

## שלב 4: הפעלת השרת

```bash
pnpm dev
```

## מה נוסף למערכת?

✅ **הזדהות עם Gmail** - משתמשים מתחברים עם חשבון Google שלהם
✅ **שמירת זהות** - כל משתמש מזוהה לפי email שלו
✅ **היסטוריית שיחות** - כל השיחות נשמרות ומקושרות למשתמש
✅ **קונטקסט אישי** - המערכת שומרת ומעדכנת קונטקסט אישי לכל משתמש
✅ **שליחת קונטקסט למודל** - הקונטקסט האישי נשלח עם כל שאלה למודל
✅ **עדכון קונטקסט** - הקונטקסט מתעדכן אחרי כל שאלה/תשובה

## מבנה הקונטקסט

הקונטקסט נשמר ב-`user_contexts` וכולל:
- מידע אישי (שם, גיל, מקצוע, וכו')
- העדפות
- היסטוריית נושאים שנדונו
- נקודות חשובות מהשיחות

הקונטקסט מתעדכן אוטומטית מתוך השיחות, אבל ניתן גם לעדכן אותו ידנית דרך ה-API.

