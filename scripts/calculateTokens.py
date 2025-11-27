#!/usr/bin/env python3
"""
Calculate token count for OpenAI API using tiktoken
"""
import sys
import json
import tiktoken

def count_tokens(text: str, model: str = "gpt-4") -> int:
    """Count tokens in text using tiktoken"""
    try:
        encoding = tiktoken.encoding_for_model(model)
        return len(encoding.encode(text))
    except KeyError:
        # Fallback to cl100k_base (used by gpt-4, gpt-3.5-turbo)
        encoding = tiktoken.get_encoding("cl100k_base")
        return len(encoding.encode(text))

def count_tokens_for_messages(messages: list, model: str = "gpt-4") -> dict:
    """Count tokens for chat messages format"""
    encoding = tiktoken.encoding_for_model(model) if hasattr(tiktoken, 'encoding_for_model') else tiktoken.get_encoding("cl100k_base")
    
    total_tokens = 0
    breakdown = {}
    
    for msg in messages:
        role = msg.get('role', 'user')
        content = msg.get('content', '')
        
        # Count tokens for this message
        # Format: role + content + formatting tokens (~4 tokens per message)
        msg_tokens = len(encoding.encode(content)) + 4
        total_tokens += msg_tokens
        
        breakdown[role] = breakdown.get(role, 0) + msg_tokens
    
    return {
        'total': total_tokens,
        'breakdown': breakdown,
        'model': model
    }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 calculateTokens.py <text>")
        print("   or: python3 calculateTokens.py --messages <json_file>")
        sys.exit(1)
    
    if sys.argv[1] == '--messages':
        # Read messages from JSON file
        if len(sys.argv) < 3:
            print("Error: --messages requires a JSON file path")
            sys.exit(1)
        
        with open(sys.argv[2], 'r', encoding='utf-8') as f:
            messages = json.load(f)
        
        result = count_tokens_for_messages(messages)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        # Count tokens for single text
        text = sys.argv[1]
        tokens = count_tokens(text)
        print(json.dumps({
            'text': text[:100] + '...' if len(text) > 100 else text,
            'tokens': tokens,
            'characters': len(text)
        }, indent=2, ensure_ascii=False))

