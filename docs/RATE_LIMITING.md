# 🔒 Rate Limiting Configuration

Documentación sobre la configuración de rate limiting en Mi LibreChat.

---

## Overview

Mi LibreChat implementa rate limiting en múltiples niveles para proteger la API de abusos:

1. **Global** - Límite general para todas las requests
2. **Por endpoint** - Límites específicos según el tipo de endpoint
3. **Por usuario** - Límites basados en el usuario autenticado
4. **Por IP** - Protección contra ataques DDoS

---

## Configuración de Variables de Entorno

### Variables Principales

```env
# Rate Limiting General
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000  # 1 minuto en milisegundos
RATE_LIMIT_MAX=100  # Máximo de requests por ventana

# Rate Limiting por IP
RATE_LIMIT_IP_ENABLED=true
RATE_LIMIT_IP_MAX=500
RATE_LIMIT_IP_WINDOW_MS=60000

# Rate Limiting de Chat (más estricto)
CHAT_RATE_LIMIT_ENABLED=true
CHAT_RATE_LIMIT_WINDOW_MS=60000
CHAT_RATE_LIMIT_MAX=60  # Máximo 60 mensajes de chat por minuto

# Rate Limiting de Autenticación
AUTH_RATE_LIMIT_ENABLED=true
AUTH_RATE_LIMIT_MAX=10  # Máximo 10 intentos de login por minuto
AUTH_RATE_LIMIT_WINDOW_MS=60000
```

### Variables Avanzadas

```env
# Límites por Tier de Usuario
RATE_LIMIT_FREE_TIER_MAX=50
RATE_LIMIT_PRO_TIER_MAX=500
RATE_LIMIT_ENTERPRISE_TIER_MAX=5000

# Baneo Temporal
RATE_LIMIT_BAN_ENABLED=true
RATE_LIMIT_BAN_THRESHOLD=5  # Veces que puede exceder antes de ban
RATE_LIMIT_BAN_DURATION_MS=900000  # 15 minutos de ban

# Skip Rate Limit (para APIs internas)
RATE_LIMIT_SKIP_PATHS=/api/health,/api/status
```

---

## Límites por Defecto

### Endpoints Públicos (Sin Autenticación)

| Endpoint | Límite | Ventana | Descripción |
|----------|--------|---------|-------------|
| `/api/*` (general) | 30 | 1 min | Requests generales |
| `/api/auth/*` | 10 | 1 min | Autenticación |
| `/api/auth/login` | 5 | 1 min | Intentos de login |
| `/api/auth/register` | 3 | 1 min | Registros |

### Endpoints Autenticados

| Endpoint | Límite | Ventana | Descripción |
|----------|--------|---------|-------------|
| `/api/chat` | 60 | 1 min | Mensajes de chat |
| `/api/messages` | 120 | 1 min | Gestión de mensajes |
| `/api/conversations` | 60 | 1 min | Gestión de conversaciones |
| `/api/files/*` | 30 | 1 min | Subida de archivos |
| `/api/plugins/*` | 30 | 1 min | Gestión de plugins |
| `/api/agents/*` | 30 | 1 min | Gestión de agentes |

### Límites por Plan

| Plan | Chat/min | Requests/min | Archivos/día | Concurrentes |
|------|----------|--------------|--------------|--------------|
| Free | 20 | 100 | 50 | 2 |
| Pro | 100 | 500 | 500 | 10 |
| Enterprise | 500 | 5000 | Ilimitado | 50 |

---

## Configuración de Redis

El rate limiting usa Redis para almacenamiento distribuido:

```yaml
# docker-compose.override.yml
services:
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    environment:
      REDIS_PASSWORD: tu_password_seguro
    volumes:
      - ./redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Variables de Redis

```env
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=tu_password_seguro
REDIS_DB=0
```

---

## Headers de Respuesta

Cada respuesta incluye headers de rate limiting:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 55
X-RateLimit-Reset: 1689864060
X-RateLimit-Window: 60000
```

### Significado de Headers

| Header | Descripción |
|--------|-------------|
| `X-RateLimit-Limit` | Máximo de requests permitidos |
| `X-RateLimit-Remaining` | Requests restantes en la ventana actual |
| `X-RateLimit-Reset` | Timestamp UNIX cuando se reinicia el contador |
| `X-RateLimit-Window` | Duración de la ventana en ms |

---

## Respuestas de Error

### 429 Too Many Requests

Cuando se excede el rate limit, la API responde:

```json
{
  "error": "Too Many Requests",
  "message": "Has excedido el límite de requests. Intenta de nuevo en X segundos.",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 45
}
```

Headers adicionales:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 45
X-RateLimit-Reset: 1689864105
```

### 429 Response Headers

```
Retry-After: 45
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1689864105
```

---

## Implementación en Código

### Configuración del Middleware

```javascript
// api/server/middleware/rateLimit.js
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');

// Rate limit general
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: {
    error: 'Too Many Requests',
    message: 'Has excedido el límite de requests',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
  }),
});

