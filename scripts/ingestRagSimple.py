#!/usr/bin/env python3
"""
Simple RAG Ingestion - Starting Fresh
Reads Word documents, chunks them, creates embeddings, and indexes to PostgreSQL
"""
import os
import json
from typing import List, Dict
from pathlib import Path

import numpy as np
from docx import Document
from sentence_transformers import SentenceTransformer
import psycopg2
from tqdm import tqdm

# === CONFIGURATION ===

# Documents directory
DOCUMENTS_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "word_docs")

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://tzahimoyal@localhost:5432/talbashanai")

# Embedding model (768 dimensions for PostgreSQL vector(768))
EMBEDDING_MODEL_NAME = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"

# Chunk size (in characters, optimized for Hebrew)
# Using 800 chars ≈ 200 tokens, with 150 overlap ≈ 37 tokens
CHUNK_MAX_CHARS = 800
CHUNK_OVERLAP_CHARS = 150

# === HELPERS ===

def load_word_docs(doc_dir: str) -> List[Dict]:
    """
    Reads all .docx files in directory (recursively) and returns:
    { "filename": ..., "text": ... }
    """
    docs: List[Dict] = []
    
    if not os.path.isdir(doc_dir):
        raise ValueError(f"Documents directory does not exist: {doc_dir}")
    
    # Walk recursively
    for root, dirs, files in os.walk(doc_dir):
        for fname in files:
            if not fname.lower().endswith(".docx"):
                continue
            
            full_path = os.path.join(root, fname)
            try:
                doc = Document(full_path)
            except Exception as e:
                print(f"⚠️  Failed to read {full_path}: {e}")
                continue
            
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            text = "\n".join(paragraphs).strip()
            
            if not text:
                print(f"⚠️  Empty or no text extracted from: {fname}")
                continue
            
            # Use relative path from doc_dir as filename
            rel_path = os.path.relpath(full_path, doc_dir)
            docs.append({"filename": rel_path, "text": text})
    
    return docs


def chunk_text(text: str, max_chars: int, overlap: int) -> List[str]:
    """
    Improved context-aware chunking that respects sentence boundaries.
    Ensures chunks are within optimal size range (200-1000 chars).
    """
    import re
    
    chunks: List[str] = []
    MIN_CHUNK_SIZE = 200  # Minimum chunk size
    MAX_CHUNK_SIZE = 1000  # Maximum chunk size (hard limit)
    
    if not text or len(text) == 0:
        return chunks
    
    # Clean text
    text = re.sub(r'\s+', ' ', text).strip()
    
    # If text is too short, return as single chunk (if above minimum)
    if len(text) < MIN_CHUNK_SIZE:
        if len(text) > 50:  # Only if meaningful
            chunks.append(text)
        return chunks
    
    # Split by sentences (Hebrew sentence endings)
    sentence_endings = r'[.!?]\s+'
    sentences = [s.strip() for s in re.split(sentence_endings, text) if len(s.strip()) > 10]
    
    if not sentences:
        # Fallback: split by paragraphs or force split if too long
        if len(text) > MAX_CHUNK_SIZE:
            # Force split long text
            for i in range(0, len(text), max_chars - overlap):
                chunk = text[i:i + max_chars]
                if len(chunk) >= MIN_CHUNK_SIZE:
                    chunks.append(chunk)
        elif len(text) >= MIN_CHUNK_SIZE:
            chunks.append(text)
        return chunks
    
    current_chunk = []
    current_length = 0
    
    for sentence in sentences:
        sentence_length = len(sentence)
        
        # If adding this sentence would exceed max_chars, finalize current chunk
        if current_length + sentence_length > max_chars and current_chunk:
            chunk_text = '. '.join(current_chunk)
            
            # Only add if chunk is large enough
            if len(chunk_text) >= MIN_CHUNK_SIZE:
                chunks.append(chunk_text)
            elif current_length > 0:
                # Merge with previous chunk if too short
                if chunks:
                    chunks[-1] = chunks[-1] + '. ' + chunk_text
                else:
                    chunks.append(chunk_text)
            
            # Start new chunk with overlap
            overlap_sentences = []
            overlap_length = 0
            
            # Take last few sentences for overlap
            for sent in reversed(current_chunk):
                sent_len = len(sent)
                if overlap_length + sent_len <= overlap:
                    overlap_sentences.insert(0, sent)
                    overlap_length += sent_len
                else:
                    break
            
            current_chunk = overlap_sentences + [sentence]
            current_length = overlap_length + sentence_length
        else:
            current_chunk.append(sentence)
            current_length += sentence_length
        
        # Safety check: if chunk is getting too long, force split
        if current_length > MAX_CHUNK_SIZE and current_chunk:
            chunk_text = '. '.join(current_chunk)
            # Split the long chunk
            if len(chunk_text) > MAX_CHUNK_SIZE:
                # Take first part
                first_part = chunk_text[:max_chars]
                if len(first_part) >= MIN_CHUNK_SIZE:
                    chunks.append(first_part)
                # Continue with rest
                remaining = chunk_text[max_chars - overlap:]
                current_chunk = [remaining] if len(remaining) > 10 else []
                current_length = len(remaining)
    
    # Add final chunk
    if current_chunk:
        chunk_text = '. '.join(current_chunk)
        if len(chunk_text) >= MIN_CHUNK_SIZE:
            chunks.append(chunk_text)
        elif len(chunk_text) > 50 and chunks:
            # Merge with previous if too short
            chunks[-1] = chunks[-1] + '. ' + chunk_text
        elif len(chunk_text) > 50:
            chunks.append(chunk_text)
    
    return chunks


