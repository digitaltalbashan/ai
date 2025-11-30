# AI Behavior & Memory Specification

## סקירה כללית

מסמך זה מגדיר את ההתנהגות והארכיטקטורה של מערכת הזיכרון והתגובות של ה-AI בפרויקט.

**עקרון מרכזי**: כל תשובה חייבת להיות מבוססת על קונטקסט מפורש שנשלח ב-`messages`. המערכת לא מסתמכת על זיכרון מרומז של המודל.

---

## 1. מטרות ליבה

כל תשובה חייבת:

- ✅ להשתמש בקונטקסט השיחה הנוכחית
- ✅ לכבד ולנצל את הפרופיל וההעדפות השמורים של המשתמש
- ✅ להשתמש בעובדות מתמשכות רלוונטיות על המשתמש
- ✅ להשתמש בתוצאות RAG מבסיס הידע כשזה עוזר

**חשוב**: המודל לא מסתמך על זיכרון מרומז. כל הקונטקסט חייב להיות **מפורש** ונבנה ב-`messages`.

---

## 2. שכבות הזיכרון

המערכת משתמשת ב-**שלוש שכבות זיכרון**:

1. **Active Conversation Memory** (זיכרון קצר טווח)
2. **Long-term User Memory** (פרופיל, העדפות, עובדות, משימות)
3. **External Knowledge (RAG)** (חומרי הקורס)

כל שכבה יש לה מודל נתונים ברור ודרך ברורה להזרקה לפרומפט.

---

## 2.1 Active Conversation Memory

### מה נשמר:

- **סיכום קצר** של השיחה עד כה (2-5 משפטים מקסימום)
- רשימת **N הודעות אחרונות** (6-12 תורות) לקונטקסט מדויק

### מבנה DB:

```typescript
// טבלה: user_memories
{
  id: string
  userId: string
  summary: string              // סיכום קצר של השיחה
  embedding: vector(1536)      // embedding לסיכום (לחיפוש סמנטי)
  memoryType: 'ACTIVE_CONVERSATION'
  createdAt: Date
  updatedAt: Date
}

// טבלה: messages (כבר קיימת)
{
  id: string
  conversationId: string
  sender: 'USER' | 'ASSISTANT'
  content: string
  createdAt: Date
}
```

### כללים:

- ✅ **לא לסכם מחדש את כל ההיסטוריה כל פעם**
- ✅ **לשמור על סיכום incremental** (previous summary + new messages)
- ✅ עדכון אחרי כל הודעה

### איך זה עובד:

#### לפני תשובה:
1. טעינת הסיכום הקיים (`summary_text`)
2. טעינת 6-12 הודעות אחרונות
3. הוספה ל-User Message

#### אחרי תשובה:
1. איסוף הסיכום הקודם + הודעות חדשות (6 אחרונות)
2. יצירת סיכום חדש incremental:
   ```
   Previous summary: [הסיכום הקודם]
   New messages: [6 הודעות אחרונות]
   → Create new summary (2-5 sentences)
   ```
3. שמירה/עדכון במסד הנתונים

---

## 2.2 Long-term User Memory (User Context)

### מבנה נתונים:

```typescript
type LongTermMemory = {
  user_id: string
  
  profile?: {
    name?: string
    native_language?: 'he' | 'en' | 'other'
    level?: 'beginner' | 'intermediate' | 'advanced' | 'expert'
    role?: string                    // e.g. "Fullstack developer"
    location?: string
    goals?: string[]                 // מטרות ארוכות טווח
  }
  
  preferences?: {
    language?: 'he' | 'en'
    answer_length?: 'short' | 'medium' | 'long'
    code_examples?: 'none' | 'simple' | 'detailed'
    tone?: 'casual' | 'formal'
    prefers_bullets?: boolean
    other_notes?: string[]
  }
  
  long_term_facts?: Array<{
    id: string
    text: string                     // "User teaches a course about X", etc.
    importance: 'low' | 'medium' | 'high'
    tags?: string[]                  // ["business", "course", "family"]
    embedding?: number[]             // optional – for similarity search
    last_updated: string
    last_used?: string
  }>
  
  open_tasks?: Array<{
    id: string
    description: string
    status: 'open' | 'in_progress' | 'done'
    created_at: string
    last_updated?: string
  }>
  
  conversation_themes?: string[]
  memory_summary?: string            // סיכום תמציתי של כל הזיכרון
  last_updated: string
}
```

