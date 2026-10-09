/**
 * Connector Routes
 * ================
 * Rutas API para conectar con GitHub y HuggingFace
 */

import { Router } from 'express';
import { Request, Response } from 'express';
import { GitHubClient, GitHubRepo, GitHubUser } from './github_client.js';
import { HuggingFaceClient, HuggingFaceModel, HuggingFaceDataset, HuggingFaceSpace } from './huggingface_client.js';

const router: Router = Router();

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Obtener cliente de GitHub desde el request
 */
function getGitHubClient(req: Request): GitHubClient | null {
  const token = req.headers['x-github-token'] as string;
  if (!token) return null;
  return new GitHubClient(token);
}

/**
 * Obtener cliente de HuggingFace desde el request
 */
function getHuggingFaceClient(req: Request): HuggingFaceClient | null {
  const token = req.headers['x-huggingface-token'] as string;
  if (!token) return null;
  return new HuggingFaceClient(token);
}

/**
 * Obtener token de GitHub del usuario desde la sesión/DB
 */
async function getUserGitHubToken(userId: string): Promise<string | null> {
  // TODO: Implementar desde la base de datos/sesión
  // Por ahora retorna null - se usa el token del header
  return null;
}

/**
 * Obtener token de HuggingFace del usuario desde la sesión/DB
 */
async function getUserHuggingFaceToken(userId: string): Promise<string | null> {
  // TODO: Implementar desde la base de datos/sesión
  return null;
}

// ============================================================================
// GITHUB ROUTES
// ============================================================================

/**
 * @route GET /api/connectors/github/me
 * @desc Obtener información del usuario de GitHub
 */
router.get('/github/me', async (req: Request, res: Response) => {
  try {
    const token = req.headers['x-github-token'] as string;
    if (!token) {
      return res.status(401).json({ error: 'Token de GitHub requerido' });
    }

    const client = new GitHubClient(token);
    const user = await client.getUser();

    if (!user) {
      return res.status(401).json({ error: 'Token de GitHub inválido' });
    }

    res.json({
      connected: true,
      user: {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatar_url,
        htmlUrl: user.html_url,
      },
    });
  } catch (error) {
    console.error('Error verificando GitHub:', error);
    res.status(500).json({ error: 'Error al verificar GitHub' });
  }
});

/**
 * @route GET /api/connectors/github/repos
 * @desc Obtener repositorios del usuario
 */
router.get('/github/repos', async (req: Request, res: Response) => {
  try {
    const token = req.headers['x-github-token'] as string;
    if (!token) {
      return res.status(401).json({ error: 'Token de GitHub requerido' });
    }

    const client = new GitHubClient(token);
    const repos = await client.getMyRepos({
      type: 'owner',
      per_page: 30,
      sort: 'updated',
    });

    res.json({ repos });
  } catch (error) {
    console.error('Error obteniendo repos:', error);
    res.status(500).json({ error: 'Error al obtener repositorios' });
  }
});

/**
 * @route GET /api/connectors/github/search
 * @desc Buscar repositorios
 */
router.get('/github/search', async (req: Request, res: Response) => {
  try {
    const { q, page = '1', per_page = '30', sort = 'stars', language } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query requerida' });
    }

    const client = new GitHubClient();
    const results = await client.searchRepos(q, {
      page: parseInt(page as string),
      per_page: parseInt(per_page as string),
      sort: sort as 'stars' | 'forks' | 'updated',
      language: language as string | undefined,
    });

    res.json({
      total: results.total_count,
      repos: results.items.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        url: repo.html_url,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        topics: repo.topics,
        owner: {
          login: repo.owner.login,
          avatarUrl: repo.owner.avatar_url,
        },
        updatedAt: repo.updated_at,
      })),
    });
  } catch (error) {
    console.error('Error buscando repos:', error);
    res.status(500).json({ error: 'Error al buscar repositorios' });
  }
});

/**
 * @route GET /api/connectors/github/search/skills
 * @desc Buscar skills/plugins en GitHub
 */
