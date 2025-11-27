# 🚀 מדריך הפעלה - RAG System עם Dicta-LM

## ✅ המערכת מוכנה!

כל מה שצריך זה להפעיל את שרת Dicta-LM ולהתחיל לשאול שאלות.

## 📋 שלב 1: הפעלת שרת Dicta-LM

```bash
# הפעל את השרת (ייקח 2-5 דקות לטעון את המודל)
python3 scripts/dicta_lm_server.py 5001
```

**חשוב:** תן לשרת זמן לטעון את המודל. תראה הודעות:
- `🔄 Loading model...`
- `✅ Model loaded`

## 📋 שלב 2: שימוש ב-API הקיים

ה-API הקיים (`POST /api/chat`) **כבר משתמש ב-RAG + LLM!**

### דרך Next.js API:

```bash
# הפעל את Next.js (אם לא רץ)
npm run dev

# שאל שאלה דרך API
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "message": "מה זה מעגל התודעה?"
  }'
```

### או דרך CLI (Python):

```bash
# פתח טרמינל נוסף (השרת רץ בטרמינל הראשון)
python3 scripts/askRag.py "מה זה מעגל התודעה?"
```

## 🔧 הגדרת סביבה (אופציונלי)

אם אתה רוצה להשתמש ב-Dicta-LM דרך ה-API הקיים, הוסף ל-`.env`:

```bash
USE_PYTHON_LLM=true
PYTHON_LLM_SERVER_URL=http://localhost:5001
```

## 📊 מה המערכת עושה?

1. **RAG Search**: מוצאת chunks רלוונטיים (עם CrossEncoder)
2. **Context Building**: בונה prompt עם הקונטקסט
3. **Dicta-LM**: המודל הכי טוב בעברית עונה
4. **Response**: מחזיר תשובה מדויקת בעברית

## ✅ המערכת כוללת:

- ✅ 8,126 chunks במסד הנתונים
- ✅ CrossEncoder ל-re-ranking משופר
- ✅ Dicta-LM 2.0 (המודל הכי טוב בעברית)
- ✅ API endpoint: `POST /api/chat`
- ✅ CLI: `python3 scripts/askRag.py`

## 🎯 דוגמאות שאלות:

```bash
# דרך CLI
python3 scripts/askRag.py "מה זה מעגל התודעה?"
python3 scripts/askRag.py "מה ההבדל בין תודעה ראקטיבית לאקטיבית?"
python3 scripts/askRag.py "איך נוצרת שחיקה לפי הקורס?"

# דרך API
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"userId": "test", "message": "מה זה מעגל התודעה?"}'
```

## ⚠️ בעיות נפוצות

**השרת לא עולה:**
```bash
# בדוק אם הפורט תפוס
lsof -i :5001

# הרוג תהליך קיים
pkill -f dicta_lm_server

# הפעל מחדש
python3 scripts/dicta_lm_server.py 5001
```

**המודל לא נטען:**
- בדוק שיש מספיק זיכרון (המודל גדול)
- תן זמן לטעינה (2-5 דקות)
- בדוק את הלוגים: `tail -f /tmp/dicta_server.log`
