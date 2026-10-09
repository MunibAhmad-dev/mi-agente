'use strict';

/**
 * Harness/cognitive/CheckpointManager — thin shim.
 * Canonical implementation is at ../../Checkpoint/UnifiedCheckpointManager.js
 * Kept here for backward compat with ExecutiveLoop and MemoryFacade imports.
 */

const { UnifiedCheckpointManager, Checkpoint } = require('../../Checkpoint/UnifiedCheckpointManager');

module.exports = { CheckpointManager: UnifiedCheckpointManager, Checkpoint };
module.exports.default = UnifiedCheckpointManager;
