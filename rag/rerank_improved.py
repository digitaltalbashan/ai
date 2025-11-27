"""
Improved Reranking with multiple model options and optimizations
"""
from typing import List, Dict, Optional
from sentence_transformers import CrossEncoder
from rag.model_cache import get_rerank_model

# Available rerank models (from best to fastest)
RERANK_MODELS = {
    "fast": "cross-encoder/ms-marco-MiniLM-L-6-v2",  # Fast, good for CPU
    "balanced": "BAAI/bge-reranker-base",  # Better quality, still fast
    "best": "BAAI/bge-reranker-large",  # Best quality, needs more resources
    "latest": "mixedbread-ai/mxbai-rerank-large-v1",  # Latest and greatest
}

# Default model
DEFAULT_RERANK_MODEL = "fast"  # Use fast by default, can be changed


def rerank_chunks(
    question: str,
    chunks: List[Dict],
    top_n: int = 8,
    model_name: Optional[str] = None,
    batch_size: int = 32,
    show_progress: bool = False
) -> List[Dict]:
    """
    Rerank chunks using CrossEncoder model
    
    Args:
        question: The question to rank against
        chunks: List of chunk dicts with at least "text" key
        top_n: Number of top chunks to return
        model_name: Model name or alias ("fast", "balanced", "best", "latest")
                   If None, uses DEFAULT_RERANK_MODEL
        batch_size: Batch size for processing (larger = faster but more memory)
        show_progress: Whether to show progress bar
    
    Returns:
        List of top_n chunks sorted by rerank score (highest first)
        Each chunk has added "rerank_score" field
    """
    if not chunks:
        return []
    
    # Resolve model name
    if model_name is None:
        model_name = DEFAULT_RERANK_MODEL
    
    # If it's an alias, resolve to actual model name
    if model_name in RERANK_MODELS:
        actual_model_name = RERANK_MODELS[model_name]
    else:
        actual_model_name = model_name
    
    # Get rerank model (cached)
    reranker = get_rerank_model(actual_model_name)
    
    # Prepare pairs: (question, chunk_text)
    pairs = [[question, chunk.get("text", "")] for chunk in chunks]
    
    # Get scores from CrossEncoder
    scores = reranker.predict(
        pairs,
        show_progress_bar=show_progress,
        batch_size=batch_size
    )
    
    # Add scores to chunks
    scored_chunks = []
    for chunk, score in zip(chunks, scores):
        chunk_with_score = chunk.copy()
        chunk_with_score["rerank_score"] = float(score)
        scored_chunks.append(chunk_with_score)
    
    # Sort by score (descending)
    scored_chunks_sorted = sorted(
        scored_chunks,
        key=lambda x: x["rerank_score"],
        reverse=True
    )
    
    # Return top_n
    return scored_chunks_sorted[:top_n]


def compare_rerank_models(
    question: str,
    chunks: List[Dict],
    models: List[str] = ["fast", "balanced", "best"],
    top_n: int = 5
) -> Dict[str, List[Dict]]:
    """
    Compare different rerank models on the same question and chunks
    
    Useful for testing which model works best for your use case
    
    Returns:
        Dict mapping model name to list of top_n reranked chunks
    """
    results = {}
    
    for model_alias in models:
        print(f"🔄 Testing model: {model_alias}...")
        reranked = rerank_chunks(
            question=question,
            chunks=chunks,
            top_n=top_n,
            model_name=model_alias,
            show_progress=False
        )
        results[model_alias] = reranked
        
        if reranked:
            top_score = reranked[0].get("rerank_score", 0)
            print(f"   ✅ Top score: {top_score:.3f}")
    
    return results


# Example usage:
if __name__ == "__main__":
    # Example chunks
    test_chunks = [
        {"id": "1", "text": "תודעה ריאקטיבית היא מצב שבו האדם מגיב אוטומטית למציאות."},
        {"id": "2", "text": "תודעה אקטיבית מאפשרת בחירה חופשית גם מול מציאות קיימת."},
        {"id": "3", "text": "תודעה קריאטיבית מאפשרת לברוא מציאות חדשה מתוך כוונה."},
    ]
    
    test_question = "מה ההבדל בין תודעה ריאקטיבית לתודעה אקטיבית?"
    
    print("🧪 Testing rerank...")
    reranked = rerank_chunks(test_question, test_chunks, top_n=3)
    
    print("\n📊 Results:")
    for i, chunk in enumerate(reranked, 1):
        print(f"{i}. Score: {chunk['rerank_score']:.3f} | {chunk['text'][:50]}...")

