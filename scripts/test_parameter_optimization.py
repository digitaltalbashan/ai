#!/usr/bin/env python3
"""
סקריפט בדיקה לאופטימיזציה של פרמטרים עבור Dicta-LM 2.0
בודק כמה אופציות של פרמטרים עם שאלות מגוונות
"""
import sys
import os
import json
import time
from typing import Dict, List, Tuple
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.query_improved import RagQueryEngine
from rag.llama_cpp_llm import call_llm, build_prompt

# שאלות בדיקה מגוונות
TEST_QUESTIONS = [
    "מה ההבדל בין הבנה שכלית של שינוי לבין שינוי אמיתי בחיים?",
    "מה זה מעגל התודעה ואיך הוא עובד?",
    "מה הקשר בין סרגלים לריאקטיביות?",
    "איך אני משחרר את המראה?",
    "מה ההבדל בין תודעת R, תודעת A ותודעת C?"
]

# אופציות פרמטרים לבדיקה
PARAMETER_OPTIONS = [
    {
        "name": "Option 1 - Current (Conservative)",
        "max_context": 1200,
        "max_tokens": 1024,
        "description": "הנוכחי - שמרני"
    },
    {
        "name": "Option 2 - Medium Increase",
        "max_context": 1500,
        "max_tokens": 1536,
        "description": "הגדלה בינונית - יותר קונטקסט ויותר טוקנים"
    },
    {
        "name": "Option 3 - Large Increase",
        "max_context": 1800,
        "max_tokens": 2048,
        "description": "הגדלה גדולה - מקסימום קונטקסט וטוקנים"
    },
    {
        "name": "Option 4 - Balanced (Recommended)",
        "max_context": 1600,
        "max_tokens": 1792,
        "description": "מאוזן - אופטימלי בין קונטקסט לטוקנים"
    }
]


def check_if_answer_is_truncated(answer: str) -> Tuple[bool, str]:
    """
    בודק אם התשובה נקטעה
    """
    if not answer:
        return True, "תשובה ריקה"
    
    # בדיקה אם התשובה מסתיימת בסימן פיסוק מלא
    answer_trimmed = answer.strip()
    if not answer_trimmed:
        return True, "תשובה ריקה אחרי trim"
    
    # סימני סיום תקינים
    proper_endings = ['.', '!', '?', ':', ';', '…', '״', '"', "'"]
    
    # בדיקה אם מסתיים בסימן פיסוק
    ends_with_punctuation = any(answer_trimmed.endswith(ending) for ending in proper_endings)
    
    # בדיקה אם מסתיים במילה שלמה (לא באמצע משפט)
    # אם מסתיים במילה + רווח או סימן פיסוק - כנראה לא נקטע
    last_50_chars = answer_trimmed[-50:]
    
    # אם מסתיים בסימן פיסוק - כנראה לא נקטע
    if ends_with_punctuation:
        return False, "מסתיים בסימן פיסוק תקין"
    
    # אם מסתיים במילה שלמה (לא באמצע) - כנראה לא נקטע
    # אבל אם התשובה ארוכה מאוד ויש סיכוי שנקטעה
    if len(answer) > 1000:  # תשובה ארוכה
        # בדיקה אם יש סימן פיסוק באחרונים 20 תווים
        last_20 = answer_trimmed[-20:]
        has_punctuation_near_end = any(p in last_20 for p in proper_endings)
        if not has_punctuation_near_end:
            return True, "תשובה ארוכה ללא סימן פיסוק בסוף - כנראה נקטעה"
    
    return False, "נראה תקין"