### כללים:

- ✅ להעדיף שדות מובנים על פני טקסט חופשי
- ✅ עובדות צריכות להיות הצהרות קטנות ואטומיות על המשתמש
- ✅ לכלול timestamps ו-embedding אופציונלי לכל עובדה לדירוג רלוונטיות

### איפה נשמר:

- **טבלה**: `user_contexts`
- **פורמט**: JSON string ב-`context` field
- **מבנה**: זיכרון אחד למשתמש (unique על `userId`)

---

## 2.3 External Knowledge (RAG)

### תהליך:

1. **Encode** את שאלת המשתמש
2. **Retrieve** Top K candidates (50) באמצעות vector similarity
3. **Rerank** ובחר N chunks סופיים (5-10)
4. **Inject** אותם לפרומפט בקטע מובנה וברור

### פונקציה מומלצת:

```typescript
async function getRagContextForQuery(
  userId: string, 
  query: string
): Promise<string> {
  // 1. embed query
  // 2. vector search
  // 3. rerank
  // 4. format chunks into a text block for the prompt
}
```

### מבנה DB:

```typescript
// טבלה: knowledge_chunks
{
  id: string
  text: string
  embedding: vector(1536)
  source: string
  chunk_index: number
  // ... metadata
}
```

---

## 3. התנהגות בזמן Request (לפני קריאה למודל)

### רצף פעולות:

#### 1. טעינת Active Conversation Memory:

```typescript
// טעינת סיכום
const activeSummary = await loadActiveSummary(userId)

// טעינת הודעות אחרונות (6-12 תורות)
const recentMessages = await loadLastMessages(conversationId, 12)
```

#### 2. טעינת Long-term User Context:

```typescript
// טעינת הזיכרון המלא
const userContext = await loadLongTermMemory(userId)

// בחירת החלקים הרלוונטיים ביותר:
const userContextSnippet = buildRelevantSnippet(userContext, query, {
  // פרופיל בסיסי
  includeProfile: true,
  
  // העדפות
  includePreferences: true,
  
  // 3-7 עובדות חשובות רלוונטיות
  maxFacts: 7,
  factImportance: ['high', 'medium'],
  
  // משימות פתוחות רלוונטיות
  includeRelevantTasks: true
})
```

#### 3. הרצת RAG:

```typescript
const ragSnippet = await getRagContextForQuery(userId, query)
```

#### 4. בניית Prompt מובנה:

```typescript
const messages = buildMessagesForModel({
  systemPrompt: "...",
  userContextSnippet: "...",
  activeSummary: "...",
  recentMessages: [...],
  ragSnippet: "...",
  currentUserInput: "..."
})
```

---

## 3.1 בניית ה-Prompt (messages)

### פונקציה מומלצת:

```typescript
function buildMessagesForModel(params: {
  systemPrompt: string
  userContextSnippet: string
  activeSummary: string
  recentMessages: ChatMessage[]
  ragSnippet: string
  currentUserInput: string
}): OpenAI.ChatCompletionMessageParam[]
```

### מבנה מומלץ:

```
SYSTEM: "You are [persona]. Follow the instructions and constraints below."

SYSTEM: "User context:
- Profile: ...
- Preferences: ...
- Important facts:
  - ...
  - ...
- Open tasks:
  - ..."

SYSTEM: "Conversation summary so far:
{activeSummary}"

SYSTEM: "Relevant external knowledge:
{ragSnippet}

If this knowledge conflicts with user memory, prefer the user's explicit data.
If it conflicts with the system rules, obey the system rules."

[optional: last 6-12 messages mapped as user/assistant roles]

USER: "{currentUserInput}"
```

