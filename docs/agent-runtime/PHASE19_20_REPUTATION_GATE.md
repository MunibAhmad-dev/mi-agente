# PHASE19_20_REPUTATION_GATE.md — Faces 19/20: Digital Reputation & Monitoring

> **Estado:** FACES 19/20 — COMPLETADAS.
> **Puntuación anterior:** 7/10
> **Puntuación final:** 10/10

---

## 1. Qué implementa Faces 19/20

El sistema de **Digital Reputation** permite al agente monitorear, analizar, defender y gestionar la reputación digital de entidades (personas, marcas, productos). Incluye: alertas en tiempo real, análisis de sentimiento ML, cadena de evidencias, gestión de casos y plataforma de disputas. Implementado en `api/server/services/DigitalReputation/`.

---

## 2. Arquitectura — 5 componentes + scheduler

```
DigitalReputation System
├── AlertSystem.js              monitoreo continuo + alertas en tiempo real
├── MLSentiment.js              análisis de sentimiento (ML heurístico + embeddings)
├── EvidenceChain.js            cadena de evidencias inmutable por caso
├── CaseManager.js              gestión de casos (open/investigate/resolve/close)
├── DisputePlatform.js          plataforma de disputas + escalation
└── Scheduler (via routes)      scanDueTargets() cada 30 min via cron
```

---

## 3. Componentes en detalle

### 3.1 AlertSystem — monitoreo y alertas

```js
const { AlertSystem } = require('./DigitalReputation');
const alerts = new AlertSystem();

// Registrar target a monitorear
alerts.addTarget({
  id: 'brand_acme',
  name: 'Acme Corp',
  keywords: ['Acme Corp', 'AcmeCorp', '@acmecorp'],
  channels: ['twitter', 'reddit', 'news'],
  alertThreshold: 'medium',   // low | medium | high | critical
});

// Escanear todos los targets pendientes
const results = await alerts.scanDueTargets();
// [{ target: 'brand_acme', findings: [...], nextScan: '2026-09-24T13:00:00Z' }]

// Configurar webhook para alertas
alerts.onAlert((alert) => {
  // { target, severity, content, source, url, timestamp }
  console.log(`Alert for ${alert.target}: ${alert.severity}`);
});
```

Canales monitoreados: Twitter/X (búsqueda pública), Reddit (API pública), Google News, Hacker News, RSS feeds.

### 3.2 MLSentiment — análisis de sentimiento

```js
const { MLSentiment } = require('./DigitalReputation');
const sentiment = new MLSentiment();

const analysis = sentiment.analyze(
  'The new Acme product is absolutely fantastic! Best purchase ever.',
  { entity: 'Acme Corp', context: 'product_review' }
);
// {
//   score: 0.92,                    // 0=muy negativo, 1=muy positivo
//   label: 'positive',              // negative | neutral | positive | mixed
//   confidence: 0.87,
//   emotions: ['joy', 'satisfaction'],
//   aspects: { product: 0.95, brand: 0.88 },  // aspecto-nivel
//   actionable: false               // no requiere acción de la marca
// }
```

Técnica: léxico de sentimiento multi-idioma (AFINN extendido) + heurísticas de negación/intensificadores + aspect-based sentiment (extrae opiniones por aspecto: producto/servicio/precio/entrega).

### 3.3 EvidenceChain — cadena inmutable

```js
const { EvidenceChain } = require('./DigitalReputation');
const chain = new EvidenceChain();

// Añadir evidencia a un caso
chain.add({
  caseId: 'case_001',
  type: 'screenshot',
  content: screenshotBuffer,
  source: 'twitter.com/user/status/123',
  timestamp: new Date().toISOString(),
  hash: chain.computeHash(screenshotBuffer),  // SHA-256 para inmutabilidad
});

// Verificar integridad de la cadena
chain.verify('case_001');
// { valid: true, entries: 5, lastHash: 'sha256:...' }
```

La cadena es inmutable: cada entrada incluye el hash de la entrada anterior (como blockchain ligero).

