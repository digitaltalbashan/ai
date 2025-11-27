#!/usr/bin/env python3
"""
Convert ODT and DOTX files to Markdown
Uses odfpy to extract text from ODT files
"""
import os
import sys
from pathlib import Path
from odf.opendocument import load
from odf.text import P
from odf import text
import re

BASE_DIR = Path(__file__).parent.parent
WORD_DOCS_DIR = BASE_DIR / "data" / "word_docs"
MD_OUTPUT_DIR = BASE_DIR / "data" / "word_docs_md"

def extract_text_from_odt(odt_path: Path) -> str:
    """Extract text from ODT file"""
    try:
        doc = load(str(odt_path))
        paragraphs = []
        
        # Extract all paragraphs
        for paragraph in doc.getElementsByType(text.P):
            text_content = []
            for node in paragraph.childNodes:
                if node.nodeType == 3:  # Text node
                    text_content.append(node.data)
                elif hasattr(node, 'data'):
                    text_content.append(node.data)
            
            para_text = ''.join(text_content).strip()
            if para_text:
                paragraphs.append(para_text)
        
        return '\n\n'.join(paragraphs)
    except Exception as e:
        raise Exception(f"Failed to extract text from ODT: {e}")

def convert_odt_to_md(input_path: Path, output_path: Path) -> dict:
    """Convert ODT/DOTX file to Markdown"""
    try:
        # Extract text
        text_content = extract_text_from_odt(input_path)
        
        if not text_content.strip():
            return {
                "status": "skipped",
                "input": str(input_path),
                "reason": "Empty file"
            }
        
        # Convert to basic markdown (preserve structure)
        # Simple conversion - keep paragraphs as-is
        md_content = text_content
        
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
    print("🚀 המרת קבצי ODT/DOTX ל-Markdown")
    print("=" * 80)
    
    # Try Docling for DOTX files first
    from docling.document_converter import DocumentConverter
    docling_converter = DocumentConverter()
    
    # Find all ODT and DOTX files
    odt_files = list(WORD_DOCS_DIR.rglob("*.odt"))
    dotx_files = list(WORD_DOCS_DIR.rglob("*.dotx"))
    all_files = odt_files + dotx_files
    
    if not all_files:
        print(f"❌ לא נמצאו קבצי ODT/DOTX ב-{WORD_DOCS_DIR}")
        return
    
    print(f"📁 נמצאו {len(all_files)} קבצי ODT/DOTX")
    print(f"📂 תיקיית פלט: {MD_OUTPUT_DIR}\n")
    
    # Create output directory
    MD_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    results = []
    success_count = 0
    error_count = 0
    skipped_count = 0
    
    for i, doc_path in enumerate(all_files, 1):
        # Calculate relative path and output path
        rel_path = doc_path.relative_to(WORD_DOCS_DIR)
        # Change extension to .md
        md_rel_path = rel_path.with_suffix('.md')
        md_output_path = MD_OUTPUT_DIR / md_rel_path
        
        # Skip if already exists (from DOCX conversion)
        if md_output_path.exists():
            print(f"[{i}/{len(all_files)}] דולג (כבר קיים): {rel_path}")
            skipped_count += 1
            continue
        
        print(f"[{i}/{len(all_files)}] מעבד: {rel_path}")
        
        # Try Docling for DOTX files
        if doc_path.suffix.lower() == '.dotx':
            try:
                result_docling = docling_converter.convert(doc_path)
                md_content = result_docling.document.export_to_markdown()
                md_output_path.parent.mkdir(parents=True, exist_ok=True)
                with open(md_output_path, 'w', encoding='utf-8') as f:
                    f.write(md_content)
                result = {
                    "status": "success",
                    "input": str(doc_path),
                    "output": str(md_output_path),
                    "size": len(md_content)
                }
            except Exception as e:
                result = {
                    "status": "error",
                    "input": str(doc_path),
                    "error": f"Docling failed: {str(e)}"
                }
        else:
            result = convert_odt_to_md(doc_path, md_output_path)
        
        results.append(result)
        
        if result["status"] == "success":
            success_count += 1
            size_kb = result["size"] / 1024
            print(f"  ✅ נוצר: {md_rel_path} ({size_kb:.1f} KB)")
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
    print(f"📁 סה\"כ קבצים: {len(all_files)}")
    
    print("\n✅ המרה הושלמה!")

if __name__ == "__main__":
    main()

