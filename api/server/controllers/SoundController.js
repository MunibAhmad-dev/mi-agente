/**
 * SoundController — API interna de sonidos y notificaciones (FASE 20).
 *
 *  GET  /api/sounds/providers         → proveedores disponibles (con estado de keys)
 *  GET  /api/sounds/search            → búsqueda en proveedor (local siempre; remoto si key)
 *  GET  /api/sounds/:id               → metadata + preview de un sonido
 *  GET  /api/user/sound-preferences   → preferencias del usuario (default si no existen)
 *  PUT  /api/user/sound-preferences   → persistir preferencias (validadas)
 *
 * Seguridad: todas las rutas con requireJwtAuth; las API keys de proveedores
 * remotos viven SOLO en el backend (process.env) y nunca viajan al navegador.
 * La búsqueda remota es server-side (sin exponer credenciales al cliente).
 */

const fs = require('fs');
const path = require('path');
const SoundPreferences = require('~/models/SoundPreferences');
const { searchFreesound, getFreesoundSound } = require('~/server/services/sounds/freesound');
const { searchLocalCatalog, getLocalSound } = require('~/server/services/sounds/local');
const { searchPixabay, getPixabaySound } = require('~/server/services/sounds/pixabay');
const { searchMixkit, getMixkitSound } = require('~/server/services/sounds/mixkit');
const {
  saveUpload,
  listUploads,
  getUpload,
  deleteUpload,
  UPLOAD_ROOT,
} = require('~/server/services/sounds/uploads');

/** Eventos del sistema con su sonido por defecto (id de la biblioteca local). */
const EVENT_DEFAULTS = {
  aiResponse: 'chime-soft-digital',
  taskCompleted: 'success-chime',
  aiMessage: 'message-digital',
  notification: 'notification-soft',
  warning: 'alert-soft',
  error: 'error-notification',
  taskStarted: 'process-start',
  fileCompleted: 'file-done',
  connectionSuccess: 'connection-ok',
};

const DEFAULT_PREFS = {
  soundsEnabled: true,
  masterVolume: 75,
  backgroundSoundsEnabled: true,
  reduceDuringIntenseActivity: false,
  events: Object.fromEntries(
    Object.entries(EVENT_DEFAULTS).map(([id, soundId]) => [
      id,
      { enabled: true, soundId, volume: null },
    ]),
  ),
};

const KNOWN_EVENTS = Object.keys(EVENT_DEFAULTS);
const MAX_SOUND_ID = 120;
const MAX_EVENT_LEN = 60;

function sanitizePrefs(body = {}) {
  const out = {
    soundsEnabled:
      typeof body.soundsEnabled === 'boolean' ? body.soundsEnabled : DEFAULT_PREFS.soundsEnabled,
    masterVolume:
      typeof body.masterVolume === 'number' &&
      Number.isFinite(body.masterVolume) &&
      body.masterVolume >= 0 &&
      body.masterVolume <= 100
        ? Math.round(body.masterVolume)
        : DEFAULT_PREFS.masterVolume,
    backgroundSoundsEnabled:
      typeof body.backgroundSoundsEnabled === 'boolean'
        ? body.backgroundSoundsEnabled
        : DEFAULT_PREFS.backgroundSoundsEnabled,
    reduceDuringIntenseActivity:
      typeof body.reduceDuringIntenseActivity === 'boolean'
        ? body.reduceDuringIntenseActivity
        : DEFAULT_PREFS.reduceDuringIntenseActivity,
    events: {},
  };

  const evt = body.events && typeof body.events === 'object' ? body.events : {};
  for (const key of Object.keys(EVENT_DEFAULTS)) {
    const cur = evt[key] && typeof evt[key] === 'object' ? evt[key] : {};
    const soundId =
      typeof cur.soundId === 'string' && cur.soundId.length <= MAX_SOUND_ID
        ? cur.soundId
        : EVENT_DEFAULTS[key];
    out.events[key] = {
      enabled: typeof cur.enabled === 'boolean' ? cur.enabled : true,
      soundId,
      volume:
        typeof cur.volume === 'number' &&
        Number.isFinite(cur.volume) &&
        cur.volume >= 0 &&
        cur.volume <= 100
          ? Math.round(cur.volume)
          : null,
    };
  }
  return out;
}

