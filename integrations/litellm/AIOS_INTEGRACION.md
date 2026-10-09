# LiteLLM proxy — integración con LibreChat/AI-OS (Puente 1)

`config.yaml` en esta carpeta es un punto de partida para exponer el proxy nativo
de LiteLLM (no el `/chat` custom de AI-OS) como el endpoint de modelos que
consume LibreChat, reutilizando el registro de proveedores que `UnifiedGateway`
ya construyó en AI-OS.

## Por qué esto y no el bug de prioridad de AI-OS

La auditoría marca que `GET/PUT /models/priority/{role}` devuelve 500 porque
`_migrate_add_priority_column()` nunca se llama desde `init_db()`. En vez de
arreglar esa migración y mantener una tabla de prioridad propia, `config.yaml`
usa lo que el Router de LiteLLM ya trae nativo:

- **`model_info.order`** por deployment → varios modelos bajo el mismo
  `model_name` (un "rol"), con prioridad explícita.
- **`router_settings.cooldown_time` / `allowed_fails_policy`** → un deployment
  que falla sale de rotación automáticamente, sin tabla ni migración.
- **`general_settings.background_health_checks`** → pings periódicos que
  alimentan esa rotación.

Esto resuelve a la vez el bug de la auditoría y el hueco marcado en el
checklist ("Fallback automático de prioridad de modelos por salud/rol").

## Cómo levantarlo

```bash
pip install 'litellm[proxy]'
litellm --config integrations/litellm/config.yaml --port 4000
```

## Cómo lo consume LibreChat

Como "custom endpoint" 100% compatible con OpenAI en `librechat.yaml`
(ver la entrada `LiteLLM (AI-OS Gateway)`), apuntando `baseURL` a
`http://localhost:4000` — sin tocar el endpoint nativo `anthropic`, que sigue
libre para usarse con `free-claude-code` (ver `integrations/free-claude-code/`)
u otro proveedor directo si se prefiere.

## Cómo probar

```bash
litellm --config integrations/litellm/config.yaml --port 4000
# en otra terminal:
export LITELLM_AIOS_BASE_URL=http://localhost:4000
export LITELLM_AIOS_API_KEY=sk-local-no-auth
./integrations/litellm/test_proxy.sh
```

`test_proxy.sh` verifica: que el proxy responde, qué modelos expone, una
llamada real al rol `aios-rapido` (para confirmar que el `order`/fallback
funciona), y el estado de los health checks por deployment.

## Pendiente / a decidir

- `config.yaml` trae los proveedores marcados como "Usar" en
  `SELECCION_MODELOS.md` (Anthropic activo, OpenAI como fallback comentable);
  el resto de proveedores están ahí mismo como bloques comentados, listos
  para descomentar según se decida en esa tabla.
- La tabla de `SELECCION_MODELOS.md` usa proveedores genéricos de LiteLLM
  como punto de partida — falta confirmarla contra los 12 proveedores reales
  que audita el documento (no tengo el código de AI-OS en este repo).
- Definir si el proxy corre como servicio propio en `docker-compose` (todavía
  no está añadido ahí) o se levanta aparte.
- Decidir si se protege con `master_key` antes de exponerlo fuera de localhost.
