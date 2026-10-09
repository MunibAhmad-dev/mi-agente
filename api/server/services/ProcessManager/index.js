/**
 * ProcessManager — Unified process management service.
 *
 * Combines:
 *   - PtyManager (node-pty, MIT): persistent interactive terminal sessions
 *   - BackgroundProcess: long-running command execution with streaming
 *   - OutputStreamer: real-time output streaming to subscribers
 *   - JobQueue: durable background job queue with retries
 *
 * License: MIT
 */

module.exports = {
  PtyManager: require('./PtyManager'),
  BackgroundProcess: require('./BackgroundProcess'),
  OutputStreamer: require('./OutputStreamer'),
  JobQueue: require('./JobQueue'),
};
