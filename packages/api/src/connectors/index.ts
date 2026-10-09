/**
 * Connectors Module
 * ==================
 * Módulo para integración con servicios externos (GitHub, HuggingFace)
 * 
 * @example
 * // Usar como ruta en Express
 * import connectorRoutes from './connectors';
 * app.use('/api/connectors', connectorRoutes);
 */

export { default as connectorRoutes } from './connector_routes.js';
export { GitHubClient, publicGitHubClient, createGitHubClient } from './github_client.js';
export { HuggingFaceClient, publicHuggingFaceClient, createHuggingFaceClient } from './huggingface_client.js';

// Tipos
export type {
  GitHubRepo,
  GitHubSearchResult,
  GitHubUser,
} from './github_client.js';

export type {
  GitHubRepo,
  GitHubSearchResult,
  GitHubUser,
} from './github_client.js';

export type {
  HuggingFaceModel,
  HuggingFaceDataset,
  HuggingFaceSpace,
  HuggingFaceUser,
  HuggingFaceSearchResult,
} from './huggingface_client.js';
