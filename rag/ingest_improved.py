"""
Improved Ingestion Pipeline for RAG
- Context-Aware Chunking (200-400 tokens, 50-100 overlap)
- Better metadata extraction
- Quality embeddings
"""
import os
import json
import re
from typing import List, Dict, Tuple
from pathlib import Path

import numpy as np
from docx import Document
import faiss
from sentence_transformers import SentenceTransformer

from .config import DOCS_DIR, INDEX_PATH, METADATA_PATH, EMBEDDING_MODEL_NAME


def estimate_tokens(text: str) -> int:
    """
    Estimate token count (rough: 1 token ≈ 4 characters for Hebrew)
    More accurate would use tiktoken, but this is good enough for chunking
    """
    return len(text) // 4


def context_aware_chunk_text(
    text: str,
    max_tokens: int = 300,
    overlap_tokens: int = 75,
    min_chunk_tokens: int = 50
) -> List[Dict[str, any]]:
    """
    Context-aware chunking that respects sentence boundaries
    
    Args:
        text: Text to chunk
        max_tokens: Maximum tokens per chunk (200-400 recommended)
        overlap_tokens: Overlap between chunks (50-100 recommended)
        min_chunk_tokens: Minimum tokens per chunk
    
    Returns:
        List of chunks with metadata
    """
    chunks = []
    
    # Split into sentences (Hebrew sentence endings)
    sentence_endings = r'[.!?]\s+'
    sentences = re.split(sentence_endings, text)
    
    current_chunk = []
    current_tokens = 0
    chunk_start_idx = 0
    
    for i, sentence in enumerate(sentences):
        sentence = sentence.strip()
        if not sentence:
            continue
        
        sentence_tokens = estimate_tokens(sentence)
        
        # If adding this sentence would exceed max_tokens, finalize current chunk
        if current_tokens + sentence_tokens > max_tokens and current_chunk:
            # Finalize current chunk
            chunk_text = ' '.join(current_chunk)
            if estimate_tokens(chunk_text) >= min_chunk_tokens:
                chunks.append({
                    'text': chunk_text,
                    'start_sentence': chunk_start_idx,
                    'end_sentence': i - 1,
                    'token_count': estimate_tokens(chunk_text)
                })
            
            # Start new chunk with overlap
            # Take last few sentences for overlap
            overlap_sentences = []
            overlap_tokens_count = 0
            for j in range(len(current_chunk) - 1, -1, -1):
                sent = current_chunk[j]
                sent_tokens = estimate_tokens(sent)
                if overlap_tokens_count + sent_tokens <= overlap_tokens:
                    overlap_sentences.insert(0, sent)
                    overlap_tokens_count += sent_tokens
                else:
                    break
            
            current_chunk = overlap_sentences + [sentence]
            current_tokens = overlap_tokens_count + sentence_tokens
            chunk_start_idx = i - len(overlap_sentences)
        else:
            current_chunk.append(sentence)
            current_tokens += sentence_tokens
    
    # Add final chunk
    if current_chunk:
        chunk_text = ' '.join(current_chunk)
        if estimate_tokens(chunk_text) >= min_chunk_tokens:
            chunks.append({
                'text': chunk_text,
                'start_sentence': chunk_start_idx,
                'end_sentence': len(sentences) - 1,
                'token_count': estimate_tokens(chunk_text)
            })
    
    return chunks


def extract_metadata(text: str, filename: str) -> Dict:
    """
    Extract metadata from chunk text
    """
    metadata = {
        'source': filename,
        'word_count': len(text.split()),
        'char_count': len(text),
        'token_count': estimate_tokens(text)
    }
    
    # Extract potential topics (first sentence or key phrases)
    sentences = text.split('.')
    if sentences:
        first_sentence = sentences[0].strip()[:100]
        metadata['topic'] = first_sentence
    
    # Extract key concepts (simple heuristic - look for course terms)
    course_terms = [
        'מעגל התודעה', 'תודעה ראקטיבית', 'תודעה אקטיבית', 'תודעה יצירתית',
        'תת מודע', 'רצון חופשי', 'פחד', 'מציאות', 'שחיקה', 'תקיעות',
        'R', 'A', 'C', 'תודעת R', 'תודעת A', 'תודעת C'
    ]
    
    found_concepts = []
    text_lower = text.lower()
    for term in course_terms:
        if term.lower() in text_lower:
            found_concepts.append(term)
    
    if found_concepts:
        metadata['key_concepts'] = found_concepts[:5]  # Limit to 5
    
    return metadata


