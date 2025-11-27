# מדריך לבדיקת ה-Flow

## שלבים לבדיקה:

1. **בדיקת משתני סביבה:**
   ```bash
   # בדוק ב-.env:
   USE_OPENAI=true
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o-mini
   ```

2. **בדיקת השרת:**
   - השרת צריך לרוץ על פורט 3000
   - בדוק את הלוגים של השרת

3. **בדיקת Authentication:**
   - המשתמש צריך להיות מחובר
   - Session צריך להיות תקין

4. **בדיקת RAG:**
   - Python RAG צריך לעבוד (retrieval + rerank)
   - צ'אנקים צריכים להתקבל

5. **בדיקת OpenAI:**
   - החיבור ל-OpenAI צריך לעבוד
   - התשובה צריכה להתקבל

## בעיות נפוצות:

1. **USE_OPENAI לא מוגדר** - הוסף ל-.env: `USE_OPENAI=true`
2. **OPENAI_API_KEY חסר** - הוסף את המפתח
3. **Python RAG לא עובד** - בדוק את venv ו-dependencies
4. **Authentication לא עובד** - בדוק את NextAuth configuration

