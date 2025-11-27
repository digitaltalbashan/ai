#!/usr/bin/env python3
"""
בדיקת שאלה ספציפית - לריאקטיביות, איך אני מגיבה?
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.query_improved import RagQueryEngine, call_llm_default

question = "לריאקטיביות, איך אני מגיבה?"

print("="*80)
print(f"🧪 בודק שאלה: {question}")
print("="*80)
print()

# Initialize engine
engine = RagQueryEngine(top_k_retrieve=50, top_n_rerank=8)

# Get answer
answer, sources, timing = engine.answer(
    search_query=question,
    question=question,
    llm_callable=call_llm_default,
    measure_time=True
)

print()
print("="*80)
print("📝 תשובה שהתקבלה:")
print("="*80)
print(answer)
print()
print("="*80)
print(f"📊 אורך תשובה: {len(answer)} תווים")
print(f"📚 מספר מקורות: {len(sources)}")
print(f"⏱️  זמן: {timing.get('total_time', 0):.2f} שניות" if timing else "")
print("="*80)

engine.close()

