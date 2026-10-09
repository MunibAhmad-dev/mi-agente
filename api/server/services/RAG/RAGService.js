/**
 * RAG Service (Retrieval Augmented Generation)
 * ==========================================
 * Sistema de búsqueda semántica para enriquecimiento de prompts
 *
 * Características:
 * - Indexación de documentos
 * - Búsqueda por similitud
 * - Enriquecimiento de contexto
 * - Soporte para múltiples fuentes
 *
 * @example
 * const rag = require('./RAGService');
 *
 * // Indexar documentos
 * await rag.indexDocuments('docs-1', [
 *   { id: 'doc-1', content: 'Documento sobre Python...', metadata: { source: 'python-guide' } },
 * ]);
 *
 * // Buscar documentos relevantes
 * const results = await rag.search('¿Cómo usar Python?', {
 *   collection: 'docs-1',
 *   topK: 5,
 * });
 *
 * // Enriquecer prompt
 * const enriched = await rag.enrichPrompt(
 *   '¿Cómo usar Python?',
 *   { collection: 'docs-1', topK: 3 }
 * );
 */

const { logger } = require('@librechat/data-schemas');
const Redis = require('ioredis');

const RAG_COLLECTION = 'rag_service';
/* Prefijo de documentos versionado: al cambiar la dimensión del embedding
 * (hashing 256 → nomic 768) los documentos viejos no son comparables, así
 * que se aíslan en un namespace nuevo y se re-indexa (FASE 38). */
const DOC_PREFIX = 'rag:doc:v2:';

/* Cliente Redis del stack (FASE 37): persiste colecciones y documentos para
 * que sobrevivan al reinicio del API. `getLogStores` no acepta el namespace
 * 'rag_service', por eso se usa ioredis directo contra REDIS_URI. */
let _redisClient = null;
function getRedisClient() {
  if (!_redisClient) {
    _redisClient = new Redis(process.env.REDIS_URI || 'redis://redis:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
  }
  return _redisClient;
}

// Proveedores de embeddings soportados
const EMBEDDING_PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  LOCAL: 'local', // Embeddings simples locales (hashing trick, 256 dim)
  OLLAMA: 'ollama', // Embeddings reales locales vía Ollama (nomic-embed-text)
};

/** Modelo de embeddings local (sin claves). Configurable vía env. */
const EMBED_MODEL = process.env.RAG_EMBED_MODEL || 'nomic-embed-text';
const EMBED_OLLAMA_URL = process.env.OLLAMA_HOST || 'http://chat-ollama:11434';

// Proveedores de vectores soportados
const VECTOR_STORES = {
  REDIS: 'redis', // Redis con JSON
  MEMORY: 'memory', // Solo en memoria
  PINECONE: 'pinecone', // (futuro)
  CHROMA: 'chroma', // (futuro)
};

/** Dimensión fija del embedding (hashing trick). Garantiza que query y
 *  documentos SIEMPRE tengan la misma longitud, condición necesaria para la
 *  similitud coseno (FASE 37 — la búsqueda RAG devolvía vacío porque el
 *  vocabulario TF-IDF variaba entre query y documento). */
const EMBEDDING_DIM = 256;

/**
 * Embedding REAL local vía Ollama (/api/embed, nomic-embed-text). Sin claves.
 * Devuelve {embedding, vocabulary: []} o null si falla.
 */