def index_to_postgresql(
    chunks: List[Dict],
    embeddings: np.ndarray,
    conn
) -> None:
    """
    Index chunks and embeddings to PostgreSQL with pgvector
    """
    cursor = conn.cursor()
    
    print(f"\n💾 Indexing {len(chunks)} chunks to PostgreSQL...")
    
    # Delete old chunks
    print("🗑️  Cleaning old chunks...")
    cursor.execute("DELETE FROM knowledge_chunks")
    conn.commit()
    print("✅ Old chunks deleted")
    
    indexed = 0
    errors = 0
    
    # Insert chunks with progress bar
    for chunk, embedding in tqdm(zip(chunks, embeddings), total=len(chunks), desc="Indexing"):
        try:
            chunk_id = f"{chunk['filename']}_chunk_{chunk['chunk_index']:03d}"
            # Sanitize ID (remove invalid characters)
            chunk_id = chunk_id.replace('/', '_').replace('\\', '_')
            
            embedding_str = '[' + ','.join(map(str, embedding.tolist())) + ']'
            
            # Extract topic and key concepts (improved)
            text_lower = chunk['text'].lower()
            sentences = [s.strip() for s in chunk['text'].split('.') if s.strip()]
            
            # Topic: first meaningful sentence (up to 100 chars)
            topic = ''
            for sent in sentences:
                if len(sent) > 20:  # Meaningful sentence
                    topic = sent[:100].strip()
                    break
            
            # Key concepts - expanded list
            course_concepts = [
                'מעגל התודעה', 'תודעה ראקטיבית', 'תודעה אקטיבית', 'תודעה יצירתית',
                'תת מודע', 'רצון חופשי', 'פחד', 'מציאות', 'שחיקה', 'תקיעות',
                'תודעה', 'מנהיגות תודעתית', 'תיקון', 'הרגל', 'התנגדות',
                'דיסקרטיות', 'מאמן', 'משתתף', 'סדנה', 'שיעור', 'תרגול',
                'מודל', 'תהליך', 'התפתחות', 'אישי', 'נפשי', 'רגשי',
                'מעגל', 'התודעה', 'ראקטיבי', 'אקטיבי', 'יצירתי'
            ]
            key_concepts = []
            for concept in course_concepts:
                if concept.lower() in text_lower:
                    key_concepts.append(concept)
                    if len(key_concepts) >= 5:
                        break
            
            # Determine chunk type (improved)
            chunk_type = 'content'
            words = chunk['text'].split()
            word_count = len(words)
            
            # Intro chunks
            intro_indicators = ['שלום', 'ברוכים', 'נתחיל', 'בואו נתחיל', 'היום נלמד']
            if any(ind in text_lower for ind in intro_indicators) and chunk['chunk_index'] <= 2:
                chunk_type = 'intro'
            # Summary chunks
            elif any(ind in text_lower for ind in ['סיכום', 'לסיכום', 'בסוף', 'לסיום', 'לסיכום']):
                chunk_type = 'summary'
            # General chunks (too many common words or too short)
            else:
                common_words = ['זה', 'של', 'את', 'על', 'או', 'אם', 'כי', 'אז', 'גם', 'יותר', 'אנחנו', 'אני']
                common_count = sum(1 for w in words if w.lower() in common_words)
                common_ratio = common_count / max(1, word_count)
                
                # Mark as general if:
                # 1. Too many common words (>35%)
                # 2. Too short (<100 chars) and has many common words
                # 3. Very repetitive content
                if common_ratio > 0.35:
                    chunk_type = 'general'
                elif len(chunk['text']) < 100 and common_ratio > 0.25:
                    chunk_type = 'general'
                elif word_count < 20:  # Very short chunks are likely general
                    chunk_type = 'general'
            
            # Estimate token count (rough: 1 token ≈ 4 chars for Hebrew)
            token_count = len(chunk['text']) // 4
            
            metadata = {
                'source': chunk['filename'],
                'order': chunk['chunk_index'],
                'word_count': word_count,
                'char_count': len(chunk['text']),
                'token_count': token_count,
                'topic': topic if topic else None,
                'key_concepts': key_concepts if key_concepts else [],
                'chunk_type': chunk_type,
                'is_general': chunk_type == 'general',
                'is_standalone': len(chunk['text']) >= 200 and word_count >= 30  # Can stand alone
            }
            
            cursor.execute("""
                INSERT INTO knowledge_chunks (id, text, metadata, source, "order", embedding)
                VALUES (%s, %s, %s::jsonb, %s, %s, %s::vector)
            """, (
                chunk_id,
                chunk['text'],
                json.dumps(metadata),
                chunk['filename'],
                chunk['chunk_index'],
                embedding_str
            ))
            
            indexed += 1
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f"   ❌ Error inserting chunk: {e}")
    
    conn.commit()
    cursor.close()
    
    print(f"\n✅ Indexed: {indexed}/{len(chunks)}")
    if errors > 0:
        print(f"❌ Errors: {errors}")


