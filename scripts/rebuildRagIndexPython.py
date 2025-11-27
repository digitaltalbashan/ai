#!/usr/bin/env python3
"""
Rebuild RAG index from JSONL files using Python
More efficient than TypeScript for embedding generation
"""
import os
import json
import re
import time
from pathlib import Path
from typing import List, Dict, Any
import psycopg2
from psycopg2.extras import execute_values
import numpy as np
from sentence_transformers import SentenceTransformer
from tqdm import tqdm

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://tzahimoyal@localhost:5432/talbashanai")

# Paths
RAG_DIR = Path(__file__).parent.parent / "data" / "rag"
EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"  # 768 dimensions, good for Hebrew


def estimate_tokens(text: str) -> int:
    """Estimate tokens (rough: 1 token ≈ 4 characters for Hebrew)"""
    return len(text) // 4


def context_aware_chunk(
    text: str,
    max_tokens: int = 300,
    overlap_tokens: int = 75,
    min_chunk_tokens: int = 50
) -> List[Dict[str, Any]]:
    """
    Context-aware chunking with sentence boundaries
    """
    chunks = []
    
    # Clean text
    cleaned_text = re.sub(r'\s+', ' ', text).strip()
    
    # Split into sentences
    sentence_endings = r'[.!?]\s+'
    sentences = [s.strip() for s in re.split(sentence_endings, cleaned_text) if len(s.strip()) > 10]
    
    if not sentences:
        if cleaned_text and estimate_tokens(cleaned_text) >= min_chunk_tokens:
            chunks.append({
                'text': cleaned_text,
                'tokens': estimate_tokens(cleaned_text),
                'start_idx': 0,
                'end_idx': 0
            })
        return chunks
    
    current_chunk = []
    current_tokens = 0
    chunk_start_idx = 0
    
    for i, sentence in enumerate(sentences):
        sentence_tokens = estimate_tokens(sentence)
        
        if current_tokens + sentence_tokens > max_tokens and current_chunk:
            chunk_text = '. '.join(current_chunk)
            chunk_tokens = estimate_tokens(chunk_text)
            
            if chunk_tokens >= min_chunk_tokens:
                chunks.append({
                    'text': chunk_text,
                    'tokens': chunk_tokens,
                    'start_idx': chunk_start_idx,
                    'end_idx': i - 1
                })
            
            # Start new chunk with overlap
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
        chunk_text = '. '.join(current_chunk)
        chunk_tokens = estimate_tokens(chunk_text)
        
        if chunk_tokens >= min_chunk_tokens:
            chunks.append({
                'text': chunk_text,
                'tokens': chunk_tokens,
                'start_idx': chunk_start_idx,
                'end_idx': len(sentences) - 1
            })
    
    return chunks


def analyze_chunk(chunk_text: str, source: str, order: int) -> Dict[str, Any]:
    """Analyze chunk to extract metadata"""
    text = chunk_text.lower()
    words = chunk_text.split()
    
    # Determine chunk type
    chunk_type = 'content'
    
    intro_indicators = ['שלום', 'ברוכים', 'נתחיל', 'היום', 'בשיעור', 'בפרק']
    summary_indicators = ['סיכום', 'לסיכום', 'בסוף', 'לסיום']
    
    if any(ind in text for ind in intro_indicators) and order <= 3:
        chunk_type = 'intro'
    elif any(ind in text for ind in summary_indicators):
        chunk_type = 'summary'
    else:
        common_words = ['זה', 'של', 'את', 'על', 'או', 'אם', 'כי', 'אז', 'גם']
        common_count = sum(1 for w in words if w.lower() in common_words)
        if common_count > len(words) * 0.35:
            chunk_type = 'general'
    
    # Extract topic
    sentences = [s for s in chunk_text.split('.') if len(s.strip()) > 20]
    topic = ''
    if sentences:
        topic = sentences[0][:100].strip()
        if len(topic) < 30 and len(sentences) > 1:
            topic = sentences[1][:100].strip()
    
    # Extract key concepts
    course_concepts = [
        'מעגל התודעה', 'תודעה ראקטיבית', 'תודעה אקטיבית', 'תודעה יצירתית',
        'תת מודע', 'רצון חופשי', 'פחד', 'מציאות', 'שחיקה', 'תקיעות',
        'תודעה', 'מנהיגות תודעתית', 'תיקון', 'הרגל', 'התנגדות'
    ]
    
    key_concepts = []
    for concept in course_concepts:
        if concept.lower() in text:
            key_concepts.append(concept)
            if len(key_concepts) >= 5:
                break
    
    return {
        'source': source,
        'order': order,
        'topic': topic if topic else None,
        'key_concepts': key_concepts if key_concepts else None,
        'word_count': len(words),
        'token_count': estimate_tokens(chunk_text),
        'is_standalone': len(words) > 100 and estimate_tokens(chunk_text) > 50,
        'chunk_type': chunk_type,
        'is_general': chunk_type == 'general'
    }


