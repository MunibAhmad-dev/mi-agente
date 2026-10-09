/**
 * Configuración declarativa de proveedores soportados por el módulo de
 * Conectores. Agregar un proveedor nuevo (ej. GitLab) sólo requiere sumar
 * una entrada aquí + sus variables de entorno, sin tocar las rutas.
 */

const providers = {
  github: {
    key: 'github',
    label: 'GitHub',
    clientId: () => process.env.GITHUB_CONNECTOR_CLIENT_ID,
    clientSecret: () => process.env.GITHUB_CONNECTOR_CLIENT_SECRET,
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    // 'repo' da acceso a repos privados; usar 'public_repo' si sólo se
    // quiere permitir seleccionar repos públicos del usuario.
    scope: 'read:user repo',
    /** Devuelve el usuario autenticado (para mostrar avatar/username conectado) */
    async fetchIdentity(accessToken) {
      const resp = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'LibreChat-Connectors',
        },
      });
      if (!resp.ok) throw new Error(`GitHub identity fetch failed: ${resp.status}`);
      const data = await resp.json();
      return { username: data.login, avatarUrl: data.avatar_url, name: data.name };
    },
    /**
     * Busca repositorios. Si hay query, usa la Search API filtrando por
     * el usuario conectado; si no, lista los repos propios (más recientes).
     */
    async search(accessToken, query) {
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'LibreChat-Connectors',
      };

      let url;
      if (query && query.trim()) {
        const q = encodeURIComponent(`${query} in:name,description user:@me`);
        url = `https://api.github.com/search/repositories?q=${q}&per_page=20`;
      } else {
        url = 'https://api.github.com/user/repos?sort=updated&per_page=20';
      }

      const resp = await fetch(url, { headers });
      if (!resp.ok) throw new Error(`GitHub search failed: ${resp.status}`);
      const data = await resp.json();
      const items = Array.isArray(data) ? data : data.items || [];

      return items.map((repo) => ({
        id: String(repo.id),
        name: repo.full_name,
        description: repo.description,
        url: repo.html_url,
        private: repo.private,
        stars: repo.stargazers_count,
        language: repo.language,
        updatedAt: repo.updated_at,
        defaultBranch: repo.default_branch,
      }));
    },
  },

  huggingface: {
    key: 'huggingface',
    label: 'Hugging Face',
    clientId: () => process.env.HUGGINGFACE_CONNECTOR_CLIENT_ID,
    clientSecret: () => process.env.HUGGINGFACE_CONNECTOR_CLIENT_SECRET,
    authorizeUrl: 'https://huggingface.co/oauth/authorize',
    tokenUrl: 'https://huggingface.co/oauth/token',
    scope: 'read-repos',
    async fetchIdentity(accessToken) {
      const resp = await fetch('https://huggingface.co/api/whoami-v2', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!resp.ok) throw new Error(`Hugging Face identity fetch failed: ${resp.status}`);
      const data = await resp.json();
      return { username: data.name, avatarUrl: data.avatarUrl, name: data.fullname };
    },
    /**
     * Busca modelos, datasets y spaces. HF Hub API es pública, pero se
     * manda el token para incluir los privados/gated del usuario conectado.
     */
    async search(accessToken, query) {
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
      const identity = accessToken ? await this.fetchIdentity(accessToken) : null;
      const author = identity ? `&author=${encodeURIComponent(identity.username)}` : '';
      const q = query && query.trim() ? `&search=${encodeURIComponent(query)}` : '';

      const [models, datasets, spaces] = await Promise.all([
        fetch(`https://huggingface.co/api/models?limit=10${author}${q}`, { headers }).then((r) =>
          r.ok ? r.json() : [],
        ),
        fetch(`https://huggingface.co/api/datasets?limit=10${author}${q}`, { headers }).then((r) =>
          r.ok ? r.json() : [],
        ),
        fetch(`https://huggingface.co/api/spaces?limit=10${author}${q}`, { headers }).then((r) =>
          r.ok ? r.json() : [],
        ),
      ]);

      const map = (items, type) =>
        (items || []).map((item) => ({
          id: item.id,
          name: item.id,
          type,
          url: `https://huggingface.co/${type === 'model' ? '' : type + 's/'}${item.id}`,
          private: !!item.private,
          likes: item.likes,
          downloads: item.downloads,
          updatedAt: item.lastModified,
        }));

      return [...map(models, 'model'), ...map(datasets, 'dataset'), ...map(spaces, 'space')];
    },
  },
};

const isValidProvider = (name) => Object.prototype.hasOwnProperty.call(providers, name);

module.exports = { providers, isValidProvider };