def test_question_with_params(
    engine: RagQueryEngine,
    question: str,
    max_context: int,
    max_tokens: int
) -> Dict:
    """
    בודק שאלה אחת עם פרמטרים ספציפיים
    """
    print(f"\n{'─'*80}")
    print(f"📝 שאלה: {question}")
    print(f"⚙️  פרמטרים: max_context={max_context}, max_tokens={max_tokens}")
    print(f"{'─'*80}")
    
    start_time = time.time()
    
    try:
        # Retrieve chunks
        print("🔍 מחפש chunks...")
        candidates = engine.retrieve_candidates(question)
        print(f"✅ נמצאו {len(candidates)} candidates")
        
        # Re-rank
        print("🔄 מבצע re-ranking...")
        reranked = engine.rerank(question, candidates)
        print(f"✅ לאחר re-ranking: {len(reranked)} chunks")
        
        # Build prompt with custom max_context
        print(f"📝 בונה prompt עם max_context={max_context}...")
        prompt = build_prompt(question, reranked, max_context_length=max_context)
        prompt_length = len(prompt)
        prompt_tokens_estimate = prompt_length // 3  # הערכה גסה: ~3 תווים לטוקן בעברית
        
        print(f"📊 אורך prompt: {prompt_length} תווים (~{prompt_tokens_estimate} טוקנים)")
        print(f"📚 מספר chunks שנשלחו: {len(reranked)}")
        
        # Call LLM with custom max_tokens and max_context
        print(f"🤖 קורא למודל עם max_tokens={max_tokens}, max_context={max_context}...")
        answer = call_llm(question, reranked, max_new_tokens=max_tokens, max_context=max_context)
        
        answer_length = len(answer)
        answer_tokens_estimate = answer_length // 3
        
        # Check if truncated
        is_truncated, truncation_reason = check_if_answer_is_truncated(answer)
        
        elapsed_time = time.time() - start_time
        
        result = {
            "question": question,
            "max_context": max_context,
            "max_tokens": max_tokens,
            "num_chunks": len(reranked),
            "prompt_length": prompt_length,
            "prompt_tokens_estimate": prompt_tokens_estimate,
            "answer_length": answer_length,
            "answer_tokens_estimate": answer_tokens_estimate,
            "is_truncated": is_truncated,
            "truncation_reason": truncation_reason,
            "answer_preview": answer[:200] + "..." if len(answer) > 200 else answer,
            "answer_full": answer,
            "elapsed_time": elapsed_time,
            "chunks_sent": [
                {
                    "source": c.get("source", ""),
                    "text_length": len(c.get("text", "")),
                    "rerank_score": c.get("rerank_score", 0)
                }
                for c in reranked
            ]
        }
        
        print(f"✅ תשובה התקבלה: {answer_length} תווים (~{answer_tokens_estimate} טוקנים)")
        print(f"⏱️  זמן: {elapsed_time:.2f} שניות")
        print(f"⚠️  נקטע: {'כן' if is_truncated else 'לא'} - {truncation_reason}")
        
        return result
        
    except Exception as e:
        print(f"❌ שגיאה: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "question": question,
            "error": str(e),
            "max_context": max_context,
            "max_tokens": max_tokens
        }


