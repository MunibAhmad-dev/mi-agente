'use strict';

/**
 * Account-level login lockout.
 *
 * After LOCKOUT_THRESHOLD consecutive failures the account is locked for
 * LOCKOUT_DURATION_MS milliseconds. IP-based rate limiting (loginLimiter)
 * already covers distributed attacks; this guards against single-IP
 * credential stuffing on a per-account basis.
 *
 * Fields required on the User document:
 *   failedLoginAttempts  Number  (default 0)
 *   lockoutUntil         Date    (default null)
 */

const { logger } = require('@librechat/data-schemas');
const { findUser, updateUser } = require('~/models');

const LOCKOUT_THRESHOLD = parseInt(process.env.LOGIN_LOCKOUT_THRESHOLD || '5', 10);
const LOCKOUT_DURATION_MS = parseInt(
  process.env.LOGIN_LOCKOUT_DURATION_MS || String(15 * 60 * 1000), // 15 min
  10,
);

/**
 * Pre-auth middleware: reject locked accounts immediately.
 * Place AFTER validateEmailLogin (so req.body.email is normalised) and BEFORE requireLocalAuth.
 */
const checkAccountLockout = async (req, res, next) => {
  const email = (req.body?.email || '').toLowerCase().trim();
  if (!email) return next();

  try {
    const user = await findUser({ email }, 'lockoutUntil');
    if (user?.lockoutUntil && user.lockoutUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 60000);
      logger.warn(`[withAccountLockout] Account locked: ${email} — ${minutesLeft}m remaining`);
      return res.status(429).json({
        message: `Account temporarily locked due to too many failed login attempts. Try again in ${minutesLeft} minute(s).`,
      });
    }
  } catch (err) {
    logger.warn('[withAccountLockout] checkAccountLockout error:', err.message);
  }

  next();
};

/**
 * Call this when a login attempt fails (wrong password / user not found).
 * Increments the counter and applies lockout if threshold is reached.
 * @param {string} email
 */
const recordLoginFailure = async (email) => {
  if (!email) return;
  const normalised = email.toLowerCase().trim();
  try {
    const user = await findUser({ email: normalised }, 'failedLoginAttempts lockoutUntil');
    if (!user) return;

    const attempts = (user.failedLoginAttempts || 0) + 1;
    const update = { failedLoginAttempts: attempts };

    if (attempts >= LOCKOUT_THRESHOLD) {
      update.lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      update.failedLoginAttempts = 0;
      logger.warn(`[withAccountLockout] Account locked after ${LOCKOUT_THRESHOLD} failures: ${normalised}`);
    }

    await updateUser({ email: normalised }, update);
  } catch (err) {
    logger.warn('[withAccountLockout] recordLoginFailure error:', err.message);
  }
};

/**
 * Call this when a login succeeds — resets the failure counter.
 * @param {string|import('mongoose').Types.ObjectId} userId
 */
const resetLoginFailures = async (userId) => {
  if (!userId) return;
  try {
    await updateUser({ _id: userId }, { failedLoginAttempts: 0, lockoutUntil: null });
  } catch (err) {
    logger.warn('[withAccountLockout] resetLoginFailures error:', err.message);
  }
};

module.exports = { checkAccountLockout, recordLoginFailure, resetLoginFailures };
