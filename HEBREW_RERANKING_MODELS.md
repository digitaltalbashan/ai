# Best Re-ranking Models for Hebrew Support

## Overview

The current model `cross-encoder/ms-marco-MiniLM-L-6-v2` is English-focused and doesn't handle Hebrew well. For Hebrew text, we need **multilingual models** that were trained on multiple languages including Hebrew.

## Recommended Models (Best to Good)

### 1. **BAAI/bge-reranker-base** ⭐ **RECOMMENDED**

**Why it's best for Hebrew:**
- ✅ **Multilingual** - Trained on 100+ languages including Hebrew
- ✅ Better semantic understanding of Hebrew text
- ✅ Good balance of quality and speed
- ✅ Medium model size (~278MB)
- ✅ Actively maintained by BAAI (Beijing Academy of AI)

**Performance:**
- Speed: Fast (good for production)
- Quality: Excellent for Hebrew
- Memory: ~500MB RAM

**Usage:**
```bash
export RERANK_MODEL="BAAI/bge-reranker-base"
```

---

### 2. **BAAI/bge-reranker-large** ⭐ **BEST QUALITY**

**Why it's best for quality:**
- ✅ **Multilingual** - Same as base but larger
- ✅ Highest quality for Hebrew text
- ✅ Better semantic understanding
- ⚠️ Slower than base version
- ⚠️ Larger model size (~1.1GB)

**Performance:**
- Speed: Moderate (slower than base)
- Quality: Best for Hebrew
- Memory: ~2GB RAM

**Usage:**
```bash
export RERANK_MODEL="BAAI/bge-reranker-large"
```

---

### 3. **cross-encoder/ms-marco-MiniLM-L-12-v2**

**Why it's an option:**
- ✅ Larger version of current model
- ✅ Better multilingual support than L-6
- ⚠️ Still English-focused (not ideal for Hebrew)
- ⚠️ Larger than L-6 (~200MB)

**Performance:**
- Speed: Moderate
- Quality: Better than L-6, but not as good as BAAI models for Hebrew
- Memory: ~400MB RAM

**Usage:**
```bash
export RERANK_MODEL="cross-encoder/ms-marco-MiniLM-L-12-v2"
```

---

### 4. **mixedbread-ai/mxbai-rerank-large-v1**

**Why it's an option:**
- ✅ Latest multilingual model
- ✅ Good quality
- ⚠️ Very large (~1.5GB)
- ⚠️ May be slower

**Performance:**
- Speed: Slower
- Quality: Very good
- Memory: ~3GB RAM

**Usage:**
```bash
export RERANK_MODEL="mixedbread-ai/mxbai-rerank-large-v1"
```

---

## Current Status

**Default Model:** `BAAI/bge-reranker-base` (updated to support Hebrew)

The default has been changed from `cross-encoder/ms-marco-MiniLM-L-6-v2` to `BAAI/bge-reranker-base` for better Hebrew support.

## How to Change the Model

### Option 1: Environment Variable (Recommended)

```bash
# In your .env file or shell
export RERANK_MODEL="BAAI/bge-reranker-base"
```

### Option 2: Update Default in Code

Edit `scripts/rerank_with_crossencoder.py`:
```python
DEFAULT_RERANK_MODEL = "BAAI/bge-reranker-base"
```

## Testing the New Model

After changing the model, test it:

```bash
# Test with Hebrew query
pnpm tsx scripts/checkChunksForQuery.ts "מהי מצדה?"
```

You should see:
- ✅ Metzada chunks appearing in top 8 results
- ✅ Higher rerank scores for Hebrew content
- ✅ Better relevance ranking

## Model Comparison

| Model | Hebrew Support | Speed | Quality | Size | RAM |
|-------|---------------|-------|---------|------|-----|
| `BAAI/bge-reranker-base` | ✅ Excellent | Fast | Excellent | 278MB | ~500MB |
| `BAAI/bge-reranker-large` | ✅ Excellent | Moderate | Best | 1.1GB | ~2GB |
| `cross-encoder/ms-marco-MiniLM-L-12-v2` | ⚠️ Moderate | Moderate | Good | 200MB | ~400MB |
| `cross-encoder/ms-marco-MiniLM-L-6-v2` | ❌ Poor | Fast | Poor (Hebrew) | 80MB | ~200MB |
| `mixedbread-ai/mxbai-rerank-large-v1` | ✅ Good | Slower | Very Good | 1.5GB | ~3GB |

## Recommendation

**For Production (Hebrew):**
- Use `BAAI/bge-reranker-base` - Best balance of quality and speed

**For Best Quality (Hebrew):**
- Use `BAAI/bge-reranker-large` - If you have enough resources

**For Speed (English):**
- Use `cross-encoder/ms-marco-MiniLM-L-6-v2` - Only if Hebrew is not important

## Installation

The models are automatically downloaded by `sentence-transformers` on first use. No additional installation needed.

## References

- [BAAI/bge-reranker-base on HuggingFace](https://huggingface.co/BAAI/bge-reranker-base)
- [BAAI/bge-reranker-large on HuggingFace](https://huggingface.co/BAAI/bge-reranker-large)
- [Sentence Transformers Documentation](https://www.sbert.net/docs/package_reference/crossencoder.html)