def load_word_docs(doc_dir: str) -> List[Dict]:
    """
    Load all Word documents recursively
    """
    docs = []
    for root, dirs, files in os.walk(doc_dir):
        for fname in files:
            if not fname.lower().endswith(".docx"):
                continue
            full_path = os.path.join(root, fname)
            try:
                doc = Document(full_path)
                text = "\n".join([p.text for p in doc.paragraphs if p.text.strip()])
                if text.strip():
                    rel_path = os.path.relpath(full_path, doc_dir)
                    docs.append({"filename": rel_path, "text": text})
            except Exception as e:
                print(f"⚠️  שגיאה בקריאת {full_path}: {e}")
                continue
    return docs


def build_index_improved(
    max_tokens: int = 300,
    overlap_tokens: int = 75,
    embedding_model_name: str = None
):
    """
    Build improved RAG index with context-aware chunking
    
    Args:
        max_tokens: Maximum tokens per chunk (200-400 recommended)
        overlap_tokens: Overlap between chunks (50-100 recommended)
        embedding_model_name: Override embedding model
    """
    if embedding_model_name is None:
        embedding_model_name = EMBEDDING_MODEL_NAME
    
    print("🚀 Building improved RAG index...")
    print("=" * 80)
    print(f"📁 Loading documents from: {DOCS_DIR}")
    
    docs = load_word_docs(DOCS_DIR)
    if not docs:
        raise ValueError(f"No .docx files found in {DOCS_DIR}")
    
    print(f"✅ Found {len(docs)} documents")
    print(f"\n🔧 Chunking parameters:")
    print(f"   Max tokens per chunk: {max_tokens}")
    print(f"   Overlap tokens: {overlap_tokens}")
    print(f"\n📝 Processing documents...")
    
    # Load embedding model
    print(f"\n🔄 Loading embedding model: {embedding_model_name}")
    embed_model = SentenceTransformer(embedding_model_name)
    print("✅ Embedding model loaded")
    
    all_embeddings = []
    all_metadata = []
    
    total_chunks = 0
    
    for doc_idx, doc in enumerate(docs, 1):
        filename = doc["filename"]
        text = doc["text"]
        
        print(f"\n[{doc_idx}/{len(docs)}] Processing: {filename}")
        
        # Context-aware chunking
        chunks = context_aware_chunk_text(text, max_tokens, overlap_tokens)
        print(f"   Created {len(chunks)} chunks")
        
        if not chunks:
            continue
        
        # Generate embeddings for all chunks at once (more efficient)
        chunk_texts = [chunk['text'] for chunk in chunks]
        embeddings = embed_model.encode(chunk_texts, convert_to_numpy=True, show_progress_bar=False)
        
        # Add to collections
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
            chunk_metadata = extract_metadata(chunk['text'], filename)
            chunk_metadata.update({
                'chunk_index': i,
                'start_sentence': chunk.get('start_sentence', 0),
                'end_sentence': chunk.get('end_sentence', 0),
            })
            
            all_embeddings.append(emb)
            all_metadata.append({
                'filename': filename,
                'chunk_index': i,
                'text': chunk['text'],
                'metadata': chunk_metadata
            })
            total_chunks += 1
    
    print(f"\n✅ Processed {total_chunks} chunks from {len(docs)} documents")
    
    # Build FAISS index
    print(f"\n🔨 Building FAISS index...")
    all_embeddings = np.vstack(all_embeddings).astype("float32")
    
    dim = all_embeddings.shape[1]
    index = faiss.IndexFlatL2(dim)
    index.add(all_embeddings)
    
    # Save index
    faiss.write_index(index, INDEX_PATH)
    print(f"✅ FAISS index saved to: {INDEX_PATH}")
    
    # Save metadata
    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(all_metadata, f, ensure_ascii=False, indent=2)
    print(f"✅ Metadata saved to: {METADATA_PATH}")
    
    # Statistics
    print("\n" + "=" * 80)
    print("📊 Statistics:")
    print("=" * 80)
    print(f"Total documents: {len(docs)}")
    print(f"Total chunks: {total_chunks}")
    print(f"Average chunks per document: {total_chunks / len(docs):.1f}")
    
    avg_tokens = np.mean([chunk['metadata']['token_count'] for chunk in all_metadata])
    print(f"Average tokens per chunk: {avg_tokens:.1f}")
    print(f"Index dimension: {dim}")
    print("=" * 80)


if __name__ == "__main__":
    os.makedirs(DOCS_DIR, exist_ok=True)
    
    # Use recommended parameters: 200-400 tokens, 50-100 overlap
    # We'll use 300 tokens with 75 overlap as a good middle ground
    build_index_improved(
        max_tokens=300,
        overlap_tokens=75
    )

