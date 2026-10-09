/**
 * Search Runtime - Búsqueda Web Funcional (JavaScript)
 *
 * Este runtime proporciona capacidades de búsqueda web usando
 * múltiples proveedores con fallback automático.
 *
 * FLUJO:
 * ExecutionEngine → SearchRuntime.execute() → Search Providers
 */

const { getEventBus, EventType } = require('../EventBus');
const { Capability } = require('../RuntimeRegistry');
const https = require('https');
const http = require('http');

const logger = {
  debug: (...args) => console.log('[SearchRuntime]', ...args),
  info: (...args) => console.log('[SearchRuntime]', ...args),
  warn: (...args) => console.warn('[SearchRuntime]', ...args),
  error: (...args) => console.error('[SearchRuntime]', ...args),
};

// Proveedores de búsqueda
const SearchProviders = {
  DUCKDUCKGO: 'duckduckgo',
  BING: 'bing',
  BRAVE: 'brave',
  TAVILY: 'tavily',
  SERPAPI: 'serpapi',
  WHOOGLE: 'whoogle',
};

/**
 * Search Result - Resultado de búsqueda individual
 */
class SearchResult {
  constructor(data) {
    this.title = data.title || '';
    this.url = data.url || data.link || '';
    this.snippet = data.snippet || data.description || data.content || '';
    this.source = data.source || data.engine || 'unknown';
    this.date = data.date || data.publishedDate || null;
    this.metadata = data.metadata || {};
  }

  toJSON() {
    return {
      title: this.title,
      url: this.url,
      snippet: this.snippet,
      source: this.source,
      date: this.date,
    };
  }
}

/**
 * DuckDuckGo Search Provider (Gratuito)
 */
class DuckDuckGoProvider {
  constructor(config = {}) {
    this.name = SearchProviders.DUCKDUCKGO;
    this.config = config;
  }

  async search(query, options = {}) {
    const maxResults = options.maxResults || 10;

    logger.debug(`[DuckDuckGo] Searching: ${query}`);

    try {
      // Usar la API no oficial de DuckDuckGo (fetch — el https.get del runtime
      // devolvía respuestas vacías en este entorno, FASE 31)
      const encodedQuery = encodeURIComponent(query);
      const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      let response;
      let data;
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LibreChat-Search/1.0)',
            Accept: 'application/json',
          },
        });
        const text = await res.text();
        if (!text) {
          throw new Error(`DuckDuckGo respondió vacío (HTTP ${res.status})`);
        }
        data = JSON.parse(text);
      } finally {
        clearTimeout(timer);
      }

      const results = [];

      // Extraer resultados de Topics
      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics) {
          if (results.length >= maxResults) break;
          if (topic.Text && topic.FirstURL) {
            results.push(
              new SearchResult({
                title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 60),
                url: topic.FirstURL,
                snippet: topic.Text,
                source: 'DuckDuckGo',
              }),
            );
          }
        }
      }

      // Agregar abstract si existe
      if (data.AbstractText && results.length < maxResults) {
        results.unshift(
          new SearchResult({
            title: data.Heading || query,
            url: data.AbstractURL || '',
            snippet: data.AbstractText,
            source: 'DuckDuckGo',
            metadata: {
              abstract: true,
              image: data.Image,
            },
          }),
        );
      }

      return {
        query,
        results,
        total: results.length,
        provider: this.name,
      };
    } catch (error) {
      logger.error('[DuckDuckGo] Search failed:', error.message);
      throw error;
    }
  }

  async httpGet(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      protocol
        .get(
          url,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; LibreChat-Search/1.0)',
            },
            timeout: 10000,
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => resolve(data));
          },
        )
        .on('error', reject)
        .on('timeout', () => reject(new Error('Request timeout')));
    });
  }
}

/**
 * Bing Search Provider (scraping HTML, SIN API key). FASE 31: DuckDuckGo
 * bloquea datacenters (anomaly detection); Bing responde bien con un
 * User-Agent de navegador y se parsea el HTML de resultados.
 */
