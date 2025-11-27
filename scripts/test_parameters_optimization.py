#!/usr/bin/env python3
"""
סקריפט לבדיקת אופטימיזציה של פרמטרים עבור Dicta-LM 2.0
בודק שילובים שונים של:
- max_new_tokens (כמה טוקנים ליצור)
- max_context (כמה קונטקסט לשלוח)
- top_n_rerank (כמה צ'אנקים לשלוח)
"""
import sys
import os
import json
import time
from typing import Dict, List, Tuple

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.query_improved import RagQueryEngine, call_llm_default
from rag.llama_cpp_llm import call_llm

# שאלות לבדיקה (3 שאלות מייצגות)
TEST_QUESTIONS = [
    "מה זה מעגל התודעה?",
    "מה הקשר בין סרגלים לריאקטיביות?",
    "איך עובד חוק המראות?",
]

# שילובי פרמטרים לבדיקה (מיקוד על השילובים החשובים ביותר)
PARAMETER_COMBINATIONS = [
    # (max_new_tokens, max_context, top_n_rerank, description)
    (1024, 1200, 8, "ברירת מחדל נוכחית"),
    (1536, 1500, 10, "הגדלה בינונית"),
    (2048, 1800, 12, "הגדלה משמעותית"),
    (1536, 1200, 8, "רק הגדלת max_tokens"),
    (1024, 1500, 10, "רק הגדלת context"),
    (2048, 1500, 10, "max_tokens + context"),
]

def count_tokens_hebrew(text: str) -> int:
    """אומדן גס של טוקנים בעברית (1.3 טוקנים למילה)"""
    words = len(text.split())
    return int(words * 1.3)

def check_if_truncated(answer: str, max_tokens: int) -> Tuple[bool, int]:
    """בודק אם התשובה נקטעה"""
    estimated_tokens = count_tokens_hebrew(answer)
    is_truncated = estimated_tokens >= max_tokens * 0.95  # אם קרוב ל-95% מהמקסימום
    return is_truncated, estimated_tokens

def test_combination(
    question: str,
    max_new_tokens: int,
    max_context: int,
    top_n_rerank: int,
    engine: RagQueryEngine
) -> Dict:
    """בודק שילוב פרמטרים אחד"""
    print(f"\n{'='*80}")
    print(f"🧪 בודק: max_tokens={max_new_tokens}, max_context={max_context}, top_n={top_n_rerank}")
    print(f"📝 שאלה: {question}")
    print(f"{'='*80}")
    
    start_time = time.time()
    
    try:
        # Override call_llm to use custom parameters
        def custom_call_llm(q: str, chunks: List[Dict]) -> str:
            return call_llm(q, chunks, max_new_tokens=max_new_tokens, max_context=max_context)
        
        # Get answer
        answer, sources, timing_info = engine.answer(
            search_query=question,
            question=question,
            llm_callable=custom_call_llm,
            measure_time=True
        )
        
        total_time = time.time() - start_time
        
        # Analyze results
        answer_length = len(answer)
        answer_tokens = count_tokens_hebrew(answer)
        is_truncated, estimated_tokens = check_if_truncated(answer, max_new_tokens)
        
        # Count context tokens
        context_text = "\n\n".join([s.get('text', '') for s in sources])
        context_length = len(context_text)
        context_tokens = count_tokens_hebrew(context_text)
        
        # Check if answer ends abruptly (sign of truncation)
        ends_abruptly = (
            answer.endswith("...") or
            answer.endswith(".") == False and len(answer) > 100 or
            answer.count(".") == 0 and len(answer) > 200
        )
        
        result = {
            "question": question,
            "max_new_tokens": max_new_tokens,
            "max_context": max_context,
            "top_n_rerank": top_n_rerank,
            "answer": answer,
            "answer_length": answer_length,
            "answer_tokens": answer_tokens,
            "context_length": context_length,
            "context_tokens": context_tokens,
            "num_chunks": len(sources),
            "is_truncated": is_truncated or ends_abruptly,
            "ends_abruptly": ends_abruptly,
            "total_time": total_time,
            "timing": timing_info,
            "success": True,
        }
        
        print(f"✅ תשובה: {answer_length} תווים, ~{answer_tokens} טוקנים")
        print(f"📚 קונטקסט: {context_length} תווים, ~{context_tokens} טוקנים, {len(sources)} chunks")
        print(f"⏱️  זמן: {total_time:.2f} שניות")
        if is_truncated or ends_abruptly:
            print(f"⚠️  תשובה נקטעה!")
        
        return result
        
    except Exception as e:
        print(f"❌ שגיאה: {str(e)}")
        return {
            "question": question,
            "max_new_tokens": max_new_tokens,
            "max_context": max_context,
            "top_n_rerank": top_n_rerank,
            "error": str(e),
            "success": False,
        }

