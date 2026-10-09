/**
 * UserStreakService — FASE 27: racha de días de uso del sistema.
 *
 *  - recordActivity(userId): se llama tras cada petición autenticada, pero un
 *    guard en memoria (Map userId -> fecha) evita escribir a Mongo más de una
 *    vez al día por usuario y proceso.
 *  - getStreak(userId): devuelve la racha + progreso hasta el próximo hito
 *    semanal (cada 7 días: "+1 sesión extra al día").
 */

const mongoose = require('mongoose');
const UserStreak = require('~/models/UserStreak');
const { logger } = require('@librechat/data-schemas');

// Modelo de conversaciones registrado por data-schemas al iniciar la app.
// Se resuelve perezosamente: no debe cargarse antes de que exista la conexión.
function getConversationModel() {
  return mongoose.models['Conversation'] || mongoose.model('Conversation');
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Hito: cada N días consecutivos se desbloquea el bonus ("+1 sesión extra al día").
const MILESTONE_DAYS = 7;

/** Memoria de días ya registrados: `${userId}:${yyyymmdd}` -> true */
const _recorded = new Set();
// Evita que el Set crezca sin límite: lo podamos cuando supera 50k entradas.
const _MAX_RECORDED = 50000;

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Registra un día de actividad. Idempotente por día/usuario (escribe a Mongo
 * como máximo una vez al día por usuario). Nunca lanza: el streak no debe
 * romper ninguna petición.
 */
async function recordActivity(userId) {
  try {
    if (!userId) {
      return null;
    }
    const key = `${userId}:${dayKey()}`;
    if (_recorded.has(key)) {
      return null;
    }
    _recorded.add(key);
    if (_recorded.size > _MAX_RECORDED) {
      // Podar las entradas más antiguas (aproximación: reiniciar el guard;
      // lo único que se pierde es una escritura extra a Mongo, inofensiva).
      _recorded.clear();
      _recorded.add(key);
    }

    const today = startOfDay();
    const yesterday = new Date(today.getTime() - DAY_MS);

    const doc = await UserStreak.findOneAndUpdate(
      { userId },
      { $setOnInsert: { streak: 0, totalActiveDays: 0, bestStreak: 0, firstActiveDate: today } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    if (!doc.lastActiveDate) {
      doc.lastActiveDate = today;
      doc.streak = 1;
      doc.totalActiveDays = 1;
      doc.bestStreak = 1;
      await doc.save();
      return { streak: doc.streak, totalActiveDays: doc.totalActiveDays };
    }

    const last = startOfDay(new Date(doc.lastActiveDate));
    if (last.getTime() === today.getTime()) {
      return { streak: doc.streak, totalActiveDays: doc.totalActiveDays }; // mismo día
    }

    if (last.getTime() === yesterday.getTime()) {
      doc.streak += 1; // día consecutivo
    } else {
      doc.streak = 1; // se perdió un día → racha nueva
    }
    doc.lastActiveDate = today;
    doc.totalActiveDays += 1;
    if (doc.streak > doc.bestStreak) {
      doc.bestStreak = doc.streak;
    }
    await doc.save();
    return { streak: doc.streak, totalActiveDays: doc.totalActiveDays };
  } catch (error) {
    logger.error('[streak] error registrando actividad', error);
    return null;
  }
}

/** Racha actual + progreso al próximo hito (para la UI). */
async function getStreak(userId) {
  try {
    if (!userId) {
      return { streak: 0, bestStreak: 0, totalActiveDays: 0, daysToUnlock: MILESTONE_DAYS };
    }
    const doc = await UserStreak.findOne({ userId }).lean();
    if (!doc) {
      return { streak: 0, bestStreak: 0, totalActiveDays: 0, daysToUnlock: MILESTONE_DAYS };
    }
    const streak = doc.streak || 0;
    const inCycle = streak % MILESTONE_DAYS;
    const daysToUnlock = inCycle === 0 && streak > 0 ? 0 : MILESTONE_DAYS - inCycle;
    // FASE 28 — regalo: hay un hito nuevo (streak múltiplo del hito) que
    // todavía no se ha reclamado → la UI muestra el modal de celebración.
    const unlocked = streak > 0 && streak % MILESTONE_DAYS === 0;
    const giftClaimed = unlocked && doc.lastGiftClaimedStreak >= streak;
    // FASE 29 — sesiones extra reales: uso de HOY contado contra las
    // conversaciones realmente creadas en el día (índice user+createdAt).
    const extraSessionsPerDay = doc.extraSessionsPerDay || 0;
    const dailySessionLimit = doc.dailySessionLimit == null ? -1 : doc.dailySessionLimit;
    let sessionsUsedToday = 0;
    if (dailySessionLimit >= 0 || extraSessionsPerDay > 0) {
      try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        sessionsUsedToday = await getConversationModel().countDocuments({
          user: userId,
          createdAt: { $gte: start },
        });
      } catch (e) {
        logger.warn('[streak] error contando sesiones de hoy', e);
      }
    }
    const allowance = dailySessionLimit >= 0 ? dailySessionLimit + extraSessionsPerDay : -1;
    const remainingToday = allowance >= 0 ? Math.max(0, allowance - sessionsUsedToday) : -1;
    return {
      streak,
      bestStreak: doc.bestStreak || 0,
      totalActiveDays: doc.totalActiveDays || 0,
      lastActiveDate: doc.lastActiveDate || null,
      milestone: MILESTONE_DAYS,
      daysToUnlock,
      // Progreso de la semana actual (0..7) para los puntitos de la UI.
      weekProgress: streak % MILESTONE_DAYS,
      unlocked,
      giftClaimed,
      giftReady: unlocked && !giftClaimed,
      // FASE 29 — sesiones extra reales.
      extraSessionsPerDay,
      dailySessionLimit,
      sessionsUsedToday,
      remainingToday,
    };
  } catch (error) {
    logger.error('[streak] error leyendo racha', error);
    return { streak: 0, bestStreak: 0, totalActiveDays: 0, daysToUnlock: MILESTONE_DAYS };
  }
}

/**
 * FASE 28 — reclama el regalo del hito actual. Persiste el streak en el que
 * se reclamó para que el modal no vuelva a aparecer en este ciclo.
 */
async function claimGift(userId) {
  try {
    if (!userId) {
      return { ok: false, error: 'usuario requerido' };
    }
    const doc = await UserStreak.findOneAndUpdate(
      { userId },
      { $max: { lastGiftClaimedStreak: 0 } }, // no-op; se setea abajo con el streak real
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    if (!doc.streak || doc.streak % MILESTONE_DAYS !== 0) {
      return { ok: false, error: 'no hay hito de regalo pendiente' };
    }
    if ((doc.lastGiftClaimedStreak ?? 0) >= doc.streak) {
      return { ok: true, alreadyClaimed: true, streak: doc.streak };
    }
    doc.lastGiftClaimedStreak = doc.streak;
    // FASE 29: el regalo entrega +1 sesión extra al día (acumulativa).
    doc.extraSessionsPerDay = (doc.extraSessionsPerDay || 0) + 1;
    await doc.save();
    return {
      ok: true,
      alreadyClaimed: false,
      streak: doc.streak,
      extraSessionsPerDay: doc.extraSessionsPerDay,
    };
  } catch (error) {
    logger.error('[streak] error reclamando regalo', error);
    return { ok: false, error: error.message };
  }
}

/** FASE 29 — comprueba si el usuario puede crear una conversación hoy según
 *  su límite base (si configuró uno) + sus sesiones extra de regalos.
 *  Devuelve { ok } siempre cuando no hay límite configurado (default). */
async function checkSessionAllowance(userId) {
  try {
    if (!userId) {
      return { ok: true };
    }
    const doc = await UserStreak.findOne({ userId }).lean();
    if (!doc) {
      return { ok: true };
    }
    const dailySessionLimit = doc.dailySessionLimit == null ? -1 : doc.dailySessionLimit;
    if (dailySessionLimit < 0) {
      return { ok: true }; // sin límite configurado → nunca bloquea
    }
    const extra = doc.extraSessionsPerDay || 0;
    const allowance = dailySessionLimit + extra;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const used = await getConversationModel().countDocuments({
      user: userId,
      createdAt: { $gte: start },
    });
    if (used >= allowance) {
      return {
        ok: false,
        used,
        allowance,
        error:
          'Límite de sesiones diarias alcanzado. Reclama el regalo de tu racha para +1 sesión extra al día.',
      };
    }
    return { ok: true, used, allowance };
  } catch (error) {
    logger.warn('[streak] error verificando allowance', error);
    return { ok: true }; // nunca bloquear por un fallo del contador
  }
}

module.exports = {
  recordActivity,
  getStreak,
  claimGift,
  checkSessionAllowance,
  MILESTONE_DAYS,
  dayKey,
};
