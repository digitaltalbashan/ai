#!/usr/bin/env python3
"""
Quick test to check if chunks are returned from Python RAG
"""
import os
import sys
import json
import time

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.query_improved import RagQueryEngine

def test_chunks():
    print("🧪 בדיקה מהירה - Python RAG Chunks")
    print("=" * 100)
    
    test_query = "מה זה ריאקטיביות?"
    top_k = 50
    top_n = 8
    
    print(f"\n📝 Query: \"{test_query}\"")
    print(f"   Top K: {top_k}, Top N: {top_n}")
    print("\n" + "=" * 100 + "\n")
    
    try:
        # Initialize engine
        print("🔄 Initializing RAG engine...")
        start_init = time.time()
        engine = RagQueryEngine(top_k_retrieve=top_k, top_n_rerank=top_n)
        init_time = time.time() - start_init
        print(f"✅ Engine initialized in {init_time:.2f}s\n")
        
        # Retrieve candidates
        print("🔍 Retrieving candidates from database...")
        start_retrieve = time.time()
        candidates = engine.retrieve_candidates(test_query)
        retrieve_time = time.time() - start_retrieve
        print(f"✅ Retrieved {len(candidates)} candidates in {retrieve_time:.2f}s\n")
        
        if len(candidates) == 0:
            print("❌ No candidates found!")
            print("   Check if database has knowledge chunks indexed.")
            return False
        
        # Re-rank
        print("📊 Re-ranking candidates...")
        start_rerank = time.time()
        top_chunks = engine.rerank(test_query, candidates)
        rerank_time = time.time() - start_rerank
        print(f"✅ Selected {len(top_chunks)} top chunks in {rerank_time:.2f}s\n")
        
        if len(top_chunks) == 0:
            print("❌ No chunks after re-ranking!")
            return False
        
        # Display results
        print("=" * 100)
        print(f"📚 Top {len(top_chunks)} Chunks:")
        print("=" * 100)
        
        for i, chunk in enumerate(top_chunks, 1):
            source = chunk.get('source', chunk.get('filename', 'unknown'))
            chunk_idx = chunk.get('chunk_index', chunk.get('order', '?'))
            score = chunk.get('score', chunk.get('rerank_score', 0))
            distance = chunk.get('distance', 0)
            text = chunk.get('text', '')
            text_preview = text[:150] + "..." if len(text) > 150 else text
            
            print(f"\n[{i}] {source} (chunk {chunk_idx})")
            print(f"    Score: {score:.4f} | Distance: {distance:.4f}")
            print(f"    Text: {text_preview}")
        
        print("\n" + "=" * 100)
        print("✅ SUCCESS! Chunks are being returned correctly.")
        print(f"   Total candidates: {len(candidates)}")
        print(f"   Top chunks: {len(top_chunks)}")
        print("=" * 100)
        
        return True
        
    except Exception as e:
        print("\n" + "=" * 100)
        print(f"❌ Error: {type(e).__name__}: {str(e)}")
        print("=" * 100)
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_chunks()
    sys.exit(0 if success else 1)

