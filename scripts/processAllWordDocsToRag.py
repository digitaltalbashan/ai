#!/usr/bin/env python3
"""
Process all Word documents from data/word_docs/ and create JSONL RAG files
"""
import os
import json
from pathlib import Path
from docx import Document
from typing import List, Dict
import re

BASE_DIR = Path(__file__).parent.parent
WORD_DOCS_DIR = BASE_DIR / "data" / "word_docs"
RAG_OUTPUT_DIR = BASE_DIR / "data" / "rag"

def clean_text(text: str) -> str:
    """Clean text from transcription artifacts"""
    cleaned = text
    
    # Remove excessive filler words
    cleaned = re.sub(r'\b(אמ|א|אז|ו|ה|ל)\s+', '', cleaned)
    
    # Remove repeated words
    cleaned = re.sub(r'\b(\w+)\s+\1\b', r'\1', cleaned)
    
    # Clean up multiple spaces
    cleaned = re.sub(r'\s+', ' ', cleaned)
    
    # Clean up line breaks
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    
    return cleaned.strip()

def split_into_chunks(text: str, max_length: int = 1500, overlap: int = 200) -> List[str]:
    """Split text into chunks with overlap"""
    chunks = []
    start = 0
    length = len(text)
    
    while start < length:
        end = start + max_length
        
        # Try to break at sentence boundary
        if end < length:
            # Look for sentence endings
            sentence_end = max(
                text.rfind('.', start, end),
                text.rfind('!', start, end),
                text.rfind('?', start, end),
                text.rfind('\n', start, end)
            )
            if sentence_end > start + max_length * 0.7:  # At least 70% of max_length
                end = sentence_end + 1
        
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        
        start = end - overlap
        if start < 0:
            break
    
    return chunks

def extract_topic(text: str) -> str:
    """Extract topic from text (first sentence or key phrase)"""
    # Take first meaningful sentence
    sentences = re.split(r'[.!?]\s+', text)
    for sentence in sentences:
        if len(sentence.strip()) > 20:
            return sentence.strip()[:100]
    return text[:100] if text else ""

def extract_key_concepts(text: str) -> List[str]:
    """Extract key concepts from text"""
    concepts = []
    text_lower = text.lower()
    
    # Common course concepts
    course_terms = [
        'מעגל התודעה', 'תודעה ראקטיבית', 'תודעה אקטיבית', 'תודעה יצירתית',
        'רצון חופשי', 'תת מודע', 'פער', 'מציאות', 'תודעה',
        'R', 'A', 'C', 'reacting', 'acting', 'creating'
    ]
    
    for term in course_terms:
        if term.lower() in text_lower:
            concepts.append(term)
    
    return concepts[:5]  # Limit to 5 concepts

def generate_summary(text: str) -> str:
    """Generate simple summary (first 200 chars)"""
    if len(text) <= 200:
        return text
    return text[:200] + '...'

def process_docx_file(docx_path: Path, output_dir: Path) -> Dict:
    """Process a single DOCX file and create JSONL"""
    try:
        # Read DOCX
        doc = Document(docx_path)
        text = "\n".join([p.text for p in doc.paragraphs if p.text.strip()])
        
        if not text.strip():
            return {"status": "skipped", "reason": "empty"}
        
        # Clean text
        cleaned_text = clean_text(text)
        
        # Split into chunks
        chunks = split_into_chunks(cleaned_text, max_length=1500, overlap=200)
        
        if not chunks:
            return {"status": "skipped", "reason": "no chunks"}
        
        # Create output filename
        rel_path = docx_path.relative_to(WORD_DOCS_DIR)
        # Replace path separators and remove extension
        safe_name = str(rel_path).replace('/', '_').replace('\\', '_').replace('.docx', '')
        output_file = output_dir / f"{safe_name}_rag.jsonl"
        
        # Process chunks
        processed_chunks = []
        for i, chunk_text in enumerate(chunks):
            chunk_id = f"{safe_name}_chunk_{i+1:03d}"
            word_count = len(chunk_text.split())
            
            chunk_data = {
                "id": chunk_id,
                "text": chunk_text,
                "summary": generate_summary(chunk_text),
                "metadata": {
                    "source": str(rel_path),
                    "order": i + 1,
                    "title": extract_topic(chunk_text),
                    "language": "he",
                    "tags": [safe_name.split('_')[0] if '_' in safe_name else safe_name],
                    "topic": extract_topic(chunk_text),
                    "key_concepts": extract_key_concepts(chunk_text),
                    "word_count": word_count,
                    "is_standalone": word_count > 100
                }
            }
            processed_chunks.append(chunk_data)
        
        # Write JSONL file
        with open(output_file, 'w', encoding='utf-8') as f:
            for chunk in processed_chunks:
                f.write(json.dumps(chunk, ensure_ascii=False) + '\n')
        
        return {
            "status": "success",
            "file": str(output_file),
            "chunks": len(processed_chunks),
            "source": str(rel_path)
        }
        
    except Exception as e:
        return {"status": "error", "file": str(docx_path), "error": str(e)}

def main():
    print("🚀 מעבד את כל קבצי ה-Word ל-JSONL RAG...")
    print("=" * 80)
    
    # Ensure output directory exists
    RAG_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Find all DOCX files
    docx_files = list(WORD_DOCS_DIR.rglob("*.docx"))
    
    if not docx_files:
        print(f"❌ לא נמצאו קבצי .docx ב-{WORD_DOCS_DIR}")
        return
    
    print(f"\n📁 נמצאו {len(docx_files)} קבצי Word")
    print(f"📂 תיקיית פלט: {RAG_OUTPUT_DIR}\n")
    
    results = []
    success_count = 0
    error_count = 0
    skipped_count = 0
    
    for i, docx_path in enumerate(docx_files, 1):
        rel_path = docx_path.relative_to(WORD_DOCS_DIR)
        print(f"[{i}/{len(docx_files)}] מעבד: {rel_path}")
        
        result = process_docx_file(docx_path, RAG_OUTPUT_DIR)
        results.append(result)
        
        if result["status"] == "success":
            success_count += 1
            print(f"  ✅ נוצר: {result['chunks']} chunks -> {Path(result['file']).name}")
        elif result["status"] == "skipped":
            skipped_count += 1
            print(f"  ⚠️  דולג: {result.get('reason', 'unknown')}")
        else:
            error_count += 1
            print(f"  ❌ שגיאה: {result.get('error', 'unknown')}")
    
    # Summary
    print("\n" + "=" * 80)
    print("📊 סיכום:")
    print("=" * 80)
    print(f"✅ הצליח: {success_count}")
    print(f"⚠️  דולג: {skipped_count}")
    print(f"❌ שגיאות: {error_count}")
    print(f"📁 סה\"כ קבצים: {len(docx_files)}")
    
    # Count total chunks
    total_chunks = sum(r.get("chunks", 0) for r in results if r["status"] == "success")
    print(f"📝 סה\"כ chunks שנוצרו: {total_chunks:,}")
    
    # List created files
    created_files = [r["file"] for r in results if r["status"] == "success"]
    if created_files:
        print(f"\n📋 קבצים שנוצרו ({len(created_files)}):")
        for f in sorted(created_files)[:10]:
            print(f"  - {Path(f).name}")
        if len(created_files) > 10:
            print(f"  ... ועוד {len(created_files) - 10} קבצים")

if __name__ == "__main__":
    main()

