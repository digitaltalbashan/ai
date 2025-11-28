-- Update embedding column to support 3072 dimensions (text-embedding-3-large)
-- WARNING: This will require re-indexing all chunks!

-- First, backup existing data (recommended)
-- CREATE TABLE knowledge_chunks_backup AS SELECT * FROM knowledge_chunks;

-- Drop existing index
DROP INDEX IF EXISTS idx_knowledge_chunks_embedding;

-- Alter column to support 3072 dimensions
-- Note: This will fail if there are existing embeddings with different dimensions
-- You'll need to clear the embeddings first or re-index

-- Option 1: Clear embeddings and update dimension (if you're re-indexing everything)
-- UPDATE knowledge_chunks SET embedding = NULL;
-- ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE vector(3072);

-- Option 2: Create new table and migrate (safer)
-- CREATE TABLE knowledge_chunks_new (LIKE knowledge_chunks INCLUDING ALL);
-- ALTER TABLE knowledge_chunks_new ALTER COLUMN embedding TYPE vector(3072);
-- INSERT INTO knowledge_chunks_new SELECT * FROM knowledge_chunks;
-- DROP TABLE knowledge_chunks;
-- ALTER TABLE knowledge_chunks_new RENAME TO knowledge_chunks;

-- Recreate index with new dimension
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
ON knowledge_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 200);

