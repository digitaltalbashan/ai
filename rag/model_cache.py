"""
Model caching for performance optimization
Prevents reloading models on every RagQueryEngine initialization
"""
from typing import Optional
from sentence_transformers import SentenceTransformer, CrossEncoder

# Global model cache
_embedding_model: Optional[SentenceTransformer] = None
_rerank_model: Optional[CrossEncoder] = None
_embedding_model_name: Optional[str] = None
_rerank_model_name: Optional[str] = None


def get_embedding_model(model_name: str) -> SentenceTransformer:
    """Get or load embedding model (cached)"""
    global _embedding_model, _embedding_model_name
    
    if _embedding_model is None or _embedding_model_name != model_name:
        print(f"📥 Loading embedding model: {model_name} (first time or model changed)...")
        _embedding_model = SentenceTransformer(model_name)
        _embedding_model_name = model_name
        print("✅ Embedding model loaded and cached")
    else:
        print(f"♻️  Using cached embedding model: {model_name}")
    
    return _embedding_model


# Rerank model aliases
RERANK_MODEL_ALIASES = {
    "fast": "cross-encoder/ms-marco-MiniLM-L-6-v2",
    "balanced": "BAAI/bge-reranker-base",
    "best": "BAAI/bge-reranker-large",
    "latest": "mixedbread-ai/mxbai-rerank-large-v1",
}

def get_rerank_model(model_name: str) -> CrossEncoder:
    """Get or load rerank model (cached)
    
    Args:
        model_name: Model name or alias ("fast", "balanced", "best", "latest")
                   or full HuggingFace model path
    """
    global _rerank_model, _rerank_model_name
    
    # Resolve alias to actual model name
    actual_model_name = RERANK_MODEL_ALIASES.get(model_name, model_name)
    
    if _rerank_model is None or _rerank_model_name != actual_model_name:
        print(f"📥 Loading rerank model: {actual_model_name} (first time or model changed)...")
        _rerank_model = CrossEncoder(actual_model_name)
        _rerank_model_name = actual_model_name
        print("✅ Rerank model loaded and cached")
    else:
        print(f"♻️  Using cached rerank model: {actual_model_name}")
    
    return _rerank_model


def clear_cache():
    """Clear model cache (useful for testing or memory management)"""
    global _embedding_model, _rerank_model, _embedding_model_name, _rerank_model_name
    _embedding_model = None
    _rerank_model = None
    _embedding_model_name = None
    _rerank_model_name = None