// Rate limit de chat (más estricto)
const chatLimiter = rateLimit({
  windowMs: parseInt(process.env.CHAT_RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.CHAT_RATE_LIMIT_MAX) || 60,
  message: {
    error: 'Too Many Requests',
    message: 'Has excedido el límite de mensajes de chat',
    code: 'CHAT_RATE_LIMIT_EXCEEDED'
  },
  keyGenerator: (req) => req.user?.id || req.ip,
  skip: (req) => req.user?.role === 'admin', // Admin skip
});

// Rate limit de autenticación
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  message: {
    error: 'Too Many Requests',
    message: 'Demasiados intentos de autenticación',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  },
  skipSuccessfulRequests: true, // No contar exitosos
});

// Aplicar middlewares
app.use('/api', generalLimiter);
app.use('/api/chat', chatLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
```

---

## Configuración Avanzada

### Rate Limiting por IP con Whitelist

```javascript
const whitelist = ['127.0.0.1', '::1']; // IPs que saltan rate limit

const ipLimiter = rateLimit({
  windowMs: 60000,
  max: 500,
  skip: (req) => whitelist.includes(req.ip),
});
```

### Rate Limiting con Burst

Permite ráfagas cortas de tráfico:

```javascript
const burstLimiter = rateLimit({
  windowMs: 60000,
  max: 60,
  validate: {
    xForwardedForHeader: false,
    trustProxy: true,
    onlimitRejectedRequest: (req, opts, next, remaining, isDraft) => {
      // Log cuando se rechaza
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        remaining,
      });
    },
  },
});
```

### Rate Limiting con Tiered Limits

```javascript
const tieredLimiter = (req, res, next) => {
  const limits = {
    free: { max: 50, windowMs: 60000 },
    pro: { max: 500, windowMs: 60000 },
    enterprise: { max: 5000, windowMs: 60000 },
  };
  
  const tier = req.user?.subscriptionTier || 'free';
  const { max, windowMs } = limits[tier];
  
  // Aplicar rate limit dinámico
  return rateLimit({ windowMs, max })(req, res, next);
};
```

---

## Monitoreo

### Métricas Prometheus

```yaml
# Prometheus configuration
- job_name: 'librechat-rate-limit'
  static_configs:
    - targets: ['localhost:3080']
  metrics_path: '/metrics'
```

### Métricas Disponibles

| Métrica | Descripción |
|---------|-------------|
| `librechat_rate_limit_total` | Total de requests limitados |
| `librechat_rate_limit_exceeded` | Requests que excedieron el límite |
| `librechat_rate_limit_remaining` | Requests restantes por usuario |
| `librechat_ban_total` | Número de bans temporales |

---

## Troubleshooting

### Rate Limit demasiado bajo

Si los usuarios reportan errores frecuentes de rate limit:

1. Ver logs de rate limiting: `grep "RATE_LIMIT" logs/*.log`
2. Ajustar límites según uso real
3. Considerar actualizar a plan superior

### Redis no conecta

Si el rate limiting falla por problemas de Redis:

```env
# Fallback a memoria local si Redis falla
RATE_LIMIT_REDIS_FALLBACK=true
RATE_LIMIT_MEMORY_STORE=true
```

### Baneo falso positivo

Para desbanear un usuario manualmente:

```javascript
// Via API (admin)
POST /api/admin/unban
{
  "userId": "user_123",
  "reason": "Baneo falso positivo"
}

// Via Redis directamente
redis-cli DEL rate_limit:user:user_123
```

---

## Mejores Prácticas

### 1. Implementar Retry con Backoff

```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 60;
        const jitter = Math.random() * 1000;
        await sleep((retryAfter * 1000) + jitter);
        continue;
      }
      
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * Math.pow(2, i));
    }
  }
}
```

### 2. Cachear Respuestas

```javascript
// Cachear respuestas de endpoints lentos
const cacheMiddleware = async (req, res, next) => {
  const key = `cache:${req.originalUrl}`;
  const cached = await redis.get(key);
  
  if (cached) {
    return res.json(JSON.parse(cached));
  }
  
  res.sendResponse = res.json;
  res.json = (body) => {
    redis.setex(key, 300, JSON.stringify(body)); // Cache 5 min
    return res.sendResponse(body);
  };
  
  next();
};
```

### 3. Usar Bulkhead Pattern

Separar rate limits por funcionalidad crítica:

```javascript
// Chat tiene su propio pool de rate limit
app.use('/api/chat', chatLimiter);

// APIs generales comparten pool
app.use('/api/models', generalLimiter);
app.use('/api/plugins', generalLimiter);
app.use('/api/discovery', generalLimiter);
```

---

## Referencias

- [express-rate-limit](https://github.com/nfriedly/express-rate-limit)
- [rate-limit-redis](https://github.com/wyattjho/rate-limit-redis)
- [OWASP Rate Limiting Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Rate_Limiting_Cheat_Sheet.html)

---

*Documentación actualizada: 2026-07-20*
