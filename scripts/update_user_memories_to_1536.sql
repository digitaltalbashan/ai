-- Update user_memories embedding column to vector(1536)
-- This matches the text-embedding-3-small model dimensions

-- Drop existing index if it exists
DROP INDEX IF EXISTS idx_user_memories_embedding;

-- Update the embedding column to vector(1536)
-- First, make it nullable temporarily if it's not already
ALTER TABLE user_memories ALTER COLUMN embedding DROP NOT NULL;
-- Then, update the type and set existing values to NULL
ALTER TABLE user_memories ALTER COLUMN embedding TYPE vector(1536) USING NULL;
-- Finally, make it NOT NULL again
ALTER TABLE user_memories ALTER COLUMN embedding SET NOT NULL;

-- Recreate the index with HNSW for 1536 dimensions (if HNSW is available)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector' AND extversion >= '0.5.0') THEN
        -- For pgvector 0.5.0+ HNSW is available
        CREATE INDEX IF NOT EXISTS idx_user_memories_embedding
        ON user_memories
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
        RAISE NOTICE 'HNSW index created for user_memories embedding column.';
    ELSE
        RAISE NOTICE 'HNSW not available, skipping index creation. Queries will work but may be slower.';
    END IF;
END
$$;

