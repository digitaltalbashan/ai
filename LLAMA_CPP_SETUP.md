# llama.cpp + GGUF Setup Guide

## Overview

This guide explains how to use llama.cpp with GGUF format models for faster and more memory-efficient inference.

## Advantages of llama.cpp + GGUF

- ✅ **Much faster inference** - Optimized C++ implementation
- ✅ **Lower memory usage** - Quantized models (Q4_K, Q5_K, etc.)
- ✅ **Better Apple Silicon support** - Native Metal acceleration
- ✅ **No PyTorch dependency** - Lighter weight
- ✅ **Production ready** - Stable and well-tested

## Installation

### 1. Install llama-cpp-python

```bash
# Basic installation
pip install llama-cpp-python

# For Apple Silicon (Metal acceleration)
CMAKE_ARGS="-DLLAMA_METAL=on" pip install llama-cpp-python

# For CUDA (NVIDIA GPUs)
CMAKE_ARGS="-DLLAMA_CUBLAS=on" pip install llama-cpp-python
```

### 2. Download GGUF Model

#### Option A: Use the download script

```bash
python3 scripts/download_gguf_model.py qwen2.5-7b
```

#### Option B: Manual download

Download a GGUF model from HuggingFace:
- Qwen 2.5 7B Instruct: https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF
- Mistral 7B Instruct: https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF

Save to `models/` directory.

### 3. Set Environment Variable

```bash
export LLAMA_CPP_MODEL_PATH=models/qwen2.5-7b-instruct.Q4_K_M.gguf
export USE_LLAMA_CPP=true
```

### 4. Configure Performance (Optional)

```bash
# CPU threads (adjust based on your CPU)
export LLAMA_CPP_N_THREADS=8

# Context window size
export LLAMA_CPP_N_CTX=4096

# GPU layers (for Apple Silicon or CUDA)
# For M1/M2/M3 Mac: try 20-30
# For M4 Mac: try 30-40
export LLAMA_CPP_N_GPU_LAYERS=30
```

## Usage

### Basic Usage

```bash
export USE_LLAMA_CPP=true
export LLAMA_CPP_MODEL_PATH=models/your-model.gguf
python3 rag/query_improved.py
```

### In Python Code

```python
from rag.llama_cpp_llm import call_llm

context = [{
    'text': 'Your context text here',
    'source': 'document.pdf',
    'chunk_index': 0
}]

answer = call_llm("מה זה מעגל התודעה?", context)
print(answer)
```

## Model Recommendations

### For Hebrew Text

1. **Qwen 2.5 7B Instruct** (Recommended)
   - Excellent multilingual support including Hebrew
   - Good instruction following
   - Available in GGUF format

2. **Mistral 7B Instruct**
   - Good Hebrew support
   - Fast inference
   - Available in GGUF format

3. **Dicta-LM 2.0** (Best for Hebrew, but may need conversion)
   - Specialized for Hebrew
   - May need to convert from HuggingFace format to GGUF

## Quantization Levels

- **Q4_K_M** - Good balance (recommended)
- **Q5_K_M** - Better quality, larger file
- **Q6_K** - Best quality, largest file
- **Q8_0** - Near full precision

## Troubleshooting

### Model not found

Make sure the model path is correct:
```bash
ls -lh models/*.gguf
export LLAMA_CPP_MODEL_PATH=models/your-model.gguf
```

### Slow performance

1. Enable GPU acceleration:
   ```bash
   export LLAMA_CPP_N_GPU_LAYERS=30
   ```

2. Increase CPU threads:
   ```bash
   export LLAMA_CPP_N_THREADS=8
   ```

3. Use a smaller quantization (Q4_K_M instead of Q8_0)

### Memory issues

1. Use a smaller quantization level
2. Reduce context window:
   ```bash
   export LLAMA_CPP_N_CTX=2048
   ```

## Converting Models to GGUF

If you have a HuggingFace model and want to convert it:

1. Install llama.cpp:
   ```bash
   git clone https://github.com/ggerganov/llama.cpp
   cd llama.cpp
   make
   ```

2. Convert using convert.py:
   ```bash
   python convert.py --outfile model.gguf --outtype f16 models/your-model
   ```

3. Quantize (optional):
   ```bash
   ./quantize model.gguf model-q4_k_m.gguf Q4_K_M
   ```

## Performance Comparison

| Method | Speed | Memory | Quality |
|--------|-------|--------|---------|
| transformers (FP16) | Baseline | High | Best |
| llama.cpp (Q4_K_M) | 2-3x faster | 4x less | Very good |
| llama.cpp (Q5_K_M) | 1.5-2x faster | 3x less | Excellent |
| Ollama | Variable | Medium | Good |

