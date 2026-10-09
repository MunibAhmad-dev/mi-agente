"""Embedding service — ONNX-first with torch fallback.

Memory-optimized:
- ONNX: ~25-40MB (all-MiniLM-L6-v2)
- PyTorch: ~300-400MB (fallback)
- Lazy loading: model loaded on first use, not at startup
"""

from __future__ import annotations

import gc
import asyncio
import os
from typing import Any

import numpy as np

from brain.config import get_settings
from brain.core.exceptions import EmbeddingError
from brain.logging_config import get_logger

logger = get_logger("brain.embedding.service")

# Backend state
_backend: str | None = None
_onnx_session = None
_onnx_tokenizer = None
_torch_model = None

ONNX_CACHE_DIR = os.environ.get("BRAIN_ONNX_CACHE", "/app/.cache/brain/onnx")
TORCH_CACHE_DIR = os.environ.get("HF_HOME", "/app/.cache/huggingface")


def _load_onnx() -> bool:
    """Load ONNX embedding model with pre-tokenizer."""
    global _onnx_session, _onnx_tokenizer, _backend

    settings = get_settings()
    model_name = settings.embedding.model

    try:
        import onnxruntime as ort

        # Check multiple possible ONNX model locations
        possible_paths = [
            os.path.join(ONNX_CACHE_DIR, model_name, "model.onnx"),
            os.path.join(ONNX_CACHE_DIR, f"{model_name}.onnx"),
            os.path.join(TORCH_CACHE_DIR, "onnx_models", model_name, "model.onnx"),
        ]

        onnx_path = None
        model_dir = None
        for p in possible_paths:
            if os.path.exists(p):
                onnx_path = p
                model_dir = os.path.dirname(p)
                break

        if onnx_path is None:
            # Try converting from sentence-transformers
            logger.info("onnx_converting", model=model_name)
            try:
                from optimum.onnxruntime import ORTModelForFeatureExtraction
                from transformers import AutoTokenizer

                save_dir = os.path.join(ONNX_CACHE_DIR, model_name)
                os.makedirs(save_dir, exist_ok=True)

                ort_model = ORTModelForFeatureExtraction.from_pretrained(
                    model_name, export=True
                )
                ort_model.save_pretrained(save_dir)
                tokenizer = AutoTokenizer.from_pretrained(model_name)
                tokenizer.save_pretrained(save_dir)

                onnx_path = os.path.join(save_dir, "model.onnx")
                model_dir = save_dir
            except Exception as e:
                logger.warning("onnx_convert_failed", error=str(e))
                return False

        if not os.path.exists(onnx_path):
            logger.warning("onnx_file_not_found", path=onnx_path)
            return False

        # Create ONNX session with minimal memory
        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = 2
        sess_options.inter_op_num_threads = 1
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        _onnx_session = ort.InferenceSession(onnx_path, sess_options)

        # Load tokenizer for the model
        if model_dir:
            try:
                from transformers import AutoTokenizer
                _onnx_tokenizer = AutoTokenizer.from_pretrained(model_dir)
            except Exception:
                try:
                    from transformers import AutoTokenizer
                    _onnx_tokenizer = AutoTokenizer.from_pretrained(model_name)
                except Exception:
                    logger.warning("tokenizer_load_failed")
                    _onnx_tokenizer = None

        _backend = "onnx"
        size_mb = os.path.getsize(onnx_path) / (1024 * 1024)
        logger.info("onnx_model_loaded", path=onnx_path, size_mb=f"{size_mb:.1f}")
        return True

    except ImportError:
        logger.info("onnxruntime_not_available")
        return False
    except Exception as e:
        logger.warning("onnx_load_failed", error=str(e))
        return False


def _load_torch() -> bool:
    """Load PyTorch embedding model (larger but always works)."""
    global _torch_model, _backend

    settings = get_settings()

    try:
        import torch
        torch.set_num_threads(2)
        torch.set_num_interop_threads(1)

        from sentence_transformers import SentenceTransformer

        logger.info("torch_model_loading", model=settings.embedding.model)
        _torch_model = SentenceTransformer(
            settings.embedding.model,
            device=settings.embedding.device,
            cache_folder=os.path.join(TORCH_CACHE_DIR, "sentence_transformers"),
        )
        _torch_model.eval()
        _backend = "torch"
        logger.info("torch_model_loaded", model=settings.embedding.model)
        return True

    except Exception as e:
        logger.warning("torch_load_failed", error=str(e))
        return False


