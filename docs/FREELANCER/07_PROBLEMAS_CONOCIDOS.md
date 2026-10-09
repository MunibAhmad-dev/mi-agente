# 07 — PROBLEMAS CONOCIDOS

## PROBLEMAS CRÍTICOS

### 1. Sin LLM conectado por defecto
- **Estado:** Ollama configurado pero necesita `ollama pull` de un modelo
- **Impacto:** Sin modelo = sin respuestas del agente
- **Solución:** Ejecutar `ollama pull llama3.2` o conectar un proveedor API
- **Archivo:** `.env` → `OLLAMA_BASE_URL`

### 2. Docker Compose con servicios que dependen de modelos
- **Estado:** Varios servicios requieren modelos descargados
- **Impacto:** Algunos contenedores fallan al iniciar si no hay modelos
- **Solución:** Descargar modelos primero o configurar graceful fallback

---

## PROBLEMAS MENORES

### 3. Puerto 3456 (AI Model Browser)
- **Estado:** Configurado en docker-compose pero el Dockerfile no existe
- **Impacto:** Contenedor no arranca
- **Solución:** Crear `Dockerfile.model-browser` o usar servicio standalone

### 4. Puerto 4096 (OpenCode)
- **Estado:** Configurado pero puede necesitar configuración adicional
- **Impacto:** Puede no estar disponible
- **Solución:** Verificar configuración de OpenCode

### 5. WebLLM sin service worker
- **Estado:** Código listo pero necesita registro de service worker en el browser
- **Impacto:** WebLLM no funciona en browser
- **Solución:** Crear `sw.js` y registrarlo

### 6. Fine-tuning sin dependencias pip
- **Estado:** Código listo pero necesita `unsloth`, `torch`, `transformers`
- **Impacto:** Fine-tuning no funciona
- **Solución:** `pip install unsloth torch transformers peft`

### 7. Vision models grandes
- **Estado:** VisionComplexityRouter configurado pero LLaVA necesita ~7-13GB VRAM
- **Impacto:** Solo Moondream (1.8B) funciona en CPU
- **Solución:** Usar Moondream para tareas simples, GPU para complejas

---

## DEPENDENCIAS FALTANTES (por instalar)

| Dependencia | Para qué | Cómo instalar |
|-------------|----------|---------------|
| `ollama` | LLM local | Descargar de ollama.ai |
| `ffmpeg` | Video processing | `winget install ffmpeg` |
| `playwright` | Browser automation | `npx playwright install` |
| `python` | Code execution | Instalar Python 3.10+ |
| `unsloth` | Fine-tuning | `pip install unsloth` |
| `whisper` | Speech-to-text | `pip install openai-whisper` |

---

## RIESGOS DE SEGURIDAD

| Riesgo | Severidad | Estado |
|--------|-----------|--------|
| MongoDB sin autenticación | ALTO | ⚠️ Solo para desarrollo |
| `.env` con placeholders | BAJO | ✅ Seguro |
| Docker sin network policy | MEDIO | ⚠️ Solo networks internas |
| Sin rate limiting global | MEDIO | ⚠️ RateLimiter tool existe |
| Sin HTTPS en desarrollo | BAJO | ✅ Normal en dev |

---

## NOTAS PARA EL FREELANCER

1. **No editar `docker-compose.yml` directamente** — usar `docker-compose.override.yaml`
2. **MongoDB no tiene auth** — no exponer puerto 27017 a internet
3. **Todos los servicios corren en Docker** — no instalar nada en host excepto Docker Desktop
4. **El `.env.example` tiene placeholders** — copiar a `.env` y configurar
5. **Los tests pasan con `node test_v2_integration.js`** — verificar después de cambios
