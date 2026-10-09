# 10 — RESUMEN DE DESPLIEGUE E INFRAESTRUCTURA

---

## ARQUITECTURA DE DESPLIEGUE

```
┌─────────────────────────────────────────────────────────────────┐
│                    DOCKER COMPOSE                                │
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │   LibreChat API     │  │   MongoDB           │              │
│  │   Puerto: 3080      │  │   Puerto: 27017     │              │
│  │   (UI principal)    │◄─┤   (Base de datos)   │              │
│  └─────────┬───────────┘  └─────────────────────┘              │
│            │                                                    │
│  ┌─────────┼───────────┐  ┌─────────────────────┐              │
│  │   RAG API           │  │   Redis             │              │
│  │   Puerto: 8000      │  │   Puerto: 6379      │              │
│  │   (Búsqueda RAG)   │  │   (Cache)           │              │
│  └─────────┬───────────┘  └─────────────────────┘              │
│            │                                                    │
│  ┌─────────┼───────────┐  ┌─────────────────────┐              │
│  │   pgvector          │  │   MeiliSearch       │              │
│  │   Puerto: 5432      │  │   Puerto: 7700      │              │
│  │   (Vector DB)       │  │   (Full-text)       │              │
│  └─────────┬───────────┘  └─────────────────────┘              │
│            │                                                    │
│  ┌─────────┼───────────┐  ┌─────────────────────┐              │
│  │   Ollama            │  │   Admin Panel       │              │
│  │   Puerto: 11434     │  │   Puerto: 3000      │              │
│  │   (LLM local)       │  │   (Admin UI)        │              │
│  └─────────┬───────────┘  └─────────────────────┘              │
│            │                                                    │
│  ┌─────────┼───────────┐  ┌─────────────────────┐              │
│  │   OpenCode          │  │   OpenCode Bridge   │              │
│  │   Puerto: 4096      │  │   Puerto: 4097      │              │
│  │   (Code Editor)     │  │   (Bridge)          │              │
│  └─────────────────────┘  └─────────────────────┘              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────┐       │
│  │              AI Model Browser                        │       │
│  │              Puerto: 3456                            │       │
│  │              (Buscador de modelos)                   │       │
│  └─────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## CONTENEDORES DOCKER (10)

| # | Contenedor | Imagen/Puerto | Función | Estado |
|---|-----------|---------------|---------|--------|
| 1 | `LibreChat` | `librechat-dev:latest` / 3080 | API + UI principal | ✅ |
| 2 | `chat-mongodb` | `mongo:7` / 27017 | Base de datos | ✅ |
| 3 | `chat-redis` | `redis:7-alpine` / 6379 | Cache / Sessions | ✅ |
| 4 | `rag_api` | Python / 8000 | RAG + Embeddings | ✅ |
| 5 | `vectordb` | `pgvector/pgvector:pg16` / 5432 | Vector DB | ✅ |
| 6 | `chat-meilisearch` | `getmeili/meilisearch:v1.7` / 7700 | Full-text search | ✅ |
| 7 | `ollama` | `ollama/ollama` / 11434 | LLM local | ✅ |
| 8 | `admin-panel` | Node.js / 3000 | Admin dashboard | ✅ |
| 9 | `opencode` | Go / 4096 | Code editor | ✅ |
| 10 | `opencode-bridge` | Node.js / 4097 | Bridge API | ✅ |

---

## COMANDOS DOCKER ÚTILES

```bash
# Ver todos los contenedores corriendo
docker ps

# Ver logs de un contenedor
docker logs -f LibreChat

# Reiniciar un contenedor
docker restart chat-mongodb

# Verificar salud
docker exec LibreChat curl -s http://localhost:3080/api/health

# Parar todo
docker-compose down

# Limpiar todo (incluyendo datos)
docker-compose down -v

# Reconstruir después de cambios
docker-compose up -d --build

# Ver uso de recursos
docker stats
```

---

## PUERTOS

| Puerto | Servicio | URL | Acceso |
|--------|----------|-----|--------|
| 3080 | LibreChat UI | http://localhost:3080 | Externo |
| 3000 | Admin Panel | http://localhost:3000 | Externo |
| 4096 | OpenCode | http://localhost:4096 | Externo |
| 4097 | OpenCode Bridge | http://localhost:4097 | Interno |
| 11434 | Ollama | http://localhost:11434 | Externo |
| 27017 | MongoDB | mongodb://localhost:27017 | Externo |
| 6379 | Redis | localhost:6379 | Interno |
| 5432 | pgvector | localhost:5432 | Interno |
| 7700 | MeiliSearch | http://localhost:7700 | Interno |
| 8000 | RAG API | http://localhost:8000 | Interno |
| 3456 | AI Model Browser | http://localhost:3456 | Externo |

---

## VARIABLES DE ENTorno PRINCIPALES (.env)

```bash
# === BASE DE DATOS ===
MONGO_URI=mongodb://mongodb:27017/LibreChat
REDIS_HOST=redis
REDIS_PORT=6379