def _ensure_loaded():
    """Ensure an embedding backend is loaded (lazy)."""
    global _backend
    if _backend is not None:
        return

    # Try ONNX first (5x less memory)
    if _load_onnx():
        return

    # Fall back to PyTorch
    if _load_torch():
        return

    raise EmbeddingError("No embedding backend available (neither ONNX nor PyTorch)")


def _tokenize_for_onnx(texts: list[str]) -> dict[str, Any]:
    """Tokenize texts for ONNX inference."""
    if _onnx_tokenizer is not None:
        encoded = _onnx_tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=128,
            return_tensors="np",
        )
        return {k: v for k, v in encoded.items()}

    # Fallback: load tokenizer on demand (slower but works)
    settings = get_settings()
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(settings.embedding.model)
    encoded = tokenizer(
        texts,
        padding=True,
        truncation=True,
        max_length=128,
        return_tensors="np",
    )
    return {k: v for k, v in encoded.items()}


def embed_sync(texts: list[str], normalize: bool = True) -> np.ndarray:
    """Generate embeddings for texts (memory-optimized)."""
    if not texts:
        return np.array([])

    _ensure_loaded()

    if _backend == "onnx":
        return _embed_onnx(texts, normalize)
    else:
        return _embed_torch(texts, normalize)


def _embed_onnx(texts: list[str], normalize: bool = True) -> np.ndarray:
    """Embed using ONNX Runtime (minimal memory)."""
    inputs = _tokenize_for_onnx(texts)

    # Run inference
    outputs = _onnx_session.run(None, inputs)

    # Mean pooling
    attention_mask = inputs.get("attention_mask", np.ones_like(outputs[0][:, :, 0]))
    token_embeddings = outputs[0]
    mask_expanded = np.expand_dims(attention_mask, -1).astype(float)
    summed = np.sum(token_embeddings * mask_expanded, axis=1)
    counts = np.clip(mask_expanded.sum(axis=1), 1e-9, None)
    embeddings = summed / counts

    if normalize:
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        embeddings = embeddings / np.clip(norms, 1e-9, None)

    return embeddings.astype(np.float32)


def _embed_torch(texts: list[str], normalize: bool = True) -> np.ndarray:
    """Embed using PyTorch (fallback)."""
    try:
        embeddings = _torch_model.encode(
            texts,
            batch_size=16,
            show_progress_bar=False,
            normalize_embeddings=normalize,
            convert_to_numpy=True,
        )
        if len(texts) > 10:
            gc.collect()
        return embeddings.astype(np.float32)
    except Exception as e:
        raise EmbeddingError(f"Embedding generation failed: {e}") from e


def embed_one_sync(text: str, normalize: bool = True) -> list[float]:
    """Generate embedding for a single text."""
    embeddings = embed_sync([text], normalize=normalize)
    if len(embeddings) == 0:
        return []
    return embeddings[0].tolist()


async def embed(texts: list[str], normalize: bool = True) -> list[list[float]]:
    """Generate embeddings for texts (async wrapper)."""
    loop = asyncio.get_event_loop()
    embeddings = await loop.run_in_executor(None, embed_sync, texts, normalize)
    return [vec.tolist() for vec in embeddings]


async def embed_one(text: str, normalize: bool = True) -> list[float]:
    """Generate embedding for a single text (async wrapper)."""
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, embed_one_sync, text, normalize)
    return result


def get_dimension() -> int:
    """Get the embedding dimension."""
    settings = get_settings()
    return settings.embedding.dimension


def get_backend() -> str:
    """Get the current embedding backend name."""
    if _backend:
        return _backend
    # Check what's available
    try:
        import onnxruntime
        return "onnx (ready)"
    except ImportError:
        pass
    try:
        import torch
        return "torch (ready)"
    except ImportError:
        pass
    return "none"


def get_memory_info() -> dict[str, Any]:
    """Get memory info about the embedding service."""
    info: dict[str, Any] = {"backend": get_backend(), "loaded": _backend is not None}
    if _backend == "onnx" and _onnx_session:
        try:
            import psutil
            proc = psutil.Process()
            info["ram_mb"] = round(proc.memory_info().rss / (1024 * 1024), 1)
        except Exception:
            pass
    return info
