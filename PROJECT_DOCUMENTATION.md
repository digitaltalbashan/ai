# 📚 תיעוד מלא - פרויקט טל בשן AI

## תוכן עניינים

1. [סקירה כללית](#סקירה-כללית)
2. [ארכיטקטורה](#ארכיטקטורה)
3. [זרימת העבודה המלאה](#זרימת-העבודה-המלאה)
4. [מערכת הזיכרון](#מערכת-הזיכרון)
5. [מערכת RAG](#מערכת-rag)
6. [API Endpoints](#api-endpoints)
7. [מבנה הפרויקט](#מבנה-הפרויקט)
8. [הגדרות והתקנה](#הגדרות-והתקנה)
9. [דוגמאות שימוש](#דוגמאות-שימוש)
10. [מפרט התנהגות AI](#מפרט-התנהגות-ai)

---

## מפרט התנהגות AI

📖 **מסמך מפורט**: ראה [`AI_BEHAVIOR_SPEC.md`](./AI_BEHAVIOR_SPEC.md) למפרט מלא של:
- שלוש שכבות הזיכרון (Active, Long-term, RAG)
- איך לבנות prompts מובנים
- איך לעדכן זיכרונות incrementally
- כללי Privacy & Data Handling
- Implementation Checklist

המסמך מתאר את הארכיטקטורה המלאה וההתנהגות הנדרשת של המערכת.

---

## סקירה כללית

**טל בשן AI** הוא אפליקציית צ'אט טיפולי מבוססת AI המספקת שיחות אימון טיפוליות בסגנון אישי של טל בשן. המערכת משתמשת ב-RAG (Retrieval-Augmented Generation) כדי לספק תשובות מדויקות המבוססות על חומרי הקורס, ומערכת זיכרון מתקדמת לשמירה על רצף ועקביות בשיחות.

### תכונות עיקריות

- ✅ **RAG (Retrieval-Augmented Generation)**: חיפוש סמנטי על חומרי הקורס
- ✅ **זיכרון מתמשך**: זיכרון משתמש ספציפי משיחות קודמות
- ✅ **זיכרון פעיל**: סיכום השיחה הנוכחית
- ✅ **אישיות מותאמת**: סגנון דיבור של טל בשן
- ✅ **צ'אט בזמן אמת**: ממשק צ'אט נקי עם תגובות streaming
- ✅ **חיפוש וקטורי**: PostgreSQL עם pgvector לחיפוש סמנטי
- ✅ **Re-ranking**: שיפור דיוק התוצאות עם CrossEncoder
- ✅ **Admin Dashboard**: ניהול משתמשים, שיחות וזיכרונות

### Tech Stack

- **Framework**: Next.js 14 (App Router) עם TypeScript
- **Database**: PostgreSQL עם Prisma ORM
- **Vector Search**: pgvector extension
- **LLM**: OpenAI API (GPT-4o-mini לצ'אט, text-embedding-3-small ל-embeddings)
- **Authentication**: NextAuth.js עם Google OAuth
- **Styling**: Tailwind CSS
- **Package Manager**: pnpm
- **Re-ranking**: Python CrossEncoder (BAAI/bge-reranker-base)

---

## ארכיטקטורה

### מבנה כללי

```
┌─────────────────┐
│   Frontend      │
│  (Next.js App)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   API Routes    │
│  /api/chat/*    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│      Processing Layer           │
│  ┌──────────┐  ┌─────────────┐ │
│  │  Memory  │  │    RAG      │ │
│  │  System  │  │   System    │ │
│  └──────────┘  └─────────────┘ │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │
│  + pgvector     │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│   OpenAI API    │
└─────────────────┘
```

### רכיבים עיקריים

1. **Frontend** (`app/chat/page.tsx`)
   - ממשק צ'אט עם streaming
   - ניהול state של הודעות
   - טעינת היסטוריית שיחות

2. **API Layer** (`app/api/chat/stream/route.ts`)
   - אימות משתמש
   - ניהול שיחות
   - קישור בין Memory, RAG ו-LLM

3. **Memory System** (`src/server/memory/`)
   - Active Conversation Memory
   - Long-term Memory
   - Memory Extractor (LLM-based)

4. **RAG System** (`src/server/vector/`)
   - Vector Search (OpenAI embeddings)
   - Re-ranking (Python CrossEncoder)
   - Chunk Retrieval

5. **LLM Integration** (`src/server/openai.ts`)
   - OpenAI API client
   - Chat Completion
   - Embeddings Generation

---

## זרימת העבודה המלאה

### תהליך הודעה אחת - מקצה לקצה

```
1. משתמש שולח הודעה
   ↓
2. Frontend: POST /api/chat/stream
   ↓
3. API Route: אימות משתמש
   ↓
4. שמירת הודעת המשתמש במסד הנתונים
   ↓
5. טעינת זיכרונות:
   ├─ Long-term Memory (עובדות, העדפות)
   └─ Active Conversation Memory (סיכום השיחה)
   ↓
6. RAG Retrieval:
   ├─ יצירת embedding לשאלה
   ├─ Vector Search (topK=50)
   ├─ Re-ranking עם CrossEncoder (topN=8)
   └─ החזרת chunks רלוונטיים
   ↓
7. בניית Prompt:
   ├─ System Prompt (אישיות טל בשן)
   ├─ User Message:
   │  ├─ השאלה
   │  ├─ RAG Chunks (חומרי הקורס)
   │  ├─ Long-term Memory Snippet
   │  └─ Active Memory (סיכום השיחה)
   └─ Recent Messages (20 הודעות אחרונות)
   ↓
8. קריאה ל-OpenAI API:
   ├─ Model: gpt-4o-mini
   ├─ Temperature: 0.3
   └─ Max Tokens: 2000
   ↓
9. קבלת תשובה מ-OpenAI
   ↓
10. שמירת תשובת העוזר במסד הנתונים
   ↓
11. עדכון זיכרונות:
    ├─ Active Memory: סיכום חדש של כל השיחה
    └─ Long-term Memory: עדכון עם LLM (Memory Extractor)
   ↓
12. החזרת תשובה ל-Frontend (streaming)
   ↓
13. הצגת התשובה למשתמש
```

### זרימת RAG Retrieval

```
1. שאלת המשתמש
   ↓
2. יצירת Query Embedding (text-embedding-3-small, 1536 dimensions)
   ↓
3. Vector Search ב-PostgreSQL:
   SELECT * FROM knowledge_chunks
   WHERE embedding <=> query_embedding
   ORDER BY distance
   LIMIT 50
   ↓
4. Re-ranking עם Python CrossEncoder:
   ├─ הפעלת Python script
   ├─ שימוש ב-BAAI/bge-reranker-base
   └─ דירוג מחדש לפי רלוונטיות
   ↓
5. החזרת Top 8 Chunks
   ↓
6. הוספה ל-User Message
```

---

## מערכת הזיכרון

המערכת משתמשת בשני סוגי זיכרונות שמשלימים זה את זה:

### 1. זיכרון פעיל (ACTIVE_CONVERSATION)

**מטרה**: שמירה על רצף בשיחה הנוכחית

**איפה נשמר**: טבלה `user_memories` עם `memoryType = 'ACTIVE_CONVERSATION'`

**מבנה**:
- `summary`: סיכום תמציתי בעברית (2-4 משפטים)
- `embedding`: וקטור 1536 מימדים (text-embedding-3-small)
- `memoryType`: `'ACTIVE_CONVERSATION'`
- Unique constraint: `(userId, memoryType)` - רק זיכרון אחד למשתמש

**איך זה עובד**:

1. **לפני כל תשובה**:
   - טעינת הזיכרון הפעיל מהמסד
   - הוספה ל-User Message

2. **אחרי כל תשובה**:
   - איסוף כל ההודעות מהשיחה
   - יצירת סיכום חדש עם LLM
   - יצירת embedding לסיכום
   - UPSERT במסד הנתונים

**דוגמה לסיכום**:
```
"המשתמש שאל על מהות התודעה הריאקטיבית. הסברתי שהתודעה הריאקטיבית 
מתייחסת לתגובות אוטומטיות או בלתי מודעות של האדם לסיטואציות שונות, 
ולעיתים היא נובעת מהתניות עבר. הנושאים המרכזיים שנדונו כוללים את 
ההבדל בין תודעה ריאקטיבית לתודעה מודעת."
```

### 2. זיכרון מתמשך (Long-term Memory)

**מטרה**: שמירה על עובדות, העדפות ונושאים מתמשכים

**איפה נשמר**: טבלה `user_contexts` בפורמט JSON

**מבנה**:
```typescript
{
  user_id: string
  profile?: {
    name?: string
    location?: string
    lang?: string
  }
  preferences?: string[]
  long_term_facts?: Array<{
    id: string
    text: string
    importance: 'low' | 'medium' | 'high'
    last_updated: string
    last_used?: string
  }>
  conversation_themes?: string[]
  memory_summary?: string
  last_updated: string
}
```

**איך זה עובד**:

1. **לפני כל תשובה**:
   - טעינת הזיכרון המתמשך מהמסד
   - יצירת snippet תמציתי (עד 500 תווים):
     - פרופיל (אם קיים)
     - העדפות
     - עובדות חשובות (importance: high)
     - סיכום זיכרון
   - הוספה ל-User Message

2. **אחרי כל תשובה**:
   - שליחה ל-LLM כ-"Memory Extractor":
     - הזיכרון הנוכחי (JSON)
     - הודעת המשתמש
     - תשובת העוזר
   - LLM מחזיר JSON מעודכן:
     - מוסיף עובדות חדשות
     - מעדכן עובדות קיימות
     - מוחק עובדות מיושנות
     - מעדכן העדפות ונושאים
   - שמירה במסד הנתונים

**דוגמה לעדכון**:
```typescript
// לפני:
{
  "preferences": ["מעדיף תשובות בעברית"]
}

// אחרי שהמשתמש אמר: "אני אוהב דוגמאות קוד קצרות"
// LLM מעדכן:
{
  "preferences": [
    "מעדיף תשובות בעברית",
    "אוהב דוגמאות קוד קצרות"
  ]
}
```

### למה שני סוגי זיכרונות?

| תכונה | Active Memory | Long-term Memory |
|-------|---------------|------------------|
| **מטרה** | רצף בשיחה הנוכחית | עובדות והעדפות מתמשכות |
| **תדירות עדכון** | כל הודעה | כל הודעה (אם יש משהו חדש) |
| **תוכן** | סיכום השיחה | עובדות, העדפות, נושאים, פרופיל |
| **חיים** | רק בזמן השיחה | נשמר בין שיחות |
| **גודל** | תמיד קצר (2-4 משפטים) | יכול לגדול, snippet נשלח |

---

## מערכת RAG

### אסטרטגיה: Vector Search + Re-ranking + LLM

#### שלב 1: Vector Search

**מודל Embedding**: `text-embedding-3-small` (1536 dimensions)

**תהליך**:
1. יצירת embedding לשאלת המשתמש
2. חיפוש וקטורי ב-PostgreSQL:
   ```sql
   SELECT id, text, source, embedding <=> $1::vector AS distance
   FROM knowledge_chunks
   WHERE embedding IS NOT NULL
   ORDER BY embedding <=> $1::vector
   LIMIT 50
   ```
3. החזרת Top 50 candidates

**מבנה Chunk**:
```typescript
{
  id: string
  text: string
  source: string
  lesson?: string
  order?: number
  chunk_index?: number
  embedding: vector(1536)
}
```

#### שלב 2: Re-ranking

**מודל**: `BAAI/bge-reranker-base` (CrossEncoder)

**תהליך**:
1. הפעלת Python script עם CrossEncoder
2. דירוג מחדש של 50 candidates לפי רלוונטיות לשאלה
3. החזרת Top 8 chunks הרלוונטיים ביותר

**יתרונות**:
- שיפור דיוק התוצאות
- התחשבות בהקשר מלא (לא רק embedding)
- ביצועים טובים בעברית

#### שלב 3: בניית Prompt

**System Prompt**:
- הנחיות על אישיות טל בשן
- סגנון דיבור
- מושגים מותרים/אסורים
- בקרת סגנון

**User Message**:
```
[שאלת המשתמש]

⸻

קונטקסט מחומרי הקורס:
[מקור 1] chunk_metzada.md: ...
[מקור 2] chunk_bor.md: ...

זיכרון מתמשך של המשתמש:
פרופיל: name: עומר
העדפות: מעדיף תשובות בעברית
עובדות חשובות: המשתמש עובד כמפתח backend

זיכרון מהשיחה הפעילה (מה שנאמר קודם):
[סיכום השיחה]

**הנחיות:**
- השתמש בקונטקסט מחומרי הקורס כדי לענות על השאלה
- הזיכרון המתמשך מכיל עובדות, העדפות ונושאים מתמשכים
- הזיכרון מהשיחה הפעילה מכיל סיכום של מה שנאמר קודם בשיחה
```

#### שלב 4: קריאה ל-LLM

**פרמטרים**:
- Model: `gpt-4o-mini`
- Temperature: `0.3` (נמוך = יותר דטרמיניסטי)
- Max Tokens: `2000`
- Stream: `false` (תשובה מלאה)

**תשובה**:
- תשובה בעברית בסגנון טל בשן
- מבוססת על הקונטקסט מהחומרים
- מתחשבת בזיכרונות המשתמש

---

## API Endpoints

### POST /api/chat/stream

**מטרה**: Endpoint ראשי לצ'אט עם streaming

**Authentication**: נדרש (NextAuth.js session)

**Request**:
```json
{
  "message": "מה זה תודעה ריאקטיבית?",
  "conversationId": "uuid" // optional
}
```

**Response**: Streaming text/plain עם `X-Conversation-Id` header

**תהליך**:
1. אימות משתמש
2. שמירת הודעת המשתמש
3. טעינת זיכרונות
4. RAG retrieval
5. קריאה ל-OpenAI
6. עדכון זיכרונות
7. החזרת תשובה (streaming)

### POST /api/chat

**מטרה**: Endpoint לצ'אט ללא streaming (compatibility)

**Request/Response**: זהה ל-`/api/chat/stream` אבל מחזיר JSON

### GET /api/conversations

**מטרה**: קבלת השיחה של המשתמש

**Response**:
```json
{
  "conversation": {
    "id": "uuid",
    "title": "השיחה שלי",
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-01T00:00:00Z",
    "messageCount": 10
  }
}
```

### GET /api/conversations/[id]

**מטרה**: קבלת הודעות משיחה ספציפית

**Response**:
```json
{
  "id": "uuid",
  "title": "השיחה שלי",
  "messages": [
    {
      "id": "uuid",
      "sender": "USER",
      "content": "מה זה תודעה ריאקטיבית?",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### POST /api/rag/index-knowledge

**מטרה**: אינדוקס קבצי markdown למסד הנתונים

**Request**:
```json
{
  "filePath": "data/rag/chunk_metzada.md"
}
```

**תהליך**:
1. קריאת קובץ markdown
2. חלוקה ל-chunks
3. יצירת embeddings
4. שמירה במסד הנתונים

### Admin Endpoints

#### GET /api/admin/users

**מטרה**: רשימת כל המשתמשים (admin only)

#### DELETE /api/admin/users/[userId]

**מטרה**: מחיקת משתמש (admin only)

#### POST /api/admin/users/[userId]/reset

**מטרה**: איפוס נתוני משתמש (כאילו משתמש חדש)

#### GET /api/admin/users/[userId]/memories

**מטרה**: קבלת זיכרונות של משתמש (admin only)

---

## מבנה הפרויקט

```
TalBashanAI/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── admin/                # Admin endpoints
│   │   │   └── users/
│   │   │       ├── route.ts      # List users
│   │   │       ├── [userId]/
│   │   │       │   ├── route.ts  # Delete user
│   │   │       │   ├── reset/    # Reset user data
│   │   │       │   └── memories/  # Get user memories
│   │   ├── auth/                 # NextAuth.js
│   │   │   └── [...nextauth]/
│   │   ├── chat/                 # Chat endpoints
│   │   │   ├── route.ts          # Non-streaming
│   │   │   └── stream/route.ts    # Streaming
│   │   ├── conversations/        # Conversation management
│   │   │   ├── route.ts          # Get user conversation
│   │   │   └── [id]/route.ts     # Get conversation messages
│   │   └── rag/                  # RAG indexing
│   │       └── index-knowledge/
│   ├── admin/                    # Admin dashboard
│   │   └── page.tsx
│   ├── auth/                     # Auth pages
│   │   ├── signin/
│   │   └── error/
│   ├── chat/                     # Chat UI
│   │   └── page.tsx
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Home page
│   └── globals.css               # Global styles
├── src/
│   ├── auth.ts                   # NextAuth.js config
│   ├── components/
│   │   └── SessionProviderWrapper.tsx
│   ├── server/
│   │   ├── db/
│   │   │   └── client.ts         # Prisma client
│   │   ├── memory/
│   │   │   ├── update.ts         # Active memory update
│   │   │   └── longTermMemory.ts # Long-term memory
│   │   ├── openai.ts             # OpenAI client (embeddings + LLM)
│   │   ├── llmClientOpenAI.ts    # LLM client wrapper
│   │   ├── userContext.ts        # Legacy user context
│   │   ├── utils/
│   │   │   ├── admin.ts          # Admin auth check
│   │   │   └── tokenCounter.ts  # Token counting
│   │   └── vector/
│   │       ├── queryWithOpenAIRag.ts  # Main RAG query
│   │       ├── search.ts              # Vector search
│   │       ├── searchWithRerank.ts    # Search + rerank
│   │       ├── rerankWithCrossEncoder.ts # Python reranking
│   │       └── queryWithCrossEncoder.ts  # CrossEncoder wrapper
│   └── types/
│       ├── index.ts              # Shared types
│       └── longTermMemory.ts     # Long-term memory types
├── prisma/
│   ├── schema.prisma             # Database schema
│   └── migrations/               # Database migrations
├── scripts/                      # Utility scripts
│   ├── indexKnowledge.ts         # Index markdown files
│   ├── cleanUserData.ts          # Clean user data
│   ├── showUserMemories.ts       # Show user memories
│   └── ...                       # More scripts
├── data/
│   └── rag/                      # RAG source files (markdown)
├── middleware.ts                 # Next.js middleware (auth)
├── package.json
├── tsconfig.json
└── .env                          # Environment variables
```

### קבצים מרכזיים

#### `src/server/vector/queryWithOpenAIRag.ts`
הפונקציה הראשית ל-RAG query:
- `queryWithOpenAIRag()`: פונקציה ראשית
- `retrieveChunksWithPython()`: Vector search + re-ranking
- `rerankWithCrossEncoder()`: Python CrossEncoder integration

#### `app/api/chat/stream/route.ts`
API endpoint ראשי לצ'אט:
- אימות
- ניהול שיחות
- טעינת זיכרונות
- קריאה ל-RAG
- עדכון זיכרונות

#### `src/server/memory/longTermMemory.ts`
ניהול זיכרון מתמשך:
- `loadLongTermMemory()`: טעינת זיכרון
- `saveLongTermMemory()`: שמירת זיכרון
- `buildMemorySnippet()`: יצירת snippet תמציתי
- `updateLongTermMemoryWithLLM()`: עדכון עם LLM

#### `src/server/memory/update.ts`
ניהול זיכרון פעיל:
- `updateUserMemory()`: עדכון/יצירת זיכרון פעיל
- `searchUserMemories()`: חיפוש זיכרונות

---

## הגדרות והתקנה

### דרישות מערכת

- Node.js (LTS)
- PostgreSQL 14+ עם pgvector extension
- Python 3.9+ (ל-re-ranking)
- OpenAI API key
- pnpm (`npm install -g pnpm`)

### התקנה

1. **Clone והתקנת dependencies**:
   ```bash
   git clone <repository>
   cd TalBashanAI
   pnpm install
   ```

2. **הגדרת Environment Variables**:
   צור קובץ `.env`:
   ```env
   # Database
   DATABASE_URL="postgresql://user:password@localhost:5432/talbashanai?schema=public"
   
   # OpenAI
   OPENAI_API_KEY="sk-..."
   OPENAI_MODEL="gpt-4o-mini"
   OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
   USE_OPENAI="true"
   
   # NextAuth.js
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="your-secret-key"
   
   # Google OAuth
   GOOGLE_CLIENT_ID="your-google-client-id"
   GOOGLE_CLIENT_SECRET="your-google-client-secret"
   ```

3. **הגדרת PostgreSQL עם pgvector**:
   ```sql
   -- התקנת pgvector
   CREATE EXTENSION IF NOT EXISTS vector;
   
   -- יצירת מסד נתונים
   CREATE DATABASE talbashanai;
   ```

4. **הרצת Migrations**:
   ```bash
   pnpm db:migrate
   ```

5. **אינדוקס חומרי הקורס**:
   ```bash
   # אינדוקס קבצי markdown
   pnpm rag:index
   ```

6. **הפעלת השרת**:
   ```bash
   pnpm dev
   ```

### הגדרת Python Environment (ל-Re-ranking)

```bash
# יצירת virtual environment
python3 -m venv venv
source venv/bin/activate  # או venv\Scripts\activate ב-Windows

# התקנת dependencies
pip install -r requirements.txt

# המודל יורד אוטומטית בפעם הראשונה
```

---

## דוגמאות שימוש

### דוגמה 1: שאלה פשוטה

**משתמש**: "מה זה תודעה ריאקטיבית?"

**תהליך**:
1. RAG מוצא chunks רלוונטיים על תודעה ריאקטיבית
2. System prompt מכיל הנחיות על סגנון טל בשן
3. LLM יוצר תשובה בסגנון טל בשן המבוססת על החומרים

**תשובה לדוגמה**:
```
תודעה ריאקטיבית, אה? זה כמו להיות על רכבת הרים של רגשות — כל מה שקורה 
סביבך משפיע על איך שאתה מרגיש ואיך שאתה מגיב. נגיד, מישהו מדבר אליך 
בטון לא נעים, ואתה פתאום מתכווץ, מתעצבן, או אפילו נסגר. זה לא שאתה 
בוחר להגיב ככה, זה פשוט קורה.

במצב הזה, אתה לא באמת יוצר משהו חדש — אתה מגיב למה שהמציאות מפעילה 
בך. זה כמו להיות בתוך בועה של תגובות אוטומטיות, שבהן אתה לא ממש שואל 
את עצמך "מה אני רוצה לברוא כאן?", אלא פשוט מגיב למה שקורה.

וזה בסדר, זה מצב אנושי, אבל אם אתה רוצה לצאת מזה, אתה צריך לזהות את 
הריאקטיביות הזו. ברגע שאתה מבין שאתה שם, אתה יכול להתחיל לבחור מחדש. 
זה כמו להדליק אור בחדר חשוך — מה שמואר צומח.
```

### דוגמה 2: שיחה עם הקשר

**משתמש (הודעה ראשונה)**: "מה זה מעגל התודעה?"

**תהליך**:
- אין זיכרון פעיל (שיחה חדשה)
- אין זיכרון מתמשך (משתמש חדש)
- RAG מוצא chunks על מעגל התודעה
- LLM יוצר תשובה ראשונה עם פתיחה "אוקיי… בוא נראה רגע…"

**משתמש (הודעה שנייה)**: "איך זה קשור לתודעה ריאקטיבית?"

**תהליך**:
- זיכרון פעיל: "המשתמש שאל על מעגל התודעה. הסברתי ש..."
- RAG מוצא chunks על הקשר בין מעגל התודעה לריאקטיביות
- LLM יוצר תשובה שמתייחסת לשאלה הקודמת

### דוגמה 3: שיחה עם זיכרון מתמשך

**משתמש (אחרי 10 שיחות)**: "תזכור שאני מעדיף תשובות קצרות"

**תהליך**:
1. LLM מקבל את ההודעה
2. Memory Extractor מזהה העדפה חדשה
3. מעדכן את Long-term Memory:
   ```json
   {
     "preferences": ["מעדיף תשובות קצרות"]
   }
   ```

**משתמש (שיחה הבאה)**: "מה זה מצדה?"

**תהליך**:
- Long-term Memory snippet כולל: "העדפות: מעדיף תשובות קצרות"
- LLM יוצר תשובה קצרה יותר מהרגיל

---

## פרטים טכניים

### System Prompt Structure

המערכת משתמשת ב-System Prompt דינמי שמתאים את עצמו:

1. **הנחיות בסיסיות**: אישיות טל בשן, סגנון דיבור
2. **מושגים מותרים/אסורים**: רשימת מושגים מהקובץ
3. **בקרת סגנון**: מה להימנע, מה להעדיף
4. **Fine-tuning לפתיחת שיחה**: רק לתשובה הראשונה

### User Message Structure

הקונטקסט נשלח ב-User Message (לא ב-System Prompt):

```
[שאלת המשתמש]

⸻

קונטקסט מחומרי הקורס:
[מקור 1] source.md: [chunk text]
[מקור 2] source.md: [chunk text]

זיכרון מתמשך של המשתמש:
[memory snippet]

זיכרון מהשיחה הפעילה:
[active memory summary]

**הנחיות:**
[instructions on how to use the context]
```

### Database Schema

#### `knowledge_chunks`
- `id`: String (primary key)
- `text`: Text (chunk content)
- `embedding`: vector(1536) (OpenAI embedding)
- `source`: String (file name)
- `chunk_index`: Int (position in file)
- `content_hash`: String (SHA-256 for deduplication)

#### `user_memories`
- `id`: UUID (primary key)
- `userId`: String (foreign key)
- `summary`: Text (memory summary in Hebrew)
- `embedding`: vector(1536) (for semantic search)
- `memoryType`: String (default: 'ACTIVE_CONVERSATION')
- Unique: `(userId, memoryType)`

#### `user_contexts`
- `id`: UUID (primary key)
- `userId`: String (unique, foreign key)
- `context`: Text (JSON string with LongTermMemory)

### Performance Considerations

1. **Vector Search**: HNSW index על `knowledge_chunks.embedding`
2. **Memory Search**: HNSW index על `user_memories.embedding`
3. **Re-ranking**: Python process (יכול להיות slow, אבל מדויק)
4. **Token Counting**: חישוב טוקנים לפני שליחה ל-OpenAI
5. **Caching**: אין caching כרגע (כל query חדש)

### Security

1. **Authentication**: NextAuth.js עם Google OAuth
2. **Authorization**: Middleware בודק session
3. **Admin Access**: רק `tzmoyal@gmail.com` יכול לגשת ל-admin
4. **Data Privacy**: OpenAI לא משתמש בנתונים לאימון (default)

---

## Troubleshooting

### בעיות נפוצות

1. **"Unauthorized" error**:
   - בדוק שה-session פעיל
   - בדוק שה-middleware רץ

2. **"No chunks found"**:
   - בדוק שיש chunks במסד הנתונים
   - בדוק שה-embeddings נוצרו

3. **"Python re-ranking failed"**:
   - בדוק ש-Python venv פעיל
   - בדוק שה-requirements מותקנים
   - בדוק שה-module `scripts.rerank_with_crossencoder` קיים

4. **"Memory not updating"**:
   - בדוק שה-LLM מחזיר תשובה תקינה
   - בדוק שה-DB connection עובד
   - בדוק את הלוגים

---

## סיכום

**טל בשן AI** הוא מערכת RAG מתקדמת עם:

- ✅ **RAG חזק**: Vector Search + Re-ranking + LLM
- ✅ **זיכרון חכם**: Active + Long-term Memory
- ✅ **אישיות מותאמת**: סגנון טל בשן
- ✅ **ממשק ידידותי**: צ'אט עם streaming
- ✅ **ניהול משתמשים**: Admin dashboard

המערכת מוכנה לייצור ומספקת תשובות מדויקות ומתאימות בסגנון אישי של טל בשן.

---

**עודכן לאחרונה**: ינואר 2025

