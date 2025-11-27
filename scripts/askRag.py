#!/usr/bin/env python3
"""
Simple CLI for asking questions with RAG + Dicta-LM
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.query_improved import RagQueryEngine

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/askRag.py 'שאלה שלך'")
        print("Example: python3 scripts/askRag.py 'מה זה מעגל התודעה?'")
        sys.exit(1)
    
    question = ' '.join(sys.argv[1:])
    
    print("🚀 RAG Query with Dicta-LM")
    print("=" * 80)
    print(f"❓ שאלה: {question}\n")
    
    try:
        engine = RagQueryEngine(top_k_retrieve=40, top_n_rerank=8)
        answer, sources = engine.answer(question)
        engine.close()
        
        print("=" * 80)
        print("📣 תשובה:")
        print(answer)
        print("\n📚 מקורות:")
        for i, s in enumerate(sources[:5], 1):
            score = s.get("rerank_score", 0)
            print(f"  [{i}] {s['source']} (score: {score:.3f})")
        print("=" * 80)
    except Exception as e:
        print(f"❌ שגיאה: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
