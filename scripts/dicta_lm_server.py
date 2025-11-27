#!/usr/bin/env python3
"""
Dicta-LM 2.0 server using transformers
Provides a simple HTTP API for text generation
Specialized Hebrew LLM model
"""
import json
import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline

# Global model and tokenizer
model = None
tokenizer = None
pipe = None
# Dicta-LM 2.0 Instruct - specialized Hebrew LLM model
# https://dicta.org.il/dicta-lm
# https://huggingface.co/dicta-il/dictalm2.0-instruct
MODEL_NAME = "dicta-il/dictalm2.0-instruct"

def load_model():
    """Load the model (lazy loading)"""
    global model, tokenizer, pipe
    
    if model is None:
        print(f"🔄 Loading model: {MODEL_NAME}...", file=sys.stderr)
        try:
            # Try pipeline first (simpler)
            device = "cuda" if torch.cuda.is_available() else "cpu"
            pipe = pipeline(
                "text-generation",
                model=MODEL_NAME,
                device=device,
                torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
            )
            print("✅ Model loaded via pipeline", file=sys.stderr)
        except Exception as e:
            print(f"⚠️  Pipeline failed, trying direct loading: {e}", file=sys.stderr)
            try:
                tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
                device = "cuda" if torch.cuda.is_available() else "cpu"
                model = AutoModelForCausalLM.from_pretrained(
                    MODEL_NAME,
                    device_map=device if torch.cuda.is_available() else None,
                    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
                )
                if not torch.cuda.is_available():
                    model = model.to(device)
                print("✅ Model loaded directly", file=sys.stderr)
            except Exception as e2:
                print(f"❌ Error loading model: {e2}", file=sys.stderr)
                raise

class ModelHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests (status check)"""
        if self.path == '/status':
            try:
                # Check if model is loaded
                if model is None and pipe is None:
                    status = {'status': 'not_loaded', 'model': MODEL_NAME}
                else:
                    status = {'status': 'ready', 'model': MODEL_NAME}
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(status).encode())
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_POST(self):
        """Handle POST requests for text generation"""
        global model, tokenizer, pipe
        
        if self.path == '/generate':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                prompt = data.get('prompt', '')
                temperature = data.get('temperature', 0.7)
                max_tokens = data.get('max_tokens', 1000)
                
                if not prompt:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'prompt is required'}).encode())
                    return
                
                # Load model if not loaded
                if model is None and pipe is None:
                    print(f"🔄 Loading model on first request...", file=sys.stderr)
                    load_model()
                    print(f"✅ Model loaded, generating...", file=sys.stderr)
                
                print(f"📝 Generating text (prompt length: {len(prompt)}, max_tokens: {max_tokens})...", file=sys.stderr)
                
                # Generate text
                # For Dicta-LM 2.0 Instruct, we can use the tokenizer's chat template if available
                if pipe:
                    # Use pipeline (simpler, but may not use chat template)
                    outputs = pipe(
                        prompt,
                        max_new_tokens=max_tokens,
                        temperature=temperature,
                        do_sample=temperature > 0,
                        return_full_text=False,
                    )
                    generated_text = outputs[0]['generated_text'] if outputs else ''
                    print(f"✅ Generated {len(generated_text)} characters", file=sys.stderr)
                else:
                    # Use direct model with tokenizer
                    # Try to use chat template if available (for instruction-tuned models)
                    if hasattr(tokenizer, 'apply_chat_template') and tokenizer.chat_template:
                        # Convert messages to chat format
                        messages = []
                        current_role = None
                        current_content = []
                        for line in prompt.split('\n\n'):
                            if line.startswith('System:'):
                                messages.append({'role': 'system', 'content': line.replace('System:', '').strip()})
                            elif line.startswith('User:'):
                                if current_role and current_content:
                                    messages.append({'role': current_role, 'content': '\n'.join(current_content).strip()})
                                current_role = 'user'
                                current_content = [line.replace('User:', '').strip()]
                            elif line.startswith('Assistant:'):
                                if current_role and current_content:
                                    messages.append({'role': current_role, 'content': '\n'.join(current_content).strip()})
                                current_role = 'assistant'
                                current_content = [line.replace('Assistant:', '').strip()]
                            else:
                                if current_content:
                                    current_content.append(line)
                        if current_role and current_content:
                            messages.append({'role': current_role, 'content': '\n'.join(current_content).strip()})
                        
                        # Apply chat template
                        formatted_prompt = tokenizer.apply_chat_template(
                            messages,
                            tokenize=False,
                            add_generation_prompt=True
                        )
                        inputs = tokenizer(formatted_prompt, return_tensors="pt")
                    else:
                        # Fallback to simple prompt
                        inputs = tokenizer(prompt, return_tensors="pt")
                    
                    if torch.cuda.is_available():
                        inputs = {k: v.to(model.device) for k, v in inputs.items()}
                    
                    with torch.no_grad():
                        outputs = model.generate(
                            inputs.input_ids,
                            max_new_tokens=max_tokens,
                            temperature=temperature,
                            do_sample=temperature > 0,
                            pad_token_id=tokenizer.eos_token_id if tokenizer.eos_token_id else tokenizer.pad_token_id,
                        )
                    
                    generated_ids = outputs[0][inputs.input_ids.shape[1]:]
                    generated_text = tokenizer.decode(generated_ids, skip_special_tokens=True)
                    print(f"✅ Generated {len(generated_text)} characters", file=sys.stderr)
                
                # Send response
                print(f"📤 Sending response...", file=sys.stderr)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'text': generated_text.strip(),
                    'model': MODEL_NAME
                }).encode())
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'error': str(e)
                }).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def log_message(self, format, *args):
        """Suppress default logging"""
        pass

def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5001
    try:
        server = HTTPServer(('0.0.0.0', port), ModelHandler)  # Changed to 0.0.0.0 to accept connections
        print(f"🚀 Dicta-LM 2.0 server running on http://0.0.0.0:{port}", file=sys.stderr)
        print(f"📡 Endpoint: POST http://localhost:{port}/generate", file=sys.stderr)
        print(f"✅ Server started successfully", file=sys.stderr)
        server.serve_forever()
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"❌ Port {port} is already in use. Trying to kill existing process...", file=sys.stderr)
            import subprocess
            subprocess.run(['lsof', '-ti', f':{port}', '|', 'xargs', 'kill', '-9'], shell=True)
            time.sleep(2)
            server = HTTPServer(('0.0.0.0', port), ModelHandler)
            print(f"🚀 Dicta-LM 2.0 server running on http://0.0.0.0:{port}", file=sys.stderr)
            server.serve_forever()
        else:
            raise
    except KeyboardInterrupt:
        print("\n🛑 Shutting down server...", file=sys.stderr)
        server.shutdown()

if __name__ == '__main__':
    main()

