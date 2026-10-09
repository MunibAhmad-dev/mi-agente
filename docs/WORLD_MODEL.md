# World Model — Face 8 Phase 5

## What it is

The WorldModel maintains a live, persistent snapshot of the agent's environment: known entities, their relations, and environment state. It is updated before and after every ExecutiveLoop run so the Director always has situational context.

## Data model

### Entities
Named objects with attributes:
```json
{ "id": "session:abc123", "type": "session", "name": "abc123", "attributes": { "intent": "code_task", "quality": 0.82 } }
```

### Relations
```json
{ "from": "user:alice", "to": "project:webapp", "relation": "owns", "confidence": 1.0 }
```

### Environment
Key/value snapshot of current system state:
```json
{ "activeUser": "alice", "lastIntent": "code_task", "lastApproach": "code_pipeline", "lastQuality": 0.82 }
```

## Persistence

State persists to `data/world_model.json`. History is kept for the last 100 environment snapshots.

## Usage

```javascript
const { getWorldModel } = require('~/server/services/Harness/cognitive/WorldModel');
const wm = getWorldModel();

// Update environment
wm.updateEnv({ activeUser: userId, lastMessage: 'fix the login bug' });

// Get context for LLM injection
const context = wm.getContextSummary();
// → "Env: activeUser=alice, lastIntent=code_task. Entities: 3. Relations: 1."

// Register an entity
wm.upsertEntity({ id: 'file:auth.js', type: 'file', name: 'auth.js', attributes: { status: 'modified' } });
```

## Via MemoryFacade

```javascript
const { updateWorld, upsertEntity } = require('~/server/services/Memory/MemoryFacade');
updateWorld({ status: 'ready' });
upsertEntity({ id: 'task:1', type: 'task', name: 'Fix login' });
```
