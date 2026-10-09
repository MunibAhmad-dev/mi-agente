"""Convert sentence-transformers model to ONNX for memory-efficient inference."""

import os
import sys

def convert():
    model_name = os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    cache_dir = "/app/.cache/brain/onnx"
    os.makedirs(cache_dir, exist_ok=True)

    model_dir = os.path.join(cache_dir, model_name)
    onnx_path = os.path.join(model_dir, "model.onnx")

    if os.path.exists(onnx_path):
        print(f"ONNX model already exists at {onnx_path}")
        return True

    try:
        from optimum.onnxruntime import ORTModelForFeatureExtraction
        from transformers import AutoTokenizer

        print(f"Converting {model_name} to ONNX...")
        ort_model = ORTModelForFeatureExtraction.from_pretrained(model_name, export=True)
        ort_model.save_pretrained(model_dir)

        tokenizer = AutoTokenizer.from_pretrained(model_name)
        tokenizer.save_pretrained(model_dir)

        if os.path.exists(onnx_path):
            size_mb = os.path.getsize(onnx_path) / (1024*1024)
            print(f"ONNX model saved to {model_dir} ({size_mb:.1f}MB)")
            return True
        else:
            print(f"ONNX file not found after conversion")
            return False

    except Exception as e:
        print(f"ONNX conversion failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = convert()
    sys.exit(0 if success else 1)