def build_index(
    documents_dir: str = DOCUMENTS_DIR,
    embedding_model_name: str = EMBEDDING_MODEL_NAME,
    chunk_max_chars: int = CHUNK_MAX_CHARS,
    chunk_overlap_chars: int = CHUNK_OVERLAP_CHARS,
) -> None:
    """
    Main function:
    - Reads all Word documents
    - Does chunking
    - Generates embeddings
    - Indexes to PostgreSQL
    """
    
    print("🚀 RAG Ingestion - Starting Fresh")
    print("=" * 80)
    print(f"📂 Loading .docx files from: {documents_dir}")
    
    docs = load_word_docs(documents_dir)
    
    if not docs:
        raise ValueError(f"No .docx files found in {documents_dir}")
    
    print(f"✅ Found {len(docs)} documents")
    print(f"\n🔄 Initializing embedding model: {embedding_model_name}...")
    
    embed_model = SentenceTransformer(embedding_model_name)
    print("✅ Embedding model loaded")
    
    all_chunks: List[Dict] = []
    all_embeddings = []
    
    total_chunks = 0
    
    print(f"\n📝 Processing documents...")
    print(f"   Chunk size: {chunk_max_chars} chars, Overlap: {chunk_overlap_chars} chars")
    
    for doc in tqdm(docs, desc="Processing docs"):
        filename = doc["filename"]
        text = doc["text"]
        
        chunks = chunk_text(text, max_chars=chunk_max_chars, overlap=chunk_overlap_chars)
        if not chunks:
            print(f"⚠️  No chunks produced for file: {filename}")
            continue
        
        # Generate embeddings for all chunks at once
        embeddings = embed_model.encode(chunks, convert_to_numpy=True, show_progress_bar=False)
        
        for i, (chunk_text_value, emb) in enumerate(zip(chunks, embeddings)):
            all_chunks.append({
                "filename": filename,
                "chunk_index": i,
                "text": chunk_text_value,
            })
            all_embeddings.append(emb)
            total_chunks += 1
    
    if not all_embeddings:
        raise ValueError("No embeddings created. Check your documents and chunking configuration.")
    
    # Stack embeddings
    all_embeddings_np = np.vstack(all_embeddings).astype("float32")
    
    dim = all_embeddings_np.shape[1]
    print(f"\n📐 Embedding dimension: {dim}")
    print(f"🔢 Total chunks: {total_chunks}")
    
    # Connect to PostgreSQL
    print(f"\n🔌 Connecting to PostgreSQL...")
    conn = psycopg2.connect(DATABASE_URL)
    print("✅ Connected to database")
    
    # Index to PostgreSQL
    index_to_postgresql(all_chunks, all_embeddings_np, conn)
    
    conn.close()
    
    print("\n" + "=" * 80)
    print("🎉 Ingestion & indexing completed successfully!")
    print("=" * 80)


if __name__ == "__main__":
    print("🚀 RAG ingestion started...")
    print(f"DOCUMENTS_DIR = {DOCUMENTS_DIR}")
    os.makedirs(DOCUMENTS_DIR, exist_ok=True)
    
    build_index()