# === MEILISEARCH ===
MEILI_HOST=http://meilisearch:7700
MEILI_MASTER_KEY=your-meilisearch-master-key

# === RAG ===
RAG_PORT=8000
RAG_API_URL=http://rag_api:8000

# === LLM LOCAL (Ollama) ===
OLLAMA_BASE_URL=http://host.docker.internal:11434
DEFAULT_MODEL=llama3.2

# === LLM REMOTO (opcional) ===
OPENAI_API_KEY=your-key-here
ANTHROPIC_API_KEY=your-key-here
GROK_API_KEY=your-key-here

# === SEGURIDAD ===
CREDS_KEY=your-credentials-encryption-key
CREDS_IV=your-credentials-initialization-vector

# === SERVIDOR ===
PORT=3080
NODE_ENV=development
```

---

## INSTALACIÓN (para el freelancer)

### Windows:
```bash
git clone https://github.com/proyectos-aoi/mi-agente.git
cd mi-agente
setup.bat
```

### Linux/Mac:
```bash
git clone https://github.com/proyectos-aoi/mi-agente.git
cd mi-agente
chmod +x setup.sh
./setup.sh
```

### Manual:
```bash
# 1. Clonar
git clone https://github.com/proyectos-aoi/mi-agente.git
cd mi-agente

# 2. Copiar .env
cp .env.example .env
# Editar .env con tus configuraciones

# 3. Descargar modelo LLM
ollama pull llama3.2

# 4. Levantar todo
docker-compose up -d

# 5. Verificar
docker ps
curl http://localhost:3080
```

---

## RECURSOS MÍNIMOS RECOMENDADOS

| Componente | RAM | CPU | Disco |
|------------|-----|-----|-------|
| Docker Desktop | 2GB | 2 cores | 10GB |
| MongoDB | 512MB | 1 core | 2GB |
| Redis | 256MB | 1 core | 100MB |
| Ollama (llama3.2 3B) | 4GB | 4 cores | 2GB |
| LibreChat | 1GB | 2 cores | 500MB |
| pgvector | 512MB | 1 core | 1GB |
| MeiliSearch | 512MB | 1 core | 500MB |
| **TOTAL MÍNIMO** | **~9GB** | **~8 cores** | **~16GB** |

### Para modelos más grandes:
| Modelo | RAM necesaria | VRAM (GPU) |
|--------|---------------|------------|
| llama3.2 3B | 4GB | No necesita |
| llama3.1 8B | 8GB | 6GB |
| llama3.1 70B | 40GB | 40GB |
| Moondream 1.8B | 2GB | No necesita |
| LLaVA 7B | 8GB | 6GB |

---

## BACKUP

### MongoDB:
```bash
# Backup
docker exec chat-mongodb mongodump --archive > backup.dump

# Restore
docker exec -i chat-mongodb mongorestore --archive < backup.dump
```

### Archivos del proyecto:
```bash
# El proyecto completo está en GitHub
git clone https://github.com/proyectos-aoi/mi-agente.git
```

---

## TROUBLESHOOTING

| Problema | Solución |
|----------|----------|
| Puerto 3080 en uso | Cambiar `PORT` en `.env` |
| MongoDB no conecta | `docker restart chat-mongodb` |
| Ollama no responde | Verificar que esté corriendo: `curl http://localhost:11434/api/tags` |
| Modelo no encontrado | Ejecutar `ollama pull llama3.2` |
| Docker sin espacio | `docker system prune -a` |
| Logs de error | `docker logs -f <nombre-contenedor>` |
| Reconstruir todo | `docker-compose up -d --build --force-recreate` |

---

## NOTAS PARA EL FREELANCER

1. **Docker Desktop debe estar instalado** — descargar de docker.com
2. **Los datos están en Docker volumes** — no se pierden al reiniciar
3. **MongoDB no tiene auth** — no exponer puerto 27017
4. **Ollama necesita descargar modelos** — primera vez tarda ~2-10GB
5. **El `.env.example` tiene placeholders** — copiar a `.env`
6. **Para ver logs**: `docker logs -f LibreChat`
7. **Para entrar a un contenedor**: `docker exec -it LibreChat bash`
8. **Los tests**: `node test_v2_integration.js` (23 tests)
