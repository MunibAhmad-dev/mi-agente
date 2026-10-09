# Recomendaciones de Integraciones - Proyectos Abiertos y Permisivos

## Fecha: 2026-07-19

---

## 1. BROWSER USE

### Proyecto Recomendado: **Browser Use**
- **GitHub**: https://github.com/browser-use/browser-use
- **Licencia**: MIT ✅
- **Stars**: ~50k+
- **Última actividad**: 2025

### Características
- Automatización de navegador con IA
- Compatible con Playwright (Chromium, Firefox, WebKit)
- Model-agnostic (funciona con cualquier LLM)
- API de herramientas (decoradores)
- Exportación de cookies y perfiles
- Soporta MCP (Model Context Protocol)

### Alternativas Permisivas

| Proyecto | Licencia | Características |
|----------|----------|-----------------|
| **Playwright** | Apache-2.0 | Motor de navegador cross-browser |
| **Stagehand SDK** | MIT | SDK AI para navegador (Python, Go, Rust, Ruby, PHP) |
| **CrewAI** | MIT | Orquestación multi-agente con browser tools |
| **AutoGen** | MIT | Framework de Microsoft para agentes |

### Integración Recomendada

```python
# Browser Use con LiteLLM
from browser_use import Agent
from litellm_client import LiteLLMClient

client = LiteLLMClient(base_url="http://localhost:4000")

agent = Agent(
    task="Buscar información sobre...",
    llm=client.chat,
)

result = await agent.run()
```

### Estructura de Integración

```
integrations/
└── browser-use/
    ├── README.md
    ├── lib/
    │   ├── __init__.py
    │   └── browser_agent.py    # Wrapper para Browser Use
    ├── api/
    │   └── routes.js          # Rutas API
    └── docker-compose.yml      # Con Playwright
```

---

## 2. AUDIO/VIDEO PROCESSING

### Proyecto Recomendado: **Whisper** (OpenAI)
- **GitHub**: https://github.com/openai/whisper
- **Licencia**: MIT ✅
- **Stars**: ~80k+
- **Última actividad**: 2025

### Características
- Transcripción speech-to-text
- Multilingüe (99+ idiomas)
- Modelos en inglés solo
- Word-level timestamps
- VAD integrada

### Alternativas Permisivas

| Proyecto | Licencia | Características |
|----------|----------|-----------------|
| **faster-whisper** | MIT | 4x más rápido que Whisper original |
| **WhisperX** | MIT | Alignment + Speaker Diarization |
| **whisper.cpp** | MIT | Versión C/C++ para edge/mobile |
| **Vosk** | Apache-2.0 | Offline multilingual ASR |
| **FFmpeg 8.0** | LGPL/GPL | Filtro nativo whisper filter |

### Integración Recomendada

```python
# Audio Processing con faster-whisper
from faster_whisper import WhisperModel

model = WhisperModel("large-v3", compute_type="int8")

segments, info = model.transcribe(
    "audio.wav",
    beam_size=5,
    vad_filter=True,
)

for segment in segments:
    print(f"[{segment.start:.2f}s - {segment.end:.2f}s] {segment.text}")
```

### Integración FFmpeg

```bash
# FFmpeg 8.0 con filtro nativo whisper
ffmpeg -i input.mp4 -vn -af "whisper=model=ggml-base.en.bin:language=en:queue=30" output.srt
```

### Estructura de Integración

```
integrations/
└── audio-video/
    ├── README.md
    ├── lib/
    │   ├── __init__.py
    │   ├── transcriber.py     # Wrapper para Whisper
    │   └── processor.py       # Procesamiento FFmpeg
    ├── api/
    │   └── routes.js
    └── docker-compose.yml
```

---

## 3. WAN INTEGRATION (Telephony/VoIP)

### Proyecto Recomendado: **Fonoster**
- **GitHub**: https://github.com/fonoster/fonoster
- **Licencia**: MIT (Routr) ✅
- **Stars**: ~5k+
- **Última actividad**: 2025-2026

### Características
- Alternativa open-source a Twilio
- Voz programable (Answer, Hangup, Play, Say, Gather, Dial, Record)
- SIP/WebRTC support
- Docker/Kubernetes deployment
- SDK para Node.js

### Componentes