class BingProvider {
  constructor(config = {}) {
    this.name = SearchProviders.BING;
    this.config = config;
  }

  async search(query, options = {}) {
    const maxResults = options.maxResults || 10;
    logger.debug(`[Bing] Searching: ${query}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(
        `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`,
        {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            Accept: 'text/html',
          },
        },
      );
      const html = await res.text();
      if (!html) {
        throw new Error(`Bing respondió vacío (HTTP ${res.status})`);
      }

      const results = [];
      // <li class="b_algo" data-id…> … <h2><a href="URL">Título</a></h2> … <p>Snippet</p>
      const liRe = /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/g;
      let liMatch;
      while ((liMatch = liRe.exec(html)) !== null && results.length < maxResults) {
        const block = liMatch[1];
        const hrefMatch = block.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>/);
        const titleMatch = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
        const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
        const strip = (s = '') =>
          s
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .trim();
        let url = hrefMatch ? hrefMatch[1] : '';
        // Las URLs de Bing van ofuscadas (/ck/a?...u=<base64url>) — se decodifica
        // el parámetro u para devolver la URL real del resultado.
        try {
          // En el HTML las & van escapadas como &amp;
          const uMatch = url.match(/[?&](?:amp;)?u=a1([A-Za-z0-9_-]+)/);
          if (uMatch) {
            const decoded = Buffer.from(uMatch[1], 'base64').toString('utf8');
            if (decoded.startsWith('http')) {
              url = decoded;
            }
          }
        } catch {
          /* conserva la URL original */
        }
        const title = strip(titleMatch ? titleMatch[1] : '');
        const snippet = strip(snippetMatch ? snippetMatch[1] : '');
        if (url && title) {
          results.push(new SearchResult({ title, url, snippet, source: 'Bing' }));
        }
      }
      return { query, results, total: results.length, provider: this.name };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Tavily Search Provider (requiere API key)
 */
class TavilyProvider {
  constructor(config = {}) {
    this.name = SearchProviders.TAVILY;
    this.apiKey = config.tavilyApiKey || process.env.TAVILY_API_KEY;
    this.config = config;
  }

  async search(query, options = {}) {
    const maxResults = options.maxResults || 10;

    if (!this.apiKey) {
      throw new Error('Tavily API key not configured');
    }

    logger.debug(`[Tavily] Searching: ${query}`);

    try {
      const response = await this.httpPost('https://api.tavily.com/search', {
        api_key: this.apiKey,
        query,
        max_results: maxResults,
        include_answer: true,
        include_raw_content: false,
      });

      const data = JSON.parse(response);

      const results = (data.results || []).map(
        (r) =>
          new SearchResult({
            title: r.title,
            url: r.url,
            snippet: r.content,
            source: 'Tavily',
            date: r.published_date,
          }),
      );

      return {
        query,
        results,
        total: results.length,
        provider: this.name,
        answer: data.answer,
      };
    } catch (error) {
      logger.error('[Tavily] Search failed:', error.message);
      throw error;
    }
  }

  async httpPost(url, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);

      const req = https.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
        },
        (res) => {
          let responseData = '';
          res.on('data', (chunk) => (responseData += chunk));
          res.on('end', () => resolve(responseData));
        },
      );

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}

/**
 * SerpAPI Provider (Google Search)
 */
class SerpAPIPROVIDER {
  constructor(config = {}) {
    this.name = SearchProviders.SERPAPI;
    this.apiKey = config.serpApiKey || process.env.SERPAPI_API_KEY;
    this.config = config;
  }

  async search(query, options = {}) {
    const maxResults = options.maxResults || 10;

    if (!this.apiKey) {
      throw new Error('SerpAPI key not configured');
    }

    logger.debug(`[SerpAPI] Searching: ${query}`);

    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://serpapi.com/search.json?q=${encodedQuery}&api_key=${this.apiKey}&num=${maxResults}`;

      const response = await this.httpGet(url);
      const data = JSON.parse(response);

      const results = (data.organic_results || []).map(
        (r) =>
          new SearchResult({
            title: r.title,
            url: r.link,
            snippet: r.snippet,
            source: 'Google',
            date: r.date,
          }),
      );

      return {
        query,
        results,
        total: results.length,
        provider: this.name,
      };
    } catch (error) {
      logger.error('[SerpAPI] Search failed:', error.message);
      throw error;
    }
  }

