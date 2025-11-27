"""
Few-shot examples from Tal Bashan FAQ and QNA for better model responses
These examples help the model understand the style and approach
"""
import os
import json

# Load FAQ examples
FAQ_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "טל-בשן_FAQ_פרקים_1-2-4-5-6-7-8-9 (1).md")
QNA_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "rag", "qna.jsonl")

_few_shot_examples = None
_qna_examples = None

def load_qna_examples():
    """Load QNA examples from JSONL file"""
    global _qna_examples
    
    if _qna_examples is None:
        _qna_examples = []
        try:
            if os.path.exists(QNA_FILE):
                with open(QNA_FILE, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            try:
                                example = json.loads(line)
                                _qna_examples.append(example)
                            except json.JSONDecodeError:
                                continue
        except Exception as e:
            print(f"⚠️  Warning: Could not load QNA examples: {e}")
    
    return _qna_examples

def load_few_shot_examples():
    """Load few-shot examples from FAQ file"""
    global _few_shot_examples
    
    if _few_shot_examples is None:
        try:
            if os.path.exists(FAQ_FILE):
                with open(FAQ_FILE, 'r', encoding='utf-8') as f:
                    _few_shot_examples = f.read()
            else:
                _few_shot_examples = ""
        except Exception as e:
            print(f"⚠️  Warning: Could not load FAQ examples: {e}")
            _few_shot_examples = ""
    
    return _few_shot_examples

def format_qna_examples(qna_examples, max_examples: int = 3) -> str:
    """Format QNA examples for prompt"""
    if not qna_examples:
        return ""
    
    formatted = []
    for example in qna_examples[:max_examples]:
        question = example.get('question', '')
        answer = example.get('answer_style', '')
        metadata = example.get('metadata', {})
        tone = metadata.get('tone', '')
        key_terms = metadata.get('key_term', '')
        
        formatted.append(f"שאלה: {question}\nתשובה (בסגנון טל בשן): {answer}")
        if tone or key_terms:
            formatted.append(f"[טון: {tone}, מונחי מפתח: {key_terms}]")
        formatted.append("---")
    
    return "\n".join(formatted)


def get_few_shot_examples_for_prompt(max_length: int = 2000) -> str:
    """
    Get few-shot examples formatted for prompt
    Returns a shortened version if needed to fit in context window
    """
    examples = load_few_shot_examples()
    
    if not examples:
        return ""
    
    # If examples are too long, take the first part
    if len(examples) > max_length:
        # Try to cut at a reasonable point (end of a section)
        cut_point = examples[:max_length].rfind('\n##')
        if cut_point > max_length * 0.7:  # Only cut if we can keep at least 70%
            examples = examples[:cut_point] + "\n\n[...]"
        else:
            examples = examples[:max_length] + "..."
    
    return examples


def get_relevant_examples(question: str, max_examples: int = 3) -> str:
    """
    Get relevant few-shot examples based on question keywords
    Combines FAQ examples and QNA examples for better coverage
    """
    question_lower = question.lower()
    
    # First, try to find relevant QNA examples
    qna_examples = load_qna_examples()
    relevant_qna = []
    
    if qna_examples:
        # Simple keyword matching for QNA
        for example in qna_examples:
            question_text = example.get('question', '').lower()
            answer_text = example.get('answer_style', '').lower()
            metadata = example.get('metadata', {})
            key_terms = metadata.get('key_term', '').lower()
            
            # Check if question or answer contains keywords from user question
            question_words = set(question_lower.split())
            example_words = set((question_text + ' ' + answer_text + ' ' + key_terms).split())
            
            # Simple overlap check
            if question_words & example_words or any(word in question_text for word in question_words if len(word) > 3):
                relevant_qna.append(example)
                if len(relevant_qna) >= max_examples:
                    break
    
    # Format QNA examples
    qna_formatted = format_qna_examples(relevant_qna, max_examples=max_examples)
    
    # Also get FAQ examples
    examples = load_few_shot_examples()
    faq_formatted = ""
    
    if examples:
        # Simple keyword extraction from question
        topic_keywords = {
            'תקיעות': 'פרק 1',
            'דחיינות': 'פרק 1',
            'ביקורת': 'פרק 2',
            'מסוגלות': 'פרק 2',
            'רגשות': 'פרק 4',
            'רגש': 'פרק 4',
            'מסכה': 'פרק 5',
            'כובע': 'פרק 5',
            'גבול': 'פרק 6',
            'ריאקטיבי': 'פרק 6',
            'רצון': 'פרק 7',
            'תפקיד': 'פרק 8',
            'תוצאה': 'פרק 8',
            'סמול טוק': 'סמול טוק',
            'אסטרטגיה': 'אסטרטגיה',
            'מראה': 'מראה',
            'סרגלים': 'סרגלים',
        }
        
        # Find relevant sections
        relevant_sections = []
        for keyword, section in topic_keywords.items():
            if keyword in question_lower:
                relevant_sections.append(section)
        
        # Extract relevant sections from FAQ
        if relevant_sections:
            lines = examples.split('\n')
            result_lines = []
            in_relevant_section = False
            
            for line in lines:
                # Check if we're entering a relevant section
                for section in relevant_sections:
                    if section in line and '##' in line:
                        in_relevant_section = True
                        result_lines.append(line)
                        break
                
                # Check if we're leaving a section
                if in_relevant_section and line.startswith('##') and not any(s in line for s in relevant_sections):
                    break
                
                if in_relevant_section:
                    result_lines.append(line)
            
            if result_lines:
                faq_formatted = '\n'.join(result_lines[:500])  # Limit length
        else:
            # Fallback: return first part of FAQ
            faq_formatted = examples[:1000] if len(examples) > 1000 else examples
    
    # Combine QNA and FAQ examples
    result_parts = []
    if qna_formatted:
        result_parts.append("דוגמאות מתוך שיעורים (Q&A):")
        result_parts.append(qna_formatted)
    
    if faq_formatted:
        if result_parts:
            result_parts.append("\n")
        result_parts.append("דוגמאות מתוך FAQ:")
        result_parts.append(faq_formatted)
    
    return "\n".join(result_parts) if result_parts else ""