def main():
    print("🚀 מתחיל בדיקת אופטימיזציה של פרמטרים")
    print(f"📋 {len(TEST_QUESTIONS)} שאלות, {len(PARAMETER_COMBINATIONS)} שילובי פרמטרים")
    print(f"📊 סה\"כ: {len(TEST_QUESTIONS) * len(PARAMETER_COMBINATIONS)} בדיקות\n")
    
    # Initialize engine once
    engine = RagQueryEngine(top_k_retrieve=50, top_n_rerank=12)  # Use max top_n for flexibility
    
    all_results = []
    
    for question in TEST_QUESTIONS:
        for max_new_tokens, max_context, top_n_rerank, description in PARAMETER_COMBINATIONS:
            # Create engine with specific top_n_rerank
            test_engine = RagQueryEngine(top_k_retrieve=50, top_n_rerank=top_n_rerank)
            
            result = test_combination(
                question,
                max_new_tokens,
                max_context,
                top_n_rerank,
                test_engine
            )
            result["description"] = description
            all_results.append(result)
            
            test_engine.close()
            time.sleep(0.5)  # קצת מנוחה בין בדיקות
    
    engine.close()
    
    # Analyze results
    print(f"\n\n{'='*80}")
    print("📊 סיכום תוצאות")
    print(f"{'='*80}\n")
    
    # Group by parameter combination
    by_combo = {}
    for r in all_results:
        key = (r["max_new_tokens"], r["max_context"], r["top_n_rerank"])
        if key not in by_combo:
            by_combo[key] = []
        by_combo[key].append(r)
    
    # Find best combination
    best_score = -1
    best_combo = None
    
    for combo, results in by_combo.items():
        max_tokens, max_context, top_n = combo
        successful = [r for r in results if r.get("success", False)]
        if not successful:
            continue
        
        # Calculate score: lower truncation rate, longer answers, more context
        truncation_rate = sum(1 for r in successful if r.get("is_truncated", False)) / len(successful)
        avg_answer_length = sum(r["answer_length"] for r in successful) / len(successful)
        avg_context_used = sum(r["context_tokens"] for r in successful) / len(successful)
        avg_time = sum(r["total_time"] for r in successful) / len(successful)
        
        # Score: prioritize low truncation, good answer length, reasonable time
        score = (
            (1 - truncation_rate) * 0.4 +  # 40% weight on no truncation
            min(avg_answer_length / 2000, 1) * 0.3 +  # 30% weight on answer length
            min(avg_context_used / 1500, 1) * 0.2 +  # 20% weight on context usage
            (1 - min(avg_time / 30, 1)) * 0.1  # 10% weight on speed
        )
        
        description = results[0].get("description", "N/A") if results else "N/A"
        print(f"🔧 {description}")
        print(f"   פרמטרים: max_tokens={max_tokens}, max_context={max_context}, top_n={top_n}")
        print(f"   ✅ הצלחה: {len(successful)}/{len(results)}")
        print(f"   ⚠️  קטיעה: {sum(1 for r in successful if r.get('is_truncated', False))}/{len(successful)} ({truncation_rate*100:.1f}%)")
        print(f"   📏 אורך ממוצע: {avg_answer_length:.0f} תווים (~{count_tokens_hebrew('x' * int(avg_answer_length))} טוקנים)")
        print(f"   📚 קונטקסט ממוצע: {avg_context_used:.0f} טוקנים")
        print(f"   ⏱️  זמן ממוצע: {avg_time:.2f} שניות")
        print(f"   🎯 ציון: {score:.3f}\n")
        
        if score > best_score:
            best_score = score
            best_combo = (combo, results, score, truncation_rate, avg_answer_length, avg_context_used, avg_time)
    
    if best_combo:
        combo, results, score, trunc_rate, avg_len, avg_ctx, avg_time = best_combo
        max_tokens, max_context, top_n = combo
        print(f"\n{'='*80}")
        print("🏆 השילוב הטוב ביותר:")
        print(f"{'='*80}")
        print(f"   max_new_tokens: {max_tokens}")
        print(f"   max_context: {max_context}")
        print(f"   top_n_rerank: {top_n}")
        print(f"   ציון: {score:.3f}")
        print(f"   שיעור קטיעה: {tr_rate*100:.1f}%")
        print(f"   אורך תשובה ממוצע: {avg_len:.0f} תווים")
        print(f"   קונטקסט ממוצע: {avg_ctx:.0f} טוקנים")
        print(f"   זמן ממוצע: {avg_time:.2f} שניות")
        print(f"{'='*80}\n")
    
    # Save results to JSON
    output_file = "data/parameter_optimization_results.json"
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    
    print(f"💾 תוצאות נשמרו ב: {output_file}")

if __name__ == "__main__":
    main()
