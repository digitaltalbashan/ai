#!/usr/bin/env python3
"""
Production-ready RAG indexing system for markdown files and JSONL files
- Recursive markdown scanning
- JSONL file support (QnA format)
- Semantic chunking
- SHA-256 hash tracking
- Metadata enrichment
- OpenAI text-embedding-3-small embeddings (1536 dimensions)
- Embedding normalization
- pgvector upsert with indexing support
- Automatic cleanup of deleted files
- Full logging
"""

import os
import sys
import hashlib
import json
import psycopg2
import numpy as np
from openai import OpenAI
import re
from datetime import datetime
from bs4 import BeautifulSoup
import markdown
from pathlib import Path
from typing import List, Dict, Any

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# -------- CONFIG --------
DATA_DIR = os.path.join(project_root, "data", "rag")
EMBED_MODEL = "text-embedding-3-small"  # 1536 dimensions (supports indexing)
DB_URL = os.environ.get("DATABASE_URL")
CHUNK_MIN_CHARS = 250
CHUNK_MAX_CHARS = 1000
# ------------------------

if not DB_URL:
    print("❌ ERROR: DATABASE_URL environment variable not set")
    sys.exit(1)

# Remove ?schema= from DATABASE_URL if present (psycopg2 doesn't support it)
if "?schema=" in DB_URL:
    DB_URL = DB_URL.split("?schema=")[0]

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

if not client.api_key:
    print("❌ ERROR: OPENAI_API_KEY environment variable not set")
    sys.exit(1)


def normalize(v):
    """Normalize embedding vector to unit length for cosine similarity."""
    v = np.array(v, dtype=np.float32)
    norm = np.linalg.norm(v)
    if norm == 0:
        return v.tolist()
    return (v / norm).tolist()


def embed_texts(texts: List[str]) -> List[List[float]]:
    """Generate embeddings for multiple texts using OpenAI API."""
    if not texts:
        return []
    
    try:
        res = client.embeddings.create(
            model=EMBED_MODEL,
            input=texts
        )
        vectors = []
        for d in res.data:
            vectors.append(normalize(d.embedding))
        return vectors
    except Exception as e:
        print(f"❌ Error generating embeddings: {e}")
        raise


def semantic_chunk(text: str) -> List[str]:
    """Smart semantic chunking on paragraphs."""
    text = text.strip()
    if not text:
        return []
    
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    
    chunks = []
    buffer = ""
    
    for p in paragraphs:
        # If paragraph alone is too large: split by sentence
        if len(p) > CHUNK_MAX_CHARS:
            sentences = re.split(r'(?<=[.!?]) +', p)
            for s in sentences:
                if len(buffer) + len(s) < CHUNK_MAX_CHARS:
                    buffer += " " + s if buffer else s
                else:
                    if len(buffer) >= CHUNK_MIN_CHARS:
                        chunks.append(buffer.strip())
                    buffer = s
            continue
        
        # Normal accumulation
        if len(buffer) + len(p) < CHUNK_MAX_CHARS:
            buffer += "\n" + p if buffer else p
        else:
            if len(buffer) >= CHUNK_MIN_CHARS:
                chunks.append(buffer.strip())
            buffer = p
    
    if len(buffer) >= CHUNK_MIN_CHARS:
        chunks.append(buffer.strip())
    
    return chunks


def sha256(text: str) -> str:
    """Generate SHA-256 hash of text."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_markdown_clean(path: str) -> str:
    """Load markdown file and convert to clean plain text."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            body = f.read()
        
        # Convert Markdown to HTML
        html = markdown.markdown(body)
        soup = BeautifulSoup(html, "html.parser")
        clean = soup.get_text("\n", strip=True)
        
        return clean
    except Exception as e:
        print(f"❌ Error reading file {path}: {e}")
        return ""


def connect_db():
    """Connect to PostgreSQL database."""
    return psycopg2.connect(DB_URL)


