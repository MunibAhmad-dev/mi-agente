# Memory Architecture

## Overview

Three memory systems plus a unified MemoryFacade:

```
MemoryFacade (unified entry-point)
    │
    ├── MemoriaMulticapa    ← PRIMARY: three-layer persistent memory
    │      ├── Episodic     (recent experiences, decay with 7-day half-life)
    │      ├── Semantic     (facts: key/value with confidence + source)
    │      └── Procedural   (task type → step sequences + quality scores)
    │
    ├── CrossSessionMemory  ← flat session history (fallback)
    │
    └── WorldModel          ← entity/relation/environment snapshot
```

## MemoriaMulticapa (three-layer)

### Episodic memory
- `recordEpisode(userId, content, tags)` — stores a labeled experience
- `recallEpisodic(userId, query, limit)` — scored recall by keyword match + recency
- Decay: importance = `Math.pow(0.5, daysSince / 7)` (7-day half-life)
- Persists to `data/memoria/episodic.json`

### Semantic memory
- `learnFact(key, value, { confidence, source })` — upsert a keyed fact
- `recallFact(key)` — exact key lookup
- `queryFacts(prefix)` — prefix scan
- Persists to `data/memoria/semantic.json`

### Procedural memory
- `learnProcedure(taskType, steps, quality)` — store or improve step sequence
- `recallProcedure(taskType)` — best known procedure for a task type
- Persists to `data/memoria/procedural.json`

### Combined context
- `getContext(userId, query, opts)` — returns a combined string for LLM injection

## CrossSessionMemory (flat)

Used as fallback when MemoriaMulticapa has no episodic entries yet.
- `saveSession(sessionData)` — persist session summary
- `getContext(userId, query, limit)` — scored recall by keyword match

## WorldModel

See `WORLD_MODEL.md`.

## MemoryFacade API

```javascript
const memory = require('~/server/services/Memory/MemoryFacade');

// Get combined context for LLM injection
const { context, sources } = memory.getContext(userId, 'fix the auth bug');

// Record what happened
memory.recordEpisode(userId, 'Fixed JWT expiry bug in auth.js — quality 90%', ['auth', 'fix']);

// Store a fact
memory.learnFact('auth.secret_rotation', 'Every 30 days', { confidence: 1.0, source: 'ops runbook' });

// Update world state
memory.updateWorld({ lastTask: 'fix-auth', lastQuality: 0.9 });
```

## Checkpoint (consolidated)

All five previous CheckpointManager instantiations now route through a single
instance via `MemoryFacade.getCheckpoint()`. This eliminates duplicate file
handles and state conflicts.

```javascript
const { saveCheckpoint, loadCheckpoint } = require('~/server/services/Memory/MemoryFacade');
saveCheckpoint(sessionId, { steps, avgQuality });
const state = loadCheckpoint(sessionId);
```
