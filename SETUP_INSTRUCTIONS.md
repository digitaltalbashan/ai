# Setup Instructions

## Quick Start

1. **Create `.env` file** (already created from template):
   ```bash
   # File is already created at .env
   ```

2. **Edit `.env` file** and add your actual values:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/talbashanai?schema=public"
   OLLAMA_BASE_URL="http://localhost:11434"
   OLLAMA_MODEL="mistral:instruct"
   ```

3. **Set up PostgreSQL database**:
   ```sql
   CREATE DATABASE talbashanai;
   CREATE EXTENSION vector;
   ```

4. **Run database migrations**:
   ```bash
   pnpm db:migrate
   ```

5. **Index RAG data**:
   ```bash
   pnpm rag:reset:lesson1
   ```

6. **Start the server**:
   ```bash
   pnpm dev
   ```

## Current Status

✅ Code is ready and working
✅ .env file created (needs your values)
⚠️  Waiting for environment variables to be configured

## Test After Setup

Once you've added your real values to `.env`:

```bash
# Test RAG indexing
pnpm rag:test:circle

# Test the chat API
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","message":"מה זה מעגל תודעה?","conversationId":null}'
```