| Componente | Licencia | Función |
|------------|----------|---------|
| **Routr** | MIT | SIP/WebRTC routing |
| **Fonoster Core** | MIT | API y control de llamadas |
| **Asterisk** | GPL | PBX (opcional) |

### Alternativas Permisivas

| Proyecto | Licencia | Características |
|----------|----------|-----------------|
| **Eqivo** | MIT | API telephony sobre FreeSWITCH |
| **FreeSWITCH** | MPL | Motor de telefonía completo |
| **SignalWire SDKs** | MIT | SDKs Python, Node, Go |
| **OpenSIPS** | GPL | SIP proxy/router |

### Integración Recomendada

```javascript
// Fonoster SDK para Node.js
const { VoiceClient } = require('@fonoster/sdk');

const voice = new VoiceClient();

await voice.calls.make({
  from: '+1234567890',
  to: '+0987654321',
  webhook: 'https://myapp.com/callback',
});
```

### Estructura de Integración

```
integrations/
└── wan/
    ├── README.md
    ├── lib/
    │   ├── __init__.py
    │   ├── telephony.py        # Wrapper para Fonoster
    │   └── voip_client.py       # Cliente SIP
    ├── api/
    │   └── routes.js
    └── docker-compose.yml        # Con Fonoster/Routr
```

---

## RESUMEN DE LICENCIAS

### ✅ PERMISIVAS (Usar)

| Proyecto | Licencia | Tipo |
|----------|----------|------|
| Browser Use | MIT | Browser automation |
| Playwright | Apache-2.0 | Browser engine |
| Stagehand | MIT | AI browser SDK |
| Whisper | MIT | Speech-to-text |
| faster-whisper | MIT | Whisper optimizado |
| whisper.cpp | MIT | Whisper C/C++ |
| Fonoster/Routr | MIT | VoIP/Telephony |
| Eqivo | MIT | Telephony API |
| Vosk | Apache-2.0 | ASR offline |
| FFmpeg | LGPL/GPL | Video processing |

### ⚠️ MIXTAS (Auditar)

| Proyecto | Licencia | Nota |
|----------|----------|------|
| FreeSWITCH | MPL | Requiere atención |
| CrewAI | MIT | Algunos componentes tienen términos comerciales |
| AutoGen | MIT | Docker sandboxing recomendado |

---

## RECOMENDACIONES DE IMPLEMENTACIÓN

### Orden de Prioridad

1. **Browser Use** (Alta) - Muy popular, comunidad activa, documentación completa
2. **Whisper/faster-whisper** (Alta) - Estado del arte en ASR, fácil de integrar
3. **Fonoster/Routr** (Media) - Alternativa a Twilio viable, requiere más configuración

### Consideraciones de Seguridad

1. **Browser Use**: 
   - Añadir sandboxing para producción
   - Controlar cookies y perfiles
   - Rate limiting

2. **Whisper**:
   - GPU recomendada para throughput
   - Cuantización para edge/low-resource

3. **Fonoster**:
   - RBAC y OAuth2/JWT
   - Configurar SIP trunks de confianza
   - Firewall para puertos SIP

### Docker Compose Recomendado

```yaml
# browser-use + playwright
services:
  playwright:
    image: mcr.microsoft.com/playwright:v1.40.0
    volumes:
      - ./playwright:/app
    ports:
      - "9323:9323"
  
  browser-use:
    build: ./browser-use
    depends_on:
      - playwright
    environment:
      - PLAYWRIGHT_URL=http://playwright:9323
```

---

## PRÓXIMOS PASOS

1. **Crear integración Browser Use** en `/integrations/browser-use/`
2. **Crear integración Whisper** en `/integrations/audio-video/`
3. **Crear integración Fonoster** en `/integrations/wan/`
4. **Actualizar AUDITORIA_ARQUITECTURA.md**

---

## FUENTES

- Browser Use: https://github.com/browser-use/browser-use
- Playwright: https://github.com/microsoft/playwright
- Stagehand: https://github.com/browserbase/stagehand-python
- Whisper: https://github.com/openai/whisper
- faster-whisper: https://github.com/AIXerum/faster-whisper
- whisper.cpp: https://github.com/ggml-org/whisper.cpp
- Fonoster: https://github.com/fonoster/fonoster
- Routr: https://github.com/fonoster/routr
- Eqivo: https://github.com/rtckit/eqivo
