# 🤖 Specialized Agents

Sistema de agentes especializados para tareas específicas.

---

## Agentes Disponibles

| Agente | Descripción | Estado |
|--------|-------------|--------|
| **QA Agent** | Testing y control de calidad | ✅ Listo |
| **Security Agent** | Análisis de vulnerabilidades | ✅ Listo |
| **Docker Agent** | Docker y Kubernetes | ✅ Listo |
| **Code Review Agent** | Revisión de código | ✅ Listo |
| **Deep Research Agent** | Investigación profunda | ✅ Listo |

---

## Uso

```typescript
import { QAAgent, SecurityAgent, DeepResearchAgent } from './specialized';

// QA Agent
const qa = new QAAgent();
const result = await qa.execute('write tests', { file: 'my-file.ts' });

// Deep Research
const research = new DeepResearchAgent(5); // 5 iteraciones
const report = await research.execute('investigación sobre IA');

// Security
const security = new SecurityAgent();
const analysis = await security.execute('scan code');
```

---

## Deep Research Agent

El agente de investigación profunda:

1. **Búsqueda inicial** - Consulta principal
2. **Deep dive** - Sigue enlaces y profundiza
3. **Encadenamiento** - Usa hallazgos para siguientes búsquedas
4. **Reporte final** - Consolida todas las fuentes

### Configuración

```typescript
const agent = new DeepResearchAgent({
  maxIterations: 5,  // Máximo de iteraciones
  searchTools: ['tavily', 'serpapi'],  // Herramientas de búsqueda
  llm: 'claude-3.5-sonnet'  // LLM para análisis
});
```
