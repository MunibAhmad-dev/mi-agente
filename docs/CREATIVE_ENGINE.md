# Creative Engine — Face 22

The Creative Engine is the orchestration layer for AI-assisted creative production inside mi-agente. It coordinates a full pipeline from initial idea through final export, spanning 2D/3D art, character design, voice, music, video, game assembly, and quality assurance.

---

## Architecture

```
CreativeEngineOrchestrator
├── CreativePlan            (project state + task graph, persisted to JSON)
├── CharacterSystem         (character design + sprite generation)
├── AssetManager            (asset registry + linking)
└── External services (lazy-loaded, graceful degradation)
    ├── VideoGenerationService  (FFmpeg + HuggingFace SDXL)
    ├── MusicService            (Suno / HuggingFace MusicGen)
    └── ComfyUIService          (open-source image generation)
```

All services are lazy-loaded with try/catch. If a service is unavailable the engine logs what *would* happen and returns a proper response object — it never throws.

---

## Project Types

| type | Pipeline emphasis |
|---|---|
| `game` | characters, sprites, backgrounds, music, sfx, game loop |
| `animation` | characters, backgrounds, animation frames, voice, music |
| `video` | backgrounds, voice-over, music, FFmpeg stitching |
| `visual_novel` | characters, backgrounds, dialogue, music, voice |
| `music_video` | music, video, backgrounds |
| `short_film` | video, voice, music, backgrounds |

---

## Pipeline Phases

1. **planning** — Brief analysis, asset list, timeline derivation
2. **characters** — Character sheets, sprite generation, voice profile
3. **assets** — Backgrounds, props, music, SFX
4. **scenes** — Scene composition from assets
5. **assembly** — Timeline stitching, audio sync, colour grade
6. **qa** — Automated review, issue log, revisions
7. **export** — Final render, package, metadata

Phases have explicit dependencies. `characters` and `assets` both depend on `planning`; `scenes` depends on both `characters` and `assets`.

---

## REST API

Base path: `/api/creative-engine`

All routes require JWT authentication.

| Method | Path | Action |
|---|---|---|
| GET | `/status` | Engine + service availability |
| POST | `/projects` | Create project |
| GET | `/projects` | List all projects |
| GET | `/projects/:id` | Get project + computed status |
| POST | `/projects/:id/phase/:phaseId` | Execute a phase |
| POST | `/projects/:id/generate` | Generate an asset |
| POST | `/projects/:id/assemble` | Assemble a scene |
| POST | `/projects/:id/build` | Build final output |
| GET | `/projects/:id/assets` | List assets (`?type=` optional filter) |
| POST | `/projects/:id/characters` | Create a character |
| GET | `/projects/:id/characters` | List characters |

### Create Project

```json
POST /api/creative-engine/projects
{
  "title": "My Indie Game",
  "description": "A pixel-art platformer with a robot protagonist.",
  "type": "game"
}
```

### Execute Phase

```json
POST /api/creative-engine/projects/{id}/phase/planning
{}
```

Pass phase-specific options in the request body. For `characters`, pass `{ "characters": [ { "name": "...", "style": "pixel" } ] }`.

### Generate Asset

```json
POST /api/creative-engine/projects/{id}/generate
{
  "assetType": "music",
  "prompt": "upbeat chiptune boss battle theme",
  "params": { "duration": 60 }
}
```

**Asset types:** `character`, `scene`, `music`, `voice`, `video`, `sprite`, `3d_model`, `background`, `prop`, `sfx`, `animation`, `concept_art`, `texture`, `other`

### Create Character

```json
POST /api/creative-engine/projects/{id}/characters
{
  "name": "RoboHero",
  "description": "A small robot with a big heart",
  "style": "pixel",
  "personality": "brave, curious",
  "traits": ["fast", "can_double_jump"],
  "voiceType": "robotic"
}
```

---

## Storage

Projects are persisted to `data/creative_projects/{projectId}.json`. The directory is created automatically on first use.

Each JSON file contains:
- Project metadata (title, description, type, dates)
- Phase state (status, completedTasks, log per phase)
- Characters array (with sprites)
- Assets array (managed by AssetManager)
- Scenes array
- Final output metadata

---

## Service Configuration

| Service | Required env var | Fallback behaviour |
|---|---|---|
| VideoGenerationService | `HUGGINGFACE_TOKEN` + FFmpeg on PATH | Logs what would be generated, returns simulated asset |
| MusicService | `SUNO_API_KEY` or `HUGGINGFACE_TOKEN` | Same |
| ComfyUIService | `COMFYUI_URL` (default: `http://comfyui:8188`) | Falls back to ImageRuntime, then simulated |
| ImageRuntime | `HUGGINGFACE_TOKEN` | Returns placeholder |

---

## Extending the Engine

To add a new phase handler, add an entry to `PHASE_HANDLERS` in `CreativeEngineOrchestrator.js`:

```js
PHASE_HANDLERS.my_phase = async function(orch, project, plan, opts) {
  // do work, call orch._getAssetManager(), etc.
  return { result: '...' };
};
```

To add a new asset type, add to `VALID_TYPES` in `AssetManager.js` and add a case in `CreativeEngineOrchestrator._generateAsset()`.
