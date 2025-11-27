-- Update knowledge_chunks.embedding column from 1536 to 768
ALTER TABLE knowledge_chunks 
  DROP COLUMN IF EXISTS embedding;

ALTER TABLE knowledge_chunks 
  ADD COLUMN embedding vector(768);

-- Update user_memories.embedding column from 1536 to 768
ALTER TABLE user_memories 
  DROP COLUMN IF EXISTS embedding;

ALTER TABLE user_memories 
  ADD COLUMN embedding vector(768);

-- Recreate indexes
DROP INDEX IF EXISTS knowledge_chunks_embedding_idx;
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx 
ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

DROP INDEX IF EXISTS user_memories_embedding_idx;
CREATE INDEX IF NOT EXISTS user_memories_embedding_idx 
ON user_memories USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

