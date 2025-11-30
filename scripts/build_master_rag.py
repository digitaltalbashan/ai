#!/usr/bin/env python3
"""
MASTER RAG PACKAGE BUILDER
Creates optimized RAG knowledge base from all source files
"""
import os
import sys
import json
import re
import hashlib
from pathlib import Path
from typing import List, Dict, Any, Set
import unicodedata

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Try to import document processing libraries
try:
    from docx import Document
    HAS_DOCX = True
except ImportError:
    HAS_DOCX = False
    print("⚠️  python-docx not installed. Install with: pip install python-docx")

try:
    import PyPDF2
    HAS_PDF = True
except ImportError:
    HAS_PDF = False
    print("⚠️  PyPDF2 not installed. Install with: pip install PyPDF2")

try:
    from odf import text, teletype
    from odf.opendocument import load
    HAS_ODT = True
except ImportError:
    HAS_ODT = False
    print("⚠️  odfpy not installed. Install with: pip install odfpy")

SOURCE_DIR = project_root / "data" / "source"
OUTPUT_DIR = project_root / "master_rag"
CHUNKS_DIR = OUTPUT_DIR / "chunks"
METADATA_DIR = OUTPUT_DIR / "metadata"
TEMPLATES_DIR = OUTPUT_DIR / "templates"
INDEX_DIR = OUTPUT_DIR / "index"

MIN_CHUNK_WORDS = 150
MAX_CHUNK_WORDS = 350
MAX_CHUNK_CHARS = 2000
MAX_SUMMARY_CHARS = 180
TARGET_CHUNKS = 1200
MAX_CHUNKS = 2000


def normalize_hebrew(text: str) -> str:
    """Normalize Hebrew text (UTF-8, NFKC)"""
    # NFKC normalization
    text = unicodedata.normalize('NFKC', text)
    # Remove zero-width characters
    text = re.sub(r'[\u200b-\u200f\u202a-\u202e]', '', text)
    return text.strip()


def clean_text(text: str) -> str:
    """Remove duplicates, repeated paragraphs, boilerplate, formatting noise"""
    lines = text.split('\n')
    seen_lines = set()
    cleaned_lines = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Skip very short lines (likely formatting)
        if len(line) < 3:
            continue
        # Skip common boilerplate
        if any(skip in line.lower() for skip in ['page', 'עמוד', '©', 'כל הזכויות']):
            continue
        # Normalize and deduplicate
        line_normalized = normalize_hebrew(line)
        if line_normalized and line_normalized not in seen_lines:
            seen_lines.add(line_normalized)
            cleaned_lines.append(line_normalized)
    
    return '\n'.join(cleaned_lines)


def read_docx(filepath: Path) -> str:
    """Read .docx file"""
    if not HAS_DOCX:
        return ""
    try:
        doc = Document(filepath)
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return '\n'.join(paragraphs)
    except Exception as e:
        print(f"   ⚠️  Error reading DOCX {filepath.name}: {e}")
        return ""


def read_pdf(filepath: Path) -> str:
    """Read .pdf file"""
    if not HAS_PDF:
        return ""
    try:
        text_content = []
        with open(filepath, 'rb') as f:
            pdf_reader = PyPDF2.PdfReader(f)
            for page in pdf_reader.pages:
                text_content.append(page.extract_text())
        return '\n'.join(text_content)
    except Exception as e:
        print(f"   ⚠️  Error reading PDF {filepath.name}: {e}")
        return ""


def read_odt(filepath: Path) -> str:
    """Read .odt file"""
    if not HAS_ODT:
        return ""
    try:
        doc = load(filepath)
        paragraphs = []
        for para in doc.getElementsByType(text.P):
            para_text = teletype.extractText(para)
            if para_text.strip():
                paragraphs.append(para_text)
        return '\n'.join(paragraphs)
    except Exception as e:
        print(f"   ⚠️  Error reading ODT {filepath.name}: {e}")
        return ""


