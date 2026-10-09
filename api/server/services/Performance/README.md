# ⚡ Performance Optimization

Este directorio contiene servicios y herramientas para optimización de rendimiento.

## 📁 Estructura

```
Performance/
├── PerformanceMonitor.js   ✅ Monitor en tiempo real
├── CacheService.js        ✅ Servicio de caché
├── HealthService.js       ✅ Servicio de salud
├── ResponseCache.js       ✅ Caché de respuestas LRU
├── QueryOptimizer.js      ✅ Optimizador de queries
├── BenchmarkTool.js      ✅ Herramienta de benchmarking
└── index.js
```

## 🚀 Servicios

### PerformanceMonitor

Monitor de rendimiento en tiempo real.

```javascript
const { getPerformanceMonitor } = require('./Performance');

// Crear instancia
const monitor = getPerformanceMonitor({
  enabled: true,
  sampleRate: 1,
  maxSamples: 1000
});

// Registrar request
monitor.recordRequest('/api/users', 'GET', 200, 45);

// Obtener resumen
const summary = monitor.getSummary();
```

### ResponseCache

Caché LRU con TTL.

```javascript
const { getResponseCache } = require('./Performance');

// Crear caché
const cache = getResponseCache({
  maxSize: 1000,
  defaultTTL: 5 * 60 * 1000
});

// Guardar en caché
cache.set('user:123', userData, 60000);

// Obtener del caché
const cached = cache.get('user:123');

// Estadísticas
const stats = cache.getStats();
```

### QueryOptimizer

Optimizador de consultas a base de datos.

```javascript
const { getQueryOptimizer } = require('./Performance');

const optimizer = getQueryOptimizer();

// Optimizar query
const optimized = optimizer.optimize({
  where: { status: 'active' },
  sort: { createdAt: -1 },
  limit: 100
});

// Sugerir índices
const indexes = optimizer.suggestIndexes(query);

// Estadísticas
const stats = optimizer.getStats();
```

### BenchmarkTool

Herramienta de benchmarking HTTP.

```javascript
const { BenchmarkTool } = require('./Performance');

const tool = new BenchmarkTool({
  baseUrl: 'http://localhost:3001',
  concurrency: 10,
  duration: 10000
});

// Benchmark de endpoints
const results = await tool.benchmark([
  { path: '/api/health', method: 'GET' },
  { path: '/api/users', method: 'GET' }
]);

// Benchmark rápido
const quick = await tool.quickBenchmark('/api/health', 100);

// Comparar URLs
const comparison = await tool.compare(url1, url2, '/api/health');
```

## 📡 API Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/performance/summary` | GET | Resumen de rendimiento |
| `/api/performance/metrics` | GET | Métricas detalladas |
| `/api/performance/history` | GET | Historial de métricas |
| `/api/performance/cache/stats` | GET | Estadísticas de caché |
| `/api/performance/cache/clear` | POST | Limpiar caché |
| `/api/performance/queries/stats` | GET | Estadísticas de queries |
| `/api/performance/queries/slow` | GET | Queries lentas |
| `/api/performance/queries/optimizations` | GET | Sugerencias |
| `/api/performance/benchmark` | POST | Ejecutar benchmark |
| `/api/performance/benchmark/quick` | GET | Benchmark rápido |

## 📊 Métricas

### Latencia

| Percentil | Descripción |
|-----------|-------------|
| p50 | Mediana de latencia |
| p90 | 90% de requests más rápidos |
| p95 | 95% de requests más rápidos |
| p99 | 99% de requests más rápidos |

### Caché

| Métrica | Descripción |
|---------|-------------|
| hitRate | Porcentaje de cache hits |
| hits | Total de cache hits |
| misses | Total de cache misses |
| size | Entradas en caché |

### Queries

| Métrica | Descripción |
|---------|-------------|
| totalQueries | Total de queries ejecutadas |
| slowQueries | Queries que superan umbral |
| avgDuration | Duración promedio |

## 🔧 Configuración

```javascript
// PerformanceMonitor
{
  enabled: true,
  sampleRate: 1,        // 100% de samples
  maxSamples: 1000,     // Máximo de samples en memoria
  slowQueryThreshold: 1000 // ms
}

// ResponseCache
{
  enabled: true,
  maxSize: 1000,        // Máximo de entradas
  defaultTTL: 300000,   // 5 minutos
  cleanupInterval: 60000 // 1 minuto
}

// QueryOptimizer
{
  slowQueryThreshold: 1000 // ms
}
```

## 🎯 Objetivos de Rendimiento

| Métrica | Target |
|---------|--------|
| Latencia p99 | < 500ms |
| Error Rate | < 1% |
| Cache Hit Rate | > 80% |
| Requests/sec | > 100 |
