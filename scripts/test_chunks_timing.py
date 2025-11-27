#!/usr/bin/env python3
"""
Test script to measure time for retrieving relevant chunks from RAG
"""
import os
import sys
import time

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.query_improved import RagQueryEngine

def format_time(seconds: float) -> str:
    """Format time in a readable way"""
    if seconds < 0.001:
        return f"{seconds * 1000000:.2f}μs"
    elif seconds < 1:
        return f"{seconds * 1000:.2f}ms"
    else:
        return f"{seconds:.2f}s"

def test_chunks_timing(question: str):
    """Test chunk retrieval timing for a question"""
    print("=" * 80)
    print(f"❓ שאלה: {question}")
    print("=" * 80)
    
    try:
        engine = RagQueryEngine()
        
        # Measure only chunks retrieval (without LLM)
        start_total = time.time()
        
        print("\n🔍 שלב 1: חיפוש candidates...")
        start_retrieve = time.time()
        candidates = engine.retrieve_candidates(question)
        retrieve_time = time.time() - start_retrieve
        
        print(f"✅ נמצאו {len(candidates)} candidates בזמן: {format_time(retrieve_time)}")
        
        if not candidates:
            print("⚠️ לא נמצאו candidates!")
            engine.close()
            return
        
        print(f"\n🔍 שלב 2: Re-ranking...")
        start_rerank = time.time()
        top_chunks = engine.rerank(question, candidates)
        rerank_time = time.time() - start_rerank
        
        print(f"✅ נבחרו {len(top_chunks)} chunks סופיים בזמן: {format_time(rerank_time)}")
        
        total_chunks_time = time.time() - start_total
        
        print("\n" + "=" * 80)
        print("⏱️ סיכום זמנים:")
        print("=" * 80)
        print(f"  🔍 חיפוש candidates:     {format_time(retrieve_time)}")
        print(f"  📊 Re-ranking:            {format_time(rerank_time)}")
        print(f"  ⏱️ סה\"כ זמן chunks:       {format_time(total_chunks_time)}")
        print("=" * 80)
        
        print(f"\n📚 ה-chunks שנבחרו:")
        for i, chunk in enumerate(top_chunks[:5], 1):  # Show top 5
            score = chunk.get("rerank_score", 0)
            distance = chunk.get("distance", 0)
            text_preview = chunk.get("text", "")[:100] + "..." if len(chunk.get("text", "")) > 100 else chunk.get("text", "")
            print(f"\n  [{i}] {chunk.get('source', 'unknown')} (chunk {chunk.get('chunk_index', '?')})")
            print(f"      rerank_score: {score:.3f} | distance: {distance:.3f}")
            print(f"      {text_preview}")
        
        engine.close()
        
    except Exception as e:
        print(f"❌ שגיאה: {e}")
        import traceback
        traceback.print_exc()

def main():
    """Main function"""
    print("🚀 בדיקת זמנים לחיפוש chunks ב-RAG")
    print("=" * 80)
    
    # Test questions
    test_questions = [
        "מה זה מעגל התודעה?",
        "מה זה תודעה ראקטיבית?",
        "מה ההבדל בין תודעת R, תודעת A ותודעת C?",
    ]
    
    if len(sys.argv) > 1:
        # Use question from command line
        question = " ".join(sys.argv[1:])
        test_chunks_timing(question)
    else:
        # Test with predefined questions
        for question in test_questions:
            test_chunks_timing(question)
            print("\n")

if __name__ == "__main__":
    main()