def read_txt(filepath: Path) -> str:
    """Read .txt file"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        print(f"   ⚠️  Error reading TXT {filepath.name}: {e}")
        return ""


def read_markdown(filepath: Path) -> str:
    """Read .md file"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        print(f"   ⚠️  Error reading MD {filepath.name}: {e}")
        return ""


def load_all_source_files() -> str:
    """Load all source files recursively and merge into unified corpus"""
    print("📂 Scanning source files...")
    
    all_texts = []
    file_count = 0
    
    for root, dirs, files in os.walk(SOURCE_DIR):
        for file in files:
            if file.startswith('.'):
                continue
            
            filepath = Path(root) / file
            ext = filepath.suffix.lower()
            
            text_content = ""
            if ext == '.docx':
                text_content = read_docx(filepath)
            elif ext == '.pdf':
                text_content = read_pdf(filepath)
            elif ext in ['.odt', '.dotx']:
                text_content = read_odt(filepath)
            elif ext == '.txt':
                text_content = read_txt(filepath)
            elif ext in ['.md', '.markdown']:
                text_content = read_markdown(filepath)
            elif ext == '.json':
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        text_content = json.dumps(data, ensure_ascii=False)
                except:
                    pass
            
            if text_content:
                all_texts.append(text_content)
                file_count += 1
                print(f"   ✅ Loaded: {filepath.relative_to(SOURCE_DIR)}")
    
    print(f"📊 Loaded {file_count} files")
    
    # Merge and clean
    unified_text = '\n\n'.join(all_texts)
    unified_text = clean_text(unified_text)
    unified_text = normalize_hebrew(unified_text)
    
    print(f"📝 Unified corpus: {len(unified_text)} characters")
    return unified_text


def create_slug(title: str) -> str:
    """Convert title to slug (english-lowercase-dashes)"""
    # Transliterate Hebrew to English (simple mapping)
    hebrew_to_english = {
        'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z',
        'ח': 'ch', 'ט': 't', 'י': 'y', 'כ': 'k', 'ל': 'l', 'מ': 'm', 'נ': 'n',
        'ס': 's', 'ע': 'a', 'פ': 'p', 'צ': 'ts', 'ק': 'k', 'ר': 'r', 'ש': 'sh',
        'ת': 't'
    }
    
    # Simple transliteration
    slug = title.lower()
    # Replace Hebrew with transliteration (simplified)
    for heb, eng in hebrew_to_english.items():
        slug = slug.replace(heb, eng)
    
    # Keep only alphanumeric and dashes
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'\s+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    slug = slug.strip('-')
    
    # If empty, use hash
    if not slug:
        slug = hashlib.md5(title.encode()).hexdigest()[:8]
    
    return slug


def extract_concepts(text: str) -> List[Dict[str, Any]]:
    """Split text into conceptual chunks"""
    # Split by paragraphs first
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip() and len(p.strip()) > 50]
    
    chunks = []
    current_chunk = []
    current_length = 0
    
    for para in paragraphs:
        para_words = len(para.split())
        para_chars = len(para)
        
        # If paragraph itself is too long, split it
        if para_chars > MAX_CHUNK_CHARS:
            # Split long paragraph by sentences
            sentences = re.split(r'[.!?]\s+', para)
            for sent in sentences:
                if sent.strip():
                    sent_words = len(sent.split())
                    sent_chars = len(sent)
                    
                    if current_length + sent_chars > MAX_CHUNK_CHARS or (current_chunk and len(' '.join(current_chunk).split()) + sent_words > MAX_CHUNK_WORDS):
                        # Save current chunk
                        if current_chunk and len(' '.join(current_chunk).split()) >= MIN_CHUNK_WORDS:
                            chunks.append(' '.join(current_chunk))
                        current_chunk = [sent]
                        current_length = sent_chars
                    else:
                        current_chunk.append(sent)
                        current_length += sent_chars
        else:
            # Check if adding this paragraph would exceed limits
            potential_length = current_length + para_chars
            potential_words = len(' '.join(current_chunk + [para]).split())
            
            if (potential_length > MAX_CHUNK_CHARS or potential_words > MAX_CHUNK_WORDS) and current_chunk:
                # Save current chunk
                if len(' '.join(current_chunk).split()) >= MIN_CHUNK_WORDS:
                    chunks.append(' '.join(current_chunk))
                current_chunk = [para]
                current_length = para_chars
            else:
                current_chunk.append(para)
                current_length += para_chars
    
    # Add final chunk
    if current_chunk and len(' '.join(current_chunk).split()) >= MIN_CHUNK_WORDS:
        chunks.append(' '.join(current_chunk))
    
    # Remove duplicates
    seen = set()
    unique_chunks = []
    for chunk in chunks:
        chunk_hash = hashlib.md5(chunk.encode()).hexdigest()
        if chunk_hash not in seen:
            seen.add(chunk_hash)
            unique_chunks.append(chunk)
    
    return unique_chunks