### פרטי יישום:

- ✅ למפות `recentMessages` ל-`{ role: 'user' | 'assistant', content }`
- ✅ לשמור על הכל דטרמיניסטי ומפורש
- ✅ לסמן בבירור כל קטע (User context / Summary / RAG / Conversation / Question)

---

## 4. התנהגות Post-response (אחרי תשובת המודל)

אחרי שליחת התשובה למשתמש, להריץ שני שלבי עדכון נפרדים:

---

## 4.1 עדכון Active Conversation Summary

### תהליך:

1. **הוספת הודעות חדשות** ל-`chat_messages`
2. **בניית בקשת סיכום** המשתמשת רק ב:
   - הסיכום הקודם (`summary_text`)
   - ההודעות החדשות האחרונות (6)

### Pseudocode:

```typescript
async function updateActiveSummary(
  userId: string, 
  conversationId: string
) {
  const oldSummary = await loadActiveSummary(userId)
  const recentMessages = await loadLastMessages(conversationId, 6)
  
  const summaryPrompt = [
    {
      role: "system",
      content: "You are a summarizer. You receive the previous summary and new messages. " +
               "Return a new concise summary (2–5 sentences). Focus on facts, goals, and decisions."
    },
    {
      role: "user",
      content:
        `Previous summary:\n${oldSummary || "(none)"}\n\n` +
        `New messages:\n${formatMessagesForSummarizer(recentMessages)}`
    }
  ]
  
  const newSummary = await callOpenAI(summaryPrompt)
  await saveActiveSummary(userId, newSummary)
}
```

### כללים:

- ✅ **Incremental**: לא לסכם מחדש את כל ההיסטוריה
- ✅ **Compact**: 2-5 משפטים מקסימום
- ✅ **Focus**: עובדות, מטרות, החלטות

---

## 4.2 עדכון Long-term User Memory (Selective)

אחרי כל אינטראקציה, להחליט אם ההודעה החדשה מכילה זיכרון מתמשך חדש:

- עובדה חדשה על המשתמש
- העדפה חדשה או שונה
- משימה חדשה או עדכון על משימה קיימת

### שימוש ב-Memory Extractor:

```typescript
async function extractMemoryUpdates(
  userId: string,
  latestUserMessage: string,
  assistantReply: string,
  userContext: LongTermMemory
) {
  const prompt = [
    {
      role: "system",
      content:
        "You manage user long-term memory. " +
        "Given the last user message, the assistant reply, and the current known memory, " +
        "decide if there are NEW long-term facts, preferences, or task updates to store. " +
        "Respond ONLY with valid JSON in this format:\n" +
        `{
  "new_facts": [{ 
    "text": string, 
    "importance": "low" | "medium" | "high", 
    "tags": string[] 
  }],
  "new_preferences": [{ 
    "key": string, 
    "value": string 
  }],
  "task_updates": [{ 
    "id": string | null, 
    "description": string, 
    "status": "open" | "in_progress" | "done" 
  }]
}`
    },
    {
      role: "user",
      content:
        `Current memory (partial):\n${serializeShortUserContext(userContext)}\n\n` +
        `Last user message:\n${latestUserMessage}\n\n` +
        `Assistant reply:\n${assistantReply}`
    }
  ]
  
  const jsonResult = await callOpenAIForJson(prompt)
  return jsonResult
}
```

### אחרי קבלת התוצאה:

1. **הוספת עובדות חדשות** ל-`long_term_facts` (יצירת IDs ו-timestamps)
2. **מיזוג העדפות חדשות** ל-`preferences`
3. **יצירה/עדכון** `open_tasks` לפי הצורך

---

## 5. אסטרטגיית Tokens & Performance

### מה **לא** לשלוח:

- ❌ כל היסטוריית השיחה
- ❌ כל ה-JSON של user context
- ❌ כל העובדות או המשימות המתמשכות

### מה **לשלוח** (מוגבל):

