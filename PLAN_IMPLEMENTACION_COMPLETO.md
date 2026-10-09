# 📋 PLAN DE IMPLEMENTACIÓN COMPLETO
## Proyecto: mi-libre-chat
## Fecha: 2026-07-19
## Objetivo: 100% Funcional

---

## 🎯 RESUMEN EJECUTIVO

| Fase | Nombre | Items | Prioridad | Riesgo |
|------|--------|-------|-----------|--------|
| **FASE 0** | Seguridad Crítica | 4 | 🔴 CRÍTICA | ALTO |
| **FASE 1** | UI Components | 6 | 🟠 ALTA | MEDIO |
| **FASE 2** | Persistencia BD | 4 | 🟠 ALTA | BAJO |
| **FASE 3** | Integraciones | 5 | 🟡 MEDIA | ALTO |
| **FASE 4** | AutoConfig LLM | 3 | 🟡 MEDIA | MEDIO |
| **FASE 5** | Testing/Docs | 4 | 🟢 BAJA | BAJO |

**Total: 26 items para completar**

---

## 🔴 FASE 0: SEGURIDAD CRÍTICA
### Prioridad: CRÍTICA | Riesgo: ALTO | Dependencias: Ninguna

---

### 0.1 Command Injection - Claude Code Bridge
**Archivo:** `integrations/claude-code-bridge/lib/bridge.py:352-369`

**Problema:**
```python
result = subprocess.run(
    command,  # ⚠️ INPUT DEL USUARIO
    shell=True,  # ⚠️ PERMITE INYECCIÓN
    ...
)
```

**Implementación:**

```python
# ALLOWED_COMMANDS whitelist
ALLOWED_COMMANDS = {
    'ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc', 
    'sort', 'uniq', 'pwd', 'cd', 'mkdir', 'rmdir', 'cp', 
    'mv', 'touch', 'rm', 'chmod', 'chown'
}

async def _execute_terminal_tool(self, tool_call: ToolCall) -> str:
    if name == "run_command":
        command = args.get("command", "")
        cmd_name = command.split()[0] if command.split() else ""
        
        # Validación 1: Comando en whitelist
        if cmd_name not in ALLOWED_COMMANDS:
            return f"Error: Comando '{cmd_name}' no permitido. Comandos válidos: {', '.join(ALLOWED_COMMANDS)}"
        
        # Validación 2: Sin caracteres peligrosos
        dangerous_chars = [';', '&&', '||', '|', '`', '$(', '>', '<']
        for char in dangerous_chars:
            if char in command:
                return f"Error: Caracter '{char}' no permitido en comandos"
        
        # Validación 3: Path restrictions
        if '--path' in command or '-C' in command:
            paths = self._extract_paths(command)
            for path in paths:
                if not self._is_path_allowed(path):
                    return f"Error: Path '{path}' no está en workspace permitido"
        
        # Ejecución SEGURA
        result = subprocess.run(
            command.split(),  # Lista, NO string
            shell=False,  # ⚠️ CRÍTICO
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, 'HOME': '/tmp'}  # Isolated env
        )
```

**Pasos:**
1. Crear whitelist de comandos permitidos
2. Implementar validación de caracteres
3. Cambiar `shell=False`
4. Implementar path restrictions
5. Tests de seguridad

---

### 0.2 API Keys Sin Cifrar
**Archivo:** `api/server/services/APIKeyManager/services/key_manager.py:411-435`

**Problema:** Funciones `_encrypt_key` y `_decrypt_key` comentadas

**Implementación:**

```python
from cryptography.fernet import Fernet
import os

