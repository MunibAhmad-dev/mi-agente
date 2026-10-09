# Creative AI Orchestrator — Third-Party Licenses

## Platform Core

| Component | License | Usage |
|-----------|---------|-------|
| CAIO Core | MIT | Platform orchestration |
| TypeScript | Apache-2.0 | Language |
| Express | MIT | HTTP server |
| ws | MIT | WebSocket |
| sql.js | MIT | SQLite database |
| uuid | MIT | ID generation |

## Reference Projects (Not Dependencies)

| Project | License | Usage |
|---------|---------|-------|
| ComfyUI | GPL-3.0 | Runtime (separate process) |
| ComfyUI-Manager | GPL-3.0 | Node management (separate process) |
| Pinokio | MIT | Reference for installation patterns |
| SwarmUI | MIT | Reference for UX patterns |
| OpenHands | MIT (non-enterprise) | Reference for agent patterns |
| smolagents | Apache-2.0 | Reference for tool patterns |
| LlamaIndex | MIT | Reference for RAG patterns |
| OpenCV | Apache-2.0 | Reference for vision patterns |

## License Compliance

### GPL Boundary

ComfyUI (GPL-3.0) is used as a **separate process** that communicates via HTTP API. This creates a clear process boundary:

```
CAIO Core (MIT)
    |
    | HTTP API boundary
    |
ComfyUI Process (GPL-3.0)
```

No GPL code is copied or linked into the CAIO core. The adapter sends HTTP requests and receives HTTP responses — standard inter-process communication.

### Dependency Tracking

The License Engine (src/discovery/license/engine.ts) automatically:
- Detects SPDX license identifiers
- Separates code, model, dataset, and asset licenses
- Checks copyleft compatibility
- Flags commercial use restrictions
- Stores dependency license metadata in SQLite
