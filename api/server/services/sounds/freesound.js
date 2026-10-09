/**
 * FreesoundProvider — búsqueda y previews vía la API pública de Freesound
 * (freesound.org/apiv2, https://freesound.org/docs/api/). FASE 20.
 *
 * - Requiere FREESOUND_API_TOKEN (backend, gratis al registrarse).
 * - La licencia real de cada sonido se devuelve en la metadata (la mayoría son
 *   CC: requieren atribución; la UI lo muestra y nunca afirma uso comercial
 *   libre a menos que la licencia lo diga).
 * - El preview-hq es un audio directo de Freesound (streaming, sin cachear).
 * - Cache en memoria de 5 min por query para no abusar del rate limit.
 */

const FREESOUND_BASE = 'https://freesound.org/apiv2';

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function cacheKey(q, category, maxDuration) {
  return `${q}|${category}|${maxDuration}`;
}

async function searchFreesound({ q = '', category = '', maxDuration = 0 }) {
  const token = process.env.FREESOUND_API_TOKEN;
  if (!token) {
    throw new Error('FREESOUND_API_TOKEN no configurado');
  }
  const key = cacheKey(q, category, maxDuration);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return hit.sounds;
  }

  const params = new URLSearchParams({
    query: q || 'notification',
    token,
    page_size: '15',
    fields: 'id,name,duration,license,username,tags,previews',
  });
  if (category) {
    params.set('filter', `duration:[0 TO 10]`);
  }

  const res = await fetch(`${FREESOUND_BASE}/search/text/?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Freesound HTTP ${res.status}`);
  }
  const data = await res.json();
  const sounds = (data.results || [])
    .map((s) => ({
      id: `freesound:${s.id}`,
      name: s.name,
      category: 'Freesound',
      duration: s.duration || 0,
      tags: Array.isArray(s.tags) ? s.tags.slice(0, 8) : [],
      license: s.license || 'desconocida',
      licenseUrl: '',
      attributionRequired: /by|sampling\+|cc0/i.test(s.license || ''),
      commercialUseAllowed: /cc0/i.test(s.license || ''),
      provider: 'freesound',
      username: s.username,
      previewUrl: s.previews?.['preview-hq-mp3'] || s.previews?.['preview-lq-mp3'] || null,
    }))
    .filter((s) => {
      if (maxDuration > 0 && s.duration > maxDuration) return false;
      return true;
    });

  cache.set(key, { at: Date.now(), sounds });
  return sounds;
}

async function getFreesoundSound(rawId) {
  const token = process.env.FREESOUND_API_TOKEN;
  if (!token) {
    return null;
  }
  const id = String(rawId || '').replace(/^freesound:/, '');
  if (!/^\d+$/.test(id)) {
    return null;
  }
  const res = await fetch(
    `${FREESOUND_BASE}/sounds/${id}/?fields=id,name,duration,license,username,tags,previews&token=${encodeURIComponent(token)}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) {
    return null;
  }
  const s = await res.json();
  return {
    id: `freesound:${s.id}`,
    name: s.name,
    category: 'Freesound',
    duration: s.duration || 0,
    tags: Array.isArray(s.tags) ? s.tags.slice(0, 8) : [],
    license: s.license || 'desconocida',
    licenseUrl: '',
    attributionRequired: /by|sampling\+|cc0/i.test(s.license || ''),
    commercialUseAllowed: /cc0/i.test(s.license || ''),
    provider: 'freesound',
    username: s.username,
    previewUrl: s.previews?.['preview-hq-mp3'] || s.previews?.['preview-lq-mp3'] || null,
  };
}

module.exports = { searchFreesound, getFreesoundSound };
