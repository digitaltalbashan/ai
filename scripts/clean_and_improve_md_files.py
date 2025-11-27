#!/usr/bin/env python3
"""
Clean and improve Markdown files converted from Word documents
"""
import os
import re
from pathlib import Path
from typing import List, Dict

BASE_DIR = Path(__file__).parent.parent
MD_INPUT_DIR = BASE_DIR / "data" / "word_docs_md"
MD_OUTPUT_DIR = BASE_DIR / "data" / "word_docs_md_cleaned"

def clean_text(text: str) -> str:
    """Clean and improve text content"""
    cleaned = text
    
    # Remove excessive whitespace
    cleaned = re.sub(r'[ \t]+', ' ', cleaned)
    
    # Remove multiple newlines (keep max 2)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    
    # Fix common transcription artifacts
    # Remove filler words that appear alone
    cleaned = re.sub(r'\b(אמ|א|אז|ו|ה|ל)\s+', '', cleaned)
    
    # Remove repeated words (but keep intentional repetition)
    cleaned = re.sub(r'\b(\w+)\s+\1\s+\1\b', r'\1', cleaned)
    
    # Fix common Hebrew transcription errors
    replacements = {
        'אוקיי': 'אוקיי',
        'אוקי': 'אוקיי',
        'כן כן כן': 'כן',
        'כן כן': 'כן',
        'לא לא לא': 'לא',
        'לא לא': 'לא',
    }
    for old, new in replacements.items():
        cleaned = cleaned.replace(old, new)
    
    # Remove timestamps in brackets like [35:28]
    cleaned = re.sub(r'\[\d+:\d+\]', '', cleaned)
    
    # Remove speaker labels like "טל בשן - המרצה:"
    cleaned = re.sub(r'^[^:]+:\s*', '', cleaned, flags=re.MULTILINE)
    
    # Fix spacing around punctuation
    cleaned = re.sub(r'\s+([.,;:!?])', r'\1', cleaned)
    cleaned = re.sub(r'([.,;:!?])([^\s])', r'\1 \2', cleaned)
    
    # Remove empty lines at start/end
    cleaned = cleaned.strip()
    
    return cleaned

def improve_markdown_structure(content: str) -> str:
    """Improve Markdown structure and formatting"""
    lines = content.split('\n')
    improved_lines = []
    prev_line_empty = False
    
    for line in lines:
        line = line.strip()
        
        # Skip completely empty lines if previous was also empty
        if not line:
            if not prev_line_empty:
                improved_lines.append('')
                prev_line_empty = True
            continue
        
        prev_line_empty = False
        
        # Detect and format headings
        if line.startswith('#'):
            # Ensure proper spacing after heading
            if not line.endswith(' '):
                line = line + ' '
            improved_lines.append(line)
            continue
        
        # Detect list items
        if re.match(r'^[-*+]\s+', line) or re.match(r'^\d+\.\s+', line):
            improved_lines.append(line)
            continue
        
        # Regular paragraph
        improved_lines.append(line)
    
    return '\n'.join(improved_lines)

def remove_artifacts(content: str) -> str:
    """Remove transcription and conversion artifacts"""
    cleaned = content
    
    # Remove common transcription markers
    artifacts = [
        r'\[.*?timecode.*?\]',
        r'\[.*?timestamp.*?\]',
        r'\(.*?pause.*?\)',
        r'\(.*?silence.*?\)',
        r'\[.*?background.*?\]',
    ]
    
    for pattern in artifacts:
        cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE)
    
    # Remove excessive punctuation
    cleaned = re.sub(r'[.]{4,}', '...', cleaned)
    cleaned = re.sub(r'[!]{3,}', '!', cleaned)
    cleaned = re.sub(r'[?]{3,}', '?', cleaned)
    
    return cleaned

def fix_hebrew_encoding_issues(content: str) -> str:
    """Fix common Hebrew encoding and formatting issues"""
    cleaned = content
    
    # Fix common encoding issues
    fixes = {
        'Ã': '',
        'â€': '',
        'â€™': "'",
        'â€œ': '"',
        'â€': '"',
    }
    
    for old, new in fixes.items():
        cleaned = cleaned.replace(old, new)
    
    # Ensure proper RTL handling
    # Add zero-width characters if needed for proper RTL display
    
    return cleaned

def process_md_file(input_path: Path, output_path: Path) -> Dict:
    """Process a single Markdown file"""
    try:
        # Read original content
        with open(input_path, 'r', encoding='utf-8') as f:
            original_content = f.read()
        
        # Apply cleaning and improvements
        cleaned = clean_text(original_content)
        cleaned = remove_artifacts(cleaned)
        cleaned = fix_hebrew_encoding_issues(cleaned)
        cleaned = improve_markdown_structure(cleaned)
        
        # Ensure output directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write cleaned content
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(cleaned)
        
        original_size = len(original_content)
        cleaned_size = len(cleaned)
        reduction = ((original_size - cleaned_size) / original_size * 100) if original_size > 0 else 0
        
        return {
            "status": "success",
            "input": str(input_path),
            "output": str(output_path),
            "original_size": original_size,
            "cleaned_size": cleaned_size,
            "reduction_percent": round(reduction, 1)
        }
    except Exception as e:
        return {
            "status": "error",
            "input": str(input_path),
            "error": str(e)
        }

def main():
    print("🧹 ניקוי ושיפור קבצי Markdown")
    print("=" * 80)
    
    if not MD_INPUT_DIR.exists():
        print(f"❌ תיקיית קלט לא קיימת: {MD_INPUT_DIR}")
        print("   הרץ קודם את convert_word_docs_to_md.py")
        return
    
    # Find all markdown files
    md_files = list(MD_INPUT_DIR.rglob("*.md"))
    
    if not md_files:
        print(f"❌ לא נמצאו קבצי Markdown ב-{MD_INPUT_DIR}")
        return
    
    print(f"📁 נמצאו {len(md_files)} קבצי Markdown")
    print(f"📂 תיקיית פלט: {MD_OUTPUT_DIR}\n")
    
    # Create output directory
    MD_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    results = []
    success_count = 0
    error_count = 0
    total_reduction = 0
    
    for i, md_path in enumerate(md_files, 1):
        # Calculate relative path
        rel_path = md_path.relative_to(MD_INPUT_DIR)
        output_path = MD_OUTPUT_DIR / rel_path
        
        print(f"[{i}/{len(md_files)}] מעבד: {rel_path}")
        
        result = process_md_file(md_path, output_path)
        results.append(result)
        
        if result["status"] == "success":
            success_count += 1
            reduction = result.get("reduction_percent", 0)
            total_reduction += reduction
            print(f"  ✅ נוצר: {rel_path} (קטן ב-{reduction}%)")
        else:
            error_count += 1
            print(f"  ❌ שגיאה: {result.get('error', 'unknown')}")
    
    # Summary
    print("\n" + "=" * 80)
    print("📊 סיכום:")
    print("=" * 80)
    print(f"✅ הצליח: {success_count}")
    print(f"❌ שגיאות: {error_count}")
    print(f"📁 סה\"כ קבצים: {len(md_files)}")
    if success_count > 0:
        avg_reduction = total_reduction / success_count
        print(f"📉 הקטנה ממוצעת: {avg_reduction:.1f}%")
    
    print("\n✅ ניקוי ושיפור הושלמו!")
    print(f"📂 קבצים משופרים נמצאים ב-{MD_OUTPUT_DIR}")

if __name__ == "__main__":
    main()

