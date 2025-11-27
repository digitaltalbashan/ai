# 🎯 RAG Strategy - Implementation Guide

## Overview

This project implements a production-ready RAG (Retrieval Augmented Generation) system following best practices:

### Strategy: **Vector Search + Re-ranking + LLM**

---

## 📋 Architecture

### Part 1: Ingestion Pipeline (Document Processing)

**Location:** `rag/ingest_improved.py`

**What it does:**
1. ✅ Reads all Word documents recursively
2. ✅ Extracts text from documents
3. ✅ **Context-Aware Chunking** (200-400 tokens, 50-100 overlap)
4. ✅ Generates embeddings using `sentence-transformers/all-MiniLM-L6-v2`
5. ✅ Indexes to FAISS vector store

**Key Features:**
- Context-aware chunking that respects sentence boundaries
- Metadata extraction (topic, key_concepts, word_count)
- Token-based chunking (not character-based)
- Overlap between chunks for context preservation

**Usage:**
```bash
python3 -m rag.ingest_improved
```

**Parameters:**
- `max_tokens`: 300 (recommended: 200-400)
- `overlap_tokens`: 75 (recommended: 50-100)

---

### Part 2: Query Pipeline (Question Answering)

**Location:** `src/server/vector/searchWithRerank.ts`

**Strategy:**
1. **Vector Search**: Retrieve top_k=30-50 candidates
2. **Re-ranking**: Score and rank by relevance
3. **Return**: Top_n=5-10 most relevant chunks
4. **LLM**: Generate answer from top chunks

**Key Features:**
- Hybrid scoring: semantic distance + relevance
- Metadata matching (topic, key_concepts)
- Word overlap analysis
- Position-based scoring (earlier mentions = more important)

**Usage:**
```typescript
import { searchKnowledgeWithRerank } from '@/src/server/vector/searchWithRerank'

const chunks = await searchKnowledgeWithRerank(
  "מה זה מעגל התודעה?",
  topK: 40,  // Retrieve 40 candidates
  topN: 8    // Return top 8
)
```

---

## 🔧 Configuration

### Embedding Model
- **Model**: `sentence-transformers/all-MiniLM-L6-v2`
- **Dimension**: 384
- **Language**: Multilingual (works well with Hebrew)

### Re-ranking
- **Current**: Hybrid scoring (semantic + relevance)
- **Future**: Can upgrade to `cross-encoder/ms-marco-MiniLM-L-6-v2` for better accuracy

### Chunking
- **Size**: 200-400 tokens (currently 300)
- **Overlap**: 50-100 tokens (currently 75)
- **Method**: Context-aware (respects sentence boundaries)

---

## 📊 Performance

### Current Stats (from 1000 questions analysis):
- **Total chunks**: ~4,590
- **Unique chunks used**: 617
- **Average chunks per question**: 7.68
- **Chunks reused**: 458 (74% reuse rate)

### Quality Metrics:
- **Overall quality**: 0.177 (needs improvement)
- **Relevance**: 0.231
- **Metadata match**: 0.123

---

## 🚀 Improvements Made

### ✅ Ingestion Pipeline
- [x] Context-aware chunking (sentence boundaries)
- [x] Token-based chunking (not character-based)
- [x] Metadata extraction
- [x] FAISS indexing

### ✅ Query Pipeline
- [x] Vector search (top_k=40-50)
- [x] Re-ranking with hybrid scoring
- [x] Metadata matching
- [x] Word overlap analysis

### ✅ Prompt Engineering
- [x] Strict context usage rules
- [x] Hebrew-only enforcement
- [x] Anti-hallucination rules
- [x] Concept definition handling

---

## 🔮 Future Improvements

### Short-term:
1. **Better Re-ranking**: Use proper CrossEncoder model
2. **Chunk Quality**: Improve chunking to reduce overlap
3. **Metadata**: Add more structured metadata

### Long-term:
1. **Multi-Query**: Generate multiple query variations
2. **HyDE**: Hypothetical Document Embeddings
3. **Agentic RAG**: Multi-step reasoning

---

## 📁 File Structure

```
rag/
├── ingest_improved.py      # Improved ingestion pipeline
├── query.py                 # Python RAG engine (with re-ranking)
├── config.py                # Configuration
└── __init__.py

src/server/vector/
├── search.ts                # Main search function (uses re-ranking)
├── searchWithRerank.ts      # Re-ranking implementation
└── ...

src/server/prompt/
└── buildPrompt.ts           # Prompt engineering
```

---

## 💡 Best Practices

1. **Chunking**: Use context-aware chunking (sentence boundaries)
2. **Retrieval**: Retrieve more candidates (30-50) than needed
3. **Re-ranking**: Always re-rank before sending to LLM
4. **Metadata**: Use metadata for better matching
5. **Prompt**: Be explicit about context usage

---

## 📚 References

- [RAG Best Practices](https://www.pinecone.io/learn/retrieval-augmented-generation/)
- [Re-ranking in RAG](https://www.pinecone.io/learn/reranking/)
- [Context-Aware Chunking](https://www.pinecone.io/learn/chunking-strategies/)