router.get('/github/search/skills', async (req: Request, res: Response) => {
  try {
    const { q, page = '1', per_page = '30' } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query requerida' });
    }

    const client = new GitHubClient();
    const results = await client.searchSkills(q, {
      page: parseInt(page as string),
      per_page: parseInt(per_page as string),
    });

    res.json({
      total: results.total_count,
      skills: results.items.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        url: repo.html_url,
        stars: repo.stargazers_count,
        language: repo.language,
        topics: repo.topics,
        owner: {
          login: repo.owner.login,
          avatarUrl: repo.owner.avatar_url,
        },
      })),
    });
  } catch (error) {
    console.error('Error buscando skills:', error);
    res.status(500).json({ error: 'Error al buscar skills' });
  }
});

/**
 * @route GET /api/connectors/github/repo/:owner/:repo
 * @desc Obtener detalles de un repositorio
 */
router.get('/github/repo/:owner/:repo', async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;

    const client = new GitHubClient();
    const details = await client.getRepo(owner, repo);

    if (!details) {
      return res.status(404).json({ error: 'Repositorio no encontrado' });
    }

    const topics = await client.getRepoTopics(owner, repo);
    const languages = await client.getLanguages(owner, repo);

    res.json({
      id: details.id,
      name: details.name,
      fullName: details.full_name,
      description: details.description,
      url: details.html_url,
      stars: details.stargazers_count,
      forks: details.forks_count,
      language: details.language,
      topics,
      languages,
      owner: {
        login: details.owner.login,
        avatarUrl: details.owner.avatar_url,
      },
      defaultBranch: details.default_branch,
      updatedAt: details.updated_at,
    });
  } catch (error) {
    console.error('Error obteniendo repo:', error);
    res.status(500).json({ error: 'Error al obtener repositorio' });
  }
});

/**
 * @route GET /api/connectors/github/readme/:owner/:repo
 * @desc Obtener README de un repositorio
 */
router.get('/github/readme/:owner/:repo', async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;

    const client = new GitHubClient();
    const readme = await client.getReadme(owner, repo);

    if (!readme) {
      return res.status(404).json({ error: 'README no encontrado' });
    }

    res.json({ readme });
  } catch (error) {
    console.error('Error obteniendo README:', error);
    res.status(500).json({ error: 'Error al obtener README' });
  }
});

// ============================================================================
// HUGGINGFACE ROUTES
// ============================================================================

/**
 * @route GET /api/connectors/huggingface/me
 * @desc Obtener información del usuario de HuggingFace
 */
router.get('/huggingface/me', async (req: Request, res: Response) => {
  try {
    const token = req.headers['x-huggingface-token'] as string;
    if (!token) {
      return res.status(401).json({ error: 'Token de HuggingFace requerido' });
    }

    const client = new HuggingFaceClient(token);
    const user = await client.getUser();

    if (!user) {
      return res.status(401).json({ error: 'Token de HuggingFace inválido' });
    }

    res.json({
      connected: true,
      user: {
        id: user.id,
        username: user.username,
        fullname: user.fullname,
        avatarUrl: user.avatarUrl,
        isPro: user.isPro,
      },
    });
  } catch (error) {
    console.error('Error verificando HuggingFace:', error);
    res.status(500).json({ error: 'Error al verificar HuggingFace' });
  }
});

/**
 * @route GET /api/connectors/huggingface/models
 * @desc Buscar modelos
 */
router.get('/huggingface/models', async (req: Request, res: Response) => {
  try {
    const { q = '', page = '0', limit = '20', sort = 'downloads' } = req.query;

    const client = new HuggingFaceClient();
    const results = await client.searchModels(q as string, {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      sort: sort as 'downloads' | 'likes' | 'recently_updated',
    });

    res.json({
      total: results.total,
      models: results.data.map((model) => ({
        id: model.id,
        author: model.author,
        downloads: model.downloads,
        likes: model.likes,
        tags: model.tags,
        pipelineTag: model.pipeline_tag,
        libraryName: model.library_name,
        lastModified: model.lastModified,
      })),
    });
  } catch (error) {
    console.error('Error buscando modelos:', error);
    res.status(500).json({ error: 'Error al buscar modelos' });
  }
});

/**
 * @route GET /api/connectors/huggingface/models/:modelId
 * @desc Obtener detalles de un modelo
 */
router.get('/huggingface/models/:modelId', async (req: Request, res: Response) => {
  try {
    const { modelId } = req.params;

    const client = new HuggingFaceClient();
    const model = await client.getModel(modelId);

    if (!model) {
      return res.status(404).json({ error: 'Modelo no encontrado' });
    }

    res.json({
      id: model.id,
      author: model.author,
      downloads: model.downloads,
      likes: model.likes,
      tags: model.tags,
      pipelineTag: model.pipeline_tag,
      libraryName: model.library_name,
      lastModified: model.lastModified,
    });
  } catch (error) {
    console.error('Error obteniendo modelo:', error);
    res.status(500).json({ error: 'Error al obtener modelo' });
  }
});

