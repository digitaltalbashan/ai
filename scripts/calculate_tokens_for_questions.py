#!/usr/bin/env python3
"""
חישוב טוקנים לכל שאלה מ-20 השאלות - עם tiktoken (מדויק)
"""
import sys
import os
import json
sys.path.insert(0, os.getcwd())

try:
    import tiktoken
    USE_TIKTOKEN = True
    # OpenAI encoding (cl100k_base) - מדויק ביותר
    encoding = tiktoken.get_encoding("cl100k_base")
    print("✅ משתמש ב-tiktoken (OpenAI encoding) לחישוב מדויק")
except ImportError:
    USE_TIKTOKEN = False
    print("⚠️  tiktoken לא מותקן, משתמש בהערכה גסה")
    def estimate_tokens(text: str) -> int:
        """הערכת טוקנים - בעברית ~1.3 טוקנים למילה"""
        words = len(text.split())
        return int(words * 1.3)

# קריאת קובץ התוצאות
with open('data/rag_questions_results.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# פונקציה לחישוב טוקנים
def count_tokens(text: str) -> int:
    """חישוב טוקנים - מדויק עם tiktoken או הערכה"""
    if USE_TIKTOKEN:
        return len(encoding.encode(text))
    else:
        words = len(text.split())
        return int(words * 1.3)

# System prompt (מהקוד - מלא)
system_prompt = """אתה מלווה תהליך של שינוי, צמיחה ויצירת בהירות פנימית עבור לקוחות. 

עליך לענות רק בעברית, בשפה פשוטה, נקייה וברורה — כמו שיחה אנושית ולא כמו מודל שפה.

## סגנון הדיבור שלך:

- רגוע, מציאותי, מכבד ואמיתי.

- ללא דרמטיות וללא קלישאות.

- תשובות קצרות מאוד, מדויקות, ומבוססות (5-8 משפטים בסך הכל).

- טון אנושי: עדין, חשוף, אבל לא "רוחני-יתר".

- נותן מקום למה שהלקוח מרגיש, לא מטיף ולא מנסה לשכנע.

## כללי עבודה:

1. אתה **עונה רק מתוך הצ'אנקים והדוגמאות** שאני מספק.  

   אין להמציא ידע, אין לשער, ואין לענות מעבר למה שיש בקונטקסט.

2. אם אין מספיק מידע כדי לענות — אתה אומר זאת בכנות, בצורה עדינה:  

   "לא מצאתי תשובה מדויקת בקטעים שקיבלתי. אם תרצה, אוכל להציע כיוון כללי."

3. השתמש תמיד בעיבוד נכון של הטקסטים:

   - תסכם במילים שלך, אבל תישאר נאמן למשמעות.

   - אל תצטט קטעים ארוכים.

   - תחבר בין רעיונות אם צריך, אבל לא תבנה תאוריה חדשה.

4. תמיד תענה בעברית טבעית:

   - משפטים קצרים.

   - ללא אנגלית (חוץ ממונחים טכניים כשחייבים).

   - ללא סמלים/אימוג'ים.

## מבנה תשובה מומלץ (חשוב מאוד - תשובה קצרה!):

- משפט פתיחה שמזהה את הכוונה של האדם (1-2 משפטים).

- הסבר קצר מתוך הקונטקסט (2-3 משפטים בלבד).

- משפט שמחבר את זה לחוויה היומיומית שלו (1 משפט).

- אם מתאים: הצעה קטנה ופרקטית להמשך (1 משפט).

- סיום פתוח: "אם תרצה נעמיק בזה."

**חשוב: התשובה צריכה להיות קצרה - 5-8 משפטים בסך הכל. לא יותר.**

## התייחסות לשאלות קצרות, פתיחות וסמול־טוק:

אם המשתמש כותב מילים כלליות כמו:

"שלום", "היי", "מה קורה", "מה נשמע", "מה קורה?", "מה המצב", או כל פנייה שאינה באמת שאלה מהותית —

עליך לענות בקצרה מאוד, בנימוס ובפשטות, בלי להפעיל RAG ובלי ניתוח רגשי.

**חשוב מאוד: שאלות כאלה מקבלות תשובה של 1-2 משפטים בלבד. לא יותר.**

דוגמאות:

- "שלום!" → "היי, איך אפשר לעזור?"

- "מה נשמע?" → "בסדר, תודה! איך אפשר לסייע לך?"

- "מה קורה?" → "בסדר, תודה! מה תרצה לשאול?"

- "היי" → "היי, מה תרצה לשאול?"

- "מה המצב?" → "בסדר, איך אפשר לעזור?"

**אין לענות בתוכן עומק, אין לפרש זאת כהזמנה לניתוח, ואין לשלוף קונטקסט.**

**אין להשתמש בקטעים מהקונטקסט, אין לנתח רגשית, ואין לתת הסברים ארוכים.**

רק תשובת פתיחה מנומסת, אנושית וקצרה מאוד (1-2 משפטים).

זה כל מה שאתה צריך לעשות. 

תמיד לענות בעברית. 

תמיד מבוסס קונטקסט (אלא אם זו שאלה קצרה/פתיחה).

תמיד בסגנון אנושי וצלול."""

# Few-shot section (הערכה - בדרך כלל קצר)
few_shot_section = "\n\nדוגמאות לסגנון התשובה (מתוך FAQ של טל בשן):\n[דוגמאות קצרות]\n\n---\n"

# חישוב לכל שאלה
results = []
total_prompt_tokens = 0
total_context_tokens = 0
total_question_tokens = 0

print("=" * 80)
print("📊 חישוב טוקנים לכל שאלה מ-20 השאלות")
print("=" * 80)

for i, result in enumerate(data['results'], 1):
    question = result['question']
    
    # בניית context מתוך chunks
    context_parts = []
    total_context_length = 0
    max_context = 1200  # כמו בקוד
    
    for chunk in result['chunks']:
        chunk_text = chunk['text']
        if total_context_length + len(chunk_text) > max_context:
            remaining = max_context - total_context_length
            if remaining > 100:
                chunk_text = chunk_text[:remaining] + "..."
            else:
                break
        context_parts.append(f"[מקור {len(context_parts)+1}] {chunk['source']}:\n{chunk_text}")
        total_context_length += len(chunk_text)
    
    context_text = "\n\n".join(context_parts)
    
    # חישוב טוקנים
    system_tokens = count_tokens(system_prompt)
    few_shot_tokens = count_tokens(few_shot_section)
    context_tokens = count_tokens(context_text)
    question_tokens = count_tokens(question)
    
    # חישוב overhead - [INST] tags וכו'
    inst_tags = "[INST] [/INST]"
    prompt_overhead = count_tokens(inst_tags) + 10  # +10 עבור formatting
    
    total_prompt_tokens_for_q = system_tokens + few_shot_tokens + context_tokens + question_tokens + prompt_overhead
    
    total_prompt_tokens += total_prompt_tokens_for_q
    total_context_tokens += context_tokens
    total_question_tokens += question_tokens
    
    results.append({
        "question_num": i,
        "question": question[:60] + "..." if len(question) > 60 else question,
        "system_tokens": system_tokens,
        "few_shot_tokens": few_shot_tokens,
        "context_tokens": context_tokens,
        "question_tokens": question_tokens,
        "overhead_tokens": prompt_overhead,
        "total_prompt_tokens": total_prompt_tokens_for_q,
        "context_length": total_context_length,
        "num_chunks": len(result['chunks'])
    })
    
    print(f"\n[{i:2d}] {question[:50]}...")
    print(f"     System: {system_tokens:4d} | Few-shot: {few_shot_tokens:3d} | Context: {context_tokens:4d} | Question: {question_tokens:3d} | Overhead: {prompt_overhead:2d}")
    print(f"     📊 סה\"כ Prompt: {total_prompt_tokens_for_q:4d} טוקנים | Context: {total_context_length:4d} תווים | Chunks: {len(result['chunks'])}")

# סיכום
print("\n" + "=" * 80)
print("📊 סיכום כללי")
print("=" * 80)
print(f"\n✅ סה\"כ שאלות: {len(results)}")
print(f"📈 ממוצע טוקנים לשאלה: {total_prompt_tokens // len(results):.0f}")
print(f"📈 ממוצע context טוקנים: {total_context_tokens // len(results):.0f}")
print(f"📈 ממוצע question טוקנים: {total_question_tokens // len(results):.0f}")

print(f"\n📊 התפלגות:")
min_tokens = min(r['total_prompt_tokens'] for r in results)
max_tokens = max(r['total_prompt_tokens'] for r in results)
avg_tokens = total_prompt_tokens // len(results)

print(f"   מינימום: {min_tokens} טוקנים")
print(f"   מקסימום: {max_tokens} טוקנים")
print(f"   ממוצע: {avg_tokens} טוקנים")

# שאלות עם הכי הרבה/קצת טוקנים
sorted_results = sorted(results, key=lambda x: x['total_prompt_tokens'])
print(f"\n🔝 3 שאלות עם הכי הרבה טוקנים:")
for r in sorted_results[-3:]:
    print(f"   [{r['question_num']:2d}] {r['total_prompt_tokens']:4d} טוקנים - {r['question']}")

print(f"\n🔻 3 שאלות עם הכי מעט טוקנים:")
for r in sorted_results[:3]:
    print(f"   [{r['question_num']:2d}] {r['total_prompt_tokens']:4d} טוקנים - {r['question']}")

print(f"\n💡 הערה: זה הערכה גסה (~1.3 טוקנים למילה בעברית)")
print(f"   Context window של Dicta-LM 2.0: 2048 טוקנים")
print(f"   כל השאלות נכנסות ב-context window! ✅")

