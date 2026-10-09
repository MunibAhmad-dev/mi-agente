/**
 * OutputStreamer — Streams process output to connected clients via EventBus.
 *
 * Maintains output buffers per process, supports tailing/following live
 * output, and emits chunked output events for real-time display.
 *
 * License: MIT
 */

const path = require('path');
const EventBusPath = path.join(__dirname, '..', 'EventBus');
const { getEventBus } = require(EventBusPath);

const _buffers = new Map();
const _subscribers = new Map();
const MAX_BUFFER_SIZE = 10000;

/**
 * Start streaming output for a process.
 * @param {string} processId
 * @param {function} onChunk - callback(chunk)
 * @returns {function} unsubscribe function
 */
function subscribe(processId, onChunk) {
  if (!_subscribers.has(processId)) {
    _subscribers.set(processId, new Set());
  }
  _subscribers.get(processId).add(onChunk);

  // Send buffered output first
  const buffer = _buffers.get(processId);
  if (buffer) {
    for (const chunk of buffer) {
      try {
        onChunk(chunk);
      } catch {
        // ignore
      }
    }
  }

  return () => {
    const subs = _subscribers.get(processId);
    if (subs) {
      subs.delete(onChunk);
      if (subs.size === 0) _subscribers.delete(processId);
    }
  };
}

/**
 * Emit a chunk of output to all subscribers.
 * @param {string} processId
 * @param {object} chunk - {stream, text, at}
 */
function emit(processId, chunk) {
  if (!_buffers.has(processId)) {
    _buffers.set(processId, []);
  }
  const buffer = _buffers.get(processId);
  buffer.push(chunk);
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.splice(0, buffer.length - MAX_BUFFER_SIZE);
  }

  const subs = _subscribers.get(processId);
  if (subs) {
    for (const cb of subs) {
      try {
        cb(chunk);
      } catch {
        // ignore
      }
    }
  }

  let eventBus;
  try {
    eventBus = getEventBus();
    if (eventBus) {
      eventBus.publish('output.stream', { processId, ...chunk }, 'OutputStreamer');
    }
  } catch {
    // ignore
  }
}

/**
 * Get buffered output for a process.
 * @param {string} processId
 * @returns {Array}
 */
function getBuffer(processId) {
  return _buffers.get(processId) || [];
}

/**
 * Clear buffer for a process.
 * @param {string} processId
 */
function clearBuffer(processId) {
  _buffers.delete(processId);
  _subscribers.delete(processId);
}

/**
 * Get subscriber count for a process.
 * @param {string} processId
 * @returns {number}
 */
function getSubscriberCount(processId) {
  return _subscribers.get(processId)?.size || 0;
}

module.exports = {
  subscribe,
  emit,
  getBuffer,
  clearBuffer,
  getSubscriberCount,
};
