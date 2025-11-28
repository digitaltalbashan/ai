#!/usr/bin/env python3
"""
Re-ranking utility using CrossEncoder
Can be used standalone or imported
"""
import sys
import json
import os
from typing import List, Dict

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from sentence_transformers import CrossEncoder

# Default rerank model (fast and good quality)
# Options for Hebrew support:
# - "BAAI/bge-reranker-base" - Best for Hebrew (multilingual, 100+ languages)
# - "BAAI/bge-reranker-large" - Best quality, slower (multilingual)
# - "cross-encoder/ms-marco-MiniLM-L-12-v2" - Larger multilingual version
# - "cross-encoder/ms-marco-MiniLM-L-6-v2" - Current default (English-focused, fast)
DEFAULT_RERANK_MODEL = "BAAI/bge-reranker-base"  # Changed to support Hebrew better

# Cache for model instance
_rerank_model_cache = None
_rerank_model_name = None


def get_reranker(model_name: str = None) -> CrossEncoder:
    """Get or load rerank model (cached)"""
    global _rerank_model_cache, _rerank_model_name
    
    model_name = model_name or os.getenv("RERANK_MODEL", DEFAULT_RERANK_MODEL)
    
    if _rerank_model_cache is None or _rerank_model_name != model_name:
        print(f"📥 Loading rerank model: {model_name}...", file=sys.stderr)
        _rerank_model_cache = CrossEncoder(model_name)
        _rerank_model_name = model_name
    else:
        print(f"♻️  Using cached rerank model: {model_name}", file=sys.stderr)
    
    return _rerank_model_cache


def rerank_chunks(query: str, chunks: List[Dict], top_n: int = 8) -> List[Dict]:
    """
    Re-rank chunks using CrossEncoder
    
    Args:
        query: The search query
        chunks: List of chunk dictionaries with 'text' field
        top_n: Number of top chunks to return
    
    Returns:
        List of top_n chunks sorted by rerank score (highest first)
        Each chunk has added "rerank_score" field
    """
    if not chunks:
        return []
    
    # Get reranker
    reranker = get_reranker()
    
    # Prepare pairs for CrossEncoder: [query, chunk_text]
    pairs = [[query, chunk.get("text", "")] for chunk in chunks]
    
    # Get scores from CrossEncoder
    scores = reranker.predict(pairs, show_progress_bar=False, batch_size=32)
    
    # Add score to each chunk
    for chunk, score in zip(chunks, scores):
        chunk["rerank_score"] = float(score)
    
    # Sort by rerank score (descending) and return top_n
    sorted_chunks = sorted(chunks, key=lambda x: x["rerank_score"], reverse=True)
    
    return sorted_chunks[:top_n]


def main():
    """CLI interface for re-ranking"""
    if len(sys.argv) < 3:
        print("Usage: python rerank_with_crossencoder.py <query> <chunks_json> [top_n]")
        print("  query: The search query")
        print("  chunks_json: JSON array of chunks with 'text' field")
        print("  top_n: Number of top chunks to return (default: 8)")
        sys.exit(1)
    
    query = sys.argv[1]
    chunks_json = sys.argv[2]
    top_n = int(sys.argv[3]) if len(sys.argv) > 3 else 8
    
    try:
        chunks = json.loads(chunks_json)
        reranked = rerank_chunks(query, chunks, top_n)
        
        # Output as JSON
        print(json.dumps(reranked, ensure_ascii=False, indent=2))
    except Exception as e:
        error = {"error": str(e), "type": type(e).__name__}
        print(json.dumps(error, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

