# 🚀 מדריך שימוש - RAG עם Dicta-LM

## התקנה והפעלה

### 1. הפעלת שרת Dicta-LM
```bash
# הפעל את השרת ברקע
python3 scripts/dicta_lm_server.py > /tmp/dicta_server.log 2>&1 &

# בדוק שהשרת רץ
curl http://localhost:5001/status
```

### 2. שימוש ב-CLI
```bash
# שאל שאלה
python3 scripts/askRag.py "מה זה מעגל התודעה?"

# או שאלות נוספות
python3 scripts/askRag.py "מה ההבדל בין תודעה ראקטיבית לאקטיבית?"
python3 scripts/askRag.py "איך נוצרת שחיקה לפי הקורס?"
```

### 3. שימוש דרך API
```bash
# POST request
curl -X POST http://localhost:3000/api/rag/query \
  -H "Content-Type: application/json" \
  -d '{"question": "מה זה מעגל התודעה?"}'
```

## מה המערכת עושה?

1. **Vector Search**: מוצאת 40 chunks רלוונטיים
2. **Re-ranking**: CrossEncoder מדרג את ה-chunks
3. **Top 8**: לוקח את 8 הכי רלוונטיים
4. **Dicta-LM**: המודל הכי טוב בעברית עונה על בסיס ה-chunks

## קבצים חשובים

- `rag/query_improved.py` - Query engine עם CrossEncoder
- `scripts/askRag.py` - CLI לשאילתות
- `scripts/dicta_lm_server.py` - שרת Dicta-LM
- `app/api/rag/query/route.ts` - API endpoint

## בעיות נפוצות

**השרת לא מגיב:**
```bash
# בדוק שהשרת רץ
ps aux | grep dicta_lm_server

# הפעל מחדש
pkill -f dicta_lm_server
python3 scripts/dicta_lm_server.py > /tmp/dicta_server.log 2>&1 &
```

**אין תשובה:**
- בדוק שהשרת רץ: `curl http://localhost:5001/status`
- בדוק את הלוגים: `tail -f /tmp/dicta_server.log`
