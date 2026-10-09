const passport = require('passport');
const { logger } = require('@librechat/data-schemas');
const { recordLoginFailure } = require('~/server/middleware/withAccountLockout');

const requireLocalAuth = (req, res, next) => {
  const email = req.body?.email;
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      logger.error('[requireLocalAuth] Error at passport.authenticate:', err);
      return next(err);
    }
    if (!user) {
      logger.debug('[requireLocalAuth] Error: No user');
      recordLoginFailure(email).catch(() => {});
      return res.status(404).send(info);
    }
    if (info && info.message) {
      logger.debug('[requireLocalAuth] Error: ' + info.message);
      recordLoginFailure(email).catch(() => {});
      return res.status(422).send({ message: info.message });
    }
    req.user = user;
    next();
  })(req, res, next);
};

module.exports = requireLocalAuth;
