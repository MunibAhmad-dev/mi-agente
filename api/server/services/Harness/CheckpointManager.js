'use strict';

/**
 * Harness/CheckpointManager — thin shim.
 * Canonical implementation is at ../../Checkpoint/UnifiedCheckpointManager.js
 * Kept here for backward compat with HarnessManager and Harness/index.js imports.
 */

const { UnifiedCheckpointManager, Checkpoint } = require('../Checkpoint/UnifiedCheckpointManager');

// Expose same shape that callers expected
module.exports = { CheckpointManager: UnifiedCheckpointManager, Checkpoint };
