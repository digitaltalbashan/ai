# OpenAI API Setup

הפרויקט משתמש **רק** ב-OpenAI API עבור LLM ו-embeddings.

## ✅ מה מותקן:

1. **חבילת OpenAI** - `openai` (גרסה 6.9.1)
2. **לקוח OpenAI** - `src/server/llmClientOpenAI.ts`
3. **Embeddings** - OpenAI text-embedding-3-small

## 🔧 הגדרה:

הגדר את משתני הסביבה הבאים ב-`.env`:

```env
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
USE_OPENAI=true
```

**חשוב:** `OPENAI_API_KEY` הוא חובה. המערכת לא תעבוד בלעדיו.

## 🧪 בדיקה:

כל קריאה ל-`/api/chat` תשתמש ב-OpenAI API.

תראה הודעה בקונסול:
```
✅ Using OpenAI API for LLM
```

## 💰 עלויות:

- **gpt-4o-mini** (ברירת מחדל): ~$0.15 / 1M input tokens, ~$0.60 / 1M output tokens
- **gpt-4o**: ~$2.50 / 1M input tokens, ~$10.00 / 1M output tokens
- **gpt-4-turbo**: ~$10.00 / 1M input tokens, ~$30.00 / 1M output tokens

לשינוי מודל, עדכן את `OPENAI_MODEL` ב-`.env`.

## ⚠️ הערות:

- המפתח API רגיש - אל תעלה אותו ל-Git
- הקובץ `.env` כבר ב-`.gitignore`
- לבדיקות, מומלץ להשתמש ב-`gpt-4o-mini` (זול יותר)

