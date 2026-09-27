#!/usr/bin/env python3
"""Small OpenAI-compatible local inference service for the Sonderr-v1 LoRA."""
import json
import os
import re
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST, PORT = "127.0.0.1", int(os.environ.get("SONDERR_V1_PORT", "43174"))
MODEL_ID = "sonderr-v1"
BASE_MODEL = "Qwen/Qwen2.5-0.5B-Instruct"
MODEL_DIR = os.environ.get("SONDERR_V1_MODEL", "")
ADAPTER_DIR = os.environ.get("SONDERR_V1_ADAPTER", "")
model = tokenizer = torch = None
load_error = ""
load_lock = threading.Lock()


def ensure_model():
    global model, tokenizer, torch, load_error
    if model is not None:
        return
    with load_lock:
        if model is not None:
            return
        try:
            import torch as torch_module
            from transformers import AutoModelForCausalLM, AutoTokenizer
            torch = torch_module
            dtype = torch.float16 if torch.cuda.is_available() else torch.float32
            if MODEL_DIR and os.path.isfile(os.path.join(MODEL_DIR, "config.json")):
                tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR, use_fast=True)
                model = AutoModelForCausalLM.from_pretrained(MODEL_DIR, torch_dtype=dtype, device_map="auto" if torch.cuda.is_available() else None, low_cpu_mem_usage=True)
            elif ADAPTER_DIR and os.path.isfile(os.path.join(ADAPTER_DIR, "adapter_config.json")):
                from peft import PeftModel
                tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, use_fast=True)
                base = AutoModelForCausalLM.from_pretrained(BASE_MODEL, torch_dtype=dtype, device_map="auto" if torch.cuda.is_available() else None, low_cpu_mem_usage=True)
                model = PeftModel.from_pretrained(base, ADAPTER_DIR, is_trainable=False).merge_and_unload(safe_merge=True)
            else:
                raise RuntimeError("Merged Sonderr-v1 weights are not installed yet. The model release is still training or has not been downloaded.")
            model.eval()
            load_error = ""
        except Exception as exc:
            load_error = str(exc)
            raise RuntimeError("Could not load Sonderr-v1. Check that the merged model weights and local inference runtime are installed. Details: " + load_error)


class Handler(BaseHTTPRequestHandler):
    server_version = "SonderrV1/1.0"

    def log_message(self, *_args):
        pass

    def send_json(self, status, value):
        body = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            return self.send_json(200, {"ok": True, "model": MODEL_ID, "loaded": model is not None, "loading_error": load_error})
        if self.path in ("/v1/models", "/models"):
            return self.send_json(200, {"object": "list", "data": [{"id": MODEL_ID, "object": "model", "owned_by": "Sonderr", "name": "Sonderr-v1 · 0.6B"}]})
        return self.send_json(404, {"error": {"message": "Not found"}})

    def do_POST(self):
        if self.path not in ("/v1/chat/completions", "/chat/completions"):
            return self.send_json(404, {"error": {"message": "Not found"}})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 2_000_000:
                return self.send_json(413, {"error": {"message": "Request body must be between 1 byte and 2 MB"}})
            request = json.loads(self.rfile.read(length))
            ensure_model()
            messages = request.get("messages") or []
            tools = request.get("tools") or None
            prompt = tokenizer.apply_chat_template(messages, tools=tools, tokenize=False, add_generation_prompt=True)
            device = next(model.parameters()).device
            inputs = tokenizer(prompt, return_tensors="pt").to(device)
            limit = max(32, min(4096, int(request.get("max_tokens", 768))))
            temperature = max(0.0, min(2.0, float(request.get("temperature", 0.2))))
            kwargs = {"max_new_tokens": limit, "do_sample": temperature > 0, "pad_token_id": tokenizer.eos_token_id}
            if temperature > 0:
                kwargs["temperature"] = max(0.01, temperature)
                kwargs["top_p"] = 0.9
            with torch.inference_mode():
                output = model.generate(**inputs, **kwargs)
            text = tokenizer.decode(output[0, inputs["input_ids"].shape[1]:], skip_special_tokens=False).strip()
            tool_match = re.search(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", text, re.S)
            message = {"role": "assistant", "content": text.replace("<|im_end|>", "").replace("<|endoftext|>", "").strip()}
            if tool_match:
                try:
                    call = json.loads(tool_match.group(1))
                    name, args = call.get("name"), call.get("arguments", {})
                    if name and isinstance(args, dict):
                        message["content"] = None
                        message["tool_calls"] = [{"id": "call_" + uuid.uuid4().hex[:16], "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]
                except json.JSONDecodeError:
                    pass
            return self.send_json(200, {"id": "chatcmpl-" + uuid.uuid4().hex, "object": "chat.completion", "created": int(time.time()), "model": MODEL_ID, "choices": [{"index": 0, "message": message, "finish_reason": "tool_calls" if message.get("tool_calls") else "stop"}], "usage": {"prompt_tokens": int(inputs["input_ids"].shape[1]), "completion_tokens": int(output.shape[1] - inputs["input_ids"].shape[1])}})
        except Exception as exc:
            return self.send_json(503, {"error": {"message": str(exc), "type": "local_model_unavailable"}})


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