def generate_chunk_metadata(chunk_text: str, index: int, categories: Dict) -> Dict[str, Any]:
    """Generate metadata for a chunk"""
    # Extract title from first sentence or first 50 chars
    first_line = chunk_text.split('\n')[0] if '\n' in chunk_text else chunk_text[:100]
    title = first_line[:80].strip()
    if len(title) > 80:
        title = title[:77] + "..."
    
    # Generate summary (first 180 chars)
    summary = chunk_text[:MAX_SUMMARY_CHARS].strip()
    if len(chunk_text) > MAX_SUMMARY_CHARS:
        summary = summary[:177] + "..."
    
    # Determine category and subcategory (simple heuristic)
    category = "תודעה"
    sub_category = "נוכחות"
    
    # Simple keyword matching for categories
    text_lower = chunk_text.lower()
    if any(kw in text_lower for kw in ['רגש', 'פחד', 'בושה', 'כעס', 'שמחה']):
        category = "רגש"
        if 'פחד' in text_lower:
            sub_category = "פחד"
        elif 'בושה' in text_lower:
            sub_category = "בושה"
        elif 'כעס' in text_lower:
            sub_category = "כעס בריא"
    elif any(kw in text_lower for kw in ['קשר', 'אינטימיות', 'גבולות', 'אהבה']):
        category = "קשר"
        if 'אינטימיות' in text_lower:
            sub_category = "אינטימיות"
        elif 'גבולות' in text_lower:
            sub_category = "גבולות"
    elif any(kw in text_lower for kw in ['ערך', 'זהות', 'ביטחון']):
        category = "זהות"
        sub_category = "ערך עצמי"
    elif any(kw in text_lower for kw in ['ערכים', 'ייעוד', 'כוונה']):
        category = "ערכים"
        sub_category = "ייעוד"
    elif any(kw in text_lower for kw in ['הורה', 'ילד', 'הורות']):
        category = "הורות"
        sub_category = "הורות תודעתית"
    elif any(kw in text_lower for kw in ['נשימה', 'תרגול', 'עוגנות']):
        category = "תרגול"
        sub_category = "מודעות"
    elif any(kw in text_lower for kw in ['מנהיגות', 'השראה']):
        category = "מנהיגות תודעתית"
        sub_category = "נוכחות"
    elif any(kw in text_lower for kw in ['גוף', 'תחושה']):
        category = "גוף"
        sub_category = "תחושות"
    
    # Generate tags (max 4)
    tags = []
    if category in categories:
        tags.append(category)
    if sub_category and sub_category in categories.get(category, []):
        tags.append(sub_category)
    
    # Add 1-2 more relevant tags
    if len(tags) < 4:
        if 'תודעה' in text_lower:
            tags.append('תודעה')
        if 'ריפוי' in text_lower:
            tags.append('ריפוי')
    
    tags = tags[:4]
    
    # Generate ID
    chunk_id = f"master_rag_{index:05d}"
    
    return {
        'id': chunk_id,
        'title': title,
        'category': category,
        'sub_category': sub_category,
        'tags': tags,
        'summary': summary,
        'text': chunk_text
    }


