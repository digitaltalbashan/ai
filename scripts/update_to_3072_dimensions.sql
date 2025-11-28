-- Update database to support text-embedding-3-large (3072 dimensions)
-- This script will:
-- 1. Drop existing embedding index
-- 2. Update embedding column to 3072 dimensions
-- 3. Recreate index with new dimension

-- WARNING: This will require re-indexing all existing chunks!

BEGIN;

-- Step 1: Drop existing index
DROP INDEX IF EXISTS idx_knowledge_chunks_embedding;

-- Step 2: Update embedding column dimension
-- First, drop NOT NULL constraint if it exists
ALTER TABLE knowledge_chunks 
ALTER COLUMN embedding DROP NOT NULL;

-- Clear all embeddings (we're re-indexing with new model)
UPDATE knowledge_chunks SET embedding = NULL WHERE embedding IS NOT NULL;

-- Now update the column type to 3072 dimensions
ALTER TABLE knowledge_chunks 
ALTER COLUMN embedding TYPE vector(3072);

-- Step 3: Recreate index with new dimension
-- Note: ivfflat only supports up to 2000 dimensions
-- For 3072 dimensions, we need to use HNSW index or no index
-- HNSW is more efficient for high-dimensional vectors

-- For now, we'll create the index without specifying the type
-- The query will still work, just slower without an index
-- You can manually create HNSW index later if your pgvector version supports it

-- Check pgvector version and create appropriate index
DO $$
DECLARE
    v_version text;
BEGIN
    -- Get pgvector version
    SELECT extversion INTO v_version FROM pg_extension WHERE extname = 'vector';
    
    IF v_version IS NOT NULL THEN
        -- Try to create HNSW index (pgvector >= 0.5.0)
        BEGIN
            EXECUTE 'CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
                     ON knowledge_chunks
                     USING hnsw (embedding vector_cosine_ops)
                     WITH (m = 16, ef_construction = 64)';
            RAISE NOTICE 'Created HNSW index';
        EXCEPTION
            WHEN OTHERS THEN
                -- HNSW not available, skip index creation
                -- Queries will still work, just slower
                RAISE NOTICE 'HNSW not available, skipping index creation. Queries will work but may be slower.';
        END;
    ELSE
        RAISE NOTICE 'pgvector extension not found';
    END IF;
END $$;

COMMIT;

-- Verify
SELECT 
    column_name, 
    data_type,
    udt_name
FROM information_schema.columns 
WHERE table_name = 'knowledge_chunks' 
AND column_name = 'embedding';