def process_jsonl_file(file_path: Path) -> List[Dict[str, Any]]:
    """Process a single JSONL file and re-chunk it"""
    all_chunks = []
    
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            
            try:
                old_chunk = json.loads(line)
                source = old_chunk.get('metadata', {}).get('source', file_path.name)
                original_text = old_chunk.get('text', '')
                
                if not original_text or len(original_text.strip()) < 50:
                    continue
                
                # Re-chunk
                new_chunks = context_aware_chunk(original_text, 300, 75, 50)
                
                if not new_chunks:
                    continue
                
                base_id = old_chunk.get('id', '').split('_chunk_')[0] or file_path.stem
                
                for i, chunk_data in enumerate(new_chunks):
                    metadata = analyze_chunk(chunk_data['text'], source, i + 1)
                    new_id = f"{base_id}_improved_chunk_{i+1:03d}"
                    
                    all_chunks.append({
                        'id': new_id,
                        'text': chunk_data['text'],
                        'metadata': metadata
                    })
            except Exception as e:
                print(f"   ⚠️  Error processing line in {file_path.name}: {e}")
                continue
    
    return all_chunks


def index_chunks_to_db(chunks: List[Dict[str, Any]], embed_model: SentenceTransformer, conn):
    """Index chunks to PostgreSQL database with progress tracking"""
    print(f"\n💾 Indexing {len(chunks)} chunks to database...")
    
    cursor = conn.cursor()
    
    # Delete old chunks (all, not just improved)
    print("🗑️  Cleaning old chunks...")
    cursor.execute("DELETE FROM knowledge_chunks")
    conn.commit()
    print("✅ Old chunks deleted")
    
    indexed = 0
    errors = 0
    batch_size = 50
    
    start_time = time.time()
    
    # Process in batches with progress bar
    for i in tqdm(range(0, len(chunks), batch_size), desc="Indexing chunks"):
        batch = chunks[i:i + batch_size]
        
        # Generate embeddings for batch
        batch_texts = [chunk['text'] for chunk in batch]
        embeddings = embed_model.encode(batch_texts, convert_to_numpy=True, show_progress_bar=False)
        
        # Prepare data for bulk insert
        values = []
        for chunk, embedding in zip(batch, embeddings):
            try:
                embedding_str = '[' + ','.join(map(str, embedding.tolist())) + ']'
                
                values.append((
                    chunk['id'],
                    chunk['text'],
                    json.dumps(chunk['metadata']),
                    chunk['metadata']['source'],
                    chunk['metadata']['order'],
                    embedding_str
                ))
            except Exception as e:
                errors += 1
                if errors <= 5:
                    print(f"   ❌ Error preparing {chunk['id']}: {e}")
                continue
        
        # Insert chunks one by one (pgvector needs explicit casting)
        # Use savepoint to handle errors without failing entire batch
        if values:
            batch_errors = 0
            for value in values:
                try:
                    # Use savepoint for each insert to avoid transaction failure
                    cursor.execute("SAVEPOINT sp_insert")
                    cursor.execute("""
                        INSERT INTO knowledge_chunks (id, text, metadata, source, "order", embedding)
                        VALUES (%s, %s, %s::jsonb, %s, %s, %s::vector)
                        ON CONFLICT (id) DO UPDATE SET
                            text = EXCLUDED.text,
                            metadata = EXCLUDED.metadata,
                            source = EXCLUDED.source,
                            "order" = EXCLUDED."order",
                            embedding = EXCLUDED.embedding
                    """, value)
                    cursor.execute("RELEASE SAVEPOINT sp_insert")
                    indexed += 1
                except Exception as e:
                    cursor.execute("ROLLBACK TO SAVEPOINT sp_insert")
                    batch_errors += 1
                    errors += 1
                    if errors <= 5:
                        print(f"   ❌ Error inserting chunk {value[0][:60] if value else 'unknown'}...: {str(e)[:100]}")
            
            # Commit after each batch
            try:
                conn.commit()
            except Exception as e:
                conn.rollback()
                print(f"   ❌ Commit error: {e}")
                errors += len(values) - batch_errors
                indexed -= (len(values) - batch_errors)
        
        # Show progress every 500 chunks
        if (i + batch_size) % 500 == 0 or i + batch_size >= len(chunks):
            elapsed = time.time() - start_time
            rate = indexed / elapsed if elapsed > 0 else 0
            remaining = (len(chunks) - indexed) / rate if rate > 0 else 0
            
            print(f"\n📊 Progress: {indexed}/{len(chunks)} ({indexed/len(chunks)*100:.1f}%)")
            print(f"   ⚡ Rate: {rate:.1f} chunks/sec")
            print(f"   ⏱️  ETA: {int(remaining//60)}m {int(remaining%60)}s")
            if errors > 0:
                print(f"   ❌ Errors: {errors}")
    
    cursor.close()
    
    total_time = time.time() - start_time
    avg_rate = indexed / total_time if total_time > 0 else 0
    
    print("\n" + "=" * 80)
    print("✅ Indexing Complete!")
    print("=" * 80)
    print(f"📊 Statistics:")
    print(f"   Total chunks: {len(chunks)}")
    print(f"   ✅ Indexed: {indexed}")
    print(f"   ❌ Errors: {errors}")
    print(f"   ⏱️  Total time: {int(total_time//60)}m {int(total_time%60)}s")
    print(f"   ⚡ Average rate: {avg_rate:.2f} chunks/sec")
    print("=" * 80)


