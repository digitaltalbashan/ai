#!/usr/bin/env python3
"""
Quality check with CrossEncoder - Python version for faster execution
"""
import os
import sys
import json
from typing import List, Dict
from tqdm import tqdm

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.query_improved import RagQueryEngine

def generate_questions(num_questions: int = 1000) -> List[str]:
    """Generate diverse questions from the knowledge base"""
    import psycopg2
    
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://tzahimoyal@localhost:5432/talbashanai")
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()
    
    # Sample chunks to generate questions from
    cursor.execute("""
        SELECT text, metadata
        FROM knowledge_chunks
        WHERE LENGTH(text) > 200
        ORDER BY RANDOM()
        LIMIT 500
    """)
    
    chunks = cursor.fetchall()
    conn.close()
    
    questions = []
    question_templates = [
        "מה זה {concept}?",
        "תסביר מה זה {concept}",
        "מה המשמעות של {concept}?",
        "איך {concept} עובד?",
        "מה ההבדל בין {concept1} ל-{concept2}?",
        "למה {concept} חשוב?",
        "איך להשתמש ב-{concept}?",
    ]
    
    concepts = [
        "מעגל התודעה", "תודעה ראקטיבית", "תודעה אקטיבית", "תודעה יצירתית",
        "תת מודע", "רצון חופשי", "פחד", "מציאות", "שחיקה", "תקיעות",
        "מנהיגות תודעתית", "תיקון", "הרגל", "התנגדות", "דיסקרטיות"
    ]
    
    import random
    for i in range(num_questions):
        template = random.choice(question_templates)
        if "{concept2}" in template:
            concept1 = random.choice(concepts)
            concept2 = random.choice([c for c in concepts if c != concept1])
            question = template.format(concept1=concept1, concept2=concept2)
        else:
            concept = random.choice(concepts)
            question = template.format(concept=concept)
        questions.append(question)
    
    return questions[:num_questions]

def analyze_question(engine: RagQueryEngine, question: str) -> Dict:
    """Analyze chunks for a question"""
    # Retrieve and rerank
    candidates = engine.retrieve_candidates(question)
    chunks = engine.rerank(question, candidates)
    
    if not chunks:
        return {
            "question": question,
            "chunks_count": 0,
            "relevance": 0,
            "metadata_match": 0,
            "overall": 0
        }
    
    # Calculate quality scores
    question_lower = question.lower()
    question_words = [w for w in question_lower.split() if len(w) > 2]
    
    relevance_sum = 0
    metadata_match_sum = 0
    
    for chunk in chunks:
        text = chunk["text"].lower()
        metadata = chunk.get("metadata", {})
        topic = (metadata.get("topic") or "").lower()
        concepts = [c.lower() for c in (metadata.get("key_concepts") or [])]
        
        # Relevance: how many question words appear in chunk text
        matching_words = sum(1 for w in question_words if w in text)
        relevance = min(1.0, matching_words / max(1, len(question_words)))
        relevance_sum += relevance
        
        # Metadata match
        metadata_match = 0
        for word in question_words:
            if word in topic:
                metadata_match += 0.5
            if any(word in c for c in concepts):
                metadata_match += 0.3
        metadata_match = min(1.0, metadata_match)
        metadata_match_sum += metadata_match
    
    avg_relevance = relevance_sum / len(chunks) if chunks else 0
    avg_metadata_match = metadata_match_sum / len(chunks) if chunks else 0
    overall = (avg_relevance + avg_metadata_match) / 2
    
    return {
        "question": question,
        "chunks_count": len(chunks),
        "relevance": avg_relevance,
        "metadata_match": avg_metadata_match,
        "overall": overall,
        "chunk_ids": [c["id"] for c in chunks]
    }

def main():
    print("🚀 RAG Quality Check with CrossEncoder")
    print("=" * 80)
    
    # Initialize engine
    print("📥 Initializing RAG engine...")
    engine = RagQueryEngine(top_k_retrieve=40, top_n_rerank=8)
    
    # Generate questions
    print("📝 Generating questions...")
    questions = generate_questions(1000)
    print(f"✅ Generated {len(questions)} questions")
    
    # Analyze questions
    print("\n🔍 Analyzing questions...")
    results = []
    for question in tqdm(questions, desc="Analyzing"):
        result = analyze_question(engine, question)
        results.append(result)
    
    # Calculate statistics
    total = len(results)
    avg_relevance = sum(r["relevance"] for r in results) / total
    avg_metadata_match = sum(r["metadata_match"] for r in results) / total
    avg_overall = sum(r["overall"] for r in results) / total
    
    # Count quality distribution
    excellent = sum(1 for r in results if r["overall"] >= 0.8)
    good = sum(1 for r in results if 0.6 <= r["overall"] < 0.8)
    fair = sum(1 for r in results if 0.4 <= r["overall"] < 0.6)
    poor = sum(1 for r in results if r["overall"] < 0.4)
    
    # Find chunk overlaps
    chunk_usage = {}
    for r in results:
        for chunk_id in r["chunk_ids"]:
            chunk_usage[chunk_id] = chunk_usage.get(chunk_id, 0) + 1
    
    top_overlapping = sorted(chunk_usage.items(), key=lambda x: x[1], reverse=True)[:10]
    
    # Print report
    print("\n" + "=" * 80)
    print("📊 RAG Quality Analysis Report (with CrossEncoder)")
    print("=" * 80)
    print(f"\n📈 Summary:")
    print(f"   Total questions analyzed: {total}")
    print(f"   Total unique chunks used: {len(chunk_usage)}")
    print(f"   Average chunks per question: {sum(r['chunks_count'] for r in results) / total:.2f}")
    print(f"   Chunks used in multiple questions: {sum(1 for count in chunk_usage.values() if count > 1)}")
    
    print(f"\n🎯 Quality Scores:")
    print(f"   Overall: {avg_overall:.3f}")
    print(f"   Relevance: {avg_relevance:.3f}")
    print(f"   Metadata Match: {avg_metadata_match:.3f}")
    
    print(f"\n📊 Quality Distribution:")
    print(f"   Excellent (≥0.8): {excellent} ({excellent/total*100:.1f}%)")
    print(f"   Good (0.6-0.8): {good} ({good/total*100:.1f}%)")
    print(f"   Fair (0.4-0.6): {fair} ({fair/total*100:.1f}%)")
    print(f"   Poor (<0.4): {poor} ({poor/total*100:.1f}%)")
    
    if top_overlapping:
        print(f"\n🔄 Top 10 Most Overlapping Chunks:")
        for i, (chunk_id, count) in enumerate(top_overlapping, 1):
            print(f"   {i}. {chunk_id[:60]}...: used in {count} questions")
    
    # Save report
    DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
    report_path = os.path.join(DATA_DIR, "rag_quality_report_crossencoder.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump({
            "summary": {
                "total_questions": total,
                "unique_chunks": len(chunk_usage),
                "avg_chunks_per_question": sum(r['chunks_count'] for r in results) / total,
                "chunks_in_multiple": sum(1 for count in chunk_usage.values() if count > 1)
            },
            "scores": {
                "overall": avg_overall,
                "relevance": avg_relevance,
                "metadata_match": avg_metadata_match
            },
            "distribution": {
                "excellent": excellent,
                "good": good,
                "fair": fair,
                "poor": poor
            },
            "top_overlapping": [{"chunk_id": id, "count": count} for id, count in top_overlapping],
            "results": results
        }, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 Full report saved to: {report_path}")
    print("=" * 80)
    
    engine.close()

if __name__ == "__main__":
    main()

