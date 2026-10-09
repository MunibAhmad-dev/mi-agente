# 🌐 Universal Web & Dashboard Reconstruction Engine

Plataforma autónoma de **ingeniería inversa, reconstrucción, creación y reparación de interfaces web**.

## Qué hace

```
URL/Screenshot → Browser → Capture → Vision → Forensics → DOM/CSS → Code → Render → Compare → Repair → Loop
```

## Estructura

```
├── core/                    # Motor principal
│   ├── engine.js            # Pipeline E2E (7 fases)
│   ├── agent-base.js        # Clase base agentes
│   ├── memory.js            # SQLite (sql.js WASM)
│   ├── registries.js        # Skills, Tools, Models
│   ├── types.ts
│   └── utils.js
├── agents/                  # 11 agentes especializados
│   ├── browser-agent.js     # Playwright
│   ├── vision-agent.js      # Sharp analysis
│   ├── design-forensics-agent.js
│   ├── frontend-agent.js    # HTML/CSS generation
│   ├── visual-qa-agent.js   # Pixel comparison
│   ├── auto-repair-agent.js # CSS auto-repair
│   ├── supervisor.js        # Multi-agent orchestration
│   ├── animation-agent.js   # anime.js
│   ├── drawing-agent.js     # Annotation overlay
│   ├── manus-agent.js       # Autonomous planning
│   └── specialized-agents.js
├── registry/                # 87 UI capabilities
├── apps/api/server.js       # Express API (3099)
├── apps/dashboard/          # Dashboard UI
├── skills/                  # 25 skills
├── memory/                  # SQLite persistence
├── ARCHITECTURAL_DEBT.md
├── AUDIT.md
└── FORENSIC_AUDIT.md
```

## Instalar y ejecutar

```bash
npm install
node apps/api/server.js    # API en http://localhost:3099
```

## API

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/health` | Estado |
| `GET /api/engine/status` | Skills, tools, models |
| `POST /api/clone` | Iniciar reconstrucción |
| `GET /api/capabilities` | 87 capacidades UI |
| `POST /api/capabilities/route` | Routear elemento → capacidad |
| `GET /api/memory` | SQLite memory |
| `GET /api/stream` | SSE live events |

## Métricas

- **Score**: 90.79% overall, 99.67% pixel match
- **Pipeline**: 7 fases, ~30s por reconstrucción
- **Capacidades**: 87, 100% cobertura routing
- **Agentes**: 11 especializados
- **Memory**: SQLite con auto-migración

## Stack

Node.js (ESM) • Playwright • Sharp • sql.js • Express • Tailwind CSS • MIT