def main():
    """
    מריץ את כל הבדיקות
    """
    print("="*80)
    print("🧪 בדיקת אופטימיזציה של פרמטרים עבור Dicta-LM 2.0")
    print("="*80)
    print(f"\n📋 שאלות לבדיקה: {len(TEST_QUESTIONS)}")
    print(f"⚙️  אופציות פרמטרים: {len(PARAMETER_OPTIONS)}")
    print(f"📊 סה\"כ בדיקות: {len(TEST_QUESTIONS) * len(PARAMETER_OPTIONS)}")
    print("\n" + "="*80)
    
    # Initialize RAG engine
    print("\n🔄 מאתחל RAG engine...")
    engine = RagQueryEngine()
    print("✅ RAG engine מוכן")
    
    all_results = []
    
    # Test each parameter option with each question
    for option in PARAMETER_OPTIONS:
        print(f"\n\n{'='*80}")
        print(f"🔧 {option['name']}")
        print(f"📝 {option['description']}")
        print(f"{'='*80}")
        
        option_results = []
        
        for i, question in enumerate(TEST_QUESTIONS, 1):
            print(f"\n\n[שאלה {i}/{len(TEST_QUESTIONS)}]")
            result = test_question_with_params(
                engine,
                question,
                option["max_context"],
                option["max_tokens"]
            )
            result["option_name"] = option["name"]
            option_results.append(result)
            all_results.append(result)
            
            # קצת הפסקה בין שאלות
            time.sleep(1)
    
    # Close engine
    engine.close()
    
    # Analyze results
    print("\n\n" + "="*80)
    print("📊 ניתוח תוצאות")
    print("="*80)
    
    # Group by option
    analysis = {}
    for option in PARAMETER_OPTIONS:
        option_name = option["name"]
        option_results = [r for r in all_results if r.get("option_name") == option_name and "error" not in r]
        
        if not option_results:
            continue
        
        # Calculate statistics
        avg_answer_length = sum(r["answer_length"] for r in option_results) / len(option_results)
        avg_prompt_length = sum(r["prompt_length"] for r in option_results) / len(option_results)
        avg_chunks = sum(r["num_chunks"] for r in option_results) / len(option_results)
        truncated_count = sum(1 for r in option_results if r.get("is_truncated", False))
        avg_time = sum(r["elapsed_time"] for r in option_results) / len(option_results)
        
        analysis[option_name] = {
            "option": option,
            "num_tests": len(option_results),
            "avg_answer_length": avg_answer_length,
            "avg_prompt_length": avg_prompt_length,
            "avg_chunks": avg_chunks,
            "truncated_count": truncated_count,
            "truncated_percentage": (truncated_count / len(option_results)) * 100,
            "avg_time": avg_time,
            "results": option_results
        }
        
        print(f"\n{option_name}:")
        print(f"  📝 אורך תשובה ממוצע: {avg_answer_length:.0f} תווים")
        print(f"  📤 אורך prompt ממוצע: {avg_prompt_length:.0f} תווים")
        print(f"  📚 מספר chunks ממוצע: {avg_chunks:.1f}")
        print(f"  ⚠️  תשובות שנקטעו: {truncated_count}/{len(option_results)} ({truncated_count/len(option_results)*100:.1f}%)")
        print(f"  ⏱️  זמן ממוצע: {avg_time:.2f} שניות")
    
    # Find best option
    print("\n\n" + "="*80)
    print("🏆 המלצה")
    print("="*80)
    
    # Score each option (lower is better for truncation, higher is better for answer length)
    best_option = None
    best_score = -1
    
    for option_name, stats in analysis.items():
        # Score calculation:
        # - High answer length is good (weight: 0.3)
        # - Low truncation is good (weight: 0.4)
        # - More chunks is good (weight: 0.2)
        # - Lower time is good (weight: 0.1)
        
        answer_score = (stats["avg_answer_length"] / 2000) * 0.3  # Normalize to 2000 chars
        truncation_score = (1 - stats["truncated_percentage"] / 100) * 0.4
        chunks_score = (stats["avg_chunks"] / 10) * 0.2  # Normalize to 10 chunks
        time_score = (1 / (1 + stats["avg_time"] / 10)) * 0.1  # Lower time is better
        
        total_score = answer_score + truncation_score + chunks_score + time_score
        
        if total_score > best_score:
            best_score = total_score
            best_option = option_name
        
        print(f"\n{option_name}:")
        print(f"  Score: {total_score:.3f}")
        print(f"    - Answer length: {answer_score:.3f}")
        print(f"    - Truncation: {truncation_score:.3f}")
        print(f"    - Chunks: {chunks_score:.3f}")
        print(f"    - Time: {time_score:.3f}")
    
    if best_option:
        print(f"\n✅ המלצה: {best_option}")
        best_stats = analysis[best_option]
        print(f"   פרמטרים מומלצים:")
        print(f"   - max_context: {best_stats['option']['max_context']}")
        print(f"   - max_tokens: {best_stats['option']['max_tokens']}")
        print(f"   - אורך תשובה ממוצע: {best_stats['avg_answer_length']:.0f} תווים")
        print(f"   - תשובות שנקטעו: {best_stats['truncated_count']}/{best_stats['num_tests']} ({best_stats['truncated_percentage']:.1f}%)")
    
    # Save results
    output_file = f"data/parameter_optimization_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    output_data = {
        "timestamp": datetime.now().isoformat(),
        "test_questions": TEST_QUESTIONS,
        "parameter_options": PARAMETER_OPTIONS,
        "analysis": {
            k: {
                "option": v["option"],
                "num_tests": v["num_tests"],
                "avg_answer_length": v["avg_answer_length"],
                "avg_prompt_length": v["avg_prompt_length"],
                "avg_chunks": v["avg_chunks"],
                "truncated_count": v["truncated_count"],
                "truncated_percentage": v["truncated_percentage"],
                "avg_time": v["avg_time"]
            }
            for k, v in analysis.items()
        },
        "best_option": best_option,
        "all_results": all_results
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 תוצאות נשמרו ב: {output_file}")
    print("\n✅ בדיקה הושלמה!")


if __name__ == "__main__":
    main()

