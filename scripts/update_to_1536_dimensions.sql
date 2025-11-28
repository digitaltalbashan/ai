-- Update database to text-embedding-3-small (1536 dimensions)
-- This supports pgvector indexing (max 2000 dimensions)

BEGIN;

-- Step 1: Drop existing index if exists
DROP INDEX IF EXISTS idx_knowledge_chunks_embedding;

-- Step 2: Clear all embeddings (we're re-indexing with new model)
UPDATE knowledge_chunks SET embedding = NULL WHERE embedding IS NOT NULL;

-- Step 3: Update embedding column to 1536 dimensions
ALTER TABLE knowledge_chunks 
ALTER COLUMN embedding TYPE vector(1536);

-- Step 4: Create index (now possible with 1536 dimensions)
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
ON knowledge_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 200);

COMMIT;

-- Verify
SELECT 
    column_name, 
    data_type,
    udt_name
FROM information_schema.columns 
WHERE table_name = 'knowledge_chunks' 
AND column_name = 'embedding';

