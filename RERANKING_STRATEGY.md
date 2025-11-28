# Re-ranking Strategy

## Overview

We've implemented a **two-stage retrieval strategy** that combines fast vector search with accurate re-ranking using a CrossEncoder model. This significantly improves retrieval precision by understanding query-document relationships.

## Architecture

### Stage 1: Fast Vector Search (Retrieval)
- Uses OpenAI `text-embedding-3-small` (1536 dimensions) for query embedding
- PostgreSQL + pgvector for fast similarity search
- Returns top K candidates (default: 50)

### Stage 2: Re-ranking (Refinement)
- Uses CrossEncoder model (`cross-encoder/ms-marco-MiniLM-L-6-v2`)
- Evaluates each candidate with the query simultaneously
- Captures richer semantic interactions than vector similarity alone
- Returns top N re-ranked results (default: 8)

## Implementation

### Python Re-ranker (`scripts/rerank_with_crossencoder.py`)

```python
from scripts.rerank_with_crossencoder import rerank_chunks

# Re-rank candidates
reranked = rerank_chunks(query, candidates, top_n=8)
```

**Features:**
- Model caching for performance
- Batch processing (32 chunks at a time)
- Automatic fallback if re-ranking fails

### TypeScript Integration

The re-ranking is integrated into the retrieval flow:

```typescript
// 1. Fast vector search
const candidates = await vectorSearch(query, topK=50)

// 2. Re-rank with CrossEncoder
const reranked = await rerankWithCrossEncoder(query, candidates, topN=8)
```

## Model Details

**Default Model:** `BAAI/bge-reranker-base` (multilingual, supports Hebrew)

**Why this model for Hebrew?**
- ✅ **Multilingual support** - Trained on 100+ languages including Hebrew
- ✅ Better semantic understanding of Hebrew text
- ✅ Good balance of quality and speed
- ✅ Medium model size (~278MB)

**Alternative Models:**
- `BAAI/bge-reranker-large` - Best quality for Hebrew, slower (~1.1GB)
- `cross-encoder/ms-marco-MiniLM-L-12-v2` - Larger multilingual version
- `cross-encoder/ms-marco-MiniLM-L-6-v2` - Fast but English-focused (not recommended for Hebrew)
- `mixedbread-ai/mxbai-rerank-large-v1` - Latest multilingual model

Set via environment variable: `RERANK_MODEL`

## Performance

### Pros
✅ **Significantly improves retrieval precision**
- Better understanding of query-document relationships
- Captures semantic interactions that vector search misses
- Works well as a refinement layer

### Cons
⚠️ **Computational overhead**
- More expensive than embedding models
- Adds latency (each document processed with query)
- Requires Python environment with `sentence-transformers`

### When to Use
- ✅ When accuracy is more important than speed
- ✅ For narrowing down large candidate sets
- ✅ Production systems with sufficient compute

### When NOT to Use
- ❌ Real-time performance critical (<100ms)
- ❌ Limited compute resources
- ❌ Very large result sets (>1000 chunks)

## Usage

### In Test Scripts

```typescript
import { retrieveChunksWithOpenAI } from './scripts/testRagRetrievalOpenAI'

// Automatically uses re-ranking
const chunks = await retrieveChunksWithOpenAI(query, topK=50, topN=8)
```

### In Production Code

The re-ranking is automatically used in:
- `src/server/vector/queryWithOpenAIRag.ts` - Main RAG query handler
- `scripts/testRagRetrievalOpenAI.ts` - Quality testing

## Dependencies

```bash
pip install sentence-transformers torch
```

Already included in `requirements-rag.txt`

## Configuration

Set re-rank model via environment variable:

```bash
export RERANK_MODEL="cross-encoder/ms-marco-MiniLM-L-6-v2"  # Default
# or
export RERANK_MODEL="BAAI/bge-reranker-base"  # Better quality
```

## Expected Improvements

Based on the two-stage approach:
- **Precision**: 20-40% improvement over vector-only search
- **Recall**: Maintained (we retrieve more candidates first)
- **Latency**: +100-300ms per query (acceptable for most use cases)

## Testing

Run the quality test to see re-ranking in action:

```bash
pnpm tsx scripts/testRagRetrievalOpenAI.ts
```

This will show:
- Chunks before re-ranking (vector similarity)
- Chunks after re-ranking (CrossEncoder scores)
- Quality improvements

## References

- [Pinecone: Rerankers and Two-Stage Retrieval](https://www.pinecone.io/learn/series/rag/rerankers/)
- [CrossEncoder Documentation](https://www.sbert.net/docs/package_reference/crossencoder.html)