class KeyManagerService:
    def __init__(self, db):
        self.db = db
        encryption_key = os.environ.get('ENCRYPTION_KEY')
        if not encryption_key:
            raise ValueError("ENCRYPTION_KEY environment variable is required")
        self.fernet = Fernet(encryption_key.encode())
    
    def _encrypt_key(self, key: str) -> str:
        """Cifra API key con Fernet AES-128."""
        try:
            return self.fernet.encrypt(key.encode()).decode()
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            raise ValueError("Failed to encrypt API key")
    
    def _decrypt_key(self, encrypted_key: str) -> str:
        """Descifra API key."""
        try:
            return self.fernet.decrypt(encrypted_key.encode()).decode()
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            raise ValueError("Failed to decrypt API key")
```

**Agregar a `.env.example`:**
```env
# Encryption key for API keys (generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
ENCRYPTION_KEY=tu-clave-aqui
```

**Pasos:**
1. Instalar `cryptography` si no está
2. Implementar `_encrypt_key` con Fernet
3. Implementar `_decrypt_key` con Fernet
4. Generar clave para producción
5. Migrar keys existentes (criptografía reversible)

---

### 0.3 CORS Abierto
**Archivo:** `api/server/index.js:220`

**Problema:** `app.use(cors())` permite cualquier origen

**Implementación:**

```javascript
// Configuración de CORS
const corsOptions = {
  origin: function (origin, callback) {
    // Allowed origins desde env
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',')
      : [];
    
    // Permitir requests sin origin (mobile apps, Postman)
    if (!origin) {
      return callback(null, true);
    }
    
    // localhost en desarrollo
    if (process.env.NODE_ENV === 'development') {
      if (origin.startsWith('http://localhost')) {
        return callback(null, true);
      }
    }
    
    // Check whitelist
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));
```

**Agregar a `.env.example`:**
```env
# Allowed CORS origins (comma-separated)
ALLOWED_ORIGINS=https://tu-dominio.com,https://app.tu-dominio.com
NODE_ENV=production
```

**Pasos:**
1. Reemplazar `cors()` con configuración
2. Agregar ALLOWED_ORIGINS a variables de entorno
3. Test con múltiples origins

---

### 0.4 Helmet.js
**Archivo:** `api/server/index.js`

**Implementación:**

```bash
npm install helmet
```

```javascript
const helmet = require('helmet');

// Configuración completa de headers de seguridad
app.use(helmet());

// Content Security Policy
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "https:"],
    styleSrc: ["'self'", "'unsafe-inline'", "https:"],
    imgSrc: ["'self'", "data:", "https:", "blob:"],
    fontSrc: ["'self'", "https:"],
    connectSrc: ["'self'", "wss:", "https:"],
    mediaSrc: ["'self'", "https:", "blob:"],
    objectSrc: ["'none'"],
    frameSrc: ["'none'"],
    upgradeInsecureRequests: [],
  },
  reportOnly: false,
}));

// X-Frame-Options (previene clickjacking)
app.use(helmet.frameguard({ action: 'deny' }));

// X-Content-Type-Options (previene MIME sniffing)
app.use(helmet.noSniff());

// X-XSS-Protection (legacy, pero mantiene compatibilidad)
app.use(helmet.xssFilter());

// Strict-Transport-Security (fuerza HTTPS)
app.use(helmet.hsts({
  maxAge: 31536000, // 1 año
  includeSubDomains: true,
  preload: true,
}));

// Referrer-Policy
app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));

// Permissions-Policy
app.use(helmet.permittedCrossDomainPolicies({
  permittedPolicies: 'none',
}));
```

**Pasos:**
1. `npm install helmet`
2. Agregar configuración completa
3. Test de headers con curl
4. CSP tuning si hay problemas

---

## 🟠 FASE 1: UI COMPONENTS
### Prioridad: ALTA | Riesgo: MEDIO | Dependencias: FASE 0

---

### 1.1 Discovery Search Panel (UI Frontend)
**Ubicación:** `client/src/components/Chat/Input/Discovery/DiscoverySearchPanel.tsx`

**Descripción:** Panel de búsqueda integrado en el chat

**Implementación:**

```tsx
// client/src/components/Chat/Input/Discovery/DiscoverySearchPanel.tsx

import React, { useState, useCallback } from 'react';
import { Search, Filter, X, ExternalLink, Star, Github } from 'lucide-react';
import { useDiscoverySearch } from '@librechat/data-provider';
import type { DiscoverySearchResult } from '@librechat/data-provider';

interface DiscoverySearchPanelProps {
  onSelect: (result: DiscoverySearchResult) => void;
  onClose: () => void;
}

