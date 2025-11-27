import os

BASE_DIR = os.path.dirname(os.path.dirname(__file__))

DOCS_DIR = os.path.join(BASE_DIR, "data", "word_docs")
INDEX_PATH = os.path.join(BASE_DIR, "data", "index.faiss")
METADATA_PATH = os.path.join(BASE_DIR, "data", "metadata.json")

EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
RERANK_MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"

