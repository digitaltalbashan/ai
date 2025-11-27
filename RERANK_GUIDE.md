# מדריך Rerank מקומי - שיפור איכות ה-RAG

## 📋 תוכן עניינים

1. [סקירה כללית](#סקירה-כללית)
2. [מודלים זמינים](#מודלים-זמינים)
3. [שימוש בקוד](#שימוש-בקוד)
4. [אינטגרציה ב-RAG Flow](#אינטגרציה-ב-rag-flow)
5. [השוואת מודלים](#השוואת-מודלים)

---

## 🎯 סקירה כללית

המערכת שלך כבר משתמשת ב-**CrossEncoder** לריראנק, וזה מעולה! 

**מה הוספנו:**
- תמיכה במודלים מרובים (4 אופציות)
- אפשרות לשנות מודל בקלות
- פונקציות נוספות לבדיקה והשוואה

---

## 📦 מודלים זמינים

### 1. **"fast"** - cross-encoder/ms-marco-MiniLM-L-6-v2 (ברירת מחדל)

**יתרונות:**
- ✅ מהיר מאוד (CPU-friendly)
- ✅ קטן (כ-22MB)
- ✅ עובד מעולה לרוב המקרים
- ✅ כבר מותקן ומשמש במערכת שלך

**מתי להשתמש:**
- מחשב רגיל (CPU בלבד)
- צורך במהירות
- רוב המקרים - זה מספיק!

---

### 2. **"balanced"** - BAAI/bge-reranker-base

**יתרונות:**
- ✅ איכות טובה יותר מ-"fast"
- ✅ עדיין מהיר יחסית
- ✅ טוב לעברית (BAAI = Beijing Academy)

**מתי להשתמש:**
- יש GPU או RAM טוב
- רוצים שיפור באיכות בלי להקריב יותר מדי מהירות

---

### 3. **"best"** - BAAI/bge-reranker-large

**יתרונות:**
- ✅ האיכות הטובה ביותר
- ✅ מצוין לעברית
- ⚠️ דורש יותר משאבים (RAM/GPU)

**מתי להשתמש:**
- יש GPU חזק או RAM רב
- רוצים את האיכות המקסימלית
- זמן תגובה פחות קריטי

---

### 4. **"latest"** - mixedbread-ai/mxbai-rerank-large-v1

**יתרונות:**
- ✅ המודל החדש ביותר
- ✅ איכות מצוינת
- ⚠️ דורש משאבים רבים

**מתי להשתמש:**
- רוצים לנסות את החדש ביותר
- יש משאבים מספיקים

---

## 💻 שימוש בקוד

### שיטה 1: משתנה סביבה (הכי קל)

```bash
# לשנות מודל לפני הרצת הסקריפט
export RERANK_MODEL=balanced
python3 scripts/query_rag_questions.py
```

### שיטה 2: בקוד (rag/query_improved.py)

```python
# שורה 31 ב-rag/query_improved.py
RERANK_MODEL_NAME = "BAAI/bge-reranker-base"  # במקום המודל הנוכחי
```

### שיטה 3: ישירות דרך model_cache

```python
from rag.model_cache import get_rerank_model

# טעינת מודל עם alias
reranker = get_rerank_model("balanced")  # או "fast", "best", "latest"

# או עם שם מלא
reranker = get_rerank_model("BAAI/bge-reranker-base")
```

### שיטה 4: עם RagQueryEngine

```python
from rag.query_improved import RagQueryEngine

# יצירת engine עם מודל ספציפי
engine = RagQueryEngine(
    rerank_model_name="balanced"  # או "fast", "best", "latest"
)
```

---

## 🔄 אינטגרציה ב-RAG Flow

המערכת שלך כבר עובדת כך:

```
1. Retrieval (Vector Search)
   ↓
2. Rerank (CrossEncoder) ← כאן אתה משתמש במודל
   ↓
3. LLM Answer (Dicta-LM 2.0)
```

**איפה זה קורה בקוד:**

```python
# rag/query_improved.py - שורה 124-148
def rerank(self, question: str, candidates: List[Dict]) -> List[Dict]:
    # מכין זוגות (שאלה, טקסט)
    pairs = [[question, c["text"]] for c in candidates]
    
    # מקבל ציונים מהמודל
    scores = self.rerank_model.predict(pairs, batch_size=32)
    
    # מוסיף ציונים וממיין
    for c, s in zip(candidates, scores):
        c["rerank_score"] = float(s)
    
    return sorted(candidates, key=lambda x: x["rerank_score"], reverse=True)[:top_n]
```

**זה כבר חלק מה-flow שלך!** רק צריך לשנות את המודל.

---

## 🧪 השוואת מודלים

### בדיקה מהירה

```bash
python3 scripts/test_rerank_models.py
```

### בדיקה מותאמת אישית

```python
from rag.rerank_improved import compare_rerank_models

question = "מה זה תודעה ריאקטיבית?"
chunks = [...]  # רשימת chunks שלך

# השוואה בין מודלים
results = compare_rerank_models(
    question=question,
    chunks=chunks,
    models=["fast", "balanced", "best"],
    top_n=5
)

# תוצאות
for model_name, reranked_chunks in results.items():
    print(f"{model_name}: Top score = {reranked_chunks[0]['rerank_score']:.3f}")
```

---

## 📊 המלצות

### למחשב רגיל (CPU, 8-16GB RAM):
```bash
export RERANK_MODEL=fast  # או לא להגדיר (ברירת מחדל)
```

### למחשב עם GPU או RAM רב (32GB+):
```bash
export RERANK_MODEL=balanced  # שיפור באיכות
```

### למחשב חזק מאוד (GPU חזק, 64GB+ RAM):
```bash
export RERANK_MODEL=best  # איכות מקסימלית
```

---

## 🔍 איך לבדוק אם המודל עובד טוב?

1. **השוואת Top Scores:**
   - מודל טוב יותר → Top Score גבוה יותר
   - בדרך כלל: fast < balanced < best

2. **בדיקת רלוונטיות:**
   - האם ה-chunks שחזרו רלוונטיים לשאלה?
   - האם ה-Top chunk באמת הכי רלוונטי?

3. **בדיקה על השאלות שלך:**
   ```bash
   # הרץ את הסקריפט עם מודלים שונים
   export RERANK_MODEL=fast
   python3 scripts/query_rag_questions.py
   
   export RERANK_MODEL=balanced
   python3 scripts/query_rag_questions.py
   
   # השווה את התוצאות
   ```

---

## 🚀 דוגמה מלאה

```python
from rag.query_improved import RagQueryEngine

# יצירת engine עם מודל "balanced"
engine = RagQueryEngine(rerank_model_name="balanced")

# שאלה
question = "מה זה תודעה ריאקטיבית?"

# תהליך מלא
candidates = engine.retrieve_candidates(question)  # 50 candidates
top_chunks = engine.rerank(question, candidates)   # Top 8 אחרי rerank
answer = engine.answer(question)                  # תשובה מהמודל

# תוצאות
print(f"Top chunk score: {top_chunks[0]['rerank_score']:.3f}")
print(f"Answer: {answer}")

engine.close()
```

---

## 📝 סיכום

✅ **המערכת שלך כבר עובדת מצוין** עם `cross-encoder/ms-marco-MiniLM-L-6-v2`

✅ **עכשיו יש לך אפשרות** לשדרג למודלים טובים יותר בקלות

✅ **הכל כבר מוכן** - רק צריך לשנות את המודל!

---

## 🆘 בעיות נפוצות

**Q: המודל לא נטען?**
A: ודא ש-`sentence-transformers` מותקן: `pip install sentence-transformers`

**Q: המודל איטי מדי?**
A: נסה `fast` במקום `best`, או הקטן את `batch_size`

**Q: אין מספיק RAM?**
A: השתמש ב-`fast` (הקטן ביותר) או הקטן את `top_k_retrieve`

---

**שאלות? בעיות?** תגיד לי ואני אעזור! 🚀

