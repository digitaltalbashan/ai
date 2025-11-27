import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

# Configure MPS settings if available
if torch.backends.mps.is_available():
    if hasattr(torch.backends.mps, 'enable_flash_sdp'):
        torch.backends.mps.enable_flash_sdp(False)
    if hasattr(torch.backends.mps, 'enable_mem_efficient_sdp'):
        torch.backends.mps.enable_mem_efficient_sdp(False)
    if hasattr(torch.backends.mps, 'enable_math_sdp'):
        torch.backends.mps.enable_math_sdp(True)

model_id = "yam-peleg/Hebrew-Mistral-7B"

device = "mps" if torch.backends.mps.is_available() else "cpu"
dtype = torch.float16 if device == "mps" else torch.float32

print(f"🔄 Loading model: {model_id} on {device}...")

tokenizer = AutoTokenizer.from_pretrained(model_id)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    model_id,
    dtype=dtype,  # Use dtype instead of torch_dtype
)
model.to(device)
model.eval()

print(f"✅ Model loaded successfully on {device}")

prompt = "תסביר בקצרה מהו RAG."

print(f"\n❓ שאלה: {prompt}\n")
print("=" * 80)

inputs = tokenizer(prompt, return_tensors="pt").to(device)

with torch.no_grad():
    outputs = model.generate(
        **inputs,
        max_new_tokens=150,
        do_sample=False,
        pad_token_id=tokenizer.pad_token_id,
        eos_token_id=tokenizer.eos_token_id,
    )

answer = tokenizer.decode(outputs[0], skip_special_tokens=True)

print("📣 תשובה:")
print(answer)
print("=" * 80)

