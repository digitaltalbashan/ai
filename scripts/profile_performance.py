#!/usr/bin/env python3
"""
Performance Profiling Script - מפה מלאה של התהליך וזיהוי צוואר הבקבוק
"""
import sys
import os
import time
from typing import Dict, List

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.query_improved import RagQueryEngine
from rag.model_cache import get_embedding_model, get_rerank_model
import psycopg2
import json

# Configuration
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://tzahimoyal@localhost:5432/talbashanai")
EMBEDDING_MODEL_NAME = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
RERANK_MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"

# LLM configuration
USE_LLAMA_CPP = os.getenv("USE_LLAMA_CPP", "false").lower() == "true"
LLAMA_CPP_MODEL_PATH = os.getenv("LLAMA_CPP_MODEL_PATH", "models/hebrewllama.Q5_K_M.gguf")


class PerformanceProfiler:
    def __init__(self):
        self.timings: Dict[str, float] = {}
        self.detailed_timings: Dict[str, List[float]] = {}
        
    def time_it(self, name: str, func, *args, **kwargs):
        """Measure execution time of a function"""
        start = time.time()
        result = func(*args, **kwargs)
        elapsed = time.time() - start
        self.timings[name] = elapsed
        if name not in self.detailed_timings:
            self.detailed_timings[name] = []
        self.detailed_timings[name].append(elapsed)
        return result
    
    def print_report(self):
        """Print detailed performance report"""
        print("\n" + "=" * 80)
        print("📊 דוח ביצועים מפורט - Performance Profile")
        print("=" * 80)
        
        total_time = sum(self.timings.values())
        
        # Sort by time (descending)
        sorted_timings = sorted(self.timings.items(), key=lambda x: x[1], reverse=True)
        
        print(f"\n⏱️  סה\"כ זמן: {total_time:.3f} שניות\n")
        print("📈 זמנים לפי שלב (מהאיטי למהיר):")
        print("-" * 80)
        
        for name, elapsed in sorted_timings:
            percentage = (elapsed / total_time * 100) if total_time > 0 else 0
            bar_length = int(percentage / 2)  # Scale bar to 50 chars max
            bar = "█" * bar_length
            print(f"{name:30s} {elapsed:8.3f}s ({percentage:5.1f}%) {bar}")
        
        # Identify bottleneck
        if sorted_timings:
            bottleneck_name, bottleneck_time = sorted_timings[0]
            print(f"\n🔴 צוואר הבקבוק: {bottleneck_name} ({bottleneck_time:.3f}s, {bottleneck_time/total_time*100:.1f}%)")
        
        print("=" * 80)