def create_folder_structure():
    """Create output folder structure"""
    print("📁 Creating folder structure...")
    
    # Remove existing if exists
    if OUTPUT_DIR.exists():
        import shutil
        shutil.rmtree(OUTPUT_DIR)
    
    # Create directories
    CHUNKS_DIR.mkdir(parents=True, exist_ok=True)
    METADATA_DIR.mkdir(parents=True, exist_ok=True)
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    
    print("✅ Folder structure created")


def create_chunk_template():
    """Create chunk template"""
    template = """---
id: <auto_id>
title: "<chunk_title>"
category: "<category>"
sub_category: "<sub_category>"
tags: ["tag1", "tag2"]
summary: "<short summary>"
source: "DATA_SOURCE"
embedding_profile: "openai_text3"
---

# <chunk_title>

## נקודות עומק:

- …

## מה חשוב לזכור:

- …

## תנועה/יישום:

- …

---
"""
    template_path = TEMPLATES_DIR / "chunk_template.md"
    with open(template_path, 'w', encoding='utf-8') as f:
        f.write(template)
    print("✅ Chunk template created")


def create_categories_ontology():
    """Create categories.json"""
    categories = {
        "תודעה": [
            "תודעה ראקטיבית",
            "תודעה אדפטיבית",
            "תודעת קריאייטינג",
            "נוכחות",
            "קו האיום",
            "בחירה",
            "שקט תודעתי",
            "מערכת העצבים"
        ],
        "רגש": [
            "פחד",
            "בושה",
            "שמחה",
            "כעס בריא",
            "הצפה",
            "עומס",
            "קבלה"
        ],
        "קשר": [
            "אינטימיות",
            "פגיעות",
            "החזקה",
            "נראות",
            "גבולות",
            "ביטחון רגשי",
            "אמפתיה"
        ],
        "זהות": [
            "ערך עצמי",
            "דפוסי זהות",
            "פצע",
            "ביטחון עצמי"
        ],
        "ערכים": [
            "ייעוד",
            "כוונה",
            "חזון",
            "משמעות"
        ],
        "אחריות": [
            "מיקוד פנימי",
            "בחירה פעילה",
            "קבלת אחריות",
            "יצירה"
        ],
        "הפעלה": [
            "איום",
            "תגובה אוטומטית",
            "זיהוי הפעלה",
            "התערבות"
        ],
        "הורות": [
            "וויסות ילדים",
            "ביטחון רגשי לילד",
            "דפוסי היקשרות",
            "הורות תודעתית"
        ],
        "תרגול": [
            "נשימה",
            "מודעות",
            "עוגנות",
            "הרחבת נשיאה"
        ],
        "מנהיגות תודעתית": [
            "נוכחות",
            "השראה",
            "השפעה",
            "אחריות מנהיגותית"
        ],
        "גוף": [
            "תחושות",
            "עוגנות גופנית",
            "ויסות"
        ]
    }
    
    categories_path = METADATA_DIR / "categories.json"
    with open(categories_path, 'w', encoding='utf-8') as f:
        json.dump(categories, f, ensure_ascii=False, indent=2)
    print("✅ Categories ontology created")
    return categories


