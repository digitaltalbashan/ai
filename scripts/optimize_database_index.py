#!/usr/bin/env python3
"""
Optimize the vector index for better performance
"""
import psycopg2
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://tzahimoyal@localhost:5432/talbashanai")

def optimize_index():
    """Rebuild the vector index with optimal parameters"""
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()
    
    try:
        # Get table size
        cursor.execute('SELECT COUNT(*) FROM knowledge_chunks')
        count = cursor.fetchone()[0]
        print(f"📊 מספר chunks בטבלה: {count}")
        
        # Calculate optimal lists parameter
        # For ivfflat: lists should be rows / 1000 (minimum 10)
        optimal_lists = max(10, count // 1000)
        print(f"💡 lists מומלץ: {optimal_lists}")
        
        # Check current index
        cursor.execute('''
            SELECT indexname, indexdef
            FROM pg_indexes 
            WHERE tablename = 'knowledge_chunks' AND indexname LIKE '%embedding%'
        ''')
        current = cursor.fetchone()
        
        if current:
            print(f"\n📊 אינדקס נוכחי: {current[0]}")
            if 'lists=' in current[1]:
                current_lists = int(current[1].split('lists=')[1].split(')')[0].strip("'"))
                print(f"   lists נוכחי: {current_lists}")
                
                if current_lists < optimal_lists:
                    print(f"\n⚠️  האינדקס לא מותאם! בונה מחדש עם lists={optimal_lists}...")
                    
                    # Drop old index
                    cursor.execute('DROP INDEX IF EXISTS knowledge_chunks_embedding_idx')
                    conn.commit()
                    print("✅ אינדקס ישן נמחק")
                    
                    # Create new index with optimal parameters
                    cursor.execute(f'''
                        CREATE INDEX knowledge_chunks_embedding_idx 
                        ON knowledge_chunks 
                        USING ivfflat (embedding vector_cosine_ops) 
                        WITH (lists={optimal_lists})
                    ''')
                    conn.commit()
                    print(f"✅ אינדקס חדש נוצר עם lists={optimal_lists}")
                else:
                    print("✅ האינדקס כבר מותאם")
            else:
                print("⚠️  לא נמצא lists parameter - בונה אינדקס חדש...")
                cursor.execute('DROP INDEX IF EXISTS knowledge_chunks_embedding_idx')
                cursor.execute(f'''
                    CREATE INDEX knowledge_chunks_embedding_idx 
                    ON knowledge_chunks 
                    USING ivfflat (embedding vector_cosine_ops) 
                    WITH (lists={optimal_lists})
                ''')
                conn.commit()
                print(f"✅ אינדקס חדש נוצר")
        else:
            print("⚠️  לא נמצא אינדקס - יוצר חדש...")
            cursor.execute(f'''
                CREATE INDEX knowledge_chunks_embedding_idx 
                ON knowledge_chunks 
                USING ivfflat (embedding vector_cosine_ops) 
                WITH (lists={optimal_lists})
            ''')
            conn.commit()
            print(f"✅ אינדקס נוצר")
        
        # Analyze table for better query planning
        print("\n📊 מריץ ANALYZE על הטבלה...")
        cursor.execute('ANALYZE knowledge_chunks')
        conn.commit()
        print("✅ ANALYZE הושלם")
        
    except Exception as e:
        print(f"❌ שגיאה: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    print("🚀 אופטימיזציה של אינדקס ה-vector")
    print("=" * 80)
    optimize_index()
    print("=" * 80)
    print("✅ סיום!")

