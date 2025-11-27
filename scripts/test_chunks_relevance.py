#!/usr/bin/env python3
"""
Test chunk retrieval for multiple questions - check if relevant chunks are returned
"""
import sys
import os
sys.path.insert(0, os.getcwd())

from rag.query_improved import RagQueryEngine

def test_question(engine: RagQueryEngine, question: str):
    """Test a single question and show top chunks"""
    print(f"\n{'='*80}")
    print(f"🔍 שאלה: {question}")
    print('='*80)
    
    # Retrieve candidates
    candidates = engine.retrieve_candidates(question)
    print(f"📊 נמצאו {len(candidates)} candidates ראשוניים")
    
    # Rerank
    top_chunks = engine.rerank(question, candidates)
    print(f"✅ Top {len(top_chunks)} chunks אחרי rerank:\n")
    
    # Show top 5 chunks
    for i, chunk in enumerate(top_chunks[:5], 1):
        source = chunk.get("source", "unknown")
        rerank_score = chunk.get("rerank_score", 0)
        distance = chunk.get("distance", 0)
        text = chunk.get('text', '')
        
        print(f"[{i}] Source: {source}")
        print(f"    Rerank Score: {rerank_score:.3f} | Distance: {distance:.3f}")
        print(f"    Preview ({len(text)} תווים): {text[:200]}...")
        print()
    
    # Check relevance
    print("📈 הערכת רלוונטיות:")
    top_score = top_chunks[0].get("rerank_score", 0) if top_chunks else 0
    if top_score > 8.0:
        print(f"   ✅ מצוין - Top chunk score: {top_score:.3f}")
    elif top_score > 6.0:
        print(f"   ✅ טוב - Top chunk score: {top_score:.3f}")
    elif top_score > 4.0:
        print(f"   ⚠️  בינוני - Top chunk score: {top_score:.3f}")
    else:
        print(f"   ❌ נמוך - Top chunk score: {top_score:.3f}")
    
    return top_chunks

def main():
    print("🧪 בדיקת רלוונטיות Chunks")
    print("="*80)
    
    engine = RagQueryEngine()
    
    # Test questions
    questions = [
        "מה זה תודעה ריאקטיבית?",
        "מה ההבדל בין תודעה אקטיבית לתודעה קריאטיבית?",
        "מה זה מודל האושר?",
        "מה זה מנהיגות תודעתית?",
        "מה זה ערכים וייעוד?",
        "מה זה חזון ואיך הוא נוצר?",
        "מה זה הטמעה?",
    ]
    
    print(f"\n📋 בודק {len(questions)} שאלות\n")
    
    all_results = []
    for i, question in enumerate(questions, 1):
        print(f"\n[{i}/{len(questions)}]")
        chunks = test_question(engine, question)
        all_results.append({
            "question": question,
            "num_chunks": len(chunks),
            "top_score": chunks[0].get("rerank_score", 0) if chunks else 0,
            "top_source": chunks[0].get("source", "unknown") if chunks else None
        })
    
    # Summary
    print("\n" + "="*80)
    print("📊 סיכום הבדיקות")
    print("="*80)
    
    for result in all_results:
        score = result["top_score"]
        status = "✅" if score > 6.0 else "⚠️" if score > 4.0 else "❌"
        print(f"{status} {result['question']}")
        print(f"   Top Score: {score:.3f} | Source: {result['top_source']}")
        print()
    
    avg_score = sum(r["top_score"] for r in all_results) / len(all_results)
    print(f"📈 ממוצע Top Score: {avg_score:.3f}")
    
    if avg_score > 7.0:
        print("✅ האינדקס עובד מצוין!")
    elif avg_score > 5.0:
        print("✅ האינדקס עובד טוב")
    else:
        print("⚠️  האינדקס צריך שיפור")
    
    engine.close()

if __name__ == "__main__":
    main()

