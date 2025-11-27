#!/usr/bin/env python3
"""
Check relevance of retrieved chunks to questions
"""
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.query_improved import RagQueryEngine

def check_relevance(question: str, show_full_text: bool = False):
    """Check if retrieved chunks are relevant to the question"""
    print("=" * 80)
    print(f"❓ שאלה: {question}")
    print("=" * 80)
    
    try:
        engine = RagQueryEngine()
        
        # Get candidates
        print("\n🔍 שלב 1: חיפוש candidates...")
        candidates = engine.retrieve_candidates(question)
        print(f"✅ נמצאו {len(candidates)} candidates")
        
        if not candidates:
            print("⚠️ לא נמצאו candidates!")
            engine.close()
            return
        
        # Re-rank
        print(f"\n🔍 שלב 2: Re-ranking...")
        top_chunks = engine.rerank(question, candidates)
        print(f"✅ נבחרו {len(top_chunks)} chunks סופיים")
        
        print("\n" + "=" * 80)
        print("📚 ה-chunks שנבחרו (עם הערכת רלוונטיות):")
        print("=" * 80)
        
        for i, chunk in enumerate(top_chunks, 1):
            score = chunk.get("rerank_score", 0)
            distance = chunk.get("distance", 0)
            source = chunk.get('source', 'unknown')
            chunk_index = chunk.get('chunk_index', '?')
            text = chunk.get("text", "")
            
            # Check if question keywords appear in text
            question_words = set(question.lower().split())
            text_lower = text.lower()
            matching_words = [w for w in question_words if w in text_lower]
            relevance_score = len(matching_words) / len(question_words) if question_words else 0
            
            print(f"\n[{i}] {source} (chunk {chunk_index})")
            print(f"    rerank_score: {score:.3f} | distance: {distance:.3f}")
            print(f"    מילות מפתח מהשאלה שנמצאו: {matching_words} ({relevance_score*100:.1f}%)")
            
            if show_full_text:
                print(f"    טקסט מלא:\n    {text}")
            else:
                # Show more context
                preview = text[:300] + "..." if len(text) > 300 else text
                print(f"    תצוגה מקדימה:\n    {preview}")
            
            # Simple relevance check
            if relevance_score > 0.3:
                print(f"    ✅ נראה רלוונטי (מילות מפתח נמצאו בטקסט)")
            elif score > 8.5:
                print(f"    ⚠️ ציון גבוה אבל מילות מפתח לא נמצאו - אולי רלוונטי בהקשר")
            else:
                print(f"    ❌ לא נראה רלוונטי")
        
        print("\n" + "=" * 80)
        print("📊 סיכום:")
        print(f"  - סה\"כ chunks: {len(top_chunks)}")
        print(f"  - chunks עם מילות מפתח: {sum(1 for c in top_chunks if any(w in c.get('text', '').lower() for w in question.lower().split()))}")
        print(f"  - ציון rerank ממוצע: {sum(c.get('rerank_score', 0) for c in top_chunks) / len(top_chunks):.2f}")
        print("=" * 80)
        
        engine.close()
        
    except Exception as e:
        print(f"❌ שגיאה: {e}")
        import traceback
        traceback.print_exc()

def main():
    """Main function"""
    print("🔍 בדיקת רלוונטיות של chunks לשאלות")
    print("=" * 80)
    
    # Test questions
    test_questions = [
        "מה זה מעגל התודעה?",
        "מה זה תודעה ראקטיבית?",
        "מה ההבדל בין תודעת R, תודעת A ותודעת C?",
    ]
    
    show_full = "--full" in sys.argv
    
    if len(sys.argv) > 1 and not sys.argv[1].startswith("--"):
        # Use question from command line
        question = " ".join([arg for arg in sys.argv[1:] if not arg.startswith("--")])
        check_relevance(question, show_full_text=show_full)
    else:
        # Test with predefined questions
        for question in test_questions:
            check_relevance(question, show_full_text=show_full)
            print("\n\n")

if __name__ == "__main__":
    main()

