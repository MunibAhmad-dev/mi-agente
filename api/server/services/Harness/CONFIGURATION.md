# Harness Configuration Guide

## Environment Variables

### Required (for LLM providers)

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `XAI_API_KEY` | xAI (Grok) API key | `xai-...` |

### Optional (for routing)

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_DEFAULT_PROVIDER` | `openai` | Default LLM provider |
| `LLM_DEFAULT_MODEL` | `gpt-5.6-luna` | Default model |
| `LLM_FALLBACK_CHAIN` | `openai,xai` | Comma-separated fallback chain |

### Optional (for connectors)

| Variable | Description |
|----------|-------------|
| `GMAIL_API_KEY` or `GMAIL_TOKEN` | Gmail OAuth2 token |
| `SLACK_BOT_TOKEN` or `SLACK_TOKEN` | Slack bot token (xoxb-...) |
| `GITHUB_TOKEN` | GitHub personal access token (ghp_...) |
| `GOOGLE_CALENDAR_TOKEN` or `CALENDAR_TOKEN` | Google Calendar OAuth2 token |

### Optional (for harness config)

| Variable | Default | Description |
|----------|---------|-------------|
| `HARNESS_MAX_ITERATIONS` | `20` | Max agent loop iterations |
| `HARNESS_TIMEOUT` | `300000` | Timeout per tool call (ms) |
| `HARNESS_MAX_BUDGET_USD` | `null` | Budget limit (null = unlimited) |
| `HARNESS_ROUTING_STRATEGY` | `fallback` | Provider routing strategy |
| `HARNESS_CHECKPOINT_DIR` | `null` | Directory for checkpoint persistence |
| `HARNESS_MEMORY_PERSIST_DIR` | `null` | Directory for memory persistence |

## Quick Start

### 1. Set API keys in .env

```bash
# LLM Providers
OPENAI_API_KEY=sk-your-openai-key
XAI_API_KEY=xai-your-xai-key

# Optional: Connectors
GITHUB_TOKEN=ghp_your-github-token
SLACK_BOT_TOKEN=xoxb_your-slack-token

# Optional: Harness config
LLM_DEFAULT_PROVIDER=openai
LLM_DEFAULT_MODEL=gpt-5.6-luna
LLM_FALLBACK_CHAIN=openai,xai
```

### 2. Initialize

```javascript
const { getHarnessManager } = require('./services/Harness');

const harness = getHarnessManager({
  defaultProvider: 'openai',
  defaultModel: 'gpt-5.6-luna',
  fallbackChain: ['openai', 'xai'],
  routingStrategy: 'fallback',
  maxIterations: 20,
  timeout: 300000,
});

await harness.initialize();
```

### 3. Register as Express route (optional)

```javascript
const { createHarnessAPI } = require('./services/Harness/HarnessAPI');
app.use('/harness', createHarnessAPI(harness));
```

## Provider Configuration

### OpenAI (GPT)

Models available:
- `gpt-5.6-sol` — Flagship, best reasoning (1M context)
- `gpt-5.6-terra` — Balanced performance
- `gpt-5.6-luna` — Fast, affordable (default)
- `gpt-4.1` — Previous generation
- `o3` — Reasoning model
- `o4-mini` — Fast reasoning

### xAI (Grok)

Models available:
- `grok-4-0709` — Flagship with web search
- `grok-4-0709-fast` — Fast variant
- `grok-4.5` — Code-focused
- `grok-3` — Previous generation
- `grok-3-mini` — Fast, affordable

### Cost Estimates (per 1M tokens)

| Model | Input | Output |
|-------|-------|--------|
| gpt-5.6-sol | $10 | $30 |
| gpt-5.6-terra | $5 | $15 |
| gpt-5.6-luna | $0.50 | $2 |
| grok-4-0709 | $3 | $15 |
| grok-3-mini | $0.30 | $0.50 |

## Deployment

### Standalone (no Express)

```javascript
const { getHarnessManager } = require('./services/Harness');
const harness = getHarnessManager();
await harness.initialize();
const result = await harness.run({ task: 'Hello' });
```

### With Express

```javascript
const express = require('express');
const { getHarnessManager, createHarnessAPI } = require('./services/Harness');

const app = express();
app.use(express.json());

const harness = getHarnessManager();
harness.initialize().then(() => {
  app.use('/harness', createHarnessAPI(harness));
  app.listen(3000);
});
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install --production
EXPOSE 3000
CMD ["node", "-e", "require('./api/server/services/Harness').getHarnessManager().initialize().then(()=>console.log('Ready'))"]
```