async function getPreferences(userId) {
  let doc = await SoundPreferences.findOne({ user: userId }).lean();
  if (!doc) {
    doc = await SoundPreferences.create({ user: userId, ...DEFAULT_PREFS });
    doc = doc.toObject();
  }
  // Asegurar eventos por defecto si faltan (modelo evoluciona)
  let changed = false;
  const events = doc.events || {};
  for (const [id, soundId] of Object.entries(EVENT_DEFAULTS)) {
    if (!events[id]) {
      events[id] = { enabled: true, soundId, volume: null };
      changed = true;
    }
  }
  if (changed) {
    await SoundPreferences.updateOne({ user: userId }, { $set: { events } });
  }
  return {
    soundsEnabled: doc.soundsEnabled,
    masterVolume: doc.masterVolume,
    backgroundSoundsEnabled: doc.backgroundSoundsEnabled,
    reduceDuringIntenseActivity: doc.reduceDuringIntenseActivity,
    events,
  };
}

const getSoundPreferencesController = async (req, res) => {
  try {
    const prefs = await getPreferences(req.user.id);
    res.json({ success: true, preferences: prefs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const updateSoundPreferencesController = async (req, res) => {
  try {
    const sanitized = sanitizePrefs(req.body || {});
    await SoundPreferences.updateOne(
      { user: req.user.id },
      { $set: { ...sanitized, user: req.user.id } },
      { upsert: true },
    );
    const prefs = await getPreferences(req.user.id);
    res.json({ success: true, preferences: prefs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getSoundProvidersController = async (_req, res) => {
  res.json({
    success: true,
    providers: [
      {
        id: 'local',
        name: 'Biblioteca local (sintetizada)',
        available: true,
        requiresKey: false,
        description: 'Tonos generados en el navegador. Sin atribución, uso comercial permitido.',
      },
      {
        id: 'custom',
        name: 'Mis sonidos (subidos)',
        available: true,
        requiresKey: false,
        description:
          'Sonidos que tú subes (mp3/wav/ogg, máx 5 MB). El usuario es responsable de la licencia.',
      },
      {
        id: 'mixkit',
        name: 'Mixkit',
        available: true,
        requiresKey: false,
        description:
          'Catálogo curado de Mixkit (no tiene API pública). Uso comercial libre sin atribución; la preview se hace desde su web.',
      },
      {
        id: 'pixabay',
        name: 'Pixabay',
        available: Boolean(process.env.PIXABAY_API_KEY),
        requiresKey: true,
        description:
          'API pública de Pixabay (pixabay.com). Requiere PIXABAY_API_KEY. Uso comercial libre sin atribución.',
      },
      {
        id: 'freesound',
        name: 'Freesound',
        available: Boolean(process.env.FREESOUND_API_TOKEN),
        requiresKey: true,
        description:
          'API pública de Freesound (freesound.org). Requiere token y, según el sonido, atribución CC.',
      },
    ],
  });
};

/** Búsqueda unificada: provider ∈ {local, custom, mixkit, pixabay, freesound, all}.
 *  Los proveedores con key se degradan si no hay key; 'all' los incluye solo
 *  cuando están disponibles. */
const searchSoundsController = async (req, res) => {
  try {
    const provider = String(req.query.provider || 'local');
    const q = String(req.query.q || '').slice(0, 100);
    const category = String(req.query.category || '');
    const maxDuration = Number(req.query.maxDuration) || 0;

    const hasFreesoundKey = Boolean(process.env.FREESOUND_API_TOKEN);
    const hasPixabayKey = Boolean(process.env.PIXABAY_API_KEY);

    const local = searchLocalCatalog({ q, category, maxDuration });
    const mixkit = searchMixkit({ q, category, maxDuration });

    if (provider === 'custom') {
      return res.json({ success: true, provider, sounds: listUploads(req.user.id) });
    }

    if (provider === 'mixkit') {
      return res.json({ success: true, provider, sounds: mixkit });
    }

    if (provider === 'pixabay') {
      if (!hasPixabayKey) {
        // Degradación elegante (no es un error del cliente): sin key se responde
        // 200 con needsKey=true para que la UI muestre un aviso informativo.
        return res.json({
          success: true,
          provider,
          needsKey: true,
          keyEnv: 'PIXABAY_API_KEY',
          sounds: [],
        });
      }
      const results = await searchPixabay({ q, category, maxDuration });
      return res.json({ success: true, provider, sounds: results });
    }

    if (provider === 'freesound') {
      if (!hasFreesoundKey) {
        // Degradación elegante (ver nota anterior).
        return res.json({
          success: true,
          provider,
          needsKey: true,
          keyEnv: 'FREESOUND_API_TOKEN',
          sounds: [],
        });
      }
      const results = await searchFreesound({ q, category, maxDuration });
      return res.json({ success: true, provider, sounds: results });
    }

    if (provider === 'all') {
      const custom = listUploads(req.user.id);
      const parts = [...custom, ...local, ...mixkit];
      if (hasFreesoundKey) {
        parts.push(...(await searchFreesound({ q, category, maxDuration })));
      }
      if (hasPixabayKey) {
        parts.push(...(await searchPixabay({ q, category, maxDuration })));
      }
      return res.json({ success: true, provider, sounds: parts });
    }

    // default: local
    res.json({ success: true, provider: 'local', sounds: local });
  } catch (error) {
    res.status(502).json({ success: false, error: error.message });
  }
};

const getSoundByIdController = async (req, res) => {
  try {
    const id = String(req.params.id || '').slice(0, MAX_SOUND_ID);
    if (id.startsWith('local:')) {
      const sound = getLocalSound(id.slice('local:'.length));
      if (!sound) {
        return res.status(404).json({ success: false, error: 'sonido no encontrado' });
      }
      return res.json({ success: true, sound });
    }
    if (id.startsWith('custom:')) {
      const sound = getUpload(req.user.id, id);
      if (!sound) {
        return res.status(404).json({ success: false, error: 'sonido no encontrado' });
      }
      const { filePath, ...meta } = sound;
      res.json({
        success: true,
        sound: { ...meta, previewUrl: `/api/sounds/file/${encodeURIComponent(id)}` },
      });
      return;
    }
    if (id.startsWith('mixkit:')) {
      const sound = getMixkitSound(id);
      if (!sound) {
        return res.status(404).json({ success: false, error: 'sonido no encontrado' });
      }
      return res.json({ success: true, sound });
    }
    if (id.startsWith('pixabay:')) {
      if (!process.env.PIXABAY_API_KEY) {
        return res.status(200).json({
          success: true,
          needsKey: true,
          keyEnv: 'PIXABAY_API_KEY',
          sound: null,
        });
      }
      const sound = await getPixabaySound(id);
      if (!sound) {
        return res.status(404).json({ success: false, error: 'sonido no encontrado' });
      }
      return res.json({ success: true, sound });
    }
    if (id.startsWith('freesound:')) {
      if (!process.env.FREESOUND_API_TOKEN) {
        return res.status(200).json({
          success: true,
          needsKey: true,
          keyEnv: 'FREESOUND_API_TOKEN',
          sound: null,
        });
      }
      const sound = await getFreesoundSound(id.slice('freesound:'.length));
      if (!sound) {
        return res.status(404).json({ success: false, error: 'sonido no encontrado' });
      }
      return res.json({ success: true, sound });
    }
    // id crudo: buscar primero en local
    const local = getLocalSound(id);
    if (local) {
      return res.json({ success: true, sound: local });
    }
    const remote = await getFreesoundSound(id);
    if (remote) {
      return res.json({ success: true, sound: remote });
    }
    return res.status(404).json({ success: false, error: 'sonido no encontrado' });
  } catch (error) {
    res.status(502).json({ success: false, error: error.message });
  }
};

/** Subir un sonido personalizado (multer in-memory). Valida MIME + tamaño. */
const uploadSoundController = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });
    }
    const meta = saveUpload({
      userId: req.user.id,
      buffer: req.file.buffer,
      originalName: req.file.originalname || 'sonido',
      mime: req.file.mimetype || '',
    });
    res.json({
      success: true,
      sound: { ...meta, previewUrl: `/api/sounds/file/${encodeURIComponent(meta.id)}` },
    });
  } catch (error) {
    const status = error.code === 'INVALID_MIME' || error.code === 'TOO_LARGE' ? 400 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

const listCustomSoundsController = async (req, res) => {
  try {
    res.json({ success: true, sounds: listUploads(req.user.id) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteCustomSoundController = async (req, res) => {
  try {
    const ok = deleteUpload(req.user.id, req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'sonido no encontrado' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/** Sirve el archivo de un sonido subido SOLO a su propietario (JWT en header o query). */
const getSoundFileController = async (req, res) => {
  try {
    const sound = getUpload(req.user.id, req.params.id);
    if (!sound || !sound.filePath) {
      return res.status(404).json({ success: false, error: 'sonido no encontrado' });
    }
    if (!fs.existsSync(sound.filePath)) {
      return res.status(404).json({ success: false, error: 'archivo no encontrado' });
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(sound.filePath);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/** Asegura que el directorio de subidas exista al arrancar. */
function ensureUploadDir() {
  try {
    fs.mkdirSync(path.join(UPLOAD_ROOT), { recursive: true });
  } catch {
    /* noop */
  }
}

module.exports = {
  getSoundPreferencesController,
  updateSoundPreferencesController,
  getSoundProvidersController,
  searchSoundsController,
  getSoundByIdController,
  uploadSoundController,
  listCustomSoundsController,
  deleteCustomSoundController,
  getSoundFileController,
  ensureUploadDir,
  KNOWN_EVENTS,
  EVENT_DEFAULTS,
};