def format_chunk_content(chunk_text: str, metadata: Dict) -> str:
    """Format chunk according to template"""
    # Split chunk into sections if possible
    lines = chunk_text.split('\n')
    
    # Try to identify sections
    depth_points = []
    important_points = []
    action_points = []
    
    current_section = None
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Detect section headers
        if any(kw in line for kw in ['מה חשוב', 'חשוב לזכור', 'זכור']):
            current_section = 'important'
        elif any(kw in line for kw in ['תנועה', 'יישום', 'לעשות', 'פעולה']):
            current_section = 'action'
        elif any(kw in line for kw in ['עומק', 'מעמיק', 'עמוק']):
            current_section = 'depth'
        else:
            # Add to current section
            if current_section == 'important':
                important_points.append(line)
            elif current_section == 'action':
                action_points.append(line)
            else:
                depth_points.append(line)
    
    # If no sections detected, distribute content
    if not depth_points and not important_points and not action_points:
        all_lines = [l for l in lines if l.strip()]
        third = len(all_lines) // 3
        depth_points = all_lines[:third] if third > 0 else all_lines[:len(all_lines)//2]
        important_points = all_lines[third:2*third] if third > 0 else []
        action_points = all_lines[2*third:] if third > 0 else all_lines[len(all_lines)//2:]
    
    # Format content
    content = f"# {metadata['title']}\n\n"
    
    if depth_points:
        content += "## נקודות עומק:\n\n"
        for point in depth_points[:10]:  # Limit to 10 points
            if len(point) > 200:  # Truncate long points
                point = point[:197] + "..."
            content += f"- {point}\n\n"
    
    if important_points:
        content += "## מה חשוב לזכור:\n\n"
        for point in important_points[:10]:
            if len(point) > 200:
                point = point[:197] + "..."
            content += f"- {point}\n\n"
    
    if action_points:
        content += "## תנועה/יישום:\n\n"
        for point in action_points[:10]:
            if len(point) > 200:
                point = point[:197] + "..."
            content += f"- {point}\n\n"
    
    # If still no content, use original text
    if not depth_points and not important_points and not action_points:
        content = f"# {metadata['title']}\n\n{chunk_text[:MAX_CHUNK_CHARS]}"
    
    return content


def create_chunk_file(metadata: Dict, content: str, index: int):
    """Create a chunk file"""
    slug = create_slug(metadata['title'])
    filename = f"rag_{index:05d}_{slug}.md"
    filepath = CHUNKS_DIR / filename
    
    # Build front matter
    tags_str = json.dumps(metadata['tags'], ensure_ascii=False)
    
    front_matter = f"""---
id: {metadata['id']}
title: "{metadata['title']}"
category: "{metadata['category']}"
sub_category: "{metadata['sub_category']}"
tags: {tags_str}
summary: "{metadata['summary']}"
source: "DATA_SOURCE"
embedding_profile: "openai_text3"
---

"""
    
    full_content = front_matter + content + "\n\n---\n"
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(full_content)
    
    return filename


def quality_control(chunks: List[Dict], categories: Dict) -> bool:
    """Run quality control checks"""
    print("\n🔍 Running Quality Control...")
    
    errors = []
    
    # Check chunk count
    if len(chunks) < TARGET_CHUNKS:
        errors.append(f"⚠️  Chunk count ({len(chunks)}) below target ({TARGET_CHUNKS})")
    elif len(chunks) > MAX_CHUNKS:
        errors.append(f"⚠️  Chunk count ({len(chunks)}) above max ({MAX_CHUNKS})")
    
    # Check for duplicates
    chunk_texts = [c['text'] for c in chunks]
    if len(chunk_texts) != len(set(chunk_texts)):
        errors.append("❌ Duplicate chunks found")
    
    # Check each chunk
    for i, chunk in enumerate(chunks):
        # Check metadata fields
        required_fields = ['id', 'title', 'category', 'sub_category', 'tags', 'summary']
        for field in required_fields:
            if field not in chunk:
                errors.append(f"❌ Chunk {i+1} missing field: {field}")
        
        # Check chunk size
        if len(chunk['text']) > MAX_CHUNK_CHARS:
            errors.append(f"❌ Chunk {i+1} exceeds {MAX_CHUNK_CHARS} chars: {len(chunk['text'])}")
        
        # Check summary size
        if len(chunk['summary']) > MAX_SUMMARY_CHARS:
            errors.append(f"❌ Chunk {i+1} summary exceeds {MAX_SUMMARY_CHARS} chars")
        
        # Check category validity
        if chunk['category'] not in categories:
            errors.append(f"⚠️  Chunk {i+1} invalid category: {chunk['category']}")
        else:
            valid_subcats = categories.get(chunk['category'], [])
            if chunk['sub_category'] and chunk['sub_category'] not in valid_subcats:
                # Try to fix: if sub_category is valid for another category, update category
                found = False
                for cat, subcats in categories.items():
                    if chunk['sub_category'] in subcats:
                        found = True
                        break
                if not found:
                    errors.append(f"⚠️  Chunk {i+1} invalid sub_category '{chunk['sub_category']}' for category '{chunk['category']}'")
    
    if errors:
        print("❌ Quality Control Issues:")
        for error in errors[:20]:  # Show first 20 errors
            print(f"   {error}")
        if len(errors) > 20:
            print(f"   ... and {len(errors) - 20} more")
        return False
    
    print("✅ Quality Control passed")
    return True


def create_master_index(chunks: List[Dict]):
    """Create MASTER_INDEX.md"""
    print("📋 Creating Master Index...")
    
    index_path = INDEX_DIR / "MASTER_INDEX.md"
    
    with open(index_path, 'w', encoding='utf-8') as f:
        f.write("# Master RAG Index\n\n")
        f.write("| Index | ID | Title | Category | Sub-Category | Length (chars) | File |\n")
        f.write("|-------|----|--------|-----------|--------------|----------------|-------|\n")
        
        for i, chunk in enumerate(chunks, 1):
            slug = create_slug(chunk['title'])
            filename = f"rag_{i:05d}_{slug}.md"
            length = len(chunk['text'])
            
            # Escape pipe characters in title
            title = chunk['title'].replace('|', '\\|')
            
            f.write(f"| {i} | {chunk['id']} | {title} | {chunk['category']} | {chunk['sub_category']} | {length} | {filename} |\n")
    
    print("✅ Master Index created")


def main():
    """Main execution"""
    print("=" * 80)
    print("🚀 MASTER RAG PACKAGE BUILDER")
    print("=" * 80)
    print()
    
    # Step 1: Create folder structure
    create_folder_structure()
    
    # Step 2: Create template
    create_chunk_template()
    
    # Step 3: Create categories
    categories = create_categories_ontology()
    
    # Step 4: Load all source files
    unified_corpus = load_all_source_files()
    
    if not unified_corpus or len(unified_corpus) < 1000:
        print("❌ ERROR: Insufficient content loaded from source files")
        sys.exit(1)
    
    # Step 5: Extract concepts
    print("\n📦 Extracting concepts...")
    chunk_texts = extract_concepts(unified_corpus)
    print(f"✅ Extracted {len(chunk_texts)} concept chunks")
    
    # Step 6: Generate metadata and create chunks
    print("\n📝 Generating chunks...")
    chunks = []
    for i, chunk_text in enumerate(chunk_texts[:MAX_CHUNKS], 1):
        metadata = generate_chunk_metadata(chunk_text, i, categories)
        metadata['text'] = chunk_text
        
        # Ensure chunk_text doesn't exceed limits before formatting
        if len(chunk_text) > MAX_CHUNK_CHARS:
            chunk_text = chunk_text[:MAX_CHUNK_CHARS-3] + "..."
            metadata['text'] = chunk_text
        
        # Format content
        content = format_chunk_content(chunk_text, metadata)
        
        # Ensure content doesn't exceed limits
        if len(content) > MAX_CHUNK_CHARS:
            content = content[:MAX_CHUNK_CHARS-3] + "..."
        
        # Create file
        filename = create_chunk_file(metadata, content, i)
        chunks.append({
            **metadata,
            'filename': filename,
            'content': content
        })
        
        if i % 100 == 0:
            print(f"   ✅ Created {i}/{len(chunk_texts[:MAX_CHUNKS])} chunks")
    
    print(f"✅ Created {len(chunks)} chunk files")
    
    # Step 7: Quality Control
    if not quality_control(chunks, categories):
        print("⚠️  Quality control issues detected, but continuing...")
    
    # Step 8: Create Master Index
    create_master_index(chunks)
    
    print("\n" + "=" * 80)
    print("✨ MASTER RAG PACKAGE READY")
    print("=" * 80)
    print(f"📊 Total chunks created: {len(chunks)}")
    print(f"📁 Location: {OUTPUT_DIR}")
    print("✅ Optimized for OpenAI embeddings")
    print("=" * 80)


if __name__ == "__main__":
    main()

