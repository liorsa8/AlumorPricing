# AlumorPricing — מחשבון הצעות מחיר לחלונות ודלתות

אפליקציית הצעות מחיר פשוטה למפעל אלומיניום/PVC, ללא מנוע CAD — רק רשימת חלונות/דלתות ← הצעת מחיר מוכנה להדפסה.

התחברות עם Google, וכל המידע נשמר ב-Firebase (Firestore) — משותף בין מכשירים, ותומך בכמה עסקים לכל משתמש.

## הרצה (פיתוח)

```bash
npm install
npm run dev
```

האפליקציה תיפתח בכתובת `http://localhost:5173/AlumorPricing/`. נדרש קובץ `web/.env` (העתיקו מ-`web/.env.example`). להרצה מול אמולטור מקומי במקום הפרויקט האמיתי — ראו [docs/MANUAL_QA.md](docs/MANUAL_QA.md).

## בנייה לשימוש (build)

```bash
npm run build
```

התוצאה היא אתר סטטי בתיקייה `web/dist`.

## אחסון (Firebase Hosting)

האתר מפורסם ב-Firebase Hosting, באותו פרויקט של Auth ו-Firestore. הפרסום ידני, מהמחשב שלכם:

```bash
firebase login             # פעם אחת
npm run deploy:hosting     # בונה ומפרסם
```

הכתובת: `https://alumor-pricing.web.app` — HTTPS אמיתי, וזו הכתובת שפותחים ב-iPhone/Android כדי להתקין את האפליקציה ("הוספה למסך הבית").

אם שינית את `firestore.rules` או `firestore.indexes.json`, יש לפרסם אותם בנפרד: `firebase deploy --only firestore:rules,firestore:indexes`.

## גיבוי

כל המידע העסקי (לקוחות, קטלוג מחירים, הצעות מחיר) נשמר ב-Firestore.

בעמוד "הגדרות" יש כפתורי **ייצוא גיבוי** / **ייבוא מקובץ גיבוי** — אלה שומרים/משחזרים את לקוחות והצעות המחיר של העסק כקובץ JSON יחיד. מומלץ לייצא גיבוי מדי פעם.

## מבנה הפרויקט

- `web/` — React + Vite, הלוגיקה (כולל תמחור) רצה בדפדפן, והנתונים ב-Firebase (Auth + Firestore). ממשק בעברית מימין לשמאל (RTL).

ראו את [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) לפירוט מלא של מודל הנתונים ונוסחאות החישוב.