def profile_full_pipeline(question: str):
    """Profile the entire RAG pipeline step by step"""
    profiler = PerformanceProfiler()
    
    print("🔍 מפת התהליך המלא - Full Pipeline Mapping")
    print("=" * 80)
    print(f"❓ שאלה: {question}\n")
    
    # ===== שלב 1: טעינת מודלים =====
    print("📦 שלב 1: טעינת מודלים (Models Loading)")
    print("-" * 80)
    
    start_embed = time.time()
    embed_model = get_embedding_model(EMBEDDING_MODEL_NAME)
    profiler.timings["1.1 טעינת Embedding Model"] = time.time() - start_embed
    
    start_rerank = time.time()
    rerank_model = get_rerank_model(RERANK_MODEL_NAME)
    profiler.timings["1.2 טעינת Rerank Model"] = time.time() - start_rerank
    
    # ===== שלב 2: יצירת Embedding לשאלה =====
    print("\n🔢 שלב 2: יצירת Embedding לשאלה (Question Embedding)")
    print("-" * 80)
    
    start_embed_q = time.time()
    q_emb = embed_model.encode(
        [question],
        convert_to_numpy=True,
        show_progress_bar=False,
        batch_size=1
    )[0]
    profiler.timings["2. יצירת Embedding לשאלה"] = time.time() - start_embed_q
    print(f"   ✅ Embedding נוצר: {len(q_emb)} ממדים")
    
    # ===== שלב 3: חיפוש במסד הנתונים =====
    print("\n🗄️  שלב 3: חיפוש במסד הנתונים (Database Search)")
    print("-" * 80)
    
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()
    
    embedding_str = '[' + ','.join(map(str, q_emb.tolist())) + ']'
    
    start_db = time.time()
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
        LIMIT 50
    """, (embedding_str, embedding_str,))
    
    candidates = []
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
    
    profiler.timings["3. חיפוש במסד הנתונים"] = time.time() - start_db
    print(f"   ✅ נמצאו {len(candidates)} מועמדים")
    
    # ===== שלב 4: Re-ranking =====
    print("\n📊 שלב 4: Re-ranking (דירוג מחדש)")
    print("-" * 80)
    
    if candidates:
        pairs = [[question, c["text"]] for c in candidates]
        
        start_rerank = time.time()
        scores = rerank_model.predict(
            pairs,
            show_progress_bar=False,
            batch_size=32
        )
        
        for c, s in zip(candidates, scores):
            c["rerank_score"] = float(s)
        
        candidates_sorted = sorted(candidates, key=lambda x: x["rerank_score"], reverse=True)
        top_chunks = candidates_sorted[:8]
        
        profiler.timings["4. Re-ranking"] = time.time() - start_rerank
        print(f"   ✅ נבחרו {len(top_chunks)} קטעים מובילים")
    else:
        top_chunks = []
        profiler.timings["4. Re-ranking"] = 0.0
    
    cursor.close()
    conn.close()
    
    # ===== שלב 5: בניית Prompt =====
    print("\n📝 שלב 5: בניית Prompt (Prompt Building)")
    print("-" * 80)
    
    if USE_LLAMA_CPP:
        from rag.llama_cpp_llm import build_prompt
        
        start_prompt = time.time()
        model_path_lower = LLAMA_CPP_MODEL_PATH.lower()
        max_context = 1000 if 'hebrewllama' in model_path_lower else 2000
        prompt = build_prompt(question, top_chunks, max_context_length=max_context)
        profiler.timings["5. בניית Prompt"] = time.time() - start_prompt
        print(f"   ✅ Prompt נבנה: {len(prompt)} תווים")
    else:
        profiler.timings["5. בניית Prompt"] = 0.0
    
    # ===== שלב 6: LLM Generation =====
    print("\n🧠 שלב 6: יצירת תשובה (LLM Generation)")
    print("-" * 80)
    
    if USE_LLAMA_CPP:
        from rag.llama_cpp_llm import call_llm as call_llm_llamacpp
        
        start_llm = time.time()
        answer = call_llm_llamacpp(question, top_chunks, max_new_tokens=512)
        profiler.timings["6. LLM Generation"] = time.time() - start_llm
        print(f"   ✅ תשובה נוצרה: {len(answer)} תווים")
        print(f"\n📣 תשובה:\n{answer[:200]}...")
    else:
        profiler.timings["6. LLM Generation"] = 0.0
        print("   ⚠️  LLM לא מוגדר (USE_LLAMA_CPP=false)")
    
    # ===== דוח סופי =====
    profiler.print_report()
    
    return profiler


if __name__ == "__main__":
    # Test questions - run multiple to see real performance (after models are cached)
    test_questions = [
        "מה זה מעגל התודעה?",
        "מה ההבדל בין תודעה ראקטיבית לתודעה פרואקטיבית?",
    ]
    
    print("⚠️  הערה: הפעלה ראשונה כוללת טעינת מודלים (איטי יותר)")
    print("=" * 80)
    print()
    
    for i, question in enumerate(test_questions, 1):
        print(f"\n{'='*80}")
        print(f"🔍 שאלה {i}/{len(test_questions)}")
        print(f"{'='*80}\n")
        profile_full_pipeline(question)
        
        if i < len(test_questions):
            print("\n" + "="*80)
            print("⏳ ממתין 2 שניות לפני השאלה הבאה...")
            print("="*80)
            time.sleep(2)

