/**
 * DocsService - Servicio de Documentación API
 * Proporciona endpoints para servir la documentación OpenAPI
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

class DocsService {
  constructor() {
    // __dirname = .../services/DocsService  ->  '../../docs' = .../server/docs
    // (antes era '../docs' = .../services/docs, que no existe en Linux por case).
    this.docsPath = path.join(__dirname, '../../docs');
    this.openapiSpec = null;
    // Cargar el spec de forma sincrona en el constructor: antes el spec solo se
    // cargaba en initialize(), pero index.js monta getRouter() sin llamarlo, por
    // lo que /api/docs/spec devolvia 503 'OpenAPI spec not loaded'.
    try {
      const specPath = path.join(this.docsPath, 'openapi.yaml');
      if (fs.existsSync(specPath)) {
        this.openapiSpec = fs.readFileSync(specPath, 'utf8');
        console.log('[DocsService] OpenAPI spec loaded (constructor)');
      }
    } catch (error) {
      console.error('[DocsService] Error loading spec:', error.message);
    }
  }

  /**
   * Inicializar el servicio
   */
  async initialize() {
    console.log('[DocsService] Initializing...');

    try {
      const specPath = path.join(this.docsPath, 'openapi.yaml');
      if (fs.existsSync(specPath)) {
        this.openapiSpec = fs.readFileSync(specPath, 'utf8');
        console.log('[DocsService] OpenAPI spec loaded');
      }
    } catch (error) {
      console.error('[DocsService] Error loading spec:', error.message);
    }

    return this;
  }

  /**
   * Obtener el router de Express
   */
  getRouter() {
    const router = express.Router();

    router.get('/', (req, res) => {
      const htmlPath = path.join(this.docsPath, 'index.html');
      if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
      } else {
        res.status(404).json({ error: 'Documentation not found' });
      }
    });

    router.get('/spec', (req, res) => {
      if (!this.openapiSpec) {
        return res.status(503).json({ error: 'OpenAPI spec not loaded' });
      }
      try {
        const yaml = require('js-yaml');
        const spec = yaml.load(this.openapiSpec);
        res.json(spec);
      } catch (error) {
        res.status(500).json({ error: 'Error parsing spec' });
      }
    });

    router.get('/spec.yaml', (req, res) => {
      if (!this.openapiSpec) {
        return res.status(503).json({ error: 'OpenAPI spec not loaded' });
      }
      res.set('Content-Type', 'text/yaml');
      res.send(this.openapiSpec);
    });

    return router;
  }

  /**
   * Convertir OpenAPI spec a Postman Collection
   */
  toPostmanCollection(spec) {
    const collection = {
      info: {
        name: spec.info.title,
        description: spec.info.description,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      variable: [{ key: 'baseUrl', value: spec.servers[0]?.url || 'http://localhost:3001' }],
      item: [],
    };

    const groups = {};
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, details] of Object.entries(methods)) {
        if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
          const tag = details.tags?.[0] || 'General';
          if (!groups[tag]) groups[tag] = { name: tag, item: [] };
          groups[tag].item.push({
            name: details.summary || `${method.toUpperCase()} ${path}`,
            request: {
              method: method.toUpperCase(),
              url: {
                raw: `{{baseUrl}}${path}`,
                host: ['{{baseUrl}}'],
                path: path.split('/').filter(Boolean),
              },
              description: details.description || '',
            },
          });
        }
      }
    }
    collection.item = Object.values(groups);
    return collection;
  }
}

let instance = null;
function getDocsService() {
  if (!instance) instance = new DocsService();
  return instance;
}

module.exports = { DocsService, getDocsService };
