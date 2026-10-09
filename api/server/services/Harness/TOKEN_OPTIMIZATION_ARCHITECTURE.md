# TOKEN OPTIMIZATION ENGINE — Architecture

## Overview

Universal middleware layer between agents and LLM providers that maximizes token savings while preserving information quality.

## Pipeline Flow

```
User Request
     │
     ▼
┌─────────────────┐
│  ExactCache      │ ← Hash-based exact match (0 deps)
├─────────────────┤
│  SemanticCache   │ ← TF-IDF similarity (0 deps)
├─────────────────┤
│  TaskClassifier  │ ← Detect task type (coding/chat/research/etc)
├─────────────────┤
│  BudgetManager   │ ← Allocate token budget per category
├─────────────────┤
│  Deduplication   │ ← Remove exact + semantic duplicates
├─────────────────┤
│  Conversation    │ ← Compress old messages, keep recent
│  Compressor      │
├─────────────────┤
│  MemoryOptimizer │ ← Select only relevant memories
├─────────────────┤
│  RAGOptimizer    │ ← Dedup + rerank + compress docs
├─────────────────┤
│  ToolOptimizer   │ ← Select relevant tools only
├─────────────────┤
│  ContextPruner   │ ← Score + prune by relevance
├─────────────────┤
│  Adaptive        │ ← Choose compression mode (SAFE/BALANCED/AGGRESSIVE)
│  Compressor      │
├─────────────────┤
│  QualityGate     │ ← Verify info retention ≥ 80%
├─────────────────┤
│  PrefixCache     │ ← Detect cacheable prefixes
└─────────────────┘
     │
     ▼
Optimized Request → LLM Provider
```

## Components (16 files)

| Component | File | Purpose |
|-----------|------|---------|
| **TokenAnalyzer** | `TokenAnalyzer.js` | Count tokens, estimate costs, compare before/after |
| **ExactCache** | `ExactCache.js` | Hash-based exact match cache (1h TTL, 1000 entries) |
| **SemanticCache** | `SemanticCache.js` | TF-IDF similarity cache (88% threshold, 2h TTL) |
| **DeduplicationEngine** | `DeduplicationEngine.js` | Exact + semantic dedup for messages/docs/tools |
| **MemoryOptimizer** | `MemoryOptimizer.js` | Score + select memories by relevance/importance/recency |
| **RAGOptimizer** | `RAGOptimizer.js` | Dedup + rerank + compress RAG documents |
| **ContextPruner** | `ContextPruner.js` | Score context items + select within budget |
| **ConversationCompressor** | `ConversationCompressor.js` | Summarize old messages, keep recent full |
| **TaskClassifier** | `TaskClassifier.js` | Detect task type for compression strategy |
| **AdaptiveCompressor** | `AdaptiveCompressor.js` | Choose SAFE/BALANCED/AGGRESSIVE/EXTREME mode |
| **TokenBudgetManager** | `TokenBudgetManager.js` | Dynamic allocation across categories |
| **QualityGate** | `QualityGate.js` | Verify retention of numbers/paths/instructions/errors |
| **ToolOptimizer** | `ToolOptimizer.js` | Select relevant tools + compress schemas |
| **PrefixCacheManager** | `PrefixCacheManager.js` | Cache common system prompts |
| **TokenOptimizationEngine** | `TokenOptimizationEngine.js` | Main orchestrator connecting all 14 components |
| **index** | `index.js` | Module exports |

## Task-Aware Policies

| Task Type | Mode | Compression | Strategy |
|-----------|------|-------------|----------|
| coding | SAFE | 30% | Preserve code structure, symbols, imports |
| debugging | SAFE | 20% | Preserve errors, stack traces, context |
| research | BALANCED | 50% | Preserve evidence, sources, facts |
| chat | AGGRESSIVE | 70% | Keep recent, compress old aggressively |
| planning | SAFE | 30% | Preserve goals, constraints, decisions |
| writing | BALANCED | 40% | Preserve references, compress drafts |
| analysis | SAFE | 30% | Preserve data, numbers, results |
| tool | AGGRESSIVE | 60% | Truncate tool outputs |

## Quality Gate

The Quality Gate verifies that compression preserves:
- **Numbers** (prices, sizes, measurements)
- **Paths/URLs** (file paths, links)
- **Error messages** (stack traces, error text)
- **Instructions** (must, should, never, always)
- **JSON structure** (if present)
- **List structure** (if present)

If retention score < 80%, retries with less aggressive compression.

## Usage

```javascript
const { TokenOptimizationEngine } = require('./cognitive/optimization');

const optimizer = new TokenOptimizationEngine({
  model: 'openai/gpt-4o-mini',
  totalBudget: 12000,
  enabled: true,
});

// Optimize before sending to LLM
const { request, stats } = await optimizer.optimize({
  model: 'openai/gpt-4o-mini',
  system: '...',
  messages: [...],
  tools: [...],
  memory: [...],
  rag: [...],
});

// If request is null, use cached response
if (request === null) {
  return stats.response; // Cache hit
}

// Send optimized request to LLM
const response = await llm.call(request);

// Cache the response for future use
optimizer.cacheResponse(request, response);

// Get optimization report
console.log(optimizer.getReport());
```

## Stats Example

```
Original:    12,847 tokens
Final:        3,219 tokens
Saved:        9,628 tokens (74.9%)
Cache:        HIT after 2nd call
Dedup:        12 messages removed
RAG:          8/15 docs selected
Tools:        8/25 schemas sent
Quality:      94.2% retention
```

## Provider Compatibility

Works with ANY LLM provider:
- OpenAI (GPT-4o, GPT-4o-mini)
- Anthropic (Claude)
- xAI (Grok)
- DeepSeek
- Local (Ollama, llama.cpp)
- Any OpenAI-compatible API

Zero provider-specific code in the optimization pipeline.
