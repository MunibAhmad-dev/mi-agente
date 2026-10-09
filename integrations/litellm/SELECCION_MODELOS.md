# Selección de modelos — qué usar, qué no, y con qué criterio

No tengo el código de AI-OS (`mi-manus-nuevo-proyecto-final`) en este repo, así que
no puedo leer directamente cuáles son sus 12 proveedores registrados en
`UnifiedGateway`. Esta tabla trae los proveedores más comunes que soporta LiteLLM
como punto de partida — reemplaza filas, agrega las que falten, y bórralas cuando
decidas. Lo que sí queda resuelto es el **mecanismo**: cada fila marcada `✅ Usar`
es la que debe estar descomentada en `config.yaml`; el resto se deja comentada.

**Criterios (columnas):**
- **Costo** — aproximado, por 1M tokens (entrada), a nivel orientativo
- **Contexto** — ventana máxima soportada
- **Herramientas** — soporta tool/function calling (lo necesita cualquier Agent)
- **Visión** — acepta imágenes
- **Velocidad** — percepción relativa (alta/media/baja), no un benchmark
- **Rol sugerido** — a qué `model_name` de `config.yaml` debería mapear (`aios-principal` = tareas complejas, `aios-rapido` = tareas simples/baratas)

| Proveedor / modelo | Usar | Costo | Contexto | Herramientas | Visión | Velocidad | Rol sugerido | Motivo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Anthropic — claude-sonnet-4-5 | ✅ | Medio | 200K | Sí | Sí | Media | aios-principal | Buen balance calidad/costo para agentes con herramientas |
| Anthropic — claude-3-5-haiku | ✅ | Bajo | 200K | Sí | No | Alta | aios-rapido | Barato y rápido para tareas simples/clasificación |
| OpenAI — gpt-4o | 🟡 | Medio | 128K | Sí | Sí | Media | aios-principal (fallback) | Evaluar si aporta algo que Anthropic no cubra ya |
| OpenAI — gpt-4o-mini | 🟡 | Bajo | 128K | Sí | Sí | Alta | aios-rapido (fallback) | Fallback del rol rápido |
| Google — gemini-2.0-flash | ❌ | Bajo | 1M | Sí | Sí | Alta | — | Sin decidir — evaluar contexto largo para research |
| Azure OpenAI | ❌ | — | — | — | — | — | — | Solo si ya hay contrato/compliance con Azure |
| AWS Bedrock | ❌ | — | — | — | — | — | — | Solo si ya hay infraestructura AWS |
| Mistral — mistral-small | ❌ | Bajo | 32K | Sí | No | Alta | — | Sin decidir |
| Groq (inferencia rápida) | ❌ | Bajo | — | Parcial | No | Muy alta | — | Útil si latencia es crítica, revisar soporte de tools |
| DeepSeek | ❌ | Muy bajo | 64K | Sí | No | Media | — | Sin decidir — evaluar calidad para código |
| Cohere | ❌ | — | — | — | — | — | — | Sin caso de uso claro todavía |
| OpenRouter (multi-modelo) | ❌ | Variable | Variable | Variable | Variable | Variable | — | Solo como catálogo de respaldo, no como principal |

## Cómo se aplica en `config.yaml`

1. Marca `✅ Usar` en esta tabla para lo que quieras activo.
2. En `config.yaml`, cada proveedor tiene un bloque bajo `aios-principal` o
   `aios-rapido` — descomenta el bloque correspondiente y completa la
   variable de entorno de su API key en `.env`.
3. Dentro de cada rol, el `order` decide el orden de intento (1 = primero).
4. Todo lo marcado `❌` queda comentado — no se borra, para no perder la
   referencia si más adelante se reconsidera.

## Pendiente

- Completar esta tabla con los 12 proveedores reales que audita el documento
  (`src/ai_os/core/...` / `UnifiedGateway`) — hoy son proveedores genéricos de
  ejemplo, no confirmados contra el código real de AI-OS.
- Decidir el criterio de costo real (aquí es orientativo, no tomado de ninguna
  tabla de precios verificada a la fecha).