- ✅ Active summary: 2-5 משפטים
- ✅ Recent messages: 6-12 תורות אחרונות
- ✅ Long-term facts: 3-7 פריטים רלוונטיים
- ✅ RAG chunks: 3-10 chunks קצרים ומעוצבים היטב

### כשהשיחה מתארכת:

- ✅ להשתמש במנגנון הסיכום ה-incremental
- ✅ לשמור רק הודעות גולמיות אחרונות + סיכום

---

## 6. Privacy & Data Handling

- ✅ **הנחה**: המודל לא שומר שום נתונים בין קריאות
- ✅ **כל המצב** חייב להיות נשמר ומנוהל על ידי המערכת שלנו
- ✅ המערכת חייבת לטפל ב:
  - Active memory
  - Long-term memory
  - RAG documents
כנתונים פרטיים הקשורים למשתמש, ולעולם לא להסתמך על זיכרון חיצוני/גלובלי.

---

## 7. רשימת יישום (Implementation Checklist)

כשכותבים או משפרים קוד בפרויקט, להעדיף:

### 1. הוספה או עדכון:

- ✅ `UserContext` model ו-persistence layer
- ✅ `user_memories` (active summary) persistence
- ✅ `chat_messages` / `conversations` persistence
- ✅ `knowledge_chunks` ו-vector search (אם לא קיים)

### 2. יישום Helpers:

- ✅ `buildMessagesForModel(...)`
- ✅ `getRagContextForQuery(...)`
- ✅ `updateActiveSummary(...)` - **incremental**
- ✅ `extractMemoryUpdates(...)`
- ✅ `applyMemoryUpdatesToUserContext(...)`
- ✅ `serializeUserContextSnippet(...)` להזרקה לפרומפט

### 3. לוודא שכל קריאות המודל:

- ✅ משתמשות במבנה layered-context המתואר לעיל
- ✅ שומרות על prompts ברורים, מובנים ומסומנים (User context / Summary / RAG / Conversation / Question)

### תמיד לייעל עבור:

- ✅ **Personalization** - התאמה אישית
- ✅ **Relevance** - רלוונטיות
- ✅ **Compact, high-signal context** - קונטקסט קומפקטי עם אות חזק
- ✅ **Explicit structure in prompts** - מבנה מפורש בפרומפטים

---

## 8. השוואה למצב הנוכחי

### מה כבר מיושם:

✅ **Active Conversation Memory**:
- קיים ב-`user_memories` עם `memoryType: 'ACTIVE_CONVERSATION'`
- מתעדכן אחרי כל הודעה
- נטען לפני כל תשובה

✅ **Long-term User Memory**:
- קיים ב-`user_contexts` עם JSON structure
- מתעדכן עם LLM (Memory Extractor)
- נטען לפני כל תשובה

✅ **RAG System**:
- Vector search + Re-ranking
- Chunks נשלחים ב-User Message

✅ **Recent Messages**:
- נטענים (20 הודעות)
- נשלחים למודל

### מה צריך לשפר:

⚠️ **Active Summary Update**:
- **כרגע**: מסכם מחדש את כל ההודעות
- **צריך**: Incremental (previous summary + new messages)

⚠️ **Long-term Memory Structure**:
- **כרגע**: `preferences` הוא array של strings
- **צריך**: Object עם שדות מובנים (`language`, `answer_length`, etc.)
- **חסר**: `open_tasks` field
- **חסר**: שדות נוספים ב-`profile` (`level`, `role`, `goals`)

⚠️ **Memory Extractor**:
- **כרגע**: מחזיר JSON מלא מעודכן
- **צריך**: JSON ספציפי עם `new_facts`, `new_preferences`, `task_updates`

⚠️ **Recent Messages Count**:
- **כרגע**: 20 הודעות
- **מומלץ**: 6-12 הודעות (לפי המפרט)

⚠️ **Helper Functions**:
- **חסר**: `buildMessagesForModel()` helper
- **חסר**: `getRagContextForQuery()` helper
- **חסר**: `serializeUserContextSnippet()` helper

---