  async httpGet(url) {
    return new Promise((resolve, reject) => {
      https
        .get(
          url,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; LibreChat-Search/1.0)',
            },
            timeout: 15000,
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => resolve(data));
          },
        )
        .on('error', reject)
        .on('timeout', () => reject(new Error('Request timeout')));
    });
  }
}

/**
 * Whoogle Search Provider (self-hosted, MIT/ISC license, no API key, no censorship)
 *
 * Whoogle is a privacy-respecting metasearch that aggregates results from
 * Google without tracking. It runs as a self-hosted Docker container and
 * provides a JSON API. When WHOOGLE_URL is not set, this provider is
 * skipped (returns empty results rather than throwing).
 *
 * License: MIT/ISC (Whoogle upstream)
 */
class WhoogleProvider {
  constructor(config = {}) {
    this.name = SearchProviders.WHOOGLE;
    this.config = config;
    this.baseUrl = config.whoogleUrl || process.env.WHOOGLE_URL || '';
  }

  async search(query, options = {}) {
    const maxResults = options.maxResults || 10;
    if (!this.baseUrl) {
      logger.debug('[Whoogle] No WHOOGLE_URL configured, skipping');
      return { query, results: [], total: 0, provider: this.name };
    }

    const encodedQuery = encodeURIComponent(query);
    const url = `${this.baseUrl.replace(/\/$/, '')}/search?q=${encodedQuery}&format=json`;

    logger.debug(`[Whoogle] Searching: ${query}`);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      let data;
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LibreChat-Search/1.0)',
            Accept: 'application/json',
          },
        });
        const text = await res.text();
        if (!text) {
          throw new Error(`Whoogle responded empty (HTTP ${res.status})`);
        }
        data = JSON.parse(text);
      } finally {
        clearTimeout(timer);
      }

      const results = [];
      const items = data.results || data || [];
      if (Array.isArray(items)) {
        for (const item of items) {
          if (results.length >= maxResults) break;
          results.push(
            new SearchResult({
              title: item.title || item.link || '',
              url: item.link || item.url || '',
              snippet: item.desc || item.snippet || item.content || '',
              source: 'Whoogle',
            }),
          );
        }
      }

      return {
        query,
        results,
        total: results.length,
        provider: this.name,
      };
    } catch (error) {
      logger.error('[Whoogle] Search failed:', error.message);
      throw error;
    }
  }
}

/**
 * Brave Search Provider — requires BRAVE_SEARCH_API_KEY.
 * Uses the official Brave Search API (https://api.search.brave.com/res/v1/web/search).
 * Free tier: 2,000 queries/month.
 */
class BraveProvider {
  constructor(config = {}) {
    this.name = SearchProviders.BRAVE;
    this.apiKey = config.braveApiKey || process.env.BRAVE_SEARCH_API_KEY || '';
  }

