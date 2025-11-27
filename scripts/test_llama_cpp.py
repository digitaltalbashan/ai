#!/usr/bin/env python3
"""
Test script for llama.cpp integration
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set to use llama.cpp
os.environ["USE_LLAMA_CPP"] = "true"

def test_llama_cpp():
    """Test llama.cpp integration"""
    print("🧪 Testing llama.cpp Integration")
    print("=" * 80)
    
    # Check if model path is set
    model_path = os.getenv("LLAMA_CPP_MODEL_PATH", "models/dictalm2.0-instruct.gguf")
    print(f"📦 Model path: {model_path}")
    
    if not os.path.exists(model_path):
        print(f"\n⚠️  Model file not found: {model_path}")
        print("\n💡 To download a model, run:")
        print("   python3 scripts/download_gguf_model.py qwen2.5-7b")
        print("\n   Or set LLAMA_CPP_MODEL_PATH to point to your GGUF model")
        return False
    
    try:
        from rag.llama_cpp_llm import call_llm
        
        # Test with simple context
        context = [{
            'text': 'מעגל התודעה הוא כלי כתוב שממלאים המשתתפים בסוף כל שיעור. הוא נועד לשקף תובנות, תרגולים וקשיים.',
            'source': 'test.md',
            'chunk_index': 0
        }]
        
        question = 'מה זה מעגל התודעה?'
        print(f"\n❓ שאלה: {question}")
        print("=" * 80)
        
        answer = call_llm(question, context, max_new_tokens=150)
        
        print(f"\n📣 תשובה:")
        print(answer)
        print("=" * 80)
        
        # Check for non-Hebrew text
        import re
        non_hebrew = re.findall(r'[a-zA-Z]{3,}', answer)
        if non_hebrew:
            print(f"\n⚠️  נמצאו מילים באנגלית: {non_hebrew[:5]}")
        else:
            print("\n✅ תשובה בעברית בלבד!")
        
        return True
        
    except Exception as e:
        print(f"\n❌ שגיאה: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_llama_cpp()
    if success:
        print("\n✅ llama.cpp integration works!")
    else:
        print("\n❌ llama.cpp integration failed - check model path")

