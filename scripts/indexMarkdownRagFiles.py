#!/usr/bin/env python3
"""
Index all Markdown files from data/rag/ folder to PostgreSQL
"""
import os
import sys
import json
import time
from pathlib import Path
from typing import List, Dict, Any
import psycopg2
from sentence_transformers import SentenceTransformer
from tqdm import tqdm

# Add project root to path
BASE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BASE_DIR))

from rag.model_cache import get_embedding_model

RAG_DIR = BASE_DIR / "data" / "rag"

# Database
_raw_database_url = os.getenv("DATABASE_URL", "postgresql://tzahimoyal@localhost:5432/talbashanai")
if "?schema=" in _raw_database_url:
    DATABASE_URL = _raw_database_url.split("?schema=")[0]
else:
    DATABASE_URL = _raw_database_url

# Embedding model
EMBEDDING_MODEL_NAME = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"

def load_markdown_files(rag_dir: Path) -> List[Dict[str, str]]:
    """Load all markdown files from the RAG directory"""
    md_files = list(rag_dir.glob("*.md"))
    
    if not md_files:
        raise ValueError(f"No markdown files found in {rag_dir}")
    
    print(f"📁 Found {len(md_files)} markdown files")
    
    documents = []
    for md_file in sorted(md_files):
        try:
            with open(md_file, 'r', encoding='utf-8') as f:
                content = f.read().strip()
            
            if not content:
                print(f"⚠️  Skipping empty file: {md_file.name}")
                continue
            
            documents.append({
                "filename": md_file.name,
                "text": content,
                "filepath": str(md_file)
            })
        except Exception as e:
            print(f"❌ Error reading {md_file.name}: {e}")
            continue
    
    return documents

def clean_existing_index(conn):
    """Delete all existing chunks from the database"""
    print("\n🗑️  Cleaning existing index...")
    cursor = conn.cursor()
    cursor.execute("DELETE FROM knowledge_chunks")
    conn.commit()
    
    # Verify deletion
    cursor.execute("SELECT COUNT(*) FROM knowledge_chunks")
    count = cursor.fetchone()[0]
    print(f"✅ Existing chunks deleted. Remaining: {count}")
    cursor.close()

def index_chunks_to_db(chunks: List[Dict[str, Any]], embed_model: SentenceTransformer, conn):
    """Index chunks to PostgreSQL database"""
    print(f"\n💾 Indexing {len(chunks)} chunks to database...")
    
    cursor = conn.cursor()
    
    indexed = 0
    errors = 0
    batch_size = 50
    
    start_time = time.time()
    
    # Process in batches
    for i in tqdm(range(0, len(chunks), batch_size), desc="Indexing chunks"):
        batch = chunks[i:i + batch_size]
        
        # Generate embeddings for batch
        batch_texts = [chunk['text'] for chunk in batch]
        embeddings = embed_model.encode(batch_texts, convert_to_numpy=True, show_progress_bar=False)
        
        # Insert each chunk
        for chunk, embedding in zip(batch, embeddings):
            try:
                chunk_id = chunk['id']
                embedding_str = '[' + ','.join(map(str, embedding.tolist())) + ']'
                
                # Extract metadata
                metadata = {
                    'source': chunk['source'],
                    'filename': chunk['filename'],
                    'chunk_index': chunk.get('chunk_index', 0),
                }
                
                # Insert into database
                cursor.execute("""
                    INSERT INTO knowledge_chunks (
                        id, text, metadata, embedding, source, "order", "createdAt"
                    ) VALUES (
                        %s, %s, %s::jsonb, %s::vector, %s, %s, NOW()
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        text = EXCLUDED.text,
                        metadata = EXCLUDED.metadata,
                        embedding = EXCLUDED.embedding,
                        source = EXCLUDED.source,
                        "order" = EXCLUDED."order"
                """, (
                    chunk_id,
                    chunk['text'],
                    json.dumps(metadata),
                    embedding_str,
                    chunk['source'],
                    chunk.get('chunk_index', 0)
                ))
                
                indexed += 1
            except Exception as e:
                errors += 1
                if errors <= 5:
                    print(f"\n   ❌ Error indexing {chunk.get('id', 'unknown')}: {e}")
                continue
        
        # Commit batch
        conn.commit()
    
    duration = time.time() - start_time
    
    cursor.close()
    
    print(f"\n✅ Indexing complete!")
    print(f"   ✅ Indexed: {indexed}")
    print(f"   ❌ Errors: {errors}")
    print(f"   ⏱️  Duration: {duration:.2f}s")
    print(f"   📈 Rate: {indexed/duration:.1f} chunks/second")

def main():
    print("🚀 Indexing Markdown RAG Files")
    print("=" * 80)
    
    # Check RAG directory
    if not RAG_DIR.exists():
        print(f"❌ RAG directory not found: {RAG_DIR}")
        return
    
    # Load markdown files
    print(f"\n📂 Loading markdown files from: {RAG_DIR}")
    documents = load_markdown_files(RAG_DIR)
    
    if not documents:
        print("❌ No documents to index")
        return
    
    # Initialize embedding model
    print(f"\n🔄 Loading embedding model: {EMBEDDING_MODEL_NAME}...")
    embed_model = get_embedding_model(EMBEDDING_MODEL_NAME)
    print("✅ Embedding model loaded")
    
    # Connect to database
    print(f"\n📥 Connecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    print("✅ Connected to database")
    
    try:
        # Clean existing index
        clean_existing_index(conn)
        
        # Prepare chunks
        print(f"\n📝 Preparing chunks from {len(documents)} files...")
        chunks = []
        
        for doc_idx, doc in enumerate(documents, 1):
            filename = doc['filename']
            text = doc['text']
            
            # Use the entire file as one chunk (or split if needed)
            # For now, treat each markdown file as a single chunk
            chunk_id = f"rag_{doc_idx:03d}_{filename.replace('.md', '').replace(' ', '_')}"
            
            chunks.append({
                'id': chunk_id,
                'text': text,
                'source': filename,
                'filename': filename,
                'chunk_index': 0,
            })
        
        print(f"✅ Prepared {len(chunks)} chunks")
        
        # Index chunks
        index_chunks_to_db(chunks, embed_model, conn)
        
        # Final count
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM knowledge_chunks")
        total_count = cursor.fetchone()[0]
        cursor.close()
        
        print("\n" + "=" * 80)
        print("✨ Indexing Complete!")
        print("=" * 80)
        print(f"📊 Total chunks in database: {total_count}")
        
    finally:
        conn.close()
        print("\n✅ Database connection closed")

if __name__ == "__main__":
    main()