## 9. תוכנית שיפור

### עדיפות גבוהה:

1. **שיפור Active Summary ל-Incremental**:
   - לשנות את `updateUserMemory()` להשתמש ב-previous summary
   - לשלוח רק new messages + old summary

2. **שיפור Long-term Memory Structure**:
   - להוסיף `open_tasks` field
   - לשנות `preferences` מ-array ל-object מובנה
   - להוסיף שדות ל-`profile` (`level`, `role`, `goals`)

3. **שיפור Memory Extractor**:
   - לשנות את הפורמט ל-JSON ספציפי עם `new_facts`, `new_preferences`, `task_updates`
   - ליישם `applyMemoryUpdatesToUserContext()` למיזוג עדכונים

### עדיפות בינונית:

4. **יצירת Helper Functions**:
   - `buildMessagesForModel()`
   - `getRagContextForQuery()`
   - `serializeUserContextSnippet()`

5. **הקטנת Recent Messages**:
   - לשנות מ-20 ל-6-12 הודעות

---

## 10. דוגמאות קוד

### דוגמה: Incremental Summary Update

```typescript
async function updateActiveSummaryIncremental(
  userId: string,
  conversationId: string
) {
  // 1. טעינת הסיכום הקודם
  const oldSummary = await prisma.userMemory.findFirst({
    where: {
      userId,
      memoryType: 'ACTIVE_CONVERSATION'
    }
  })
  
  // 2. טעינת הודעות חדשות (6 אחרונות)
  const recentMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: 6,
    orderBy: { createdAt: 'asc' } // oldest first
  })
  
  // 3. יצירת סיכום incremental
  const summaryPrompt = `Previous summary:\n${oldSummary?.summary || "(none)"}\n\n` +
    `New messages:\n${formatMessages(recentMessages)}`
  
  const newSummary = await chatCompletion([
    {
      role: 'system',
      content: 'You are a summarizer. Return a new concise summary (2-5 sentences). Focus on facts, goals, and decisions.'
    },
    {
      role: 'user',
      content: summaryPrompt
    }
  ])
  
  // 4. שמירה
  await updateUserMemory(userId, recentMessages, 'ACTIVE_CONVERSATION')
}
```

### דוגמה: Memory Extractor עם JSON ספציפי

```typescript
async function extractMemoryUpdates(
  userId: string,
  userMessage: string,
  assistantReply: string,
  currentMemory: LongTermMemory
): Promise<{
  new_facts: Array<{ text: string; importance: string; tags: string[] }>
  new_preferences: Array<{ key: string; value: string }>
  task_updates: Array<{ id: string | null; description: string; status: string }>
}> {
  const prompt = `Current memory:\n${JSON.stringify(currentMemory, null, 2)}\n\n` +
    `Last user message:\n${userMessage}\n\n` +
    `Assistant reply:\n${assistantReply}\n\n` +
    `Respond ONLY with JSON:\n` +
    `{\n` +
    `  "new_facts": [...],\n` +
    `  "new_preferences": [...],\n` +
    `  "task_updates": [...]\n` +
    `}`
  
  const response = await chatCompletion([
    {
      role: 'system',
      content: 'You extract memory updates. Return ONLY valid JSON, no explanations.'
    },
    {
      role: 'user',
      content: prompt
    }
  ])
  
  return JSON.parse(response.choices[0].message.content)
}
```

---

## סיכום

מסמך זה מגדיר את הארכיטקטורה וההתנהגות של מערכת הזיכרון והתגובות.

**עקרונות מרכזיים**:
- ✅ כל קונטקסט מפורש (לא מרומז)
- ✅ שלוש שכבות זיכרון (Active, Long-term, RAG)
- ✅ Incremental updates (לא re-summarize כל פעם)
- ✅ Structured data (לא free-form text)
- ✅ Compact, high-signal context

**סטטוס נוכחי**: המערכת מיושמת ברובה, עם כמה שיפורים נדרשים (ראה סעיף 8).

---

**עודכן לאחרונה**: ינואר 2025

