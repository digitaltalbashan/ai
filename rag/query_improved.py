#!/usr/bin/env python3
"""
Improved RAG Query Engine with Re-ranking
Uses PostgreSQL + pgvector for vector search and CrossEncoder for re-ranking
"""
import os
import json
import time
from typing import List, Dict, Tuple, Optional

import psycopg2
from sentence_transformers import SentenceTransformer, CrossEncoder
from rag.model_cache import get_embedding_model, get_rerank_model

# === CONFIGURATION ===

BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "..", "data")

# Database
# Remove schema parameter from DATABASE_URL as psycopg2 doesn't support it
_raw_database_url = os.getenv("DATABASE_URL", "postgresql://tzahimoyal@localhost:5432/talbashanai")
# Remove ?schema=... from URL if present
if "?schema=" in _raw_database_url:
    DATABASE_URL = _raw_database_url.split("?schema=")[0]
else:
    DATABASE_URL = _raw_database_url

# Models
EMBEDDING_MODEL_NAME = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
# Rerank models: "fast" (default), "balanced", "best", "latest", or full model name
# Options:
#   - "fast": cross-encoder/ms-marco-MiniLM-L-6-v2 (fast, good for CPU) - DEFAULT
#   - "balanced": BAAI/bge-reranker-base (better quality, still fast)
#   - "best": BAAI/bge-reranker-large (best quality, needs more resources)
#   - "latest": mixedbread-ai/mxbai-rerank-large-v1 (latest and greatest)
# Can be overridden via RERANK_MODEL environment variable
RERANK_MODEL_NAME = os.getenv("RERANK_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")

# Default parameters
DEFAULT_TOP_K_RETRIEVE = 50
DEFAULT_TOP_N_RERANK = 8


# === LLM CALL ===

# Note: LLM is now handled by OpenAI API in TypeScript
# This function is kept for backward compatibility but should not be used
# The actual LLM call happens in queryWithOpenAIRag.ts
def call_llm_default(question: str, context_chunks: List[Dict]) -> str:
    """
    Deprecated: LLM is now handled by OpenAI API in TypeScript.
    This function is kept for backward compatibility only.
    """
    raise NotImplementedError(
        "Local LLM is no longer supported. Please use OpenAI API via queryWithOpenAIRag."
    )


# === RAG + RE-RANKING ENGINE ===

class RagQueryEngine:
    def __init__(
        self,
        database_url: str = DATABASE_URL,
        embedding_model_name: str = EMBEDDING_MODEL_NAME,
        rerank_model_name: str = RERANK_MODEL_NAME,
        top_k_retrieve: int = DEFAULT_TOP_K_RETRIEVE,
        top_n_rerank: int = DEFAULT_TOP_N_RERANK,
    ):
        print(f"📥 Connecting to PostgreSQL...")
        self.conn = psycopg2.connect(database_url)
        print("✅ Connected to database")
        
        # Use cached models for better performance
        self.embed_model = get_embedding_model(embedding_model_name)
        self.rerank_model = get_rerank_model(rerank_model_name)
        
        self.top_k_retrieve = top_k_retrieve
        self.top_n_rerank = top_n_rerank
        
        print("✅ RagQueryEngine initialized.")

    def retrieve_candidates(self, question: str) -> List[Dict]:
        """
        שלב 1: Vector search ראשוני -> מחזיר רשימת candidates מ-PostgreSQL
        """
        cursor = self.conn.cursor()
        
        # Generate query embedding (optimized: use show_progress_bar=False for speed)
        q_emb = self.embed_model.encode(
            [question], 
            convert_to_numpy=True,
            show_progress_bar=False,
            batch_size=1
        )[0]
        embedding_str = '[' + ','.join(map(str, q_emb.tolist())) + ']'
        
        # Search in PostgreSQL (optimized for vector search)
        # Using EXPLAIN to ensure index is used, and limiting work_mem if needed
        # Note: The ivfflat index should be used automatically for vector similarity search
        cursor.execute("""
            SELECT 
                id,
                text,
                metadata,
                source,
                "order",
                embedding <=> %s::vector AS distance
            FROM knowledge_chunks
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """, (embedding_str, embedding_str, self.top_k_retrieve))
        
        candidates: List[Dict] = []
        for row in cursor.fetchall():
            id, text, metadata, source, order, distance = row
            metadata_dict = metadata if isinstance(metadata, dict) else json.loads(metadata) if metadata else {}
            
            candidates.append({
                "id": id,
                "text": text,
                "metadata": metadata_dict,
                "source": source or "unknown",
                "chunk_index": order or 0,
                "order": order or 0,
                "distance": float(distance)
            })
        
        cursor.close()
        return candidates

    def rerank(self, question: str, candidates: List[Dict]) -> List[Dict]:
        """
        שלב 2: Re-ranking עם CrossEncoder
        """
        if not candidates:
            return []

        # Prepare pairs for CrossEncoder
        pairs = [[question, c["text"]] for c in candidates]
        
        # Get scores from CrossEncoder (optimized: batch processing, no progress bar)
        scores = self.rerank_model.predict(
            pairs,
            show_progress_bar=False,
            batch_size=32  # Process in batches for better performance
        )

        # Add score to each candidate and sort
        for c, s in zip(candidates, scores):
            c["rerank_score"] = float(s)

        # Sort by rerank score (descending)
        candidates_sorted = sorted(candidates, key=lambda x: x["rerank_score"], reverse=True)
        
        return candidates_sorted[: self.top_n_rerank]

    def answer(
        self,
        search_query: str = None,
        question: str = None,
        llm_callable=call_llm_default,
        measure_time: bool = False,
    ) -> Tuple[str, List[Dict], Optional[Dict]]:
        """
        הצינור המלא: Retrieve -> Re-rank -> LLM Answer
        מחזיר (תשובה, רשימת מקורות, [מידע על זמנים אם measure_time=True])
        
        Args:
            search_query: השאילתה לחיפוש chunks (יכול לכלול היסטוריה לשיפור חיפוש)
            question: השאלה הנוכחית בלבד לשליחה למודל (אם לא מוגדר, משתמש ב-search_query)
        """
        # Backward compatibility: if only question is provided, use it for both
        if question is None:
            question = search_query
        if search_query is None:
            search_query = question
        
        timing_info = {} if measure_time else None
        
        if not search_query.strip():
            return "שאלה ריקה.", [], timing_info

        # Measure retrieval time
        if measure_time:
            start_retrieve = time.time()
        
        print("🔍 Retrieving candidates...")
        # Use search_query (with history) for better retrieval
        candidates = self.retrieve_candidates(search_query)
        
        if measure_time:
            timing_info["retrieve_time"] = time.time() - start_retrieve
            timing_info["num_candidates"] = len(candidates)
        
        if not candidates:
            return "לא נמצאו קטעים רלוונטיים במסמכים.", [], timing_info

        # Measure rerank time
        if measure_time:
            start_rerank = time.time()
        
        print(f"🔍 Retrieved {len(candidates)} candidates. Re-ranking...")
        # Use search_query (with history) for better reranking
        top_chunks = self.rerank(search_query, candidates)
        
        if measure_time:
            timing_info["rerank_time"] = time.time() - start_rerank
            timing_info["num_final_chunks"] = len(top_chunks)
            timing_info["total_chunks_time"] = timing_info["retrieve_time"] + timing_info["rerank_time"]
        
        if not top_chunks:
            return "לא הצלחתי לדרג קטעים רלוונטיים.", [], timing_info

        # Measure LLM time (optional)
        if measure_time:
            start_llm = time.time()
        
        print(f"🧠 Calling LLM with top {len(top_chunks)} chunks...")
        # Use question (current question only) for LLM
        answer = llm_callable(question, top_chunks)
        
        if measure_time:
            timing_info["llm_time"] = time.time() - start_llm
            timing_info["total_time"] = timing_info["total_chunks_time"] + timing_info["llm_time"]
        
        return answer, top_chunks, timing_info

    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()