async function generateOllamaEmbedding(text) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const input = String(text || '').slice(0, 8000);
    const res = await fetch(`${EMBED_OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    const emb = data?.embeddings?.[0];
    if (!Array.isArray(emb) || emb.length === 0) {
      return null;
    }
    return { embedding: emb, vocabulary: [] };
  } catch (error) {
    logger.warn(`[RAGService] generateOllamaEmbedding error: ${error.message}`);
    return null;
  }
}

function hashWord(word, seed) {
  let h = seed;
  for (let i = 0; i < word.length; i++) {
    h = (h * 31 + word.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Genera embedding de dimensión FIJA usando hashing trick + TF ponderado.
 * Cada palabra activa 3 posiciones (sub-hashes) sumando su frecuencia
 * relativa, y el vector se normaliza. Sin claves ni servicios externos.
 * Para producción se puede sustituir por OpenAI/Anthropic embeddings
 * (EMBEDDING_PROVIDERS.OPENAI ya está soportado).
 */
function generateSimpleEmbedding(text) {
  // Normalizar texto (conserva acentos para español)
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^\w\u00e0-\u00ff\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const tf = {};
  for (const word of words) {
    tf[word] = (tf[word] || 0) + 1;
  }
  const wordCount = Math.max(words.length, 1);

  const embedding = new Array(EMBEDDING_DIM).fill(0);
  for (const word of Object.keys(tf)) {
    const weight = tf[word] / wordCount;
    // 3 sub-hashes → cubre colisiones parcialmente sin depender de vocabulario
    for (let k = 0; k < 3; k++) {
      const idx = hashWord(word, 7 + k * 131) % EMBEDDING_DIM;
      embedding[idx] += weight;
    }
  }

  // Normalizar
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= norm;
    }
  }

  return {
    embedding,
    vocabulary: Object.keys(tf).slice(0, 256),
  };
}

/**
 * Calcula similitud coseno entre dos vectores
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator > 0 ? dotProduct / denominator : 0;
}

/**
 * RAG Service
 */
class RAGService {
  constructor() {
    /** @type {Map<string, {id: string, content: string, embedding: number[], metadata: object}>} */
    this.documents = new Map();

    /** @type {Map<string, Set<string>>} - collection -> document IDs */
    this.collections = new Map();

    /** @type {Redis|undefined} */
    this.cache = undefined;

    /** @type {object} */
    this.embeddingProvider = {
      type: EMBEDDING_PROVIDERS.LOCAL,
      apiKey: null,
      endpoint: null,
    };

    /** @type {object} */
    this.vectorStore = {
      type: VECTOR_STORES.MEMORY,
    };
  }

  /**
   * Inicializa el servicio
   * @param {object} options - Opciones de configuración
   */
  async initialize(options = {}) {
    const {
      vectorStore = VECTOR_STORES.MEMORY,
      embeddingProvider = EMBEDDING_PROVIDERS.LOCAL,
      embeddingApiKey = null,
      embeddingEndpoint = null,
    } = options;

    this.vectorStore.type = vectorStore;
    this.embeddingProvider = {
      type: embeddingProvider,
      apiKey: embeddingApiKey,
      endpoint: embeddingEndpoint,
    };

    if (vectorStore === VECTOR_STORES.REDIS) {
      try {
        this.cache = getRedisClient();
        await this.cache.connect().catch(() => {}); // lazyConnect: no lanzar si Redis cae
        await this.loadFromRedis();
        logger.info('[RAGService] Initialized with Redis');
      } catch (error) {
        logger.warn('[RAGService] Redis unavailable, using memory store', error);
        this.vectorStore.type = VECTOR_STORES.MEMORY;
      }
    } else {
      logger.info('[RAGService] Initialized with Memory store');
    }
  }

  /**
   * Carga documentos desde Redis
   */
  async loadFromRedis() {
    if (!this.cache) {
      return;
    }

    try {
      const keys = await this.cache.keys(`${DOC_PREFIX}*`);
      for (const key of keys) {
        const doc = await this.cache.get(key);
        if (doc) {
          const parsed = JSON.parse(doc);
          this.documents.set(parsed.id, parsed);

          if (parsed.collection && !this.collections.has(parsed.collection)) {
            this.collections.set(parsed.collection, new Set());
          }
          if (parsed.collection) {
            this.collections.get(parsed.collection).add(parsed.id);
          }
        }
      }

      logger.info(`[RAGService] Loaded ${this.documents.size} documents from Redis`);
    } catch (error) {
      logger.error('[RAGService] Failed to load from Redis', error);
    }
  }

  /**
   * Genera embedding para un texto
   * @param {string} text - Texto a embedear
   */
  async generateEmbedding(text) {
    if (
      this.embeddingProvider.type === EMBEDDING_PROVIDERS.OPENAI &&
      this.embeddingProvider.apiKey
    ) {
      return await this.generateOpenAIEmbedding(text);
    }

    if (this.embeddingProvider.type === EMBEDDING_PROVIDERS.OLLAMA) {
      const emb = await generateOllamaEmbedding(text);
      if (emb) {
        return emb;
      }
      // Si Ollama no tiene el modelo, cae a local sin romper (dimensión distinta:
      // se descarta ese documento vía prefix v2 en loadFromRedis).
      logger.warn('[RAGService] Ollama embeddings no disponible, usando local');
    }

    // Default: embedding simple
    return generateSimpleEmbedding(text);
  }

  /**
   * Genera embedding usando OpenAI
   * @param {string} text - Texto a embedear
   */
  async generateOpenAIEmbedding(text) {
    const { apiKey, endpoint = 'https://api.openai.com/v1/embeddings' } = this.embeddingProvider;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: text.slice(0, 8000), // Limitar a 8k tokens
          model: 'text-embedding-3-small',
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        embedding: data.data[0].embedding,
        vocabulary: [],
      };
    } catch (error) {
      logger.warn('[RAGService] OpenAI embedding failed, using local', error);
      return generateSimpleEmbedding(text);
    }
  }

  /**
   * Indexa documentos
   * @param {string} collection - Nombre de la colección
   * @param {Array<{id: string, content: string, metadata?: object}>} documents - Documentos
   */
  async indexDocuments(collection, documents) {
    const results = {
      indexed: 0,
      failed: 0,
      errors: [],
    };

    if (!this.collections.has(collection)) {
      this.collections.set(collection, new Set());
    }

    for (const doc of documents) {
      try {
        // Generar embedding
        const { embedding, vocabulary } = await this.generateEmbedding(doc.content);

        const document = {
          id: doc.id,
          collection,
          content: doc.content,
          embedding,
          vocabulary,
          metadata: doc.metadata || {},
          indexedAt: new Date().toISOString(),
        };

        // Guardar documento
        this.documents.set(doc.id, document);
        this.collections.get(collection).add(doc.id);

        // Persistir en Redis si está habilitado
        if (this.cache) {
          await this.cache.set(`${DOC_PREFIX}${doc.id}`, JSON.stringify(document));
        }

        results.indexed++;
      } catch (error) {
        results.failed++;
        results.errors.push({ id: doc.id, error: error.message });
        logger.error(`[RAGService] Failed to index document ${doc.id}`, error);
      }
    }

    logger.info(`[RAGService] Indexed ${results.indexed} documents in collection '${collection}'`);

    return results;
  }

  /**
   * Indexa un documento individual
   * @param {string} collection - Nombre de la colección
   * @param {object} document - Documento
   */
  async indexDocument(collection, document) {
    return this.indexDocuments(collection, [document]);
  }

  /**
   * Elimina un documento
   * @param {string} documentId - ID del documento
   */
  async deleteDocument(documentId) {
    const doc = this.documents.get(documentId);
    if (!doc) {
      return false;
    }

    // Remover de la colección
    const collectionDocs = this.collections.get(doc.collection);
    if (collectionDocs) {
      collectionDocs.delete(documentId);
    }

    // Remover documento
    this.documents.delete(documentId);

    // Remover de Redis
    if (this.cache) {
      await this.cache.del(`${DOC_PREFIX}${documentId}`);
    }

    logger.info(`[RAGService] Deleted document ${documentId}`);

    return true;
  }

  /**
   * Elimina una colección completa
   * @param {string} collection - Nombre de la colección
   */
  async deleteCollection(collection) {
    const docIds = this.collections.get(collection);
    if (!docIds) {
      return false;
    }

    for (const docId of docIds) {
      this.documents.delete(docId);
      if (this.cache) {
        await this.cache.del(`${DOC_PREFIX}${docId}`);
      }
    }

    this.collections.delete(collection);

    logger.info(`[RAGService] Deleted collection '${collection}'`);

    return true;
  }

  /**
   * Busca documentos similares
   * @param {string} query - Consulta
   * @param {object} options - Opciones de búsqueda
   */
  async search(query, options = {}) {
    const { collection = null, topK = 5, minSimilarity = 0.1, filter = null } = options;

    // Generar embedding de la query
    const { embedding: queryEmbedding } = await this.generateEmbedding(query);

    // Obtener documentos a buscar
    let docIds;
    if (collection) {
      const collectionDocs = this.collections.get(collection);
      docIds = collectionDocs ? Array.from(collectionDocs) : [];
    } else {
      docIds = Array.from(this.documents.keys());
    }

    // Calcular similitudes
    const results = [];

    for (const docId of docIds) {
      const doc = this.documents.get(docId);
      if (!doc) {
        continue;
      }

      // Aplicar filtro si existe
      if (filter && !this.matchesFilter(doc, filter)) {
        continue;
      }

      // Calcular similitud
      const similarity = cosineSimilarity(queryEmbedding, doc.embedding);

      if (similarity >= minSimilarity) {
        results.push({
          id: doc.id,
          content: doc.content,
          metadata: doc.metadata,
          score: similarity,
        });
      }
    }

    // Ordenar por similitud y limitar
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topK);
  }

  /**
   * Verifica si un documento matches un filtro
   * @param {object} doc - Documento
   * @param {object} filter - Filtro
   */
  matchesFilter(doc, filter) {
    for (const [key, value] of Object.entries(filter)) {
      if (doc.metadata?.[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Enriquecer prompt con contexto de RAG
   * @param {string} query - Consulta original
   * @param {object} options - Opciones
   */
  async enrichPrompt(query, options = {}) {
    const {
      collection = null,
      topK = 3,
      prefix = 'Context information:',
      separator = '\n\n---\n\n',
    } = options;

    const results = await this.search(query, {
      collection,
      topK,
      minSimilarity: 0.1,
    });

    if (results.length === 0) {
      return { query, context: null, documents: [] };
    }

    const context = [prefix, ...results.map((r, i) => `[${i + 1}] ${r.content}`)].join(separator);

    return {
      query,
      context,
      documents: results,
      enrichedQuery: `${context}\n\nQuestion: ${query}`,
    };
  }

  /**
   * Obtiene estadísticas de una colección
   * @param {string} collection - Nombre de la colección
   */
  getCollectionStats(collection) {
    const docIds = this.collections.get(collection);
    if (!docIds) {
      return null;
    }

    let totalTokens = 0;
    const metadataKeys = new Set();

    for (const docId of docIds) {
      const doc = this.documents.get(docId);
      if (doc) {
        totalTokens += Math.ceil(doc.content.length / 4);
        for (const key of Object.keys(doc.metadata || {})) {
          metadataKeys.add(key);
        }
      }
    }

    return {
      collection,
      documentCount: docIds.size,
      totalTokens,
      metadataKeys: Array.from(metadataKeys),
    };
  }

  /**
   * Lista todas las colecciones
   */
  listCollections() {
    return Array.from(this.collections.keys()).map((name) => ({
      name,
      documentCount: this.collections.get(name)?.size || 0,
    }));
  }

  /**
   * Obtiene información de un documento
   * @param {string} documentId - ID del documento
   */
  getDocument(documentId) {
    const doc = this.documents.get(documentId);
    if (!doc) {
      return null;
    }

    return {
      id: doc.id,
      collection: doc.collection,
      content: doc.content,
      metadata: doc.metadata,
      indexedAt: doc.indexedAt,
      contentLength: doc.content.length,
      tokenEstimate: Math.ceil(doc.content.length / 4),
    };
  }

  /**
   * Obtiene estadísticas globales del servicio
   */
  getStats() {
    return {
      totalDocuments: this.documents.size,
      collections: this.collections.size,
      vectorStore: this.vectorStore.type,
      embeddingProvider: this.embeddingProvider.type,
    };
  }

  /**
   * Persiste todo en Redis
   */
  async persistAll() {
    if (!this.cache) {
      return;
    }

    for (const [id, doc] of this.documents) {
      await this.cache.set(`${DOC_PREFIX}${id}`, JSON.stringify(doc));
    }

    logger.info(`[RAGService] Persisted ${this.documents.size} documents to Redis`);
  }
}

// Singleton (FASE 37): getRAGService() devuelve una Promise resuelta UNA VEZ
// que la inicialización (carga desde Redis) terminó. Así las rutas hacen
// `await getRAGService()` y nunca ven un estado a medio cargar.
let instance = null;
let initPromise = null;

function getRAGService() {
  if (!instance) {
    instance = new RAGService();
    // FASE 38: embeddings reales locales (nomic-embed-text en Ollama).
    initPromise = instance
      .initialize({
        vectorStore: VECTOR_STORES.REDIS,
        embeddingProvider: EMBEDDING_PROVIDERS.OLLAMA,
      })
      .catch(() => instance);
  }
  return initPromise.then(() => instance);
}

module.exports = {
  RAGService,
  getRAGService,
  EMBEDDING_PROVIDERS,
  VECTOR_STORES,
  cosineSimilarity,
  generateSimpleEmbedding,
};
