#!/usr/bin/env python3
"""
Convert all Word documents (DOCX, ODT, DOTX) to Markdown using Docling
"""
import os
import sys
from pathlib import Path
from docling.document_converter import DocumentConverter
from docling.datamodel.base_models import OutputFormat
import json

BASE_DIR = Path(__file__).parent.parent
WORD_DOCS_DIR = BASE_DIR / "data" / "word_docs"
MD_OUTPUT_DIR = BASE_DIR / "data" / "word_docs_md"

def convert_file_to_md(input_path: Path, output_path: Path, converter: DocumentConverter) -> dict:
    """Convert a single file to Markdown"""
    try:
        # Convert document
        result = converter.convert(input_path)
        
        # Get markdown content
        md_content = result.document.export_to_markdown()
        
        # Ensure output directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write markdown file
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(md_content)
        
        return {
            "status": "success",
            "input": str(input_path),
            "output": str(output_path),
            "size": len(md_content)
        }
    except Exception as e:
        return {
            "status": "error",
            "input": str(input_path),
            "error": str(e)
        }

def main():
    print("🚀 המרת קבצי Word ל-Markdown עם Docling")
    print("=" * 80)
    
    # Initialize Docling converter
    print("📦 מאתחל Docling converter...")
    converter = DocumentConverter()
    print("✅ Docling מוכן\n")
    
    # Find all document files
    doc_extensions = ['.docx', '.odt', '.dotx']
    doc_files = []
    for ext in doc_extensions:
        doc_files.extend(WORD_DOCS_DIR.rglob(f"*{ext}"))
    
    if not doc_files:
        print(f"❌ לא נמצאו קבצים להמרה ב-{WORD_DOCS_DIR}")
        return
    
    print(f"📁 נמצאו {len(doc_files)} קבצים להמרה")
    print(f"📂 תיקיית פלט: {MD_OUTPUT_DIR}\n")
    
    # Create output directory
    MD_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    results = []
    success_count = 0
    error_count = 0
    
    for i, doc_path in enumerate(doc_files, 1):
        # Calculate relative path and output path
        rel_path = doc_path.relative_to(WORD_DOCS_DIR)
        # Change extension to .md
        md_rel_path = rel_path.with_suffix('.md')
        md_output_path = MD_OUTPUT_DIR / md_rel_path
        
        print(f"[{i}/{len(doc_files)}] מעבד: {rel_path}")
        
        result = convert_file_to_md(doc_path, md_output_path, converter)
        results.append(result)
        
        if result["status"] == "success":
            success_count += 1
            size_kb = result["size"] / 1024
            print(f"  ✅ נוצר: {md_rel_path} ({size_kb:.1f} KB)")
        else:
            error_count += 1
            print(f"  ❌ שגיאה: {result.get('error', 'unknown')}")
    
    # Summary
    print("\n" + "=" * 80)
    print("📊 סיכום:")
    print("=" * 80)
    print(f"✅ הצליח: {success_count}")
    print(f"❌ שגיאות: {error_count}")
    print(f"📁 סה\"כ קבצים: {len(doc_files)}")
    
    # Save results to JSON
    results_file = MD_OUTPUT_DIR / "conversion_results.json"
    with open(results_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n💾 תוצאות נשמרו ב-{results_file}")
    
    print("\n✅ המרה הושלמה!")

if __name__ == "__main__":
    main()

