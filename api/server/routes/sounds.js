/**
 * Sounds Routes — FASE 20 / 22.
 *
 *   GET    /api/sounds/providers
 *   GET    /api/sounds/search?provider=&q=&category=&maxDuration=
 *   GET    /api/sounds/:id
 *   POST   /api/sounds/upload            (multipart, campo "file")
 *   GET    /api/sounds/custom
 *   DELETE /api/sounds/custom/:id
 *   GET    /api/sounds/file/:id          (streaming; JWT en header o ?token=)
 *   GET    /api/user/sound-preferences
 *   PUT    /api/user/sound-preferences
 *
 * Todas requieren JWT. Las keys de proveedores remotos viven en el backend.
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');
const {
  getSoundPreferencesController,
  updateSoundPreferencesController,
  getSoundProvidersController,
  searchSoundsController,
  getSoundByIdController,
  uploadSoundController,
  listCustomSoundsController,
  deleteCustomSoundController,
  getSoundFileController,
} = require('~/server/controllers/SoundController');

// Subida en memoria (máx 5 MB por archivo) — la validación de MIME/tamaño se
// hace en el servicio (uploads.js) para no duplicar reglas.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

router.get('/sounds/providers', requireJwtAuth, getSoundProvidersController);
router.get('/sounds/search', requireJwtAuth, searchSoundsController);
router.get('/sounds/custom', requireJwtAuth, listCustomSoundsController);
router.post('/sounds/upload', requireJwtAuth, upload.single('file'), uploadSoundController);
router.delete('/sounds/custom/:id', requireJwtAuth, deleteCustomSoundController);
router.get('/sounds/file/:id', requireJwtAuth, getSoundFileController);
router.get('/sounds/:id', requireJwtAuth, getSoundByIdController);

router.get('/user/sound-preferences', requireJwtAuth, getSoundPreferencesController);
router.put('/user/sound-preferences', requireJwtAuth, updateSoundPreferencesController);

module.exports = router;
