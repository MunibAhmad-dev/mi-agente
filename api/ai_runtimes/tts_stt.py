"""
TTS + STT runtime — FASE 29.

Servicio FastAPI independiente que corre DENTRO del contenedor `rag_api`
(puerto 8500) para no añadir contenedores pesados al stack:

  POST /tts   { text, voice?, speed?, lang? }  → WAV (audio/wav)
  POST /stt   multipart file=audio.wav          → { text }
  GET  /health                                  → estado de los motores

Modelos (locales, licencias permisivas):
  - TTS: Kokoro-82M ONNX (Apache-2.0) — kokoro-v1.0.onnx (~325 MB) +
         voices-v1.0.bin (~28 MB). Sin torch: onnxruntime CPU.
  - STT: faster-whisper "tiny" (MIT) — ~75 MB, ctranslate2 CPU (int8).

Ambos cargan de forma perezosa (primera petición) y quedan en memoria.
"""

import os
import time
import threading
import wave
from io import BytesIO

import numpy as np
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import Response, JSONResponse

MODELS_DIR = os.getenv("AI_RUNTIMES_MODELS_DIR", "/app/models")
TTS_MODEL = os.getenv("TTS_MODEL_PATH", os.path.join(MODELS_DIR, "kokoro-v1.0.onnx"))
TTS_VOICES = os.getenv("TTS_VOICES_PATH", os.path.join(MODELS_DIR, "voices-v1.0.bin"))
STT_MODEL = os.getenv("STT_MODEL_NAME", "tiny")
STT_ROOT = os.getenv("STT_DOWNLOAD_ROOT", os.path.join(MODELS_DIR, "whisper"))
MAX_TEXT_CHARS = 2000
MAX_AUDIO_MB = 25

app = FastAPI(title="AI Runtimes (TTS/STT)", version="0.1.0")

_tts = None
_stt = None
_lock = threading.Lock()


def get_tts():
    global _tts
    if _tts is None:
        from kokoro_onnx import Kokoro
        _tts = Kokoro(TTS_MODEL, TTS_VOICES)
    return _tts


def get_stt():
    global _stt
    if _stt is None:
        from faster_whisper import WhisperModel
        _stt = WhisperModel(STT_MODEL, device="cpu", compute_type="int8", download_root=STT_ROOT)
    return _stt


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "tts_stt",
        "tts_loaded": _tts is not None,
        "stt_loaded": _stt is not None,
        "tts_model": os.path.basename(TTS_MODEL),
        "stt_model": STT_MODEL,
    }


@app.post("/tts")
def tts(
    text: str = Form(...),
    voice: str = Form("af_heart"),
    speed: float = Form(1.0),
    lang: str = Form("en-us"),
):
    if not text or not text.strip():
        return JSONResponse({"error": "text vacío"}, status_code=400)
    text = text.strip()[:MAX_TEXT_CHARS]
    try:
        t0 = time.time()
        with _lock:
            kokoro = get_tts()
            samples, sr = kokoro.create(text, voice=voice, speed=float(speed), lang=lang)
        buf = BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sr)
            w.writeframes((samples * 32767).astype(np.int16).tobytes())
        return Response(
            content=buf.getvalue(),
            media_type="audio/wav",
            headers={"X-Latency-Ms": str(round((time.time() - t0) * 1000))},
        )
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/stt")
async def stt(file: UploadFile = File(...), language: str = Form("")):
    data = await file.read()
    if not data:
        return JSONResponse({"error": "audio vacío"}, status_code=400)
    if len(data) < 44:
        return JSONResponse(
            {"error": f"audio demasiado corto ({len(data)} bytes)"},
            status_code=400,
        )
    if len(data) > MAX_AUDIO_MB * 1024 * 1024:
        return JSONResponse({"error": "audio demasiado grande"}, status_code=413)
    try:
        t0 = time.time()
        # BytesIO en vez de archivo temporal: evita depender de la extensión
        # del nombre (faster-whisper acepta file-like y detecta el codec solo).
        import io
        buf = io.BytesIO(data)
        buf.seek(0)
        with _lock:
            whisper = get_stt()
            segments, info = whisper.transcribe(
                buf,
                language=language or None,
                vad_filter=True,
            )
            text = " ".join(s.text.strip() for s in segments)
        return {
            "text": text,
            "language": info.language if hasattr(info, "language") else language,
            "latency_ms": round((time.time() - t0) * 1000),
        }
    except Exception as e:  # noqa: BLE001
        import binascii
        return JSONResponse(
            {
                "error": str(e),
                "debug_bytes": len(data),
                "debug_head": binascii.hexlify(data[:16]).decode(),
            },
            status_code=500,
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("AI_RUNTIMES_PORT", "8500")), log_level="info")