def main():
    print("🚀 Rebuilding RAG index with Python (more efficient!)")
    print("=" * 80)
    print("📋 Strategy:")
    print("  - Context-aware chunking: 200-400 tokens (using 300)")
    print("  - Overlap: 50-100 tokens (using 75)")
    print("  - Better metadata extraction")
    print("  - Efficient batch processing")
    print("=" * 80)
    
    # Find all JSONL files
    jsonl_files = list(RAG_DIR.glob("*.jsonl"))
    jsonl_files = [f for f in jsonl_files if not f.name.startswith('.')]
    
    print(f"\n📁 Found {len(jsonl_files)} JSONL files")
    print(f"\n📝 Processing files with improved chunking...")
    
    all_chunks = []
    file_stats = []
    
    for i, file_path in enumerate(jsonl_files, 1):
        try:
            # Count original chunks
            with open(file_path, 'r', encoding='utf-8') as f:
                original_count = sum(1 for line in f if line.strip())
            
            chunks = process_jsonl_file(file_path)
            all_chunks.extend(chunks)
            
            file_stats.append({
                'file': file_path.name,
                'original': original_count,
                'improved': len(chunks)
            })
            
            if i % 10 == 0 or i == 1 or i == len(jsonl_files):
                print(f"\n[{i}/{len(jsonl_files)}] Processed: {file_path.name}")
                print(f"   Original: {original_count} chunks → Improved: {len(chunks)} chunks")
        except Exception as e:
            print(f"\n❌ Error processing {file_path.name}: {e}")
    
    # Statistics
    total_original = sum(s['original'] for s in file_stats)
    total_improved = len(all_chunks)
    
    print("\n" + "=" * 80)
    print("📊 Chunking Statistics:")
    print("=" * 80)
    print(f"Total original chunks: {total_original}")
    print(f"Total improved chunks: {total_improved}")
    print(f"Change: {total_improved - total_original:+d} ({(total_improved/total_original - 1)*100:+.1f}%)")
    
    # Load embedding model
    print(f"\n🔄 Loading embedding model: {EMBEDDING_MODEL}")
    embed_model = SentenceTransformer(EMBEDDING_MODEL)
    print("✅ Embedding model loaded")
    
    # Connect to database
    print(f"\n🔌 Connecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    print("✅ Connected to database")
    
    # Index chunks
    index_chunks_to_db(all_chunks, embed_model, conn)
    
    conn.close()
    print("\n✨ Rebuild complete!")


if __name__ == "__main__":
    main()

