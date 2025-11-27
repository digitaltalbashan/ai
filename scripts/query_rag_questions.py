#!/usr/bin/env python3
"""
Query RAG system with multiple questions and save full results
"""
import sys
import os
import json
from pathlib import Path
from datetime import datetime
sys.path.insert(0, os.getcwd())

from rag.query_improved import RagQueryEngine

def query_rag_questions(questions: list, engine: RagQueryEngine, top_k: int = 8):
    """Query RAG system with multiple questions and return full results"""
    results = []
    
    for i, question in enumerate(questions, 1):
        print(f"\n[{i}/{len(questions)}] מעבד: {question[:60]}...")
        
        try:
            # Retrieve candidates
            candidates = engine.retrieve_candidates(question)
            
            # Rerank
            top_chunks = engine.rerank(question, candidates)
            
            # Get top K chunks with full information
            chunks_data = []
            for j, chunk in enumerate(top_chunks[:top_k], 1):
                chunk_info = {
                    "rank": j,
                    "source": chunk.get("source", "unknown"),
                    "rerank_score": round(chunk.get("rerank_score", 0), 3),
                    "distance": round(chunk.get("distance", 0), 3),
                    "text": chunk.get("text", ""),
                    "text_length": len(chunk.get("text", "")),
                    "chunk_index": chunk.get("chunk_index", 0),
                    "metadata": chunk.get("metadata", {})
                }
                chunks_data.append(chunk_info)
            
            result = {
                "question_number": i,
                "question": question,
                "num_candidates_found": len(candidates),
                "num_chunks_returned": len(top_chunks),
                "top_score": round(top_chunks[0].get("rerank_score", 0), 3) if top_chunks else 0,
                "chunks": chunks_data
            }
            
            results.append(result)
            print(f"   ✅ נמצאו {len(top_chunks)} chunks (Top score: {result['top_score']})")
            
        except Exception as e:
            print(f"   ❌ שגיאה: {e}")
            results.append({
                "question_number": i,
                "question": question,
                "error": str(e),
                "chunks": []
            })
    
    return results

def save_results_to_markdown(results: list, output_path: Path):
    """Save results to a formatted Markdown file"""
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("# תוצאות שאילתות RAG\n\n")
        f.write(f"**תאריך:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write(f"**סה\"כ שאלות:** {len(results)}\n\n")
        f.write("---\n\n")
        
        for result in results:
            if "error" in result:
                f.write(f"## שאלה {result['question_number']}: {result['question']}\n\n")
                f.write(f"❌ **שגיאה:** {result['error']}\n\n")
                f.write("---\n\n")
                continue
            
            f.write(f"## שאלה {result['question_number']}: {result['question']}\n\n")
            f.write(f"**סטטיסטיקות:**\n")
            f.write(f"- נמצאו {result['num_candidates_found']} candidates ראשוניים\n")
            f.write(f"- חזרו {result['num_chunks_returned']} chunks אחרי rerank\n")
            f.write(f"- Top Score: {result['top_score']}\n\n")
            f.write("### Chunks שחזרו:\n\n")
            
            for chunk in result['chunks']:
                f.write(f"#### Chunk #{chunk['rank']}: {chunk['source']}\n\n")
                f.write(f"**פרטים:**\n")
                f.write(f"- Rerank Score: {chunk['rerank_score']}\n")
                f.write(f"- Distance: {chunk['distance']}\n")
                f.write(f"- אורך טקסט: {chunk['text_length']} תווים\n\n")
                f.write("**תוכן מלא:**\n\n")
                f.write(f"{chunk['text']}\n\n")
                f.write("---\n\n")
        
        f.write("\n## סיכום\n\n")
        successful = sum(1 for r in results if "error" not in r)
        f.write(f"- ✅ הצליח: {successful}/{len(results)}\n")
        f.write(f"- ❌ שגיאות: {len(results) - successful}/{len(results)}\n")
        
        if successful > 0:
            avg_score = sum(r['top_score'] for r in results if "error" not in r) / successful
            f.write(f"- 📈 ממוצע Top Score: {avg_score:.3f}\n")

