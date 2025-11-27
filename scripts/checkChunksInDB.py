#!/usr/bin/env python3
"""
Quick check if chunks exist in database
"""
import os
import sys
import psycopg2

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Get database URL
database_url = os.getenv("DATABASE_URL", "postgresql://tzahimoyal@localhost:5432/talbashanai")
# Remove ?schema=... from URL if present
if "?schema=" in database_url:
    database_url = database_url.split("?schema=")[0]

print("🔍 Checking database for chunks...")
print("=" * 100)

try:
    conn = psycopg2.connect(database_url)
    cursor = conn.cursor()
    
    # Check if knowledge_chunks table exists
    cursor.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'knowledge_chunks'
        );
    """)
    table_exists = cursor.fetchone()[0]
    
    if not table_exists:
        print("❌ Table 'knowledge_chunks' does not exist!")
        print("   You need to index knowledge chunks first.")
        sys.exit(1)
    
    print("✅ Table 'knowledge_chunks' exists")
    
    # Count total chunks
    cursor.execute("SELECT COUNT(*) FROM knowledge_chunks;")
    total_chunks = cursor.fetchone()[0]
    print(f"📊 Total chunks in database: {total_chunks}")
    
    if total_chunks == 0:
        print("\n⚠️  Database is empty!")
        print("   You need to index knowledge chunks first.")
        print("   Run: pnpm rag:index")
        sys.exit(1)
    
    # Check if chunks have embeddings
    cursor.execute("""
        SELECT COUNT(*) 
        FROM knowledge_chunks 
        WHERE embedding IS NOT NULL;
    """)
    chunks_with_embeddings = cursor.fetchone()[0]
    print(f"📊 Chunks with embeddings: {chunks_with_embeddings}")
    
    # Show sample chunk (check what columns exist)
    cursor.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'knowledge_chunks';
    """)
    columns = [row[0] for row in cursor.fetchall()]
    print(f"\n📋 Available columns: {', '.join(columns)}")
    
    # Build query based on available columns
    select_cols = ["id"]
    if "source" in columns:
        select_cols.append("source")
    if "chunk_index" in columns:
        select_cols.append("chunk_index")
    elif "order" in columns:
        select_cols.append('"order" as chunk_index')
    select_cols.append("LENGTH(text) as text_length")
    select_cols.append("embedding IS NOT NULL as has_embedding")
    
    cursor.execute(f"""
        SELECT {', '.join(select_cols)}
        FROM knowledge_chunks 
        LIMIT 5;
    """)
    samples = cursor.fetchall()
    
    print(f"\n📋 Sample chunks (first 5):")
    for sample in samples:
        chunk_id, source, chunk_idx, text_len, has_emb = sample
        print(f"   - {source} (chunk {chunk_idx}): {text_len} chars, embedding: {'✅' if has_emb else '❌'}")
    
    cursor.close()
    conn.close()
    
    print("\n" + "=" * 100)
    print("✅ Database check complete!")
    print(f"   Ready for RAG queries with {total_chunks} chunks")
    print("=" * 100)
    
except psycopg2.Error as e:
    print(f"\n❌ Database error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"\n❌ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

