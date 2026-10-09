/**
 * PixabaySoundProvider — búsqueda y previews vía la API pública de Pixabay
 * (https://pixabay.com/api/sounds/). FASE 22.
 *
 * - Requiere PIXABAY_API_KEY (backend, gratis al registrarse en pixabay.com).
 * - Licencia: Pixabay Content License — uso comercial libre, sin atribución
 *   obligatoria (https://pixabay.com/service/license-summary/).
 * - Rate limit: 100 req/60 s por key; cache en memoria 5 min por query.
 * - Hotlinking de previews permitido solo de forma temporal para mostrar
 *   resultados; los archivos finales deben descargarse al servidor.
 * - El endpoint de sonidos no está en la documentación pública de imágenes/
 *   videos, por lo que el mapeo de campos se hace defensivo (varios shapes).
 */

const PIXABAY_BASE = 'https://pixabay.com/api/sounds';

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

/** Metadatos de sonidos ya vistos (para resolver /api/sounds/pixabay:<id>). */
const seen = new Map();

const LICENSE = {
  license: 'Pixabay Content License — uso comercial libre, sin atribución obligatoria',
  licenseUrl: 'https://pixabay.com/service/license-summary/',
  attributionRequired: false,
  commercialUseAllowed: true,
  provider: 'pixabay',
};

function toTags(raw) {
  if (Array.isArray(raw)) return raw.slice(0, 8);
  if (typeof raw === 'string')
    return raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8);
  return [];
}

function previewUrlOf(s) {
  const p = s.previews;
  if (!p) {
    return null;
  }
  const hq = p.preview_hq;
  const lq = p.preview_lq;
  const pick = (x) => {
    if (typeof x === 'string') return x;
    if (x && typeof x.url === 'string') return x.url;
    return null;
  };
  return pick(hq) || pick(lq) || null;
}

async function searchPixabay({ q = '', category = '', maxDuration = 0 }) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) {
    throw new Error('PIXABAY_API_KEY no configurado');
  }
  const cacheKey = `${q}|${category}|${maxDuration}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return hit.sounds;
  }

  const params = new URLSearchParams({
    key,
    q: q || 'notification',
    per_page: '15',
    safesearch: 'true',
  });

  const res = await fetch(`${PIXABAY_BASE}/?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Pixabay HTTP ${res.status}`);
  }
  const data = await res.json();
  const sounds = (data.hits || [])
    .map((s) => {
      const sound = {
        id: `pixabay:${s.id}`,
        name: toTags(s.tags)[0]
          ? toTags(s.tags)[0].replace(/^./, (c) => c.toUpperCase())
          : `Pixabay sound ${s.id}`,
        category: 'Pixabay',
        duration: Number(s.duration) || 0,
        tags: toTags(s.tags),
        ...LICENSE,
        username: s.user || s.user_id ? String(s.user || s.user_id) : undefined,
        pageUrl: s.pageURL || s.url || null,
        previewUrl: previewUrlOf(s) || null,
        downloadUrl: s.download || null,
      };
      seen.set(`pixabay:${s.id}`, sound);
      return sound;
    })
    .filter((s) => {
      if (maxDuration > 0 && s.duration > maxDuration) return false;
      return true;
    });

  cache.set(cacheKey, { at: Date.now(), sounds });
  return sounds;
}

async function getPixabaySound(rawId) {
  const id = `pixabay:${String(rawId || '').replace(/^pixabay:/, '')}`;
  const found = seen.get(id);
  if (found) {
    return found;
  }
  // Si no está en caché (p. ej. tras reinicio), no podemos re-resolver sin
  // key de búsqueda — devolvemos null y el cliente omite la preview.
  return null;
}

module.exports = { searchPixabay, getPixabaySound };
