'use strict';

/**
 * MemoryConsolidationService
 *
 * Periodically deduplicates and prunes session memories in MongoDB:
 *   - Removes SessionMemory documents that have expired (TTL safety-net)
 *   - Caps HistoricalMemory per user to MAX_HISTORY_DOCS (oldest first)
 *   - Logs a summary after each run
 *
 * Runs every CONSOLIDATION_INTERVAL_MS (default 6 hours).
 * Designed to be started once at server boot — start() is idempotent.
 */

const { logger } = require('@librechat/data-schemas');

const CONSOLIDATION_INTERVAL_MS = parseInt(
  process.env.MEMORY_CONSOLIDATION_INTERVAL_MS || String(6 * 60 * 60 * 1000), // 6 h
  10,
);
const MAX_HISTORY_DOCS = parseInt(process.env.MEMORY_MAX_HISTORY_DOCS || '500', 10);

let _mc = null;
function mc() {
  if (_mc) return _mc;
  try { _mc = require('~/models/MemoryCollections'); } catch { _mc = null; }
  return _mc;
}

let _intervalId = null;

/**
 * Run one consolidation pass.
 */
async function consolidate() {
  const lib = mc();
  if (!lib) return;

  try {
    const now = new Date();

    // 1. Prune expired SessionMemory (belt-and-suspenders — Mongoose TTL index
    //    handles this automatically, but a manual pass catches any drift).
    let expiredRemoved = 0;
    if (lib.SessionMemory) {
      const res = await lib.SessionMemory.deleteMany({ expiresAt: { $lt: now } }).catch(() => ({ deletedCount: 0 }));
      expiredRemoved = res.deletedCount || 0;
    }

    // 2. Cap HistoricalMemory per user.
    let historyCapped = 0;
    if (lib.HistoricalMemory) {
      // Get distinct userIds in HistoricalMemory
      const userIds = await lib.HistoricalMemory.distinct('userId').catch(() => []);
      for (const uid of userIds) {
        const count = await lib.HistoricalMemory.countDocuments({ userId: uid }).catch(() => 0);
        if (count > MAX_HISTORY_DOCS) {
          const toDelete = count - MAX_HISTORY_DOCS;
          // Delete oldest `toDelete` documents
          const oldest = await lib.HistoricalMemory
            .find({ userId: uid }, { _id: 1 })
            .sort({ createdAt: 1 })
            .limit(toDelete)
            .lean()
            .catch(() => []);

          if (oldest.length > 0) {
            const ids = oldest.map((d) => d._id);
            await lib.HistoricalMemory.deleteMany({ _id: { $in: ids } }).catch(() => {});
            historyCapped += oldest.length;
          }
        }
      }
    }

    if (expiredRemoved > 0 || historyCapped > 0) {
      logger.info(
        `[MemoryConsolidation] Done — expiredSession: ${expiredRemoved}, historyCapped: ${historyCapped}`,
      );
    }
  } catch (err) {
    logger.warn('[MemoryConsolidation] Error during consolidation pass:', err.message);
  }
}

/**
 * Start the periodic consolidation job.
 * Idempotent — calling multiple times has no effect.
 */
function start() {
  if (_intervalId) return;

  // Run once shortly after boot, then on the configured interval.
  setTimeout(consolidate, 30 * 1000); // 30 s after boot
  _intervalId = setInterval(consolidate, CONSOLIDATION_INTERVAL_MS);
  logger.info(
    `[MemoryConsolidation] Scheduled every ${CONSOLIDATION_INTERVAL_MS / 3600000}h (max history: ${MAX_HISTORY_DOCS})`,
  );
}

/** Stop the job (used in tests / graceful shutdown). */
function stop() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

module.exports = { start, stop, consolidate };
