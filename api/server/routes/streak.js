/**
 * Streak routes — FASE 27.
 *   GET /api/streak → { streak, bestStreak, totalActiveDays, daysToUnlock,
 *                       milestone, weekProgress, unlocked }
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');
const UserStreak = require('~/models/UserStreak');
const {
  recordActivity,
  getStreak,
  claimGift,
  checkSessionAllowance,
} = require('~/server/services/UserStreakService');

router.get('/', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user?.id ?? req.user?._id;
    // Registra el día de uso de forma síncrona ANTES de leer (el hook del
    // middleware es fire-and-forget; esperarlo aquí evita una carrera de
    // lectura y hace el endpoint determinista). Idempotente por día.
    await recordActivity(userId);
    const streak = await getStreak(userId);
    res.status(200).json({ success: true, ...streak });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * FASE 28 — POST /api/streak/claim-gift
 * Reclama el regalo del hito actual (+1 sesión extra al día). Devuelve el
 * nuevo estado; la UI marca el modal como celebrado para este ciclo.
 */
router.post('/claim-gift', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user?.id ?? req.user?._id;
    const result = await claimGift(userId);
    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error });
    }
    const streak = await getStreak(userId);
    res
      .status(200)
      .json({ success: true, claimed: result.alreadyClaimed ? false : true, ...streak });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * FASE 29 — PATCH /api/streak/limit
 * Configura el límite base de sesiones diarias (-1 = sin límite). Las sesiones
 * extra de los regalos se suman a este límite. Verifica que el usuario puede
 * crear una conversación hoy (para mostrarlo en la UI sin abrir el chat).
 */
router.patch('/limit', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user?.id ?? req.user?._id;
    let limit = Number(req.body?.dailySessionLimit);
    if (!Number.isFinite(limit)) {
      return res.status(400).json({ success: false, error: 'dailySessionLimit inválido' });
    }
    limit = Math.max(-1, Math.min(1000, Math.round(limit)));
    await UserStreak.findOneAndUpdate(
      { userId },
      { $set: { dailySessionLimit: limit } },
      { upsert: true, setDefaultsOnInsert: true },
    );
    const streak = await getStreak(userId);
    res.status(200).json({ success: true, ...streak });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * FASE 29 — GET /api/streak/allowance
 * Estado del allowance de sesiones de hoy (límite + extra + usadas).
 */
router.get('/allowance', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user?.id ?? req.user?._id;
    const result = await checkSessionAllowance(userId);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
