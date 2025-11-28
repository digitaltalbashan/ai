# 🚀 Production Markdown RAG Indexing System

This is a production-ready RAG indexing system for markdown files using OpenAI's `text-embedding-3-large` model (3072 dimensions).

## Features

- ✅ Recursive markdown scanning
- ✅ Semantic chunking (paragraph-aware)
- ✅ SHA-256 hash tracking for change detection
- ✅ Metadata enrichment
- ✅ OpenAI text-embedding-3-large embeddings (3072 dimensions)
- ✅ Embedding normalization (cosine similarity)
- ✅ pgvector upsert with conflict resolution
- ✅ Automatic cleanup of deleted files
- ✅ Full logging and error handling

## Setup

### 1. Install Dependencies

```bash
# Run the setup script
./scripts/setup_markdown_rag.sh

# Or manually:
python3 -m venv venv
source venv/bin/activate
pip install -r requirements-rag.txt
```

### 2. Database Migration

The system adds new columns to the existing `knowledge_chunks` table:

```sql
-- Run this migration
-- See: prisma/migrations/add_markdown_rag_support/migration.sql
```

Or apply via Prisma:
```bash
pnpm prisma migrate dev --name add_markdown_rag_support
```

### 3. Update Embedding Dimension (if needed)

If you want to use `text-embedding-3-large` (3072 dimensions) instead of the current embeddings:

```bash
# Option 1: Clear and re-index (recommended for fresh start)
# See: scripts/update_embedding_dimension.sql

# Option 2: Keep existing embeddings and use a separate column
# (Requires schema modification)
```

**Note:** The current system uses `text-embedding-3-small` (1536 dimensions). If you want to use `text-embedding-3-large` (3072), you'll need to:
1. Update the database schema
2. Re-index all chunks

### 4. Environment Variables

Make sure these are set in `.env`:

```bash
DATABASE_URL="postgresql://user:pass@localhost/db"
OPENAI_API_KEY="sk-..."
```

### 5. Add Markdown Files

Place your markdown files in `./data/md/`:

```bash
mkdir -p data/md
# Copy your .md files to data/md/
```

## Usage

### Index All Markdown Files

```bash
# Activate virtual environment
source venv/bin/activate

# Run the indexer
python scripts/index_markdown_rag.py
```

### What It Does

1. **Scans** `./data/md/` recursively for all `.md` files
2. **Chunks** each file semantically (by paragraphs, with sentence splitting for long paragraphs)
3. **Generates** embeddings using OpenAI `text-embedding-3-large`
4. **Upserts** chunks to database (updates if exists, inserts if new)
5. **Cleans up** chunks from files that were deleted

### Configuration

Edit these constants in `scripts/index_markdown_rag.py`:

```python
DATA_DIR = "./data/md"                    # Directory to scan
EMBED_MODEL = "text-embedding-3-large"    # Embedding model
CHUNK_MIN_CHARS = 250                     # Minimum chunk size
CHUNK_MAX_CHARS = 1000                    # Maximum chunk size
```

## Cost Estimate

- **text-embedding-3-large**: ~$0.13 per 1M tokens
- Average chunk: ~500-1000 tokens
- 1000 chunks ≈ 500,000-1,000,000 tokens ≈ **$0.065-$0.13**

## Database Schema

The system uses the existing `knowledge_chunks` table with additional columns:

- `file_path` - Path to source markdown file
- `chunk_index` - Index of chunk within file
- `content_hash` - SHA-256 hash of file content (for change detection)
- `updated_at` - Timestamp of last update

## Integration with Existing System

The indexed chunks will work with your existing RAG query system. Make sure:

1. Your query system uses the same embedding model (`text-embedding-3-large`)
2. The embedding dimension matches (3072)
3. The vector similarity search uses cosine similarity (normalized vectors)

## Troubleshooting

### "DATABASE_URL not set"
- Make sure `.env` file has `DATABASE_URL`

### "OPENAI_API_KEY not set"
- Make sure `.env` file has `OPENAI_API_KEY`

### "different vector dimensions" error
- Your database has embeddings with different dimensions
- You need to re-index all chunks or update the schema

### "No markdown files found"
- Make sure files are in `./data/md/` directory
- Files must have `.md` extension

## Next Steps

After indexing, you can:

1. **Test retrieval** - Query the indexed chunks
2. **Monitor quality** - Check chunk relevance
3. **Optimize chunking** - Adjust `CHUNK_MIN_CHARS` and `CHUNK_MAX_CHARS`
4. **Add more files** - Just add to `./data/md/` and re-run

## Production Considerations

- ✅ Uses batch embedding generation (efficient)
- ✅ Normalizes embeddings (cosine similarity)
- ✅ Handles errors gracefully
- ✅ Tracks file changes (hash-based)
- ✅ Cleans up orphaned chunks
- ⚠️  Requires OpenAI API key (costs apply)
- ⚠️  Embedding dimension must match query system

