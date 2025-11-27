import os
import json
from typing import List, Dict

import numpy as np
from docx import Document
import faiss
from sentence_transformers import SentenceTransformer

from .config import DOCS_DIR, INDEX_PATH, METADATA_PATH, EMBEDDING_MODEL_NAME


def load_word_docs(doc_dir: str) -> List[Dict]:
    docs = []
    # Search recursively in subdirectories
    for root, dirs, files in os.walk(doc_dir):
        for fname in files:
            if not fname.lower().endswith(".docx"):
                continue
            full_path = os.path.join(root, fname)
            try:
                doc = Document(full_path)
                text = "\n".join([p.text for p in doc.paragraphs if p.text.strip()])
                if text.strip():
                    # Use relative path from doc_dir as filename
                    rel_path = os.path.relpath(full_path, doc_dir)
                    docs.append({"filename": rel_path, "text": text})
            except Exception as e:
                print(f"⚠️  שגיאה בקריאת {full_path}: {e}")
                continue
    return docs


def chunk_text(text: str, max_chars: int = 1000, overlap: int = 200) -> List[str]:
    chunks = []
    start = 0
    length = len(text)
    while start < length:
        end = start + max_chars
        chunk = text[start:end]
        chunks.append(chunk)
        start = end - overlap
        if start < 0:
            break
    return chunks


def build_index():
    docs = load_word_docs(DOCS_DIR)
    if not docs:
        raise ValueError(f"No .docx files found in {DOCS_DIR}")

    embed_model = SentenceTransformer(EMBEDDING_MODEL_NAME)

    all_embeddings = []
    all_metadata = []

    for doc in docs:
        filename = doc["filename"]
        text = doc["text"]
        chunks = chunk_text(text)

        embeddings = embed_model.encode(chunks, convert_to_numpy=True)

        for i, emb in enumerate(embeddings):
            all_embeddings.append(emb)
            all_metadata.append({
                "filename": filename,
                "chunk_index": i,
                "text": chunks[i]
            })

    all_embeddings = np.vstack(all_embeddings).astype("float32")

    dim = all_embeddings.shape[1]
    index = faiss.IndexFlatL2(dim)
    index.add(all_embeddings)

    faiss.write_index(index, INDEX_PATH)

    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(all_metadata, f, ensure_ascii=False, indent=2)

    print(f"Indexed {len(all_metadata)} chunks from {len(docs)} documents.")


if __name__ == "__main__":
    os.makedirs(DOCS_DIR, exist_ok=True)
    build_index()