def upsert_chunk(conn, chunk: Dict[str, Any]):
    """Upsert chunk into database."""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO knowledge_chunks 
            (id, file_path, chunk_index, text, embedding, metadata, content_hash, updated_at, source)
            VALUES (%s, %s, %s, %s, %s::vector, %s::jsonb, %s, NOW(), %s)
            ON CONFLICT (id) DO UPDATE SET
                text = EXCLUDED.text,
                embedding = EXCLUDED.embedding,
                metadata = EXCLUDED.metadata,
                content_hash = EXCLUDED.content_hash,
                file_path = EXCLUDED.file_path,
                chunk_index = EXCLUDED.chunk_index,
                updated_at = NOW();
        """, (
            chunk["id"],
            chunk["file_path"],
            chunk["chunk_index"],
            chunk["text"],
            chunk["embedding"],
            json.dumps(chunk["metadata"]),
            chunk["content_hash"],
            chunk.get("source", "markdown"),
        ))
    conn.commit()


def get_all_existing_file_paths(conn) -> set:
    """Get all existing file paths from database."""
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT file_path FROM knowledge_chunks WHERE file_path IS NOT NULL;")
        rows = cur.fetchall()
    return {r[0] for r in rows}


def delete_orphans(conn, valid_files: set):
    """Delete chunks from files that no longer exist."""
    if not valid_files:
        return
    
    with conn.cursor() as cur:
        # Use a tuple for the IN clause
        placeholders = ','.join(['%s'] * len(valid_files))
        cur.execute(f"""
            DELETE FROM knowledge_chunks
            WHERE file_path IS NOT NULL 
            AND file_path NOT IN ({placeholders});
        """, tuple(valid_files))
        deleted = cur.rowcount
    conn.commit()
    if deleted > 0:
        print(f"🗑️  Deleted {deleted} orphaned chunks from removed files")


def index_file(conn, path: str, relative_path: str):
    """Index a single markdown file."""
    print(f"📄 Indexing: {relative_path}")
    
    text = load_markdown_clean(path)
    if not text:
        print(f"   ⚠️  Empty or unreadable file")
        return
    
    content_hash = sha256(text)
    chunks = semantic_chunk(text)
    
    if not chunks:
        print(f"   ⚠️  No chunks produced (text too short)")
        return
    
    print(f"   📦 Generated {len(chunks)} chunks")
    
    # Embed all chunks at once (more efficient)
    try:
        embeddings = embed_texts(chunks)
    except Exception as e:
        print(f"   ❌ Error generating embeddings: {e}")
        return
    
    indexed_count = 0
    for idx, (chunk_text, emb) in enumerate(zip(chunks, embeddings)):
        try:
            # Generate unique chunk ID
            chunk_id = sha256(relative_path + "::" + str(idx) + "::" + chunk_text)
            
            # Convert embedding to string format for pgvector
            embedding_str = "[" + ",".join(map(str, emb)) + "]"
            
            record = {
                "id": chunk_id,
                "file_path": relative_path,
                "chunk_index": idx,
                "text": chunk_text,
                "embedding": embedding_str,
                "content_hash": content_hash,
                "source": "markdown",
                "metadata": {
                    "source_file": os.path.basename(path),
                    "path": relative_path,
                    "index": idx,
                    "chars": len(chunk_text),
                    "embedding_model": EMBED_MODEL,
                    "embedding_dim": 1536,
                }
            }
            
            upsert_chunk(conn, record)
            indexed_count += 1
        except Exception as e:
            print(f"   ❌ Error indexing chunk {idx}: {e}")
    
    print(f"   ✅ Indexed {indexed_count}/{len(chunks)} chunks")


def index_jsonl_file(conn, jsonl_path: str):
    """Index a JSONL file (QnA format)."""
    rel_path = os.path.relpath(jsonl_path, project_root)
    print(f"📄 Indexing JSONL: {rel_path}")
    
    try:
        with open(jsonl_path, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]
        
        if not lines:
            print(f"   ⚠️  Empty file")
            return
        
        chunks_data = []
        for line in lines:
            try:
                chunk = json.loads(line)
                if not chunk.get("id") or not chunk.get("question") or not chunk.get("answer_style"):
                    continue
                chunks_data.append(chunk)
            except json.JSONDecodeError as e:
                print(f"   ⚠️  Invalid JSON in line: {e}")
                continue
        
        if not chunks_data:
            print(f"   ⚠️  No valid chunks found")
            return
        
        print(f"   📦 Found {len(chunks_data)} QnA chunks")
        
        # Prepare texts for embedding
        texts = []
        for chunk in chunks_data:
            text = f"שאלה: {chunk['question']}\n\nתשובה: {chunk['answer_style']}"
            texts.append(text)
        
        # Generate embeddings in batch
        embeddings = embed_texts(texts)
        
        indexed_count = 0
        for idx, (chunk, text, emb) in enumerate(zip(chunks_data, texts, embeddings)):
            try:
                chunk_id = chunk["id"]
                embedding_str = "[" + ",".join(map(str, emb)) + "]"
                content_hash = sha256(text)
                
                record = {
                    "id": chunk_id,
                    "file_path": rel_path,
                    "chunk_index": idx,
                    "text": text,
                    "embedding": embedding_str,
                    "content_hash": content_hash,
                    "source": "qna",
                    "metadata": {
                        "source_file": os.path.basename(jsonl_path),
                        "path": rel_path,
                        "question": chunk["question"],
                        "answer_style": chunk["answer_style"],
                        "original_format": "qna",
                        "embedding_model": EMBED_MODEL,
                        "embedding_dim": 1536,
                        **chunk.get("metadata", {})
                    }
                }
                
                upsert_chunk(conn, record)
                indexed_count += 1
            except Exception as e:
                print(f"   ❌ Error indexing chunk {chunk.get('id', 'unknown')}: {e}")
        
        print(f"   ✅ Indexed {indexed_count}/{len(chunks_data)} chunks")
    except Exception as e:
        print(f"   ❌ Error reading JSONL file: {e}")


def index_all():
    """Main indexing function."""
    conn = connect_db()
    
    print("=" * 80)
    print("🚀 Production RAG Indexing System")
    print("=" * 80)
    print(f"📂 Scanning directory: {DATA_DIR}")
    print(f"🤖 Embedding model: {EMBED_MODEL} (1536 dimensions)")
    print(f"📏 Chunk size: {CHUNK_MIN_CHARS}-{CHUNK_MAX_CHARS} chars")
    print("=" * 80)
    print()
    
    if not os.path.exists(DATA_DIR):
        print(f"❌ ERROR: Directory {DATA_DIR} does not exist")
        print(f"   Create it and add markdown files to index")
        conn.close()
        sys.exit(1)
    
    # Scan for markdown and JSONL files
    md_files = []
    jsonl_files = []
    
    for root, dirs, files in os.walk(DATA_DIR):
        for f in files:
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, project_root)
            
            if f.lower().endswith(".md"):
                md_files.append((full_path, rel_path))
            elif f.lower().endswith(".jsonl"):
                jsonl_files.append((full_path, rel_path))
    
    if not md_files and not jsonl_files:
        print(f"⚠️  No markdown or JSONL files found in {DATA_DIR}")
        conn.close()
        return
    
    print(f"📋 Found {len(md_files)} markdown files")
    print(f"📋 Found {len(jsonl_files)} JSONL files")
    print()
    
    # Get existing file paths
    existing_paths = get_all_existing_file_paths(conn)
    print(f"📊 Found {len(existing_paths)} existing indexed files in database")
    print()
    
    # Index markdown files
    indexed_md = 0
    for full_path, rel_path in md_files:
        try:
            index_file(conn, full_path, rel_path)
            indexed_md += 1
        except Exception as e:
            print(f"❌ Error indexing {rel_path}: {e}")
    
    # Index JSONL files
    indexed_jsonl = 0
    for full_path, rel_path in jsonl_files:
        try:
            index_jsonl_file(conn, full_path)
            indexed_jsonl += 1
        except Exception as e:
            print(f"❌ Error indexing {rel_path}: {e}")
    
    print()
    print("=" * 80)
    
    # Clean up orphaned chunks
    valid_files = {rel_path for _, rel_path in md_files + jsonl_files}
    delete_orphans(conn, valid_files)
    
    conn.close()
    
    print()
    print("=" * 80)
    print("✅ Indexing complete!")
    print(f"   📄 Markdown files processed: {indexed_md}/{len(md_files)}")
    print(f"   📄 JSONL files processed: {indexed_jsonl}/{len(jsonl_files)}")
    print("=" * 80)


if __name__ == "__main__":
    index_all()