def save_results_to_json(results: list, output_path: Path):
    """Save results to JSON file"""
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "total_questions": len(results),
            "results": results
        }, f, ensure_ascii=False, indent=2)

def main():
    questions = [
        "מה ההבדל בין הבנה שכלית של שינוי לבין שינוי אמיתי בחיים?",
        "למה מודעות פנימית לבד לא מספיקה כדי ליצור שינוי משמעותי?",
        "מהו \"המרחק בין הידיעה לבין הפעולה\" וכיצד מצמצמים אותו?",
        "איך מזהים דפוס רגשי שמנהל אותנו באופן אוטומטי?",
        "מה הקשר בין פחד לבין קבלת החלטות יומיומית?",
        "מדוע אנשים נתקעים ב\"התפתחות אינסופית\" בלי להשיג תוצאות מעשיות?",
        "מהי אחריות אישית וכיצד היא משפיעה על תהליך שינוי?",
        "איך משנים התנהגות שנובעת ממנגנוני הישרדות ישנים?",
        "מה ההבדל בין שינוי חיצוני לבין שינוי פנימי עמוק?",
        "כיצד ניתן להעביר רעיון או חזון לאנשים בצורה שמייצרת חיבור ולא התנגדות?",
        "למה חוסר בהירות פנימית יוצר חוסר בהירות גם במערכות יחסים ובתקשורת?",
        "איך להתמודד עם התנגדות פנימית לשינוי למרות מודעות גבוהה?",
        "מה התפקיד של רגשות \"לא נוחים\" בתהליך ההתפתחות האישית?",
        "איך יודעים אם קיבלנו החלטה ממקום חופשי ולא מתוך דפוס אוטומטי?",
        "כיצד מנהיגות אמיתית מתחילה מבפנים לפני שהיא באה לידי ביטוי בצוות או בארגון?",
        "מה יוצר פער בין מי שאנחנו רוצים להיות לבין מי שאנחנו בפועל?",
        "איך מחזקים יכולת פעולה (Action Ability) מתוך בהירות ולא מתוך לחץ?",
        "מהי \"תנועה פנימית\" וכיצד היא משפיעה על שינוי התנהגותי?",
        "מדוע תובנות לבדן אינן משנות את המציאות, ומה נדרש כדי להפוך אותן לכלים מעשיים?",
        "איך מפתחים יצירה מודעת (Creating) במקום תגובה אוטומטית למציאות?",
    ]
    
    print("🚀 שאילתת RAG - 20 שאלות")
    print("=" * 80)
    print(f"📋 סה\"כ שאלות: {len(questions)}\n")
    
    # Initialize engine
    print("📥 מאתחל RAG engine...")
    engine = RagQueryEngine()
    print("✅ RAG engine מוכן\n")
    
    try:
        # Query all questions
        results = query_rag_questions(questions, engine, top_k=8)
        
        # Save results
        output_dir = Path(__file__).parent.parent / "data"
        output_dir.mkdir(exist_ok=True)
        
        md_path = output_dir / "rag_questions_results.md"
        json_path = output_dir / "rag_questions_results.json"
        
        print(f"\n💾 שומר תוצאות...")
        save_results_to_markdown(results, md_path)
        save_results_to_json(results, json_path)
        
        print(f"✅ תוצאות נשמרו:")
        print(f"   📄 Markdown: {md_path}")
        print(f"   📄 JSON: {json_path}")
        
        # Summary
        successful = sum(1 for r in results if "error" not in r)
        print(f"\n📊 סיכום:")
        print(f"   ✅ הצליח: {successful}/{len(results)}")
        print(f"   ❌ שגיאות: {len(results) - successful}/{len(results)}")
        
        if successful > 0:
            avg_score = sum(r['top_score'] for r in results if "error" not in r) / successful
            print(f"   📈 ממוצע Top Score: {avg_score:.3f}")
        
    finally:
        engine.close()
        print("\n✅ סיום")

if __name__ == "__main__":
    main()