# === CLI לשימוש ישיר מהטרמינל ===

def main_cli():
    print("🚀 RAG Query Engine (with Re-ranking)")
    print("=" * 80)
    print(f"📂 Database: {DATABASE_URL}")
    print(f"📦 Embedding model: {EMBEDDING_MODEL_NAME}")
    print(f"📦 Rerank model: {RERANK_MODEL_NAME}")
    model_path = os.getenv('LLAMA_CPP_MODEL_PATH', 'models/dictalm2.0-instruct.gguf')
    print(f"🔗 LLM: llama.cpp GGUF ({os.path.basename(model_path)})")
    print("=" * 80)
    print("כתוב שאלה, או 'exit' ליציאה.\n")

    try:
        engine = RagQueryEngine()
        llm_callable = call_llm_default
    except Exception as e:
        print(f"❌ שגיאה באתחול: {e}")
        return

    while True:
        try:
            q = input("❓ שאלה: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n👋 ביי!")
            break

        if q.lower() in ("exit", "quit", "יציאה"):
            print("👋 ביי!")
            break

        if not q:
            continue

        try:
            result = engine.answer(q, llm_callable=llm_callable)
            # Handle both old format (2 values) and new format (3 values)
            if len(result) == 3:
                answer, sources, timing_info = result
            else:
                answer, sources = result
                timing_info = None
        except Exception as e:
            print(f"\n⚠️ שגיאה: {e}")
            import traceback
            traceback.print_exc()
            continue

        print("\n" + "=" * 80)
        print("📣 תשובה:")
        print(answer)
        print("\n📚 מקורות שנלקחו מתוך המסמכים:")
        for i, s in enumerate(sources, start=1):
            score = s.get("rerank_score", 0)
            distance = s.get("distance", 0)
            print(
                f"[{i}] {s['source']} (chunk {s['chunk_index']})"
                f" | rerank_score={score:.3f} | distance={distance:.3f}"
            )
        if timing_info:
            print("\n⏱️ זמנים:")
            print(f"  🔍 חיפוש: {timing_info.get('retrieve_time', 0):.2f}s")
            print(f"  📊 Re-ranking: {timing_info.get('rerank_time', 0):.2f}s")
            print(f"  🧠 LLM: {timing_info.get('llm_time', 0):.2f}s")
            print(f"  ⏱️ סה\"כ: {timing_info.get('total_time', 0):.2f}s")
        print("=" * 80)
        print()

    engine.close()


if __name__ == "__main__":
    main_cli()