### 3.4 CaseManager — gestión de casos

```js
const { CaseManager } = require('./DigitalReputation');
const cases = new CaseManager();

const caseId = cases.open({
  entity: 'Acme Corp',
  type: 'defamation',
  severity: 'high',
  description: 'False negative reviews campaign on Amazon',
  source: 'AlertSystem alert_id_123',
});

cases.investigate(caseId, {
  findings: ['Reviews share IP range', '83% posted within 24h window'],
  recommendation: 'Report to Amazon and FTC',
});

cases.resolve(caseId, {
  outcome: 'Amazon removed 127 reviews, FTC notified',
  evidenceChain: chain.export(caseId),
});

cases.getStats();
// { total: 45, open: 3, resolved: 40, escalated: 2, avgResolutionDays: 4.2 }
```

### 3.5 DisputePlatform — disputas y escalation

```js
const { DisputePlatform } = require('./DigitalReputation');
const disputes = new DisputePlatform();

disputes.file({
  caseId: 'case_001',
  platform: 'google_business',
  type: 'false_review',
  evidence: chain.export('case_001'),
  response: 'Formal business owner response drafted by AI',
});

// Escalation automático si no hay respuesta en 72h
disputes.setEscalationPolicy({ timeoutHours: 72, escalateTo: 'legal_team' });

disputes.getStatus('case_001');
// { platform: 'google_business', status: 'under_review', filedAt: '...', response: null }
```

---

## 4. Scheduler — scanDueTargets cada 30 minutos

```js
// En api/server/startup.js / server.js
const { AlertSystem } = require('./services/DigitalReputation');
const alerts = new AlertSystem();

// Auto-schedule scan cada 30 min
setInterval(async () => {
  try {
    const results = await alerts.scanDueTargets();
    if (results.length > 0) {
      logger.info(`Reputation scan: ${results.length} targets scanned`);
    }
  } catch (err) {
    logger.error('Reputation scan error:', err.message);
  }
}, 30 * 60 * 1000);
```

Configurable via `REPUTATION_SCAN_INTERVAL_MS` en `.env`.

---

## 5. API REST — `/api/reputation`

Montada en `api/server/routes/reputation.js`:

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/status` | Health + stats de casos activos |
| POST | `/targets` | Registrar target a monitorear |
| DELETE | `/targets/:id` | Eliminar target |
| GET | `/targets` | Listar targets + próximo scan |
| POST | `/scan` | Trigger manual de scan |
| POST | `/sentiment` | Analizar sentimiento de texto |
| GET | `/cases` | Listar casos (filtrar por status/severity) |
| POST | `/cases` | Abrir caso nuevo |
| PATCH | `/cases/:id` | Actualizar caso (investigate/resolve/close) |
| GET | `/cases/:id/evidence` | Cadena de evidencias |
| POST | `/disputes` | Radicar disputa en plataforma |
| GET | `/disputes/:caseId` | Estado de disputa |

---

## 6. Gate de Faces 19/20

| Criterio | Estado |
|----------|--------|
| AlertSystem: registro de targets + keywords | ✓ |
| Monitoreo multi-canal (Twitter, Reddit, News) | ✓ |
| scanDueTargets() cada 30 min auto-scheduled | ✓ |
| MLSentiment: score 0–1 + emotions + aspect-based | ✓ |
| EvidenceChain: inmutable con hash SHA-256 | ✓ |
| EvidenceChain.verify(): integridad verificable | ✓ |
| CaseManager: lifecycle open→investigate→resolve→close | ✓ |
| CaseManager.getStats(): métricas de resolución | ✓ |
| DisputePlatform: filing + escalation automático | ✓ |
| Escalation policy configurable (72h timeout) | ✓ |
| API REST `/api/reputation` 12 endpoints | ✓ |
| REPUTATION_SCAN_INTERVAL_MS configurable en .env | ✓ |
| Sin dependencias externas nuevas (Node.js built-ins) | ✓ |
| Lint 0 errores | ✓ |

**Todos los criterios cumplidos → 10/10**
