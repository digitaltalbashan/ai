-- This script fixes vector columns after Prisma migration
-- Run this AFTER running `pnpm db:migrate` if the vector columns weren't created correctly

-- Note: Prisma doesn't fully support pgvector, so we need to manually fix the columns

-- Fix knowledge_chunks.embedding column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'knowledge_chunks' 
        AND column_name = 'embedding' 
        AND data_type = 'USER-DEFINED'
    ) THEN
        ALTER TABLE knowledge_chunks 
        DROP COLUMN IF EXISTS embedding;
        ALTER TABLE knowledge_chunks 
        ADD COLUMN embedding vector(1536);
    END IF;
END $$;

-- Fix user_memories.embedding column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_memories' 
        AND column_name = 'embedding' 
        AND data_type = 'USER-DEFINED'
    ) THEN
        ALTER TABLE user_memories 
        DROP COLUMN IF EXISTS embedding;
        ALTER TABLE user_memories 
        ADD COLUMN embedding vector(1536);
    END IF;
END $$;

-- Create indexes for vector similarity search (optional but recommended for performance)
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx 
ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS user_memories_embedding_idx 
ON user_memories USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

