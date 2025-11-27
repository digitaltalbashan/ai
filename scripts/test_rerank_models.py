#!/usr/bin/env python3
"""
Test and compare different rerank models
"""
import sys
import os
sys.path.insert(0, os.getcwd())

from rag.query_improved import RagQueryEngine
from rag.model_cache import RERANK_MODEL_ALIASES

def test_rerank_models():
    """Test different rerank models on sample questions"""
    
    test_questions = [
        "מה זה תודעה ריאקטיבית?",
        "מה ההבדל בין תודעה אקטיבית לתודעה קריאטיבית?",
        "מה זה מנהיגות תודעתית?",
    ]
    
    models_to_test = ["fast", "balanced", "best"]
    
    print("🧪 בדיקת מודלי Rerank שונים")
    print("=" * 80)
    
    for model_alias in models_to_test:
        model_name = RERANK_MODEL_ALIASES[model_alias]
        print(f"\n📦 מודל: {model_alias} ({model_name})")
        print("-" * 80)
        
        # Set environment variable to use this model
        os.environ["RERANK_MODEL"] = model_alias
        
        engine = RagQueryEngine()
        
        for question in test_questions:
            candidates = engine.retrieve_candidates(question)
            top_chunks = engine.rerank(question, candidates)
            
            if top_chunks:
                top_score = top_chunks[0].get("rerank_score", 0)
                print(f"  ✅ {question[:40]}... → Top Score: {top_score:.3f}")
            else:
                print(f"  ❌ {question[:40]}... → No chunks")
        
        engine.close()
        print()

if __name__ == "__main__":
    test_rerank_models()

