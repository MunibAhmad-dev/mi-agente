'use strict';

/** Internal logger for every ResearchOS module. Set level via RESEARCH_OS_LOG. */
const LEVELS = { silent: 0, error: 0, warn: 1, info: 2, debug: 3 };

let current = process.env.RESEARCH_OS_LOG || 'info';
if (LEVELS[current] === undefined) current = 'info';

function fmt(prefix, args) {
  return ['[ResearchOS:' + prefix + ']', ...args];
}

function make(prefix) {
  return {
    debug: (...a) => { if (LEVELS[current] >= 3) console.log(...fmt(prefix, a)); },
    info: (...a) => { if (LEVELS[current] >= 2) console.log(...fmt(prefix, a)); },
    warn: (...a) => { if (LEVELS[current] >= 1) console.warn(...fmt(prefix, a)); },
    error: (...a) => { if (LEVELS[current] >= 0) console.error(...fmt(prefix, a)); },
  };
}

module.exports = {
  make,
  setLevel(level) { if (LEVELS[level] !== undefined) current = level; },
};