/**
 * @route GET /api/connectors/huggingface/datasets
 * @desc Buscar datasets
 */
router.get('/huggingface/datasets', async (req: Request, res: Response) => {
  try {
    const { q = '', page = '0', limit = '20', sort = 'downloads' } = req.query;

    const client = new HuggingFaceClient();
    const results = await client.searchDatasets(q as string, {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      sort: sort as 'downloads' | 'likes' | 'recently_updated',
    });

    res.json({
      total: results.total,
      datasets: results.data.map((dataset) => ({
        id: dataset.id,
        author: dataset.author,
        downloads: dataset.downloads,
        likes: dataset.likes,
        tags: dataset.tags,
        lastModified: dataset.lastModified,
      })),
    });
  } catch (error) {
    console.error('Error buscando datasets:', error);
    res.status(500).json({ error: 'Error al buscar datasets' });
  }
});

/**
 * @route GET /api/connectors/huggingface/spaces
 * @desc Buscar Spaces
 */
router.get('/huggingface/spaces', async (req: Request, res: Response) => {
  try {
    const { q = '', page = '0', limit = '20', sort = 'likes', sdk } = req.query;

    const client = new HuggingFaceClient();
    const results = await client.searchSpaces(q as string, {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      sort: sort as 'downloads' | 'likes' | 'recently_updated',
      sdk: sdk as 'gradio' | 'streamlit' | 'docker' | 'static' | undefined,
    });

    res.json({
      total: results.total,
      spaces: results.data.map((space) => ({
        id: space.id,
        author: space.author,
        sdk: space.sdk,
        hardware: space.hardware,
        url: space.url,
        likes: space.likes,
        lastModified: space.lastModified,
      })),
    });
  } catch (error) {
    console.error('Error buscando spaces:', error);
    res.status(500).json({ error: 'Error al buscar spaces' });
  }
});

/**
 * @route GET /api/connectors/huggingface/my-models
 * @desc Obtener modelos del usuario
 */
router.get('/huggingface/my-models', async (req: Request, res: Response) => {
  try {
    const token = req.headers['x-huggingface-token'] as string;
    if (!token) {
      return res.status(401).json({ error: 'Token de HuggingFace requerido' });
    }

    const client = new HuggingFaceClient(token);
    const models = await client.getMyModels({ limit: 50 });

    res.json({
      models: models.map((model) => ({
        id: model.id,
        author: model.author,
        downloads: model.downloads,
        likes: model.likes,
        tags: model.tags,
        lastModified: model.lastModified,
      })),
    });
  } catch (error) {
    console.error('Error obteniendo modelos:', error);
    res.status(500).json({ error: 'Error al obtener modelos' });
  }
});

// ============================================================================
// STATUS ROUTES
// ============================================================================

/**
 * @route GET /api/connectors/status
 * @desc Obtener estado de todas las conexiones
 */
router.get('/status', async (req: Request, res: Response) => {
  const githubToken = req.headers['x-github-token'] as string;
  const huggingfaceToken = req.headers['x-huggingface-token'] as string;

  const status = {
    github: {
      connected: false,
      user: null,
    },
    huggingface: {
      connected: false,
      user: null,
    },
  };

  // Verificar GitHub
  if (githubToken) {
    try {
      const githubClient = new GitHubClient(githubToken);
      const user = await githubClient.getUser();
      if (user) {
        status.github = {
          connected: true,
          user: {
            login: user.login,
            name: user.name,
            avatarUrl: user.avatar_url,
          },
        };
      }
    } catch (error) {
      // Token inválido
    }
  }

  // Verificar HuggingFace
  if (huggingfaceToken) {
    try {
      const hfClient = new HuggingFaceClient(huggingfaceToken);
      const user = await hfClient.getUser();
      if (user) {
        status.huggingface = {
          connected: true,
          user: {
            username: user.username,
            fullname: user.fullname,
            avatarUrl: user.avatarUrl,
          },
        };
      }
    } catch (error) {
      // Token inválido
    }
  }

  res.json(status);
});

export default router;
