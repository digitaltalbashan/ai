# Personalized Therapeutic Chat Application

A production-grade chat application with RAG (Retrieval-Augmented Generation) and long-term memory, designed to provide therapeutic coaching conversations in a specific persona and methodology.

## Features

- **RAG (Retrieval-Augmented Generation)**: Semantic search over course materials and knowledge base
- **Long-term Memory**: User-specific memory summaries from past conversations
- **Therapeutic Persona**: Customizable coaching/therapy style with specific methodology
- **Real-time Chat**: Clean, responsive chat interface with **streaming responses** for better UX
- **Vector Search**: PostgreSQL with pgvector for semantic similarity search

## Tech Stack

- **Framework**: Next.js 14 (App Router) with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Vector Search**: pgvector extension
- **LLM**: OpenAI API (GPT-4o-mini for chat, text-embedding-3-small for embeddings)
- **Styling**: Tailwind CSS
- **Package Manager**: pnpm

## Prerequisites

- Node.js (latest LTS)
- PostgreSQL with pgvector extension installed
- OpenAI API key
- pnpm installed (`npm install -g pnpm`)

## Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set up environment variables:**
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/talbashanai?schema=public"
   OPENAI_API_KEY="your-openai-api-key"
   OPENAI_MODEL="gpt-4o-mini"
   OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
   USE_OPENAI="true"
   ```

3. **Set up PostgreSQL with pgvector:**
   
   First, ensure PostgreSQL is running and you have access. Then:
   
   ```sql
   -- Create database
   CREATE DATABASE talbashanai;
   
   -- Connect to the database
   \c talbashanai
   
   -- Enable pgvector extension (required before migrations)
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
   
   Or use the provided SQL script:
   ```bash
   psql -U your_user -d talbashanai -f scripts/setup-db.sql
   ```

4. **Generate Prisma client:**
   ```bash
   pnpm db:generate
   ```

5. **Run database migrations:**
   ```bash
   pnpm db:migrate
   ```
   
   **Important:** Since Prisma doesn't fully support pgvector, after running migrations you may need to fix the vector columns:
   ```bash
   psql -U your_user -d talbashanai -f scripts/fix-vector-columns.sql
   ```
   
   This script will ensure the `embedding` columns are properly created as `vector(1536)` type and adds performance indexes.

6. **Index knowledge chunks (optional):**
   
   A sample file `lesson1_rag.jsonl.example` is provided as a template. Copy it and customize:
   ```bash
   cp lesson1_rag.jsonl.example lesson1_rag.jsonl
   # Edit lesson1_rag.jsonl with your content
   ```
   
   The JSONL format should have one JSON object per line:
   ```jsonl
   {"id": "chunk_001", "text": "Your knowledge text here...", "metadata": {}, "source": "lesson1", "lesson": "Introduction", "order": 1, "tags": []}
   {"id": "chunk_002", "text": "Another knowledge chunk...", "metadata": {}, "source": "lesson1", "lesson": "Introduction", "order": 2, "tags": []}
   ```
   
   Then run:
   ```bash
   pnpm rag:index
   ```
   
   Or specify a custom file path:
   ```bash
   pnpm rag:index path/to/your/file.jsonl
   ```
   
   Or use the API endpoint:
   ```bash
   curl -X POST http://localhost:3000/api/rag/index-knowledge \
     -H "Content-Type: application/json" \
     -d '{"filePath": "./lesson1_rag.jsonl"}'
   ```

7. **Start the development server:**
   ```bash
   pnpm dev
   ```

8. **Open the application:**
   Navigate to `http://localhost:3000` and click "Go to Chat" or go directly to `http://localhost:3000/chat`

## Project Structure

```
.
├── app/
│   ├── api/
│   │   ├── chat/              # Main chat endpoint
│   │   ├── rag/
│   │   │   └── index-knowledge/  # Knowledge indexing endpoint
│   │   └── memory/
│   │       └── update/        # Memory update endpoint
│   ├── chat/                  # Chat UI page
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── prisma/
│   └── schema.prisma          # Database schema
├── scripts/
│   └── indexKnowledge.ts      # Knowledge indexing script
├── src/
│   ├── server/
│   │   ├── db/
│   │   │   └── client.ts      # Prisma client
│   │   ├── memory/
│   │   │   └── update.ts      # Memory update logic
│   │   ├── openai.ts          # OpenAI API client for LLM and embeddings
│   │   ├── prompt/
│   │   │   └── buildPrompt.ts # Prompt construction
│   │   └── vector/
│   │       └── search.ts      # Vector search utilities
│   └── types/
│       └── index.ts           # Shared TypeScript types
└── package.json
```

## API Endpoints

### POST /api/chat

Main chat endpoint that handles user messages (non-streaming, for compatibility).

**Request:**
```json
{
  "userId": "string",
  "message": "string",
  "conversationId": "string | null"
}
```

**Response:**
```json
{
  "message": "string",
  "conversationId": "string"
}
```

### POST /api/chat/stream

Streaming chat endpoint that returns responses in real-time (used by the frontend).

**Request:** Same as `/api/chat`

**Response:** Streaming text/plain response with conversation ID in `X-Conversation-Id` header.

### POST /api/rag/index-knowledge

Index knowledge chunks from a JSONL file.

**Request:**
```json
{
  "filePath": "string (optional, defaults to ./lesson1_rag.jsonl)"
}
```

**Response:**
```json
{
  "success": true,
  "indexed": 10,
  "errors": 0,
  "total": 10
}
```

### POST /api/memory/update

Manually trigger memory update for a user.

**Request:**
```json
{
  "userId": "string",
  "conversationId": "string (optional)",
  "memoryType": "string (optional, defaults to SESSION_SUMMARY)"
}
```

## Customization

### Persona and Prompt

Edit `src/server/prompt/buildPrompt.ts` to customize:
- System prompt (therapeutic persona and methodology)
- Few-shot examples
- Context formatting

### Memory Update Frequency

Edit `app/api/chat/route.ts` to change when memory updates occur (currently every 10 messages).

### Vector Search Parameters

Edit `src/server/vector/search.ts` to adjust:
- Number of results returned (`topK`)
- Similarity metric (currently cosine distance)

## Development Scripts

- `pnpm dev` - Start Next.js development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm db:generate` - Generate Prisma client
- `pnpm db:migrate` - Run database migrations
- `pnpm db:studio` - Open Prisma Studio
- `pnpm rag:index` - Index knowledge chunks from JSONL file

## Notes

- The application uses raw SQL for pgvector operations since Prisma doesn't fully support pgvector types yet
- User authentication is not implemented - userId is stored in localStorage for demo purposes
- Memory updates happen automatically every 10 messages, but can be triggered manually via API
- The chat interface is basic but functional - can be enhanced with streaming, markdown rendering, etc.

## License

Private project - all rights reserved.