export const DiscoverySearchPanel: React.FC<DiscoverySearchPanelProps> = ({ onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [sources, setSources] = useState<string[]>(['github', 'mcp', 'npm']);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  
  const { data, isLoading, error } = useDiscoverySearch(query, sources, selectedAgent);
  
  const agents = ['claude_code', 'cursor', 'copilot', 'windsurf', 'continue'];
  const sourceOptions = [
    { id: 'github', label: 'GitHub', icon: '🐙' },
    { id: 'huggingface', label: 'HuggingFace', icon: '🤗' },
    { id: 'mcp', label: 'MCP Servers', icon: '🔧' },
    { id: 'npm', label: 'NPM', icon: '📦' },
    { id: 'pypi', label: 'PyPI', icon: '🐍' },
  ];
  
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-96 max-h-[500px] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">🔍 Discovery</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar plugins, skills, tools..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        {/* Sources Filter */}
        <div className="flex flex-wrap gap-2 mt-3">
          {sourceOptions.map((source) => (
            <button
              key={source.id}
              onClick={() => {
                setSources(prev => 
                  prev.includes(source.id) 
                    ? prev.filter(s => s !== source.id)
                    : [...prev, source.id]
                );
              }}
              className={`px-2 py-1 text-xs rounded-full flex items-center gap-1 transition-colors ${
                sources.includes(source.id)
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
              }`}
            >
              <span>{source.icon}</span>
              <span>{source.label}</span>
            </button>
          ))}
        </div>
        
        {/* Agent Filter */}
        <div className="flex gap-1 mt-2 overflow-x-auto pb-1">
          {agents.map((agent) => (
            <button
              key={agent}
              onClick={() => setSelectedAgent(selectedAgent === agent ? null : agent)}
              className={`px-2 py-1 text-xs rounded whitespace-nowrap transition-colors ${
                selectedAgent === agent
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                  : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-500'
              }`}
            >
              {agent}
            </button>
          ))}
        </div>
      </div>
      
      {/* Results */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}
        
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400 text-sm">
            Error: {error.message}
          </div>
        )}
        
        {data?.results?.length === 0 && query && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No se encontraron resultados para "{query}"
          </div>
        )}
        
        {data?.results?.map((result, index) => (
          <div
            key={`${result.source}-${result.name}-${index}`}
            onClick={() => onSelect(result)}
            className="p-3 mb-2 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">{result.name}</span>
                  <span className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">
                    {result.source}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                  {result.description}
                </p>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-500">
                  {result.stars && <span className="flex items-center gap-1">⭐ {result.stars}</span>}
                  {result.type && <span>{result.type}</span>}
                  {result.agents?.length > 0 && (
                    <span className="flex items-center gap-1">
                      {result.agents.slice(0, 2).join(', ')}
                      {result.agents.length > 2 && ` +${result.agents.length - 2}`}
                    </span>
                  )}
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DiscoverySearchPanel;
```

**Pasos:**
1. Crear directorio `client/src/components/Chat/Input/Discovery/`
2. Crear `DiscoverySearchPanel.tsx`
3. Crear `index.ts` export
4. Integrar en `ChatInput` component

---

### 1.2 ComfyUI WebSocket Preview
**Archivos:** 
- `api/server/routes/comfyui.js`
- `client/src/components/Chat/Input/ComfyUI/`

**Implementación Backend:**

```javascript
// api/server/routes/comfyui.js - AGREGAR

const WebSocket = require('ws');

// WebSocket manager
const comfyuiWebSockets = new Map(); // clientId -> ws

// WebSocket endpoint
io.of('/comfyui').on('connection', (socket) => {
  console.log('ComfyUI WebSocket connected:', socket.id);
  
  socket.on('subscribe', async (data) => {
    const { promptId } = data;
    
    // Connect to ComfyUI WebSocket if not connected
    if (!comfyuiWs || comfyuiWs.readyState !== WebSocket.OPEN) {
      const comfyuiUrl = process.env.COMFYUI_WS_URL || 'ws://localhost:8188';
      comfyuiWs = new WebSocket(comfyuiUrl);
      
      comfyuiWs.on('open', () => {
        console.log('Connected to ComfyUI WebSocket');
      });
      
      comfyuiWs.on('message', (message) => {
        const data = JSON.parse(message);
        
        // Forward relevant messages to clients
        if (data.type === 'progress' || data.type === 'executing' || data.type === 'executed') {
          socket.emit('progress', {
            promptId: data.data?.prompt_id,
            ...data.data
          });
        }
      });
    }
    
    // Subscribe to prompt updates
    socket.join(`prompt:${promptId}`);
  });
  
  socket.on('unsubscribe', (data) => {
    const { promptId } = data;
    socket.leave(`prompt:${promptId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('ComfyUI WebSocket disconnected:', socket.id);
  });
});

// Endpoint para iniciar generación con WebSocket
router.post('/generate-ws', async (req, res) => {
  const { prompt, websocket = true } = req.body;
  
  try {
    // Enviar a ComfyUI
    const result = await comfyuiRequest('/prompt', 'POST', { prompt });
    
    if (websocket) {
      // Notify WebSocket subscribers
      io.of('/comfyui').to(`prompt:${result.prompt_id}`).emit('started', {
        promptId: result.prompt_id,
        timestamp: Date.now()
      });
    }
    
    res.json({ 
      success: true, 
      promptId: result.prompt_id,
      websocket 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

**Implementación Frontend Hook:**

```typescript
// client/src/components/Chat/Input/ComfyUI/useComfyUIWebSocket.ts

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseComfyUIWebSocketOptions {
  promptId?: string;
  onProgress?: (progress: ProgressData) => void;
  onComplete?: (result: CompletionData) => void;
  onError?: (error: string) => void;
}

export const useComfyUIWebSocket = ({
  promptId,
  onProgress,
  onComplete,
  onError,
}: UseComfyUIWebSocketOptions) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<number>(0);
  
  useEffect(() => {
    // Connect to WebSocket
    const socket = io('/comfyui', {
      transports: ['websocket'],
      autoConnect: true,
    });
    
    socket.on('connect', () => {
      setIsConnected(true);
      console.log('ComfyUI WebSocket connected');
    });
    
    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('ComfyUI WebSocket disconnected');
    });
    
    socket.on('progress', (data: ProgressData) => {
      setCurrentProgress(data.progress || 0);
      onProgress?.(data);
    });
    
    socket.on('completed', (data: CompletionData) => {
      onComplete?.(data);
      setCurrentProgress(100);
    });
    
    socket.on('error', (error: string) => {
      onError?.(error);
    });
    
    socketRef.current = socket;
    
    return () => {
      socket.disconnect();
    };
  }, []);
  
  // Subscribe to prompt updates
  useEffect(() => {
    if (socketRef.current && promptId) {
      socketRef.current.emit('subscribe', { promptId });
      return () => {
        socketRef.current?.emit('unsubscribe', { promptId });
      };
    }
  }, [promptId]);
  
  return {
    isConnected,
    currentProgress,
  };
};
```

**Pasos:**
1. Instalar `socket.io`
2. Agregar endpoint WebSocket en `comfyui.js`
3. Crear hook `useComfyUIWebSocket.ts`
4. Actualizar `useComfyUI.ts` para usar WebSocket
5. Actualizar UI para mostrar progreso en tiempo real

---

### 1.3 ComfyUI Models/LoRAs API Endpoints
**Archivo:** `api/server/routes/comfyui.js`

**Implementación:**

```javascript
// AGREGAR endpoints para obtener modelos y LoRAs

// GET /api/comfyui/models - Obtener modelos disponibles
router.get('/models', async (req, res) => {
  try {
    const response = await comfyuiRequest('/object_info', 'GET');
    
    // Filtrar solo Checkpoint models
    const checkpoints = Object.entries(response)
      .filter(([key, value]) => {
        const classType = value?.class_type || '';
        return classType.includes('Checkpoint') || 
               classType.includes('Model') ||
               classType.includes('StableDiffusion');
      })
      .map(([name, config]) => ({
        name,
        classType: config.class_type,
        inputs: config.input?.required || {},
        category: categorizeModel(name),
      }));
    
    res.json({ success: true, models: checkpoints });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/comfyui/loras - Obtener LoRAs disponibles
router.get('/loras', async (req, res) => {
  try {
    const response = await comfyuiRequest('/object_info', 'GET');
    
    const loras = Object.entries(response)
      .filter(([key, value]) => {
        const classType = value?.class_type || '';
        return classType.includes('Lora') || classType.includes('LoRA');
      })
      .map(([name, config]) => ({
        name,
        filename: name,
        classType: config.class_type,
        strengthOptions: {
          clip: config.input?.required?.strength_clip?.[0] || [0, 2, 0.5],
          model: config.input?.required?.strength_model?.[0] || [0, 2, 1],
        },
      }));
    
    res.json({ success: true, loras });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function
function categorizeModel(name) {
  const lower = name.toLowerCase();
  if (lower.includes('xl') || lower.includes('sdxl')) return 'SDXL';
  if (lower.includes('1.5') || lower.includes('sd15')) return 'SD 1.5';
  if (lower.includes('3.5') || lower.includes('sd35')) return 'SD 3.5';
  if (lower.includes('video') || lower.includes('svd')) return 'Video';
  if (lower.includes(' Pony')) return 'Pony';
  return 'Other';
}
```

**Pasos:**
1. Agregar endpoint `/models`
2. Agregar endpoint `/loras`
3. Actualizar tipos TypeScript
4. Actualizar React Query hooks
5. Conectar con ComfyUIPanel UI

---

### 1.4 Marketplace Persistence (MongoDB)
**Archivos:**
- `api/server/routes/marketplace.js`
- `api/server/models/Marketplace.js` (nuevo)

**Implementación Model:**

```javascript
// api/server/models/Marketplace.js

const mongoose = require('mongoose');

const SkillSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  category: { type: String, required: true, index: true },
  type: { type: String, enum: ['skill', 'plugin', 'tool', 'mcp'], required: true },
  
  // Source info
  source: { type: String, enum: ['github', 'npm', 'pypi', 'huggingface', 'mcp', 'manual'] },
  url: { type: String },
  stars: { type: Number, default: 0 },
  
  // Compatibility
  agents: [{ type: String }],
  languages: [{ type: String }],
  
  // Installation
  installCommand: { type: String },
  configRequired: [{ type: String }],
  
  // Stats
  installs: { type: Number, default: 0 },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0 },
  
  // Status
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  
  // User interactions
  installedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  favoritesBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Metadata
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  
}, { timestamps: true });

// Indexes
SkillSchema.index({ name: 'text', description: 'text' });
SkillSchema.index({ category: 1, type: 1 });
SkillSchema.index({ 'agents': 1 });

// Virtual for installation status per user
SkillSchema.virtual('isInstalled').get(function() {
  return this.installedBy?.length > 0;
});

module.exports = mongoose.model('Skill', SkillSchema);
```

**Implementación Routes Actualizado:**

```javascript
// api/server/routes/marketplace.js - REEMPLAZAR

const express = require('express');
const router = express.Router();
const Skill = require('../models/Marketplace');
const { requireAuth } = require('../middleware');

// Inicializar con datos si está vacío
async function initializeSkills() {
  const count = await Skill.countDocuments();
  if (count === 0) {
    await Skill.insertMany(defaultSkills);
  }
}
initializeSkills();

// GET /api/marketplace/skills
router.get('/skills', async (req, res) => {
  try {
    const { category, type, agent, search, featured, page = 1, limit = 20 } = req.query;
    
    const query = { isActive: true };
    if (category) query.category = category;
    if (type) query.type = type;
    if (agent) query.agents = agent;
    if (featured === 'true') query.isFeatured = true;
    if (search) {
      query.$text = { $search: search };
    }
    
    const skills = await Skill.find(query)
      .sort({ stars: -1, rating: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    
    const total = await Skill.countDocuments(query);
    
    res.json({
      success: true,
      skills,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/marketplace/skills (admin)
router.post('/skills', requireAuth, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }
    
    const skill = new Skill(req.body);
    await skill.save();
    
    res.status(201).json({ success: true, skill });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/marketplace/skills/:id/install (user)
router.post('/skills/:id/install', requireAuth, async (req, res) => {
  try {
    const skill = await Skill.findById(req.params.id);
    if (!skill) {
      return res.status(404).json({ success: false, error: 'Skill not found' });
    }
    
    // Add user to installedBy if not already
    if (!skill.installedBy.includes(req.user._id)) {
      skill.installedBy.push(req.user._id);
      skill.installs += 1;
      await skill.save();
    }
    
    res.json({ success: true, message: 'Skill installed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/marketplace/skills/:id/review
router.post('/skills/:id/review', requireAuth, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    
    const skill = await Skill.findById(req.params.id);
    if (!skill) {
      return res.status(404).json({ success: false, error: 'Skill not found' });
    }
    
    // Update rating (simple average)
    const newCount = skill.reviewCount + 1;
    const newRating = ((skill.rating * skill.reviewCount) + rating) / newCount;
    
    skill.rating = newRating;
    skill.reviewCount = newCount;
    await skill.save();
    
    res.json({ success: true, rating: newRating });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

**Pasos:**
1. Crear modelo `api/server/models/Marketplace.js`
2. Reemplazar rutas para usar MongoDB
3. Agregar middleware de autenticación
4. Crear script de migración para datos existentes
5. Actualizar frontend para mostrar persistencia

---

### 1.5 Execution Profiles Persistence
**Archivos:**
- `api/server/models/ExecutionProfile.js` (nuevo)
- `api/server/routes/execution-profile.js`

**Implementación:** Similar a Marketplace pero para ExecutionProfiles

**Pasos:**
1. Crear modelo ExecutionProfile
2. Actualizar rutas para usar MongoDB
3. Agregar validación de límites
4. Tests de CRUD

---

### 1.6 OAuth Apps Configuration Guide
**Archivo:** `docs/OAUTH_SETUP.md` (nuevo)

**Contenido:**
```markdown
# Configuración de OAuth Apps

## GitHub OAuth App

1. Ir a: https://github.com/settings/developers
2. Click "New OAuth App"
3. Completar:
   - Application name: Mi LibreChat
   - Homepage URL: https://tu-dominio.com
   - Authorization callback URL: https://tu-dominio.com/api/connectors/github/callback
4. Click "Register application"
5. Copiar Client ID y Client Secret

## HuggingFace OAuth App

1. Ir a: https://huggingface.co/settings/oauth
2. Click "Create OAuth app"
3. Completar:
   - Application name: Mi LibreChat
   - Homepage URL: https://tu-dominio.com
   - Callback URL: https://tu-dominio.com/api/connectors/huggingface/callback
4. Click "Create"
5. Copiar Client ID y Client Secret

## Variables de Entorno

```env
GITHUB_CONNECTOR_CLIENT_ID=your_github_client_id
GITHUB_CONNECTOR_CLIENT_SECRET=your_github_client_secret
HUGGINGFACE_CONNECTOR_CLIENT_ID=your_hf_client_id
HUGGINGFACE_CONNECTOR_CLIENT_SECRET=your_hf_client_secret
```
```

**Pasos:**
1. Crear documentación
2. Agregar script de verificación
3. Tests del flujo OAuth

---

## 🟡 FASE 2: INTEGRACIONES AVANZADAS
### Prioridad: MEDIA | Riesgo: ALTO | Dependencias: FASE 1

---

### 2.1 Orquestador + Chat Integration
**Archivos:**
- `api/server/services/agents/orchestrator-integration.js` (nuevo)
- `client/src/components/Chat/OrchestratorPanel.tsx` (nuevo)

**Implementación:**

```javascript
// api/server/services/agents/orchestrator-integration.js

const AgentOrchestrator = require('../../../integrations/agent-builder/orchestrator/agent_orchestrator');

class OrchestratorService {
  constructor() {
    this.orchestrator = new AgentOrchestrator();
  }
  
  async createSession(userId, task, options = {}) {
    const session = {
      id: `session_${Date.now()}`,
      userId,
      task,
      status: 'pending',
      agents: [],
      messages: [],
      createdAt: new Date(),
    };
    
    this.sessions.set(session.id, session);
    return session;
  }
  
  async executeTask(sessionId, taskConfig) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    
    session.status = 'running';
    
    try {
      const result = await this.orchestrator.execute({
        task: session.task,
        agents: taskConfig.agents || ['planner', 'researcher', 'coder'],
        pattern: taskConfig.pattern || 'hierarchical',
        options: {
          timeout: taskConfig.timeout || 300000,
          maxIterations: taskConfig.maxIterations || 10,
        }
      });
      
      session.result = result;
      session.status = 'completed';
      
      return result;
    } catch (error) {
      session.status = 'failed';
      session.error = error.message;
      throw error;
    }
  }
  
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }
  
  cancelSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'cancelled';
      this.orchestrator.cancel(sessionId);
    }
  }
}

module.exports = new OrchestratorService();
```

**Pasos:**
1. Crear servicio de integración
2. Crear API routes para orchestration
3. Crear UI de monitoreo
4. Integrar en chat input
5. Tests E2E

---

### 2.2 Browser Use Integration
**Archivos:**
- `api/server/services/ToolService.js` (modificar)
- `client/src/components/Chat/Input/BrowserUsePanel.tsx` (nuevo)

**Implementación:**

```javascript
// En api/server/services/ToolService.js - AGREGAR

const BrowserAgent = require('../../../integrations/browser-use/lib/browser_agent');

class BrowserUseTool {
  constructor() {
    this.agent = new BrowserAgent({
      headless: process.env.BROWSER_HEADLESS !== 'false',
    });
  }
  
  async execute(action, params) {
    switch (action) {
      case 'navigate':
        return await this.agent.navigate(params.url);
      case 'click':
        return await this.agent.click(params.selector);
      case 'type':
        return await this.agent.type(params.selector, params.text);
      case 'screenshot':
        return await this.agent.screenshot();
      case 'extract':
        return await this.agent.extract(params.selector, params.type);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
}

// Registrar en ToolService
this.registerTool('browser', new BrowserUseTool());
```

**Pasos:**
1. Integrar BrowserAgent en ToolService
2. Crear UI de preview
3. Agregar controles de acción
4. Tests de integración

---

### 2.3 AutoConfig con LLM Real
**Archivos:**
- `api/server/services/auto-config/index.js` (modificar)
- `integrations/litellm-gateway/lib/litellm_client.py` (usar)

**Implementación:**

```javascript
// api/server/services/auto-config/index.js - MODIFICAR

const { analyzeTask: keywordAnalysis } = require('./keyword-based');
const litellmClient = require('../../../../integrations/litellm-gateway/lib/litellm_client');

async function analyzeTaskWithLLM(task, preferences = {}) {
  // Fallback a keywords si no hay LLM disponible
  if (!process.env.OPENAI_API_KEY && !process.env.LITELLM_API_KEY) {
    return keywordAnalysis(task, preferences);
  }
  
  try {
    const response = await litellmClient.createCompletion({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Eres un experto en configurar agentes de IA. Analiza la tarea del usuario y recommienda la mejor configuración.
          
Devuelve SOLO un JSON con esta estructura exacta, sin explicaciones adicionales:
{
  "agentType": "chat|coding|research|image|video|audio|planner|reviewer|architect|manager|workflow|router|evaluator",
  "complexity": "trivial|simple|moderate|complex|very_complex|massive",
  "complexityScore": 1-10,
  "model": {
    "provider": "openai|anthropic|google|openrouter",
    "name": "nombre-del-modelo",
    "temperature": 0.0-1.0
  },
  "capabilities": ["reasoning", "creativity", "research", "communication", "technical", "data"],
  "tools": ["web_search", "code_execution", "file_system", "image_generation", "browser"],
  "estimatedTime": minutos,
  "warnings": []
}`
        },
        {
          role: 'user',
          content: `Analiza esta tarea: "${task}"`
        }
      ],
      temperature: 0.3,
      maxTokens: 500,
    });
    
    const recommendation = JSON.parse(response.choices[0].message.content);
    return {
      success: true,
      analysis: {
        originalTask: task,
        complexity: recommendation.complexity,
        complexityScore: recommendation.complexityScore,
        suggestedAgentType: recommendation.agentType,
        ...recommendation
      },
      recommendation: {
        model: recommendation.model,
        capabilities: recommendation.capabilities,
        tools: recommendation.tools,
        memory: {
          type: recommendation.complexityScore > 7 ? 'hybrid' : 'short'
        }
      }
    };
  } catch (error) {
    console.error('LLM analysis failed, falling back to keywords:', error);
    return keywordAnalysis(task, preferences);
  }
}

module.exports = { analyzeTask: analyzeTaskWithLLM };
```

**Pasos:**
1. Agregar integración con LiteLLM Client
2. Crear prompt de system para análisis
3. Implementar fallback a keywords
4. Tests con diferentes tareas
5. Optimizar prompt

---

### 2.4 Grafana Dashboard Setup
**Archivos:**
- `integrations/litellm-gateway/prometheus-dashboard.json` (nuevo)

**Implementación:**

```json
{
  "dashboard": {
    "title": "Mi LibreChat - LiteLLM Gateway",
    "panels": [
      {
        "title": "Requests per Second",
        "type": "graph",
        "targets": [
          { "expr": "rate(litellm_requests_total[5m])" }
        ]
      },
      {
        "title": "Latency P95",
        "type": "graph",
        "targets": [
          { "expr": "histogram_quantile(0.95, rate(litellm_request_duration_seconds_bucket[5m]))" }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          { "expr": "rate(litellm_errors_total[5m]) / rate(litellm_requests_total[5m])" }
        ]
      },
      {
        "title": "Cost by Provider",
        "type": "piechart",
        "targets": [
          { "expr": "sum by (provider) (litellm_cost_total)" }
        ]
      },
      {
        "title": "Active Keys",
        "type": "stat",
        "targets": [
          { "expr": "litellm_active_keys" }
        ]
      }
    ]
  }
}
```

**Pasos:**
1. Agregar instrumentación Prometheus en LiteLLM Client
2. Crear dashboard JSON
3. Importar en Grafana
4. Configurar alertas

---

### 2.5 Team Collaboration
**Archivos:**
- `api/server/models/Team.js` (nuevo)
- `api/server/routes/team.js` (nuevo)

**Implementación:** Sistema básico de equipos

**Pasos:**
1. Crear modelo Team
2. Crear rutas para gestión de equipos
3. Agregar permisos por rol
4. UI de configuración

---

## 🟢 FASE 3: TESTING Y DOCUMENTACIÓN
### Prioridad: BAJA | Riesgo: BAJO | Dependencias: FASE 2

---

### 3.1 Tests E2E
```javascript
// tests/e2e/marketplace.spec.js
describe('Marketplace', () => {
  it('should search skills', async () => {
    const response = await request(app)
      .get('/api/marketplace/skills?search=code');
    expect(response.body.success).toBe(true);
    expect(response.body.skills.length).toBeGreaterThan(0);
  });
  
  it('should install a skill', async () => {
    const response = await request(app)
      .post(`/api/marketplace/skills/${skillId}/install`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.body.success).toBe(true);
  });
});
```

### 3.2 Documentación API
```javascript
/**
 * @swagger
 * /api/marketplace/skills:
 *   get:
 *     summary: Get all skills
 *     tags: [Marketplace]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of skills
 */
```

### 3.3 Deployment Guide
```markdown
# Deployment Guide

## Docker Compose Production

```yaml
version: '3.8'
services:
  app:
    image: mi-librechat:latest
    ports:
      - "3080:3080"
    environment:
      - NODE_ENV=production
      - ALLOWED_ORIGINS=https://tu-dominio.com
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - MONGODB_URI=${MONGODB_URI}
    restart: always
```
```

---

## 📊 CRONOGRAMA ESTIMADO

| Fase | Items | Días | Total |
|------|-------|------|-------|
| FASE 0 | 4 | 2 | 8h |
| FASE 1 | 6 | 5 | 40h |
| FASE 2 | 5 | 7 | 56h |
| FASE 3 | 4 | 3 | 24h |
| **TOTAL** | **19** | **17** | **128h** |

---

## 🔗 DEPENDENCIAS

```
FASE 0 (Seguridad)
    ↓
FASE 1 (UI) ←─────────┐
    ↓                   │
FASE 2 (Integración)───┘
    ↓
FASE 3 (Testing)
```

---

## 📋 CHECKLIST DE IMPLEMENTACIÓN

### FASE 0 - Seguridad
- [ ] 0.1 Command Injection fix
- [ ] 0.2 API Keys encryption
- [ ] 0.3 CORS configuration
- [ ] 0.4 Helmet.js

### FASE 1 - UI Components
- [ ] 1.1 Discovery Search Panel
- [ ] 1.2 ComfyUI WebSocket
- [ ] 1.3 ComfyUI Models API
- [ ] 1.4 Marketplace MongoDB
- [ ] 1.5 Execution Profiles MongoDB
- [ ] 1.6 OAuth Setup Guide

### FASE 2 - Integraciones
- [ ] 2.1 Orquestador + Chat
- [ ] 2.2 Browser Use + Chat
- [ ] 2.3 AutoConfig LLM
- [ ] 2.4 Grafana Dashboard
- [ ] 2.5 Team Collaboration

### FASE 3 - Testing
- [ ] 3.1 E2E Tests
- [ ] 3.2 API Documentation
- [ ] 3.3 Deployment Guide
- [ ] 3.4 Performance Testing

---

*Plan generado: 2026-07-19*
*Total items: 19*
*Estimación: 128 horas*
