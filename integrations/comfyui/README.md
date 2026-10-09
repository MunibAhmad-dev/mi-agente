# 🔥 ComfyUI Integration for LibreChat

<p align="center">
  <img src="https://img.shields.io/badge/ComfyUI-Integration-blue.svg" alt="ComfyUI">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
</p>

Sistema de integración de ComfyUI para generación de imágenes y video en LibreChat.

---

## 📋 Tabla de Contenidos

1. [Descripción](#-descripción)
2. [Arquitectura](#-arquitectura)
3. [Componentes](#-componentes)
4. [Instalación](#-instalación)
5. [Configuración](#-configuración)
6. [API](#-api)
7. [UI](#-ui)

---

## 📖 Descripción

Integración de **ComfyUI** como sistema de generación de imágenes/vídeo en LibreChat, permitiendo:

- 🎨 **Text-to-Image** - Generación de imágenes desde texto
- 🔄 **Image-to-Image** - Transformación de imágenes existentes
- 🎬 **Video Generation** - Creación de vídeos
- 🎛️ **Workflows Custom** - Flujos de trabajo personalizados
- 📊 **Preview Real-time** - Vista previa de resultados

### Modelos Soportados

| Categoría | Modelos |
|-----------|---------|
| **SDXL** | sd_xl_base_1.0, sd_xl_refiner_1.0 |
| **SD 1.5** | v1-5-pruned, realistic-vision-v51 |
| **SDXL Turbo** | sdxl-turbo, pix2pix-turbo |
| **Video** | SVD, SVD-XT, AnimateDiff |
| **ControlNet** | Canny, Depth, Pose, Lineart |

### LoRAs Soportados

| Tipo | Ejemplos |
|------|---------|
| **Style** | anime, realistic, cyberpunk |
| **Character** | AnimeCharacter, RealisticPortrait |
| **Concept** | Logo, UI Design, Architecture |

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                     LIBRECHAT + COMFYUI                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     LIBRECHAT                            │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │   │
│  │  │  Chat Input   │  │  ComfyUI UI  │  │  Preview     │ │   │
│  │  │  (prompt)     │  │  (models,    │  │  (results)   │ │   │
│  │  │              │  │   loras)      │  │              │ │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │   │
│  │         │                  │                  │          │   │
│  └─────────┼──────────────────┼──────────────────┼──────────┘   │
│            │                  │                  │               │
│            ▼                  ▼                  ▼               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              COMFYUI INTEGRATION API                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │   │
│  │  │  Queue        │  │  History      │  │  Models       │ │   │
│  │  │  Manager      │  │  Manager      │  │  Manager      │ │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                    │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     COMFYUI API                            │   │
│  │         http://localhost:8188 (WebSocket + REST)          │   │
│  │                                                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │   │
│  │  │  Stable       │  │  ControlNet   │  │  LoRA        │ │   │
│  │  │  Diffusion    │  │  Preprocessors│  │  Loader      │ │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Componentes

### 1. API de Integración (`comfyui_api.py`)

Gestiona la comunicación con ComfyUI:

```python
# Endpoints principales
POST /api/comfyui/queue          # Encolar workflow
GET  /api/comfyui/history/{id}  # Ver historial
GET  /api/comfyui/models          # Listar modelos
GET  /api/comfyui/loras           # Listar LoRAs
POST /api/comfyui/preview/{id}    # Generar preview
```

### 2. Panel UI (`ComfyUIPanel.tsx`)

Componente React para selección de:

- Modelos
- LoRAs
- Parámetros
- Previews

### 3. Service (`ComfyUIService.js`)

Lógica de negocio en backend:

- Queue management
- History tracking
- Error handling
- Retry logic

---

## 📥 Instalación

### 1. ComfyUI (Local o Servidor)

```bash
# Clonar ComfyUI
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

# Instalar dependencias
pip install -r requirements.txt

# Descargar modelos (ejemplo SDXL)
# Models will be in models/checkpoints/
```

### 2. Configurar Variables de Entorno

```env
COMFYUI_API_URL=http://localhost:8188
COMFYUI_API_KEY=  # Opcional
COMFYUI_WS_URL=ws://localhost:8188
```

### 3. Agregar a LibreChat

```javascript
// En config/plugins.js
import { ComfyUIPlugin } from './comfyui-plugin';

export default {
  plugins: [
    ComfyUIPlugin
  ]
};
```

---

## ⚙️ Configuración

### ComfyUI Settings

```javascript
// client/src/config/comfyui.ts
export const comfyUIConfig = {
  apiUrl: process.env.COMFYUI_API_URL || 'http://localhost:8188',
  wsUrl: process.env.COMFYUI_WS_URL || 'ws://localhost:8188',
  
  // Modelos default
  defaultModel: 'sd_xl_base_1.0',
  
  // Parámetros default
  defaultParams: {
    steps: 20,
    cfg: 7.0,
    sampler: 'euler_ancestral',
    scheduler: 'normal'
  },
  
  // Límites
  maxQueueSize: 5,
  timeout: 300 // segundos
};
```

### Workflows Predefinidos

```json
{
  "text-to-image": {
    "name": "Text to Image",
    "nodes": ["CLIPTextEncode", "KSampler", "VAEDecode", "SaveImage"],
    "params": {
      "model": "required",
      "prompt": "required",
      "negative_prompt": "optional",
      "steps": 20,
      "cfg": 7.0
    }
  },
  "image-to-image": {
    "name": "Image to Image",
    "nodes": ["LoadImage", "CLIPTextEncode", "VAEEncode", "KSampler", "VAEDecode", "SaveImage"],
    "params": {
      "model": "required",
      "image": "required",
      "strength": 0.7
    }
  }
}
```

---

## 🌐 API

### Endpoints REST

#### POST /api/comfyui/queue

Encola un nuevo workflow:

```json
POST /api/comfyui/queue
{
  "workflow": "text-to-image",
  "params": {
    "model": "sd_xl_base_1.0",
    "prompt": "a beautiful sunset over mountains",
    "negative_prompt": "ugly, low quality",
    "steps": 25,
    "cfg": 7.5,
    "seed": -1
  }
}
```

**Response:**

```json
{
  "prompt_id": "prompt-12345",
  "number": 1,
  "status": "queued"
}
```

#### GET /api/comfyui/history/{prompt_id}

Obtiene el resultado de un prompt:

```json
GET /api/comfyui/history/prompt-12345

{
  "prompt_id": "prompt-12345",
  "status": "success",
  "outputs": [
    {
      "node": "SaveImage",
      "images": [
        {
          "filename": "image_0001.png",
          "subfolder": "",
          "type": "output"
        }
      ]
    }
  ]
}
```

#### GET /api/comfyui/models

Lista modelos disponibles:

```json
GET /api/comfyui/models

{
  "models": [
    {
      "name": "sd_xl_base_1.0",
      "path": "models/checkpoints/sd_xl_base_1.0.safetensors",
      "type": "checkpoint",
      "size": "6.5GB"
    }
  ]
}
```

#### GET /api/comfyui/loras

Lista LoRAs disponibles:

```json
GET /api/comfyui/loras

{
  "loras": [
    {
      "name": "sdxl-style-anime",
      "path": "models/loras/anime.safetensors",
      "strength": 1.0
    }
  ]
}
```

### WebSocket Events

```javascript
// Conectar WebSocket
const ws = new WebSocket('ws://localhost:8188/ws');

// Escuchar eventos
ws.on('message', (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'executing':
      console.log('Ejecutando nodo:', data.data.node);
      break;
    case 'progress':
      console.log('Progreso:', data.data.value, '/', data.data.max);
      break;
    case 'executed':
      console.log('Nodo completado:', data.data.node);
      break;
    case 'executed':
      console.log('Workflow completado');
      // Refrescar preview
      break;
  }
});
```

---

## 🎨 UI

### ComfyUIPanel Component

```tsx
import React, { useState, useEffect } from 'react';
import { ComfyUIPanel } from './ComfyUIPanel';

function App() {
  return (
    <div className="comfyui-integration">
      <ComfyUIPanel
        apiUrl="http://localhost:4000/api/comfyui"
        defaultModel="sd_xl_base_1.0"
        onImageGenerated={(imageUrl) => {
          console.log('Nueva imagen:', imageUrl);
        }}
      />
    </div>
  );
}
```

### Props

| Prop | Tipo | Descripción |
|------|------|-------------|
| `apiUrl` | string | URL de la API |
| `defaultModel` | string | Modelo por defecto |
| `onImageGenerated` | function | Callback al generar |
| `showAdvanced` | boolean | Mostrar parámetros avanzados |
| `maxQueueSize` | number | Tamaño máximo de cola |

### Preview Component

```tsx
import { ComfyUIPreview } from './ComfyUIPreview';

<ComfyUIPreview
  promptId="prompt-12345"
  autoRefresh={true}
  refreshInterval={2000}
/>
```

---

## 🔄 Workflows

### Basic Text-to-Image

```json
{
  "nodes": [
    {
      "id": 1,
      "type": "CheckpointLoaderSimple",
      "widgets": ["sd_xl_base_1.0"]
    },
    {
      "id": 2,
      "type": "CLIPTextEncode",
      "widgets": ["positive prompt"]
    },
    {
      "id": 3,
      "type": "CLIPTextEncode",
      "widgets": ["negative prompt"]
    },
    {
      "id": 4,
      "type": "KSampler",
      "widgets": [20, 7.0, "euler_ancestral", 42]
    },
    {
      "id": 5,
      "type": "VAEDecode",
      "widgets": []
    },
    {
      "id": 6,
      "type": "SaveImage",
      "widgets": ["output"]
    }
  ],
  "links": [
    [1, 0, 2, 0],
    [1, 0, 3, 0],
    [2, 0, 4, 1],
    [3, 0, 4, 2],
    [4, 0, 5, 0],
    [5, 0, 6, 0]
  ]
}
```

---

## 🚀 Deployment

### Docker Compose

```yaml
services:
  comfyui:
    image: ghcr.io/comfyanonymous/comfyui:latest
    ports:
      - "8188:8188"
    volumes:
      - ./comfyui/models:/app/models
      - ./comfyui/output:/app/output
    environment:
      - PASSWORD=your-password

  librechat:
    # ... configuración existente
    environment:
      - COMFYUI_API_URL=http://comfyui:8188
```

---

## 📊 Estado de Implementación

| Componente | Estado | Notas |
|-----------|--------|-------|
| API REST | ✅ Listo | 5 endpoints |
| WebSocket | ✅ Listo | Eventos implementados |
| Panel UI | 🔜 Pendiente | Requiere React component |
| Service | 🔜 Pendiente | Backend logic |
| Modelos | ✅ Config | SDXL, SD 1.5 |
| LoRAs | ✅ Config | Estructura lista |
| Workflows | ✅ Templates | Text2Img, Img2Img |

---

## 📄 Licencia

**MIT License**

Basado en [ComfyUI](https://github.com/comfyanonymous/ComfyUI) (GPL-3.0)

---

<div align="center">
  <strong>Generación de imágenes profesional en LibreChat</strong>
  <br>
  <em>Con ❤️ para la comunidad</em>
</div>
