#!/usr/bin/env python3
"""
Script to download GGUF models for Hebrew LLM
"""
import os
import sys
import requests
from pathlib import Path

# Create models directory
MODELS_DIR = Path(__file__).parent.parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

# Available Hebrew GGUF models
HEBREW_MODELS = {
    "mistral-7b-hebrew": {
        "url": "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf",
        "description": "Mistral 7B Instruct (good Hebrew support)",
        "size": "~4GB"
    },
    "qwen2.5-7b": {
        "url": "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct.Q4_K_M.gguf",
        "description": "Qwen 2.5 7B Instruct (excellent multilingual, good Hebrew)",
        "size": "~4.5GB"
    },
    # Note: Dicta-LM 2.0 GGUF might need to be converted manually
    # or check HuggingFace for community conversions
}

def download_file(url: str, filepath: Path, chunk_size: int = 8192):
    """Download a file with progress bar"""
    print(f"📥 Downloading from: {url}")
    print(f"💾 Saving to: {filepath}")
    
    response = requests.get(url, stream=True)
    total_size = int(response.headers.get('content-length', 0))
    
    if total_size == 0:
        print("⚠️  Could not determine file size")
    
    downloaded = 0
    with open(filepath, 'wb') as f:
        for chunk in response.iter_content(chunk_size=chunk_size):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)
                if total_size > 0:
                    percent = (downloaded / total_size) * 100
                    print(f"\r   Progress: {percent:.1f}% ({downloaded / 1024 / 1024:.1f} MB / {total_size / 1024 / 1024:.1f} MB)", end='')
    
    print(f"\n✅ Download complete: {filepath}")
    return filepath

def main():
    """Main function"""
    print("🚀 GGUF Model Downloader for Hebrew LLM")
    print("=" * 80)
    print("\nAvailable models:")
    for i, (key, info) in enumerate(HEBREW_MODELS.items(), 1):
        print(f"  {i}. {key}")
        print(f"     {info['description']}")
        print(f"     Size: {info['size']}")
        print()
    
    if len(sys.argv) > 1:
        model_key = sys.argv[1]
    else:
        model_key = input("Enter model name (or 'qwen2.5-7b' for default): ").strip()
        if not model_key:
            model_key = "qwen2.5-7b"
    
    if model_key not in HEBREW_MODELS:
        print(f"❌ Unknown model: {model_key}")
        print(f"Available models: {', '.join(HEBREW_MODELS.keys())}")
        return
    
    model_info = HEBREW_MODELS[model_key]
    filename = model_key + ".gguf"
    filepath = MODELS_DIR / filename
    
    if filepath.exists():
        print(f"✅ Model already exists: {filepath}")
        response = input("Download again? (y/N): ").strip().lower()
        if response != 'y':
            print("Skipping download.")
            return
    
    try:
        download_file(model_info["url"], filepath)
        print(f"\n✅ Model downloaded successfully!")
        print(f"📝 Set environment variable:")
        print(f"   export LLAMA_CPP_MODEL_PATH={filepath.absolute()}")
    except Exception as e:
        print(f"❌ Error downloading model: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()