  async search(query, options = {}) {
    if (!this.apiKey) {
      throw new Error('Brave Search API key not configured (BRAVE_SEARCH_API_KEY)');
    }
    const maxResults = Math.min(options.maxResults || 10, 20);
    logger.debug(`[Brave] Searching: ${query}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.apiKey,
        },
      });
      if (!res.ok) {
        throw new Error(`Brave API error ${res.status}`);
      }
      const data = await res.json();
      const results = (data.web?.results || []).map(
        (r) =>
          new SearchResult({
            title: r.title || '',
            url: r.url || '',
            snippet: r.description || '',
            source: 'Brave',
            date: r.age || null,
          }),
      );
      return { query, results, total: results.length, provider: this.name };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Search Runtime - Clase principal
 */
class SearchRuntime {
  constructor(config = {}) {
    this.eventBus = getEventBus();
    this.name = 'SearchRuntime';
    this.capabilities = [Capability.WEB_SEARCH, Capability.DOCUMENT_SEARCH, Capability.RAG_SEARCH];
    this.status = 'initializing';

    // Inicializar proveedores
    this.providers = {
      [SearchProviders.DUCKDUCKGO]: new DuckDuckGoProvider(config),
      [SearchProviders.BING]: new BingProvider(config),
    };

    // Agregar Tavily si hay API key
    if (config.tavilyApiKey || process.env.TAVILY_API_KEY) {
      this.providers[SearchProviders.TAVILY] = new TavilyProvider(config);
    }

    // Agregar SerpAPI si hay API key
    if (config.serpApiKey || process.env.SERPAPI_API_KEY) {
      this.providers[SearchProviders.SERPAPI] = new SerpAPIPROVIDER(config);
    }

    // Agregar Whoogle (self-hosted, MIT/ISC, sin API key, sin censura)
    if (config.whoogleUrl || process.env.WHOOGLE_URL) {
      this.providers[SearchProviders.WHOOGLE] = new WhoogleProvider(config);
    }

    // Agregar Brave Search (Face 10: DDG → Bing → Brave fallback chain)
    if (config.braveApiKey || process.env.BRAVE_SEARCH_API_KEY) {
      this.providers[SearchProviders.BRAVE] = new BraveProvider(config);
    }

    this.config = {
      defaultProvider: config.defaultProvider || SearchProviders.DUCKDUCKGO,
      maxResults: config.maxResults || 10,
      timeout: config.timeout || 30000,
      ...config,
    };

    // Orden de fallback: DDG → Whoogle → Bing → Brave → Tavily → SerpAPI
    this.fallbackOrder = [
      SearchProviders.WHOOGLE,
      SearchProviders.BING,
      SearchProviders.BRAVE,
      SearchProviders.TAVILY,
      SearchProviders.SERPAPI,
      SearchProviders.DUCKDUCKGO,
    ];
  }

  /**
   * Inicializar el runtime
   */
  async initialize() {
    this.status = 'ready';

    logger.info(
      '[SearchRuntime] Initialized with providers:',
      Object.keys(this.providers).join(', '),
    );

    this.eventBus.publish(
      'runtime.ready',
      {
        runtime: this.name,
        capabilities: this.capabilities,
        providers: Object.keys(this.providers),
      },
      'SearchRuntime',
    );

    return true;
  }

  /**
   * Ejecutar búsqueda
   */
  async execute(task) {
    const startTime = Date.now();
    const { intent, query, provider, maxResults } = task;

    // Limpiar la query para búsqueda
    const searchQuery = this.cleanQuery(query || intent);

    logger.debug('[SearchRuntime] Executing search:', searchQuery);

    this.eventBus.publish(
      EventType.EXECUTION_STARTED,
      {
        runtime: this.name,
        query: searchQuery,
        provider: provider || this.config.defaultProvider,
      },
      'SearchRuntime',
    );

    try {
      const result = await this.search(searchQuery, {
        provider: provider || this.config.defaultProvider,
        maxResults: maxResults || this.config.maxResults,
      });

      const duration = Date.now() - startTime;

      this.eventBus.publish(
        EventType.EXECUTION_COMPLETED,
        {
          runtime: this.name,
          duration,
          results: result.total,
        },
        'SearchRuntime',
      );

      return {
        text: this.formatResults(result),
        results: result.results.map((r) => r.toJSON()),
        raw: result,
        provider: result.provider,
        total: result.total,
        latency: duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.eventBus.publish(
        EventType.EXECUTION_FAILED,
        {
          runtime: this.name,
          error: error.message,
          duration,
        },
        'SearchRuntime',
      );

      logger.error('[SearchRuntime] Search failed:', error.message);
      throw error;
    }
  }

  /**
   * Realizar búsqueda con fallback
   */
  async search(query, options = {}) {
    const providers = this.getProviderOrder(options.provider);

    let lastError;

    for (const providerName of providers) {
      const provider = this.providers[providerName];
      if (!provider) continue;

      try {
        logger.debug(`[SearchRuntime] Trying provider: ${providerName}`);
        const result = await Promise.race([
          provider.search(query, options),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Search timeout')), this.config.timeout),
          ),
        ]);
        // DuckDuckGo devuelve 0 resultados sin lanzar error cuando bloquea
        // datacenters; un resultado vacío también debe activar el fallback al
        // siguiente proveedor (p. ej. Bing) en vez de devolver vacío.
        const empty = !result || !Array.isArray(result.results) || result.results.length === 0;
        if (empty && providers.length > providers.indexOf(providerName) + 1) {
          lastError = new Error(`${providerName} devolvió 0 resultados`);
          logger.warn(`[SearchRuntime] Provider ${providerName} returned 0 results, trying next`);
          continue;
        }
        return result;
      } catch (error) {
        lastError = error;
        logger.warn(`[SearchRuntime] Provider ${providerName} failed:`, error.message);
      }
    }

    throw lastError || new Error('All search providers failed');
  }

  /**
   * Obtener orden de proveedores para fallback
   */
  getProviderOrder(preferredProvider) {
    const order = [];

    // Agregar proveedor preferido primero
    if (preferredProvider && this.providers[preferredProvider]) {
      order.push(preferredProvider);
    }

    // Agregar resto en orden de fallback
    for (const p of this.fallbackOrder) {
      if (p !== preferredProvider && this.providers[p]) {
        order.push(p);
      }
    }

    return order;
  }

  /**
   * Formatear resultados para texto
   */
  formatResults(result) {
    if (!result.results || result.results.length === 0) {
      return 'No se encontraron resultados para la búsqueda.';
    }

    let text = `## Resultados de búsqueda para "${result.query}"\n\n`;

    for (let i = 0; i < result.results.length; i++) {
      const r = result.results[i];
      text += `**${i + 1}. ${r.title}**\n`;
      text += `   URL: ${r.url}\n`;
      text += `   ${r.snippet.substring(0, 150)}${r.snippet.length > 150 ? '...' : ''}\n\n`;
    }

    if (result.answer) {
      text += `## Respuesta directa\n\n${result.answer}\n`;
    }

    text += `---\n*Proveedor: ${result.provider}*`;

    return text;
  }

  /**
   * Verificar salud del runtime
   */
  async healthCheck() {
    try {
      // Test simple de búsqueda (con fallback real entre providers)
      await this.search('librechat', { maxResults: 1 });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtener capacidades del runtime
   */
  getCapabilities() {
    return this.capabilities;
  }

  /**
   * Limpiar query para búsqueda
   */
  cleanQuery(query) {
    if (!query) return '';

    // Remover prefijos comunes en español e inglés
    let cleaned = query
      // Español
      .replace(
        /^(busca|buscar|encuentra|encontrar|búsqueda|investig|investigar)\s*(información|info|datos)?\s*(sobre|acerca de|de|:|-)?\s*/i,
        '',
      )
      .replace(/^(información|info|datos|sobre|acerca de|de|:|-)\s*/gi, '')
      // Inglés
      .replace(/^(search|find|look up)\s*(for|information|about)?\s*/i, '')
      .trim();

    // Si quedó vacío, usar la query original
    return cleaned || query;
  }

  /**
   * Apagar el runtime
   */
  async shutdown() {
    this.status = 'shutdown';
    logger.info('[SearchRuntime] Shutdown complete');
  }
}

// Singleton
let runtimeInstance = null;

function getSearchRuntime(config) {
  if (!runtimeInstance) {
    runtimeInstance = new SearchRuntime(config);
  }
  return runtimeInstance;
}

function createSearchRuntime(config) {
  runtimeInstance = new SearchRuntime(config);
  return runtimeInstance;
}

module.exports = {
  SearchRuntime,
  SearchResult,
  SearchProviders,
  getSearchRuntime,
  createSearchRuntime,
};
