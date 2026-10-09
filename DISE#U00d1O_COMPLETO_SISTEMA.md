# 🎯 DISEÑO COMPLETO DEL SISTEMA
## Mi LibreChat - Versión Profesional Producción

**Fecha:** 2026-07-19  
**Versión:** 1.0  
**Estado:** LISTO PARA IMPLEMENTACIÓN  

---

## 📋 TABLA DE CONTENIDOS

1. [Proveedores LLM Gratuitos](#1-proveedores-llm-gratuitos)
2. [Arquitectura General](#2-arquitectura-general)
3. [Mensajes del Chat (Acciones)](#3-mensajes-del-chat)
4. [Selector de Repositorio](#4-selector-de-repositorio-en-composer)
5. [Panel de Actividad IA (Manu Style)](#5-panel-de-actividad-ia)
6. [Panel de Métricas Drag&Drop](#6-panel-de-métricas-drag-drop)
7. [LLM Gateway con LiteLLM](#7-llm-gateway)
8. [ComfyUI WebSocket + Preview](#8-comfyui-websocket)
9. [Execution Profiles](#9-execution-profiles)
10. [Estructura de Archivos](#10-estructura-de-archivos)
11. [Cronograma de Implementación](#11-cronograma)

---

## 1. PROVEEDORES LLM GRATUITOS

### ✅ PROVEEDORES CON TIER FREE VERIFICADOS

| # | Proveedor | Modelos Principales | Límite Free | Streaming | Context | Notas |
|---|-----------|-------------------|-------------|-----------|---------|-------|
| 1 | **Groq** | Llama 3.3 70B, Mixtral 8x7B, Gemma 2 9B | 14,400 req/día | ✅ | 131K | Más rápido, 30 RPM |
| 2 | **DeepSeek** | DeepSeek-V4, DeepSeek-Coder | 5M tokens (crédito) | ✅ | 64K | Excelente para código |
| 3 | **Cloudflare Workers AI** | Llama 3, Mistral, Gemma 2 | 10,000 req/día | ✅ | 131K | Serverless, global |
| 4 | **OpenRouter** | Múltiples modelos free | ~50-1000 req/día | ✅ | Variable | Routing automático |
| 5 | **Cohere** | Command R+, Rerank 3 | 1,000 req/mes | ✅ | 128K | Especializado RAG |
| 6 | **Mistral AI** | Mistral Small, Codestral | ~1B tokens/mes | ✅ | 128K | Europa, open source |
| 7 | **HuggingFace** | 10B+ modelos | ~100 req/hora | ✅ | 4K-32K | Repo de modelos |
| 8 | **Perplexity** | Sonar Small/Large | 100 req/día | ✅ | 128K | Búsqueda web |
| 9 | **Lepton AI** | Llama 3, Phi-3 | Sandbox free | ✅ | 8K | Simple API |
| 10 | **Together AI** | Mixtral, Llama 3 | $100 crédito | ✅ | 128K | Model variety |
| 11 | **Google AI Studio** | Gemini 1.5 Flash | 1.5M tokens/min | ✅ | 1M | Mejor contexto |
| 12 | **Anthropic** | Claude 3.5 Sonnet | $5 crédito trial | ✅ | 200K | Mejor reasoning |

### 📊 MATRIZ DE COMPATIBILIDAD

| Proveedor | Chat | Code | RAG | Vision | Math | Spanish | API Stable |
|-----------|------|------|-----|--------|------|---------|------------|
| Groq | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| DeepSeek | ✅ | ✅✅ | ✅ | ❌ | ✅✅ | ✅ | ✅ |
| Cloudflare | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| OpenRouter | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cohere | ✅ | ✅ | ✅✅ | ❌ | ✅ | ✅ | ✅ |
| Mistral | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Gemini | ✅ | ✅ | ✅ | ✅ | ✅✅ | ✅ | ✅ |
| Claude | ✅✅ | ✅✅ | ✅ | ✅ | ✅✅ | ✅ | ✅ |

### 🔧 CONFIGURACIÓN DE API KEYS

```yaml
# config/llm-providers.yaml
providers:
  groq:
    name: "Groq"
    logo: "/icons/groq.svg"
    models:
      - id: "llama-3.3-70b-versatile"
        name: "Llama 3.3 70B"
        type: "chat"
        context: 131072
        input: 0.59  # $/1M tokens
        output: 2.99
      - id: "mixtral-8x7b-32768"
        name: "Mixtral 8x7B"
        type: "chat"
        context: 32768
      - id: "gemma2-9b-it"
        name: "Gemma 2 9B"
        type: "chat"
        context: 8192
    auth: "API_KEY"
    endpoint: "https://api.groq.com/openai/v1"
    docs: "https://console.groq.com/docs/models"

  deepseek:
    name: "DeepSeek"
    logo: "/icons/deepseek.svg"
    models:
      - id: "deepseek-chat"
        name: "DeepSeek V4"
        type: "chat"
        context: 64000
      - id: "deepseek-coder"
        name: "DeepSeek Coder"
        type: "code"
        context: 16384
    auth: "API_KEY"
    endpoint: "https://api.deepseek.com"
    docs: "https://platform.deepseek.com"

  cloudflare:
    name: "Cloudflare Workers AI"
    logo: "/icons/cloudflare.svg"
    models:
      - id: "@cf/meta/llama-3.1-8b-instruct"
        name: "Llama 3.1 8B"
        type: "chat"
        context: 131072
      - id: "@cf/mistral/mistral-7b-instruct-v0.2"
        name: "Mistral 7B"
        type: "chat"
    auth: "BEARER_TOKEN"  # CF API Token
    endpoint: "https://api.cloudflare.com/client/v4/ai"
    docs: "https://developers.cloudflare.com/workers-ai"

  # ... (continuar con los demás proveedores)
```

---

## 2. ARQUITECTURA GENERAL

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MI LIBRECHAT - ARQUITECTURA                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         FRONTEND (React)                           │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │   │
│  │  │  Chat    │ │ Metrics  │ │ Settings │ │ Market-  │          │   │
│  │  │  Window  │ │  Panel   │ │          │ │  place   │          │   │
│  │  └────┬─────┘ └────┬─────┘ └──────────┘ └──────────┘          │   │
│  │       │            │                                            │   │
│  │       ▼            ▼                                            │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │   │
│  │  │ Message  │ │ Metrics  │ │  Repo    │ │ Activity │          │   │
│  │  │ Actions  │ │ DragDrop │ │ Selector │ │  Panel   │          │   │
│  │  │  (Copy,  │ │ Widgets  │ │          │ │ (Manu)   │          │   │
│  │  │ Share)   │ │          │ │          │ │          │          │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      LLM GATEWAY (LiteLLM)                       │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │                    ROUTING LAYER                          │   │   │
│  │  │  • Load Balancing    • Fallback Chain                     │   │   │
│  │  │  • Rate Limiting     • Cost Optimization                  │   │   │
│  │  │  • Retry Logic       • Health Checks                       │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │                              │                                   │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │                  PROVIDER ADAPTERS                       │   │   │
│  │  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │   │   │
│  │  │  │ Groq │ │DeepSe│ │ CF   │ │Mistral│ │Gemini│ ...  │   │   │
│  │  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘      │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    EXTERNAL APIs                                    │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │   │
│  │  │  Groq   │ │DeepSeek │ │Cloudflar│ │  Mistral│ │Gemini AI│   │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │   │
│  │                                                                  │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │   │
│  │  │ OpenAI  │ │Anthropic│ │Cohere   │ │ Hugging │ │ Perplex │   │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. MENSAJES DEL CHAT

### 3.1 UBICACIÓN
```
client/src/components/Chat/
├── Chat.jsx                    ← Componente principal
├── Messages/
│   ├── Message.jsx            ← Mensaje individual
│   ├── MessageActions.tsx      ← ✅ NUEVO: Acciones del mensaje
│   ├── MessageContent.tsx      ← Contenido del mensaje
│   ├── MoreActionsMenu.tsx     ← ✅ NUEVO: Menú de más acciones
│   └── index.js
├── Input/
│   └── TextChat.jsx           ← Área de input
└── Windows/
    └── composer/
        └── ComposerActions.tsx ← ✅ NUEVO: Selector de repos
```

### 3.2 DISEÑO UI - ACCIONES DE MENSAJE

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🧑 Usuario                                                              │
│  Hola, ¿puedes ayudarme con este código?                               │
│                                                                         │
│  ┌─ Hover Area ─────────────────────────────────────────────────────┐   │
│  │                                                   [22:30]        │   │
│  │  ════════════════════════════════════════════════════════════════│   │
│  │                                                                   │   │
│  │  [📋 Copiar] [🔗 Compartir] [🔄 Reintentar] [••• Más]          │   │
│  │                                                                   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  🤖 AI Assistant                                                         │
│  ¡Claro! Aquí está el código que necesitas...                          │
│                                                                         │
│  ┌─ Hover Area ─────────────────────────────────────────────────────┐   │
│  │                                                   [22:31]        │   │
│  │  ════════════════════════════════════════════════════════════════│   │
│  │                                                                   │   │
│  │  [📋 Copiar] [🔗 Compartir] [🔄 Reintentar] [••• Más]          │   │
│  │                                                                   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 📁 Código generado:                                             │   │
│  │ ┌───────────────────────────────────────────────────────────┐  │   │
│  │ │ function example() {                                      │  │   │
│  │ │   console.log("Hello World");                              │  │   │
│  │ │ }                                                         │  │   │
│  │ └───────────────────────────────────────────────────────────┘  │   │
│  │                                        [📋 Copiar] [📥 Descargar]│   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 MENÚ "MÁS ACCIONES"

```
┌─────────────────────────────────────┐
│  📅 Fecha                           │
│  19 de Julio, 2026 - 10:30 PM      │
├─────────────────────────────────────┤
│  💬 Tokens del mensaje              │
│  Input: 45 | Output: 234            │
├─────────────────────────────────────┤
│  📚 Ver fuentes                      │
│  [2 fuentes encontradas]            │
├─────────────────────────────────────┤
│  🧵 Crear hilo nuevo               │
│  Continuar desde este mensaje        │
├─────────────────────────────────────┤
│  🔊 Leer en voz alta               │
│  Reproducir audio                   │
├─────────────────────────────────────┤
│  📋 Copiar como Markdown           │
├─────────────────────────────────────┤
│  ❌ Denunciar                       │
└─────────────────────────────────────┘
```

### 3.4 CÓDIGO - MessageActions.tsx

```typescript
// client/src/components/Chat/Messages/MessageActions.tsx
import React, { useState, useRef, useEffect } from 'react';
import { 
  Copy, Share2, RotateCcw, MoreHorizontal, 
  Calendar, MessageSquare, Library, GitBranch, Volume2,
  FileText, Flag, Check
} from 'lucide-react';

interface MessageActionsProps {
  message: Message;
  onCopy: () => void;
  onShare: () => void;
  onRetry: () => void;
  onViewSources?: () => void;
  onCreateThread?: () => void;
  onReadAloud?: () => void;
  onCopyMarkdown?: () => void;
  onReport?: () => void;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  message,
  onCopy,
  onShare,
  onRetry,
  onViewSources,
  onCreateThread,
  onReadAloud,
  onCopyMarkdown,
  onReport,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopy = async () => {
    await onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const moreActions = [
    { icon: Calendar, label: formatDate(message.createdAt), disabled: true },
    { icon: MessageSquare, label: `Tokens: ${message.tokens || 'N/A'}`, disabled: true },
    { icon: Library, label: 'Ver fuentes', disabled: !message.sources, action: onViewSources },
    { icon: GitBranch, label: 'Crear hilo nuevo', action: onCreateThread },
    { icon: Volume2, label: 'Leer en voz alta', action: onReadAloud },
    { icon: FileText, label: 'Copiar como Markdown', action: onCopyMarkdown },
    { icon: Flag, label: 'Denunciar', action: onReport, danger: true },
  ];

  return (
    <div className="message-actions" ref={menuRef}>
      <div className="actions-row">
        {/* Copiar */}
        <button 
          className={`action-btn ${copied ? 'success' : ''}`}
          onClick={handleCopy}
          title="Copiar"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? 'Copiado' : 'Copiar'}</span>
        </button>

        {/* Compartir */}
        <button 
          className="action-btn"
          onClick={onShare}
          title="Compartir"
        >
          <Share2 size={14} />
          <span>Compartir</span>
        </button>

        {/* Reintentar (solo mensajes de AI) */}
        {message.role === 'assistant' && (
          <button 
            className="action-btn"
            onClick={onRetry}
            title="Reintentar"
          >
            <RotateCcw size={14} />
            <span>Reintentar</span>
          </button>
        )}

        {/* Más acciones */}
        <button 
          className="action-btn"
          onClick={() => setShowMenu(!showMenu)}
          title="Más acciones"
        >
          <MoreHorizontal size={14} />
          <span>Más</span>
        </button>
      </div>

      {/* Dropdown Menu */}
      {showMenu && (
        <div className="actions-dropdown">
          {moreActions.map((action, idx) => (
            <button
              key={idx}
              className={`dropdown-item ${action.danger ? 'danger' : ''}`}
              disabled={action.disabled}
              onClick={() => {
                action.action?.();
                setShowMenu(false);
              }}
            >
              <action.icon size={14} />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default MessageActions;
```

---

## 4. SELECTOR DE REPOSITORIO EN COMPOSER

### 4.1 UBICACIÓN
```
client/src/components/Chat/Input/
├── TextChat.jsx                    ← Modificar
├── TextChat.tsx                   ← Componente principal
├── composer/
│   ├── ComposerActions.tsx        ← ✅ NUEVO: Botones del composer
│   └── RepositorySelector.tsx     ← ✅ NUEVO: Selector de repos
```

### 4.2 DISEÑO UI

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                  [📎] [🔗] [🤖]│   │
│  │  ┌─────────────────────────────────────────────────────────┐  │   │
│  │  │ 💻 Repo: [dropdown repos]              │ [🔄 Sync] │   │  │   │
│  │  └─────────────────────────────────────────────────────────┘  │   │
│  │                                                                  │   │
│  │  Escribe tu mensaje aquí...                                      │   │
│  │                                                                  │   │
│  │  ┌──────────────────────────────────────────────────────────┐  │   │
│  │  │                                                          │  │   │
│  │  │                                                          │  │   │
│  │  │                                                          │  │   │
│  │  │                                                          │  │   │
│  │  │                                                          │  │   │
│  │  │                                                          │  │   │
│  │  └──────────────────────────────────────────────────────────┘  │   │
│  │                                                                  │   │
│  │                                        [✨ Enviar]              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ DROPDOWN REPOSITORIO:                                                   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 🔍 Buscar repositorio...                                         │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ 📁 Todos los repositorios                                       │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ 📁 ⭐ mi-libre-chat                                [🌐] [📋] │   │
│  │     Chat con IA avanzado                                        │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ 📁 🤖 agent-builder                                  [🌐] [📋] │   │
│  │     Sistema de agentes                                          │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ 📁 📦 npm-package                                   [📋]       │   │
│  │     Paquete NPM                                                 │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ 📁 🔒 private-repo                                   [🔒]       │   │
│  │     Repositorio privado                                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.3 CÓDIGO - RepositorySelector.tsx

```typescript
// client/src/components/Chat/Input/composer/RepositorySelector.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  FolderGit2, Search, RefreshCw, Globe, Lock, 
  ChevronDown, ExternalLink, Copy, Check
} from 'lucide-react';
import { useConnectorSearch } from '~/data-provider';
import { useLocalize } from '~/hooks';

interface Repository {
  id: string;
  name: string;
  fullName: string;
  description: string;
  private: boolean;
  htmlUrl: string;
  cloneUrl: string;
  stars: number;
  language: string;
}

interface RepositorySelectorProps {
  value?: Repository;
  onChange: (repo: Repository | null) => void;
  disabled?: boolean;
}

export const RepositorySelector: React.FC<RepositorySelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(value || null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const localize = useLocalize();

  const { data: repos, isLoading, refetch } = useConnectorSearch(
    'github',
    search,
    { enabled: search.length > 0 }
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (repo: Repository) => {
    setSelectedRepo(repo);
    onChange(repo);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = () => {
    setSelectedRepo(null);
    onChange(null);
  };

  const copyCloneUrl = (url: string) => {
    navigator.clipboard.writeText(url);
  };

  const displayRepos = repos || [];

  return (
    <div className="repository-selector" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        className={`selector-trigger ${selectedRepo ? 'has-value' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <FolderGit2 size={14} />
        {selectedRepo ? (
          <span className="selected-repo">
            <span className="repo-name">{selectedRepo.name}</span>
            <span className="repo-icon">
              {selectedRepo.private ? <Lock size={12} /> : <Globe size={12} />}
            </span>
          </span>
        ) : (
          <span className="placeholder">
            {localize('com_ui_select_repo') || 'Seleccionar repositorio'}
          </span>
        )}
        <ChevronDown size={14} className={`chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {/* Clear Button */}
      {selectedRepo && (
        <button
          type="button"
          className="clear-btn"
          onClick={handleClear}
          title="Limpiar"
        >
          ×
        </button>
      )}

      {/* Sync Button */}
      <button
        type="button"
        className="sync-btn"
        onClick={() => refetch()}
        disabled={isLoading}
        title="Sincronizar"
      >
        <RefreshCw size={14} className={isLoading ? 'spinning' : ''} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="selector-dropdown">
          {/* Search */}
          <div className="search-container">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder={localize('com_ui_search_repos') || 'Buscar repositorios...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* Repos List */}
          <div className="repos-list">
            {isLoading ? (
              <div className="loading">{localize('com_ui_searching')}</div>
            ) : displayRepos.length === 0 ? (
              <div className="empty">
                {search ? localize('com_ui_no_results') : localize('com_ui_start_search')}
              </div>
            ) : (
              displayRepos.map((repo) => (
                <div
                  key={repo.id}
                  className={`repo-item ${selectedRepo?.id === repo.id ? 'selected' : ''}`}
                  onClick={() => handleSelect(repo)}
                >
                  <div className="repo-info">
                    <div className="repo-header">
                      <FolderGit2 size={14} />
                      <span className="repo-name">{repo.name}</span>
                      {repo.private && <Lock size={12} className="private-icon" />}
                    </div>
                    {repo.description && (
                      <div className="repo-description">{repo.description}</div>
                    )}
                    <div className="repo-meta">
                      {repo.stars > 0 && <span>⭐ {repo.stars}</span>}
                      {repo.language && <span>• {repo.language}</span>}
                    </div>
                  </div>
                  <div className="repo-actions">
                    <button
                      className="action-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(repo.htmlUrl, '_blank');
                      }}
                      title="Ver en GitHub"
                    >
                      <ExternalLink size={12} />
                    </button>
                    <button
                      className="action-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyCloneUrl(repo.cloneUrl);
                      }}
                      title="Copiar URL"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RepositorySelector;
```

---

## 5. PANEL DE ACTIVIDAD IA (MANUS STYLE)

### 5.1 UBICACIÓN
```
client/src/components/Chat/
├── Chat.jsx                      ← Modificar para incluir panel
├── ActivityPanel/
│   ├── ActivityPanel.tsx         ← ✅ NUEVO: Panel principal
│   ├── ActivityItem.tsx         ← ✅ NUEVO: Item de actividad
│   ├── ActivitySearch.tsx        ← ✅ NUEVO: Búsqueda web
│   ├── ActivityCoding.tsx        ← ✅ NUEVO: Programación
│   ├── ActivityProgress.tsx      ← ✅ NUEVO: Progreso
│   └── ActivityLog.tsx           ← ✅ NUEVO: Log de acciones
```

### 5.2 DISEÑO UI - PANEL DE ACTIVIDAD

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     🔄 PANEL DE ACTIVIDAD IA                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─ Header ────────────────────────────────────────────────────────┐   │
│  │  [🔍 Búsqueda] [💻 Código] [📁 Archivos] [📊 Progreso] [📝 Log]│   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─ Content Area ──────────────────────────────────────────────────┐   │
│  │                                                                    │   │
│  │  ┌─ Actividad Actual ──────────────────────────────────────────┐  │   │
│  │  │  🔍 Buscando información en la web...                       │  │   │
│  │  │  Query: "mejores prácticas React 2024"                       │  │   │
│  │  │  ████████████████░░░░░░░ 60%                               │  │   │
│  │  │  15 resultados encontrados                                   │  │   │
│  │  │                                                                │  │   │
│  │  │  ┌────────────────────────────────────────────────────────┐ │  │   │
│  │  │  │ 🌐 react.dev - Documentación oficial de React           │ │  │   │
│  │  │  │    Score: 95% | Actualizado: 2024                      │ │  │   │
│  │  │  └────────────────────────────────────────────────────────┘ │  │   │
│  │  │  ┌────────────────────────────────────────────────────────┐ │  │   │
│  │  │  │ 🌐 github.com/reactjs - Best practices                │ │  │   │
│  │  │  │    Score: 88% | Estrellas: 2.5K                       │ │  │   │
│  │  │  └────────────────────────────────────────────────────────┘ │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  │                                                                    │   │
│  │  ┌─ Código (collapsible) ──────────────────────────────────────┐  │   │
│  │  │  💻 Escribiendo código...                                   │  │   │
│  │  │  📁 src/components/Button.tsx                               │  │   │
│  │  │  ┌──────────────────────────────────────────────────────┐  │  │   │
│  │  │  │ import React from 'react';                            │  │  │   │
│  │  │  │ interface ButtonProps {                               │  │  │   │
│  │  │  │   children: React.ReactNode;                          │  │  │   │
│  │  │  └──────────────────────────────────────────────────────┘  │  │   │
│  │  │  [Ver más] [Copiar] [Guardar]                             │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  │                                                                    │   │
│  │  ┌─ Archivos (collapsible) ────────────────────────────────────┐  │   │
│  │  │  📁 Creando archivos...                                     │  │   │
│  │  │  ├── ✓ src/components/Button.tsx                          │  │   │
│  │  │  ├── ✓ src/styles/button.module.css                       │  │   │
│  │  │  └── ◌ src/types/button.ts (pendiente)                    │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  │                                                                    │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─ Log Panel (collapsible) ────────────────────────────────────────┐   │
│  │  10:30:01 [INFO] Iniciando tarea                                 │   │
│  │  10:30:02 [WEB] Búsqueda: "React best practices"                 │   │
│  │  10:30:05 [WEB] Resultados: 25 encontrados                      │   │
│  │  10:30:08 [CODE] Generando componente Button                     │   │
│  │  10:30:12 [FILE] Creado: src/components/Button.tsx               │   │
│  │  10:30:15 [CODE] Generando estilos                               │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─ Footer ──────────────────────────────────────────────────────────┐   │
│  │  [Detener]                    [Minimizar] [Maximizar] [Cerrar]  │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 TIPOS DE ACTIVIDADES

```typescript
// client/src/types/Activity.ts
export type ActivityType = 
  | 'search'           // Búsqueda web
  | 'coding'           // Programación
  | 'file'             // Gestión de archivos
  | 'command'          // Comandos shell
  | 'api'              // Llamadas API
  | 'rag'              // RAG/Búsqueda vectorial
  | 'download'         // Descargas
  | 'compile'          // Compilación
  | 'test'             // Testing
  | 'deploy'           // Despliegue
  | 'reasoning';       // Razonamiento

export interface Activity {
  id: string;
  type: ActivityType;
  status: 'pending' | 'running' | 'completed' | 'failed';
  title: string;
  description?: string;
  progress?: number;      // 0-100
  startTime: Date;
  endTime?: Date;
  data?: ActivityData;    // Datos específicos por tipo
  children?: Activity[]; // Sub-actividades
  error?: string;
}

export interface ActivitySearchData {
  query: string;
  results?: SearchResult[];
  sources: string[];
  totalResults: number;
}

export interface ActivityCodingData {
  language: string;
  file?: string;
  code?: string;
  lineStart?: number;
  lineEnd?: number;
}

export interface ActivityFileData {
  action: 'create' | 'read' | 'update' | 'delete';
  path: string;
  content?: string;
}
```

### 5.4 CÓDIGO - ActivityPanel.tsx

```typescript
// client/src/components/Chat/ActivityPanel/ActivityPanel.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Code, FolderOpen, TrendingUp, FileText,
  Play, Pause, Square, Minimize2, Maximize2, X,
  ChevronDown, ChevronRight, Copy, Check, ExternalLink
} from 'lucide-react';
import { Activity, ActivityType } from '~/types/Activity';
import { ActivityItem } from './ActivityItem';
import { ActivityLog } from './ActivityLog';
import './ActivityPanel.css';

interface ActivityPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  activities: Activity[];
  currentActivity?: Activity;
}

type TabType = 'search' | 'coding' | 'files' | 'progress' | 'log';

export const ActivityPanel: React.FC<ActivityPanelProps> = ({
  isOpen,
  onClose,
  onMinimize,
  activities,
  currentActivity,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('progress');
  const [isMinimized, setIsMinimized] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(['current']);
  
  // WebSocket para recibir actividades en tiempo real
  useEffect(() => {
    const ws = new WebSocket(`${process.env.WS_URL}/activities`);
    
    ws.onmessage = (event) => {
      const activity = JSON.parse(event.data);
      // Handle new activity
    };
    
    return () => ws.close();
  }, []);

  const tabs = [
    { id: 'search', icon: Search, label: 'Búsqueda' },
    { id: 'coding', icon: Code, label: 'Código' },
    { id: 'files', icon: FolderOpen, label: 'Archivos' },
    { id: 'progress', icon: TrendingUp, label: 'Progreso' },
    { id: 'log', icon: FileText, label: 'Log' },
  ] as const;

  const toggleSection = (section: string) => {
    setExpandedSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const filteredActivities = activities.filter(a => {
    switch (activeTab) {
      case 'search': return a.type === 'search';
      case 'coding': return a.type === 'coding';
      case 'files': return a.type === 'file';
      case 'progress': return true;
      case 'log': return true;
      default: return true;
    }
  });

  if (!isOpen) return null;

  return (
    <div className={`activity-panel ${isMinimized ? 'minimized' : ''}`}>
      {/* Header */}
      <div className="panel-header">
        <div className="header-title">
          <span className="pulse-indicator" />
          <span>Panel de Actividad IA</span>
        </div>
        
        {/* Tabs */}
        <div className="header-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
            >
              <tab.icon size={14} />
            </button>
          ))}
        </div>
        
        {/* Controls */}
        <div className="header-controls">
          <button onClick={() => setIsMinimized(!isMinimized)}>
            {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
          <button onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="panel-content">
          {/* Current Activity */}
          {currentActivity && (
            <div className="section current-activity">
              <div 
                className="section-header"
                onClick={() => toggleSection('current')}
              >
                {expandedSections.includes('current') 
                  ? <ChevronDown size={14} /> 
                  : <ChevronRight size={14} />
                }
                <ActivityIcon type={currentActivity.type} />
                <span>{currentActivity.title}</span>
                <span className="status-badge">{currentActivity.status}</span>
              </div>
              
              {expandedSections.includes('current') && (
                <div className="section-content">
                  <ActivityItem activity={currentActivity} />
                </div>
              )}
            </div>
          )}

          {/* Activity List */}
          <div className="activities-list">
            {filteredActivities.map(activity => (
              <ActivityItem 
                key={activity.id} 
                activity={activity}
                expanded={expandedSections.includes(activity.id)}
                onToggle={() => toggleSection(activity.id)}
              />
            ))}
          </div>

          {/* Log */}
          {activeTab === 'log' && (
            <ActivityLog activities={activities} />
          )}
        </div>
      )}
    </div>
  );
};

const ActivityIcon: React.FC<{ type: ActivityType }> = ({ type }) => {
  const icons = {
    search: Search,
    coding: Code,
    file: FolderOpen,
    command: Play,
    api: ExternalLink,
    rag: Search,
    download: FileText,
    compile: Code,
    test: Play,
    deploy: ExternalLink,
    reasoning: TrendingUp,
  };
  
  const Icon = icons[type] || FileText;
  return <Icon size={14} />;
};

export default ActivityPanel;
```

---

## 6. PANEL DE MÉTRICAS DRAG & DROP

### 6.1 UBICACIÓN
```
client/src/components/
├── Dashboard/
│   ├── Dashboard.jsx              ← Panel principal
│   ├── MetricsPanel/
│   │   ├── MetricsPanel.tsx       ← ✅ NUEVO: Panel de métricas
│   │   ├── MetricWidget.tsx      ← ✅ NUEVO: Widget individual
│   │   ├── DragDropContext.tsx   ← ✅ NUEVO: Context de drag
│   │   ├── WidgetLibrary.tsx     ← ✅ NUEVO: Biblioteca de widgets
│   │   └── WidgetConfigs/         ← ✅ NUEVO: Configuraciones
│   │       ├── TokenUsage.tsx
│   │       ├── ResponseTime.tsx
│   │       ├── ErrorRate.tsx
│   │       ├── ModelPerformance.tsx
│   │       ├── CostTracking.tsx
│   │       ├── UserActivity.tsx
│   │       └── CustomQuery.tsx
```

### 6.2 DISEÑO UI

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    📊 PANEL DE MÉTRICAS (Drag & Drop)                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─ Header ─────────────────────────────────────────────────────────┐   │
│  │  📊 Métricas                              [⚙️ Config] [+ Widget]│   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─ Toolbar ───────────────────────────────────────────────────────┐   │
│  │  [📐 Grid: 2x2 ▼] [⏰ Rango: 7 días ▼] [🔄 Auto-refresh ✓]   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─ Widget Library (collapsible) ──────────────────────────────────┐   │
│  │  Arrastra los widgets al dashboard:                              │   │
│  │                                                                    │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐         │   │
│  │  │ Tokens │ │ Latenc │ │ Errores│ │ Model  │ │ Costos│         │   │
│  │  │  📈   │ │  📉   │ │  ⚠️   │ │  🤖   │ │  💰   │         │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘         │   │
│  │                                                                    │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐         │   │
│  │  │ Usuarios│ │ Topics │ │ Hilos  │ │ Queries│ │ Custom │         │   │
│  │  │  👥   │ │  📝   │ │  🧵   │ │  💬   │ │  ⚙️   │         │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘         │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─ Dashboard Grid ────────────────────────────────────────────────┐   │
│  │                                                                    │   │
│  │  ┌─────────────────────┐ ┌─────────────────────┐              │   │
│  │  │ 📈 USO DE TOKENS    │ │ 📉 LATENCIA         │              │   │
│  │  │                     │ │                     │              │   │
│  │  │   ████████░░░░░    │ │   ██████░░░░░░░    │              │   │
│  │  │   1.2M / 2M        │ │   245ms promedio    │              │   │
│  │  │   60%              │ │   p95: 500ms        │              │   │
│  │  │                     │ │                     │              │   │
│  │  │ [≡] [×] [⚙️]      │ │ [≡] [×] [⚙️]        │              │   │
│  │  └─────────────────────┘ └─────────────────────┘              │   │
│  │                                                                    │   │
│  │  ┌─────────────────────┐ ┌─────────────────────┐              │   │
│  │  │ ⚠️ TASA DE ERRORES  │ │ 🤖 MODELOS          │              │   │
│  │  │                     │ │                     │              │   │
│  │  │   █░░░░░░░░░░░░    │ │  GPT-4: 45% ████    │              │   │
│  │  │   0.5% (Bueno ✓)   │ │  Claude: 30% ██      │              │   │
│  │  │                     │ │  Gemini: 25% ██      │              │   │
│  │  │ [≡] [×] [⚙️]      │ │ [≡] [×] [⚙️]        │              │   │
│  │  └─────────────────────┘ └─────────────────────┘              │   │
│  │                                                                    │   │
│  │  ┌────────────────────────────────────────────┐              │   │
│  │  │ 💰 COSTOS                                  │              │   │
│  │  │                                             │              │   │
│  │  │   GPT-4: $45.23    Claude: $23.50          │              │   │
│  │  │   Gemini: $12.00   Groq: $0.00 ✓          │              │   │
│  │  │                                             │              │   │
│  │  │   Total: $80.73 / $200 presupuesto        │              │   │
│  │  │   ████████████░░░░░░░░░░░░ 40%            │              │   │
│  │  │                                             │              │   │
│  │  │ [≡] [×] [⚙️]                              │              │   │
│  │  └─────────────────────────────────────────────┘              │   │
│  │                                                                    │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.3 TIPOS DE WIDGETS

```typescript
// client/src/components/Dashboard/MetricsPanel/types.ts
export interface MetricWidget {
  id: string;
  type: WidgetType;
  title: string;
  position: { x: number; y: number; w: number; h: number };
  config: WidgetConfig;
  data?: MetricData;
}

export type WidgetType = 
  | 'token_usage'
  | 'response_time'
  | 'error_rate'
  | 'model_performance'
  | 'cost_tracking'
  | 'user_activity'
  | 'conversation_topics'
  | 'thread_stats'
  | 'query_volume'
  | 'custom_query';

export interface WidgetConfig {
  refreshInterval?: number;     // ms
  timeRange?: '1h' | '24h' | '7d' | '30d' | 'custom';
  filters?: Record<string, any>;
  visualization?: 'line' | 'bar' | 'pie' | 'area' | 'stat';
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count';
}

export interface TokenUsageData {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  limit: number;
  usageByModel: Record<string, number>;
}

export interface ResponseTimeData {
  avg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  byModel: Record<string, number>;
}

export interface ErrorRateData {
  rate: number;
  totalErrors: number;
  totalRequests: number;
  errorsByType: Record<string, number>;
}
```

---

## 7. LLM GATEWAY

### 7.1 UBICACIÓN
```
api/server/services/
├── LLMGateway/
│   ├── LLMGateway.js             ← ✅ NUEVO: Gateway principal
│   ├── LLMGateway.ts             ← ✅ NUEVO: Gateway TypeScript
│   ├── ProviderManager.js        ← ✅ NUEVO: Gestor de providers
│   ├── Router.js                 ← ✅ NUEVO: Enrutamiento
│   ├── LoadBalancer.js           ← ✅ NUEVO: Balanceador
│   ├── CircuitBreaker.js         ← ✅ NUEVO: Circuit breaker
│   ├── RateLimiter.js           ← ✅ NUEVO: Rate limiter
│   ├── FallbackChain.js          ← ✅ NUEVO: Cadena de fallback
│   ├── HealthChecker.js          ← ✅ NUEVO: Health checks
│   ├── CostOptimizer.js          ← ✅ NUEVO: Optimizador de costos
│   ├── providers/
│   │   ├── BaseProvider.js
│   │   ├── GroqProvider.js
│   │   ├── DeepSeekProvider.js
│   │   ├── CloudflareProvider.js
│   │   ├── MistralProvider.js
│   │   ├── CohereProvider.js
│   │   ├── OpenRouterProvider.js
│   │   ├── GeminiProvider.js
│   │   └── AnthropicProvider.js
│   └── index.js
```

### 7.2 ARQUITECTURA DEL GATEWAY

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         LLM GATEWAY - ARQUITECTURA                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        ENTRY POINT                                  │  │
│  │                       /api/chat/complete                            │  │
│  └─────────────────────────────────┬──────────────────────────────────┘  │
│                                    │                                      │
│                                    ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      MIDDLEWARE LAYER                              │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐     │  │
│  │  │   Auth     │ │ Rate Limit │ │  Validate  │ │   Log      │     │  │
│  │  │ Middleware │ │ Middleware  │ │ Middleware │ │ Middleware │     │  │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘     │  │
│  └─────────────────────────────────┬──────────────────────────────────┘  │
│                                    │                                      │
│                                    ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                       ROUTER LAYER                                  │  │
│  │                                                                     │  │
│  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │                    INTELLIGENT ROUTER                         │  │  │
│  │  │                                                              │  │  │
│  │  │  • Model Selection (by capability, cost, latency)           │  │  │
│  │  │  • Fallback Chain (primary → secondary → tertiary)           │  │  │
│  │  │  • Cost Optimization (cheapest that meets requirements)     │  │  │
│  │  │  • Load Balancing (round-robin, weighted, latency-based)     │  │  │
│  │  │  • Health-Aware (skip unhealthy providers)                   │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  │                                                                     │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │  │
│  │  │  CHAT    │ │  CODE    │ │  VISION  │ │  SEARCH  │              │  │
│  │  │  Router  │ │  Router  │ │  Router  │ │  Router  │              │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘              │  │
│  │       │            │            │            │                     │  │
│  └───────┼────────────┼────────────┼────────────┼─────────────────────┘  │
│          │            │            │            │                        │
│          ▼            ▼            ▼            ▼                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     PROVIDER LAYER                                 │  │
│  │                                                                     │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │  │
│  │  │  Groq   │ │ DeepSeek│ │    CF   │ │ Mistral │ │Cohere   │      │  │
│  │  │  ┌───┐  │ │  ┌───┐  │ │  ┌───┐  │ │  ┌───┐  │ │  ┌───┐  │      │  │
│  │  │  │CB │  │ │  │CB │  │ │  │CB │  │ │  │CB │  │ │  │CB │  │      │  │
│  │  │  │RL │  │ │  │RL │  │ │  │RL │  │ │  │RL │  │ │  │RL │  │      │  │
│  │  │  │HC │  │ │  │HC │  │ │  │HC │  │ │  │HC │  │ │  │HC │  │      │  │
│  │  │  └───┘  │ │  └───┘  │ │  └───┘  │ │  └───┘  │ │  └───┘  │      │  │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘      │  │
│  │       │            │            │            │            │           │  │
│  │       ▼            ▼            ▼            ▼            ▼           │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │  │
│  │  │  API    │ │  API    │ │  API    │ │  API    │ │  API    │       │  │
│  │  │  Groq   │ │ DeepSeek│ │ Cloudfl │ │ Mistral │ │ Cohere  │       │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘       │  │
│  │                                                                     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Leyenda: CB = Circuit Breaker | RL = Rate Limiter | HC = Health Check │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 7.3 CÓDIGO PRINCIPAL - LLMGateway.js

```javascript
// api/server/services/LLMGateway/LLMGateway.js
const { EventEmitter } = require('events');
const ProviderManager = require('./ProviderManager');
const Router = require('./Router');
const LoadBalancer = require('./LoadBalancer');
const CircuitBreaker = require('./CircuitBreaker');
const FallbackChain = require('./FallbackChain');
const HealthChecker = require('./HealthChecker');
const CostOptimizer = require('./CostOptimizer');
const logger = require('../../utils/logger');

class LLMGateway extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      defaultModel: config.defaultModel || 'gpt-4',
      timeout: config.timeout || 60000,
      maxRetries: config.maxRetries || 3,
      ...config,
    };
    
    // Initialize components
    this.providerManager = new ProviderManager(config.providers);
    this.router = new Router(this.providerManager, config.routing);
    this.loadBalancer = new LoadBalancer(this.providerManager);
    this.healthChecker = new HealthChecker(this.providerManager);
    this.costOptimizer = new CostOptimizer(this.providerManager);
    
    // Start health checks
    this.healthChecker.start();
    
    logger.info('[LLMGateway] Initialized with providers:', 
      Object.keys(this.providerManager.providers).join(', ')
    );
  }
  
  /**
   * Chat completion - Main method
   */
  async complete({
    messages,
    model,
    temperature = 0.7,
    maxTokens,
    stream = false,
    fallback = true,
    userId,
    ...options
  }) {
    const startTime = Date.now();
    
    try {
      // 1. Select model based on requirements
      const selectedModel = model || await this.router.selectModel({
        messages,
        requirements: options,
      });
      
      // 2. Get provider for model
      const provider = this.providerManager.getProviderForModel(selectedModel);
      
      // 3. Execute with fallback chain if enabled
      if (fallback) {
        return await this.executeWithFallback({
          provider,
          messages,
          model: selectedModel,
          temperature,
          maxTokens,
          stream,
          userId,
          ...options,
        });
      }
      
      // 4. Direct execution
      return await this.execute({
        provider,
        messages,
        model: selectedModel,
        temperature,
        maxTokens,
        stream,
        userId,
        ...options,
      });
      
    } catch (error) {
      logger.error('[LLMGateway] Completion failed:', error);
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      this.emit('completion', { duration, model, error: error?.message });
    }
  }
  
  /**
   * Execute with automatic fallback
   */
  async executeWithFallback(params) {
    const { provider, messages, model, ...options } = params;
    
    // Get fallback chain for this model
    const chain = this.router.getFallbackChain(model);
    const providers = [provider, ...chain];
    
    let lastError;
    
    for (const p of providers) {
      try {
        // Check circuit breaker
        if (p.circuitBreaker.isOpen()) {
          logger.warn(`[LLMGateway] Circuit breaker open for ${p.name}`);
          continue;
        }
        
        // Check rate limit
        if (await p.rateLimiter.isLimited()) {
          logger.warn(`[LLMGateway] Rate limited for ${p.name}`);
          continue;
        }
        
        // Execute
        const result = await this.execute({
          provider: p,
          messages,
          model: p.getModelForTask(model),
          ...options,
        });
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        // Record failure for circuit breaker
        p.circuitBreaker.recordFailure();
        
        // Check if should continue
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        logger.warn(`[LLMGateway] Provider ${p.name} failed, trying fallback`);
      }
    }
    
    throw lastError || new Error('All providers failed');
  }
  
  /**
   * Direct execution on a provider
   */
  async execute({ provider, messages, model, stream, ...options }) {
    const startTime = Date.now();
    
    try {
      const result = await provider.complete({
        messages,
        model,
        stream,
        ...options,
      });
      
      // Record success
      provider.circuitBreaker.recordSuccess();
      provider.stats.recordSuccess(Date.now() - startTime);
      
      return result;
      
    } catch (error) {
      provider.stats.recordError(error);
      throw error;
    }
  }
  
  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    const retryableCodes = [
      'RATE_LIMITED',
      'TIMEOUT',
      'SERVICE_UNAVAILABLE',
      'BAD_GATEWAY',
      'GATEWAY_TIMEOUT',
    ];
    
    return retryableCodes.includes(error.code) || 
           error.status === 429 ||
           error.status >= 500;
  }
  
  /**
   * Get gateway statistics
   */
  getStats() {
    return {
      providers: this.providerManager.getStats(),
      health: this.healthChecker.getStatus(),
      costs: this.costOptimizer.getTotalCost(),
    };
  }
  
  /**
   * Shutdown
   */
  async shutdown() {
    this.healthChecker.stop();
    await this.providerManager.shutdown();
  }
}

module.exports = LLMGateway;
```

---

## 8. COMFYUI WEBSOCKET + PREVIEW

### 8.1 UBICACIÓN
```
api/server/services/
├── ComfyUI/
│   ├── ComfyUIService.js         ← ✅ NUEVO: Servicio principal
│   ├── ComfyUIWebSocket.js       ← ✅ NUEVO: WebSocket handler
│   ├── WorkflowBuilder.js        ← ✅ NUEVO: Constructor de workflows
│   ├── ComfyUIClient.js          ← ✅ NUEVO: Cliente REST
│   ├── ImageQueue.js             ← ✅ NUEVO: Cola de imágenes
│   └── routes/
│       └── comfyui.js            ← ✅ NUEVO: Rutas API
```

### 8.2 ARQUITECTURA WEBSOCKET

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         COMFYUI - ARQUITECTURA                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        FRONTEND                                     │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │  │
│  │  │  Model Sel.  │ │  LoRA Sel.   │ │  Parameters  │             │  │
│  │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘             │  │
│  │         │                 │                 │                      │  │
│  │         └────────┬────────┴────────┬───────┘                      │  │
│  │                  ▼                   │                               │  │
│  │         ┌────────────────┐          │                               │  │
│  │         │  Generate Btn  │◄─────────┘                               │  │
│  │         └───────┬────────┘                                          │  │
│  │                 │                                                     │  │
│  │                 ▼                                                     │  │
│  │         ┌───────────────┐                                           │  │
│  │         │  Preview Img  │                                           │  │
│  │         │  (WebSocket)  │                                           │  │
│  │         └───────────────┘                                           │  │
│  └─────────┼───────────────────────────────────────────────────────────┘  │
│            │                                                             │
│            │ HTTP POST /api/comfyui/generate                            │
│            │ WebSocket /ws/comfyui                                      │
│            ▼                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        API SERVER                                   │  │
│  │                                                                     │  │
│  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │                    COMFYUI GATEWAY                             │  │  │
│  │  │                                                              │  │  │
│  │  │  1. Validate request                                         │  │  │
│  │  │  2. Build workflow JSON                                      │  │  │
│  │  │  3. Submit to ComfyUI                                        │  │  │
│  │  │  4. Track progress via WebSocket                             │  │  │
│  │  │  5. Stream previews                                          │  │  │
│  │  │  6. Return final image                                       │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────┬────────────────────────────────────┘  │
│                                │                                          │
│         HTTP + WS              │                 WS                       │
│         ┌──────────────────────┴──────────────────────┐                  │
│         ▼                                             ▼                  │
│  ┌─────────────────┐                        ┌─────────────────┐       │
│  │   COMFYUI API   │                        │   COMFYUI WS    │       │
│  │   (REST)        │                        │   (Progress)    │       │
│  │   :8188         │                        │   :8188         │       │
│  └─────────────────┘                        └─────────────────┘       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 8.3 CÓDIGO - ComfyUIWebSocket.js

```javascript
// api/server/services/ComfyUI/ComfyUIWebSocket.js
const WebSocket = require('ws');
const EventEmitter = require('events');
const logger = require('../../utils/logger');

class ComfyUIWebSocket extends EventEmitter {
  constructor(comfyUIUrl = 'ws://localhost:8188') {
    super();
    this.comfyUIUrl = comfyUIUrl;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.pingInterval = null;
    this.subscriptions = new Map(); // clientId -> { promptId, onProgress, onComplete }
  }
  
  /**
   * Connect to ComfyUI WebSocket
   */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.comfyUIUrl);
        
        this.ws.on('open', () => {
          logger.info('[ComfyUI WS] Connected');
          this.reconnectAttempts = 0;
          this.startPing();
          resolve();
        });
        
        this.ws.on('message', (data) => this.handleMessage(data));
        
        this.ws.on('close', () => {
          logger.warn('[ComfyUI WS] Disconnected');
          this.stopPing();
          this.attemptReconnect();
        });
        
        this.ws.on('error', (error) => {
          logger.error('[ComfyUI WS] Error:', error);
          reject(error);
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Handle incoming messages
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'progress':
          this.handleProgress(message);
          break;
          
        case 'executing':
          this.handleExecuting(message);
          break;
          
        case 'executed':
          this.handleExecuted(message);
          break;
          
        case 'execution_error':
          this.handleError(message);
          break;
          
        case 'execution_start':
          this.handleExecutionStart(message);
          break;
          
        case 'received_images':
          this.handleReceivedImages(message);
          break;
          
        default:
          logger.debug('[ComfyUI WS] Unknown message type:', message.type);
      }
      
    } catch (error) {
      logger.error('[ComfyUI WS] Failed to parse message:', error);
    }
  }
  
  /**
   * Handle progress updates
   */
  handleProgress(message) {
    const { node, prompt_id, progress, max_progress, node_name } = message;
    
    // Find subscription by prompt_id
    for (const [clientId, sub] of this.subscriptions) {
      if (sub.promptId === prompt_id) {
        const progressData = {
          node,
          promptId: prompt_id,
          progress: progress / max_progress,
          current: progress,
          max: max_progress,
          nodeName: node_name,
        };
        
        // Emit to subscriber
        sub.onProgress?.(progressData);
        
        // Emit to gateway
        this.emit('progress', { clientId, ...progressData });
      }
    }
  }
  
  /**
   * Handle node execution
   */
  handleExecuting(message) {
    const { node, prompt_id } = message;
    
    if (node === null) {
      // Execution complete
      this.handleExecutionComplete(prompt_id);
    }
  }
  
  /**
   * Submit a prompt
   */
  async submitPrompt(workflow, clientId) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }
    
    return new Promise((resolve, reject) => {
      const promptId = workflow.prompt_id || this.generatePromptId();
      
      // Store subscription
      this.subscriptions.set(clientId, {
        promptId,
        onProgress: (progress) => {
          this.emit('progress', { clientId, ...progress });
        },
        onComplete: (images) => {
          this.subscriptions.delete(clientId);
          resolve(images);
        },
        onError: (error) => {
          this.subscriptions.delete(clientId);
          reject(error);
        },
      });
      
      // Set timeout
      const timeout = setTimeout(() => {
        if (this.subscriptions.has(clientId)) {
          this.subscriptions.delete(clientId);
          reject(new Error('ComfyUI prompt timeout'));
        }
      }, 600000); // 10 minutes
      
      this.subscriptions.get(clientId).timeout = timeout;
      
      // Submit prompt
      this.ws.send(JSON.stringify({
        type: 'prompt',
        data: {
          ...workflow,
          prompt_id: promptId,
        },
      }));
      
      logger.info(`[ComfyUI WS] Submitted prompt ${promptId}`);
    });
  }
  
  /**
   * Handle execution complete
   */
  handleExecutionComplete(promptId) {
    for (const [clientId, sub] of this.subscriptions) {
      if (sub.promptId === promptId) {
        clearTimeout(sub.timeout);
        sub.onComplete?.([]);
        break;
      }
    }
  }
  
  /**
   * Attempt to reconnect
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('[ComfyUI WS] Max reconnection attempts reached');
      this.emit('disconnected');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    logger.info(`[ComfyUI WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => this.connect(), delay);
  }
  
  /**
   * Start ping interval
   */
  startPing() {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }
  
  /**
   * Stop ping interval
   */
  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  /**
   * Generate unique prompt ID
   */
  generatePromptId() {
    return `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Close connection
   */
  close() {
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
  }
}

module.exports = ComfyUIWebSocket;
```

---

## 9. EXECUTION PROFILES

### 9.1 UBICACIÓN
```
api/server/services/
├── ExecutionProfiles/
│   ├── ExecutionProfileService.js ← ✅ AMPLIAR
│   ├── ProfileTypes.js             ← ✅ NUEVO: Tipos completos
│   ├── ProfileValidator.js         ← ✅ NUEVO: Validador
│   ├── ProfileStore.js             ← ✅ NUEVO: Persistencia
│   ├── ProfileExecutor.js          ← ✅ NUEVO: Ejecutor
│   ├── profiles/
│   │   ├── LLMProfile.js           ← ✅ NUEVO
│   │   ├── ToolsProfile.js         ← ✅ NUEVO
│   │   ├── PermissionsProfile.js   ← ✅ NUEVO
│   │   ├── MemoryProfile.js        ← ✅ NUEVO
│   │   ├── MultimodalProfile.js    ← ✅ NUEVO
│   │   ├── ResourcesProfile.js     ← ✅ NUEVO
│   │   ├── OrchestrationProfile.js ← ✅ NUEVO
│   │   └── SecurityProfile.js      ← ✅ NUEVO
│   └── index.js
```

### 9.2 TIPOS COMPLETOS

```typescript
// api/server/services/ExecutionProfiles/ProfileTypes.ts

export interface ExecutionProfile {
  id: string;
  name: string;
  description: string;
  version: string;
  isActive: boolean;
  
  // Sub-profiles
  llm: LLMProfile;
  tools: ToolsProfile;
  permissions: PermissionsProfile;
  memory: MemoryProfile;
  multimodal: MultimodalProfile;
  resources: ResourcesProfile;
  orchestration: OrchestrationProfile;
  security: SecurityProfile;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  tags: string[];
}

export interface LLMProfile {
  // Primary model selection
  primaryModel: ModelSelection;
  
  // Fallback chain (ordered)
  fallbackModels: ModelSelection[];
  
  // Provider configuration
  providers: {
    [providerId: string]: {
      enabled: boolean;
      priority: number;
      maxRPM: number;
      maxTPM: number;
    };
  };
  
  // Generation settings
  generation: {
    temperature: number;
    topP: number;
    topK: number;
    maxTokens: number;
    stopSequences: string[];
    seed?: number;
  };
  
  // Retry configuration
  retry: {
    maxAttempts: number;
    backoffMultiplier: number;
    initialDelayMs: number;
    maxDelayMs: number;
  };
}

export interface ModelSelection {
  provider: string;
  model: string;
  capabilities: ('chat' | 'code' | 'vision' | 'math' | 'reasoning')[];
  maxContext: number;
  cost?: {
    input: number;  // per 1M tokens
    output: number;
  };
}

export interface ToolsProfile {
  enabled: boolean;
  
  // MCP Tools
  mcp: {
    enabled: boolean;
    servers: string[];
    timeout: number;
  }[];
  
  // Built-in tools
  builtIn: {
    [toolName: string]: {
      enabled: boolean;
      config: Record<string, any>;
    };
  };
  
  // Custom tools
  custom: {
    [toolId: string]: {
      enabled: boolean;
      config: Record<string, any>;
    };
  };
  
  // Restrictions
  restrictions: {
    maxConcurrent: number;
    allowedPaths?: string[];
    blockedPaths?: string[];
    sandboxEnabled: boolean;
  };
}

export interface PermissionsProfile {
  enabled: boolean;
  
  // Network permissions
  network: {
    allowExternalIPs: boolean;
    allowedDomains: string[];
    blockedDomains: string[];
    maxRequestSize: number;
  };
  
  // System permissions
  system: {
    allowFileSystem: boolean;
    allowedDirs: string[];
    blockedDirs: string[];
    allowSubprocess: boolean;
    maxSubprocessTime: number;
  };
  
  // Data permissions
  data: {
    allowDataUpload: boolean;
    maxUploadSize: number;
    allowedFormats: string[];
    piiDetection: boolean;
  };
  
  // RAG permissions
  rag: {
    enabled: boolean;
    allowedSources: string[];
    maxDocuments: number;
  };
}

export interface MemoryProfile {
  enabled: boolean;
  
  // Short-term memory
  shortTerm: {
    enabled: boolean;
    maxMessages: number;
    windowType: 'sliding' | 'token_based';
    includeSystem: boolean;
  };
  
  // Long-term memory
  longTerm: {
    enabled: boolean;
    provider: 'vector' | 'graph' | 'hybrid';
    vectorDb?: {
      provider: 'pinecone' | 'weaviate' | 'chroma' | 'qdrant';
      index: string;
      dimension: number;
      metric: 'cosine' | 'euclidean' | 'dotproduct';
    };
    retentionDays: number;
    maxEntries: number;
  };
  
  // Shared memory (multi-agent)
  shared: {
    enabled: boolean;
    namespace: string;
    visibility: 'private' | 'team' | 'public';
  };
  
  // Memory isolation
  isolation: {
    isolateByUser: boolean;
    isolateBySession: boolean;
    clearOnConversationEnd: boolean;
  };
}

export interface ResourcesProfile {
  enabled: boolean;
  
  // Context management
  context: {
    maxContextTokens: number;
    compressionEnabled: boolean;
    summaryModel?: string;
  };
  
  // Token limits
  tokens: {
    maxInputTokens: number;
    maxOutputTokens: number;
    maxTotalTokens: number;
  };
  
  // Concurrency
  concurrency: {
    maxConcurrentRequests: number;
    maxConcurrentTools: number;
    maxQueueSize: number;
  };
  
  // Timing
  timing: {
    maxExecutionTime: number;
    idleTimeout: number;
    responseTimeout: number;
  };
}

export interface OrchestrationProfile {
  enabled: boolean;
  
  // Sub-agents
  subAgents: {
    enabled: boolean;
    maxAgents: number;
    agentTypes: string[];
    coordination: 'sequential' | 'parallel' | 'hierarchical';
  };
  
  // Supervisor
  supervisor: {
    enabled: boolean;
    model: string;
    reviewInterval: number;
    interventionThreshold: number;
  };
  
  // Workflow
  workflow: {
    type: 'sequential' | 'parallel' | 'dag' | 'custom';
    stages: WorkflowStage[];
    errorStrategy: 'stop' | 'retry' | 'skip' | 'fallback';
  };
}

export interface SecurityProfile {
  enabled: boolean;
  
  // Authentication
  auth: {
    requireAuth: boolean;
    authMethods: ('api_key' | 'oauth' | 'jwt')[];
    sessionTimeout: number;
  };
  
  // Encryption
  encryption: {
    atRest: boolean;
    inTransit: boolean;
    algorithm: 'AES-128' | 'AES-256' | 'RSA';
  };
  
  // Sandboxing
  sandbox: {
    enabled: boolean;
    type: 'container' | 'vm' | 'wasm';
    networkIsolation: boolean;
    resourceLimits: {
      cpu: number;
      memory: number;
      disk: number;
    };
  };
  
  // Audit
  audit: {
    enabled: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    retentionDays: number;
    alertOnError: boolean;
    destinations: ('file' | 'db' | 'syslog' | 'slack')[];
  };
}
```

---

## 10. ESTRUCTURA DE ARCHIVOS

```
mi-libre-chat/
├── api/
│   └── server/
│       ├── services/
│       │   ├── LLMGateway/                    ← NUEVO
│       │   │   ├── LLMGateway.js
│       │   │   ├── ProviderManager.js
│       │   │   ├── Router.js
│       │   │   ├── LoadBalancer.js
│       │   │   ├── providers/
│       │   │   │   ├── BaseProvider.js
│       │   │   │   ├── GroqProvider.js
│       │   │   │   ├── DeepSeekProvider.js
│       │   │   │   ├── CloudflareProvider.js
│       │   │   │   ├── MistralProvider.js
│       │   │   │   ├── CohereProvider.js
│       │   │   │   └── ...
│       │   │   └── index.js
│       │   │
│       │   ├── ComfyUI/                      ← NUEVO
│       │   │   ├── ComfyUIService.js
│       │   │   ├── ComfyUIWebSocket.js
│       │   │   ├── WorkflowBuilder.js
│       │   │   └── routes/
│       │   │       └── comfyui.js
│       │   │
│       │   └── ExecutionProfiles/             ← AMPLIAR
│       │       ├── ExecutionProfileService.js
│       │       ├── ProfileTypes.js
│       │       ├── ProfileExecutor.js
│       │       └── profiles/
│       │           ├── LLMProfile.js
│       │           ├── ToolsProfile.js
│       │           ├── PermissionsProfile.js
│       │           ├── MemoryProfile.js
│       │           ├── ResourcesProfile.js
│       │           ├── OrchestrationProfile.js
│       │           └── SecurityProfile.js
│       │
│       └── routes/
│           ├── llm.js                         ← NUEVO
│           ├── comfyui.js                     ← NUEVO
│           └── execution-profiles.js           ← NUEVO
│
├── client/
│   └── src/
│       ├── components/
│       │   ├── Chat/
│       │   │   ├── Messages/
│       │   │   │   ├── MessageActions.tsx    ← NUEVO
│       │   │   │   └── MoreActionsMenu.tsx   ← NUEVO
│       │   │   │
│       │   │   ├── Input/
│       │   │   │   └── composer/
│       │   │   │       └── RepositorySelector.tsx  ← NUEVO
│       │   │   │
│       │   │   └── ActivityPanel/            ← NUEVO
│       │   │       ├── ActivityPanel.tsx
│       │   │       ├── ActivityItem.tsx
│       │   │       ├── ActivitySearch.tsx
│       │   │       ├── ActivityCoding.tsx
│       │   │       └── ActivityLog.tsx
│       │   │
│       │   └── Dashboard/
│       │       └── MetricsPanel/             ← NUEVO
│       │           ├── MetricsPanel.tsx
│       │           ├── MetricWidget.tsx
│       │           ├── DragDropContext.tsx
│       │           ├── WidgetLibrary.tsx
│       │           └── configs/
│       │               ├── TokenUsage.tsx
│       │               ├── ResponseTime.tsx
│       │               ├── ErrorRate.tsx
│       │               ├── ModelPerformance.tsx
│       │               └── CostTracking.tsx
│       │
│       ├── hooks/
│       │   ├── useLLMGateway.ts              ← NUEVO
│       │   ├── useComfyUI.ts                  ← NUEVO
│       │   ├── useActivityPanel.ts            ← NUEVO
│       │   └── useMetricsPanel.ts             ← NUEVO
│       │
│       └── types/
│           ├── Activity.ts                    ← NUEVO
│           ├── Metrics.ts                     ← NUEVO
│           └── ExecutionProfile.ts             ← NUEVO
│
├── config/
│   ├── llm-providers.yaml                    ← NUEVO
│   └── comfyui.yaml                         ← NUEVO
│
└── docs/
    ├── LLM_GATEWAY.md                        ← NUEVO
    ├── COMFYUI_INTEGRATION.md                ← NUEVO
    └── EXECUTION_PROFILES.md                 ← NUEVO
```

---

## 11. CRONOGRAMA DE IMPLEMENTACIÓN

### Fase 1: LLM Gateway (3-4 días)
- [ ] Setup ProviderManager
- [ ] Implementar Groq, DeepSeek, Cloudflare providers
- [ ] Implementar Router y FallbackChain
- [ ] Agregar CircuitBreaker y RateLimiter
- [ ] Testing y documentación

### Fase 2: Mensajes del Chat (1-2 días)
- [ ] MessageActions component
- [ ] MoreActionsMenu
- [ ] Integración con API
- [ ] Testing

### Fase 3: Selector de Repositorio (2 días)
- [ ] RepositorySelector component
- [ ] Integración con Connectors
- [ ] UI/UX refinamiento
- [ ] Testing

### Fase 4: Panel de Actividad IA (3-4 días)
- [ ] ActivityPanel base
- [ ] ActivityItem components
- [ ] WebSocket integration
- [ ] Log viewer
- [ ] Testing

### Fase 5: Panel de Métricas (3-4 días)
- [ ] MetricsPanel base con drag & drop
- [ ] WidgetLibrary
- [ ] Implementar 8-10 widgets
- [ ] Persistencia de layout
- [ ] Testing

### Fase 6: ComfyUI WebSocket (3-4 días)
- [ ] ComfyUIWebSocket service
- [ ] WorkflowBuilder
- [ ] Frontend integration
- [ ] Preview component
- [ ] Testing

### Fase 7: Execution Profiles (4-5 días)
- [ ] ProfileTypes completos
- [ ] ProfileExecutor
- [ ] UI de perfiles
- [ ] Integración con gateway
- [ ] Testing

**Total estimado: 19-25 días**

---

*Documento de diseño creado: 2026-07-19*
*Versión: 1.0*
