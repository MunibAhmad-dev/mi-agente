'use strict';

const EventEmitter3 = require('eventemitter3');

/**
 * CrossSessionMessaging - Agent-to-agent and session-to-session messaging
 */
class CrossSessionMessaging {
  constructor() {
    this.emitter = new EventEmitter3();
    this.channels = new Map();
    this.messageHistory = [];
    this.maxHistory = 500;
  }

  subscribe(channel, callback) {
    if (!this.channels.has(channel)) this.channels.set(channel, new Set());
    this.channels.get(channel).add(callback);
    this.emitter.on(channel, callback);
    return { success: true, channel };
  }

  unsubscribe(channel, callback) {
    if (this.channels.has(channel)) {
      this.channels.get(channel).delete(callback);
      this.emitter.off(channel, callback);
    }
    return { success: true };
  }

  publish(channel, message) {
    const entry = { channel, message, timestamp: new Date().toISOString() };
    this.messageHistory.push(entry);
    if (this.messageHistory.length > this.maxHistory) this.messageHistory = this.messageHistory.slice(-this.maxHistory);
    this.emitter.emit(channel, message);
    return { success: true };
  }

  async send(targetSession, message) {
    return this.publish(`session:${targetSession}`, message);
  }

  broadcast(message) {
    this.emitter.emit('broadcast', message);
    this.messageHistory.push({ channel: 'broadcast', message, timestamp: new Date().toISOString() });
    return { success: true };
  }

  getHistory(channel, limit = 50) {
    if (channel) return this.messageHistory.filter(m => m.channel === channel).slice(-limit);
    return this.messageHistory.slice(-limit);
  }

  getStats() {
    return { channels: this.channels.size, messageCount: this.messageHistory.length };
  }
}

module.exports = CrossSessionMessaging;
