'use strict';

/**
 * PeerMesh — Face 13: Cross-node Agent Peer Network.
 *
 * Each agent instance (or node) can register itself as a peer in the mesh.
 * Peers can send typed messages to each other via the in-process bus; when a
 * remote transport (e.g. Redis pub/sub) is attached it fans out across nodes.
 *
 * Interface:
 *   mesh.register(peerId, meta)          → peer descriptor
 *   mesh.unregister(peerId)              → bool
 *   mesh.send(fromPeerId, toPeerId, msg) → delivery receipt
 *   mesh.broadcast(fromPeerId, msg)      → broadcast receipt
 *   mesh.subscribe(peerId, handler)      → unsubscribe fn
 *   mesh.getPeers()                      → peer[]
 *   mesh.getStats()                      → stats
 */

const { EventEmitter } = require('events');

let _meshIdCounter = 0;

class PeerMesh extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.peers = new Map();        // peerId → { id, meta, subscribedAt, messageCount }
    this.handlers = new Map();     // peerId → Set<handler>
    this.messageLog = [];
    this.stats = { registered: 0, messages: 0, broadcasts: 0, delivered: 0 };
    this._remoteTransport = null;  // optional external transport (Redis, WS, etc.)
  }

  /**
   * Register a peer in the mesh.
   * @param {string} peerId - unique peer identifier (e.g. agentId or sessionId)
   * @param {object} meta   - arbitrary metadata (name, role, nodeId, capabilities)
   * @returns {object} peer descriptor
   */
  register(peerId, meta = {}) {
    if (!peerId) throw new Error('peerId is required');
    const peer = {
      id: peerId,
      meta,
      registeredAt: Date.now(),
      messageCount: 0,
      online: true,
    };
    this.peers.set(peerId, peer);
    this.stats.registered++;
    this.emit('peer:registered', { peerId, meta });
    return peer;
  }

  /**
   * Remove a peer from the mesh.
   */
  unregister(peerId) {
    const existed = this.peers.delete(peerId);
    this.handlers.delete(peerId);
    if (existed) this.emit('peer:unregistered', { peerId });
    return existed;
  }

  /**
   * Subscribe to messages addressed to peerId.
   * @param {string} peerId
   * @param {function} handler - called with (message) each time a message arrives
   * @returns {function} unsubscribe
   */
  subscribe(peerId, handler) {
    if (!this.handlers.has(peerId)) this.handlers.set(peerId, new Set());
    this.handlers.get(peerId).add(handler);
    // Ensure the peer is registered (auto-register if not)
    if (!this.peers.has(peerId)) this.register(peerId, { autoRegistered: true });
    return () => {
      const set = this.handlers.get(peerId);
      if (set) set.delete(handler);
    };
  }

  /**
   * Send a message from one peer to another.
   * @param {string} fromPeerId
   * @param {string} toPeerId
   * @param {object} msg - { type, payload, ... }
   * @returns {object} receipt
   */
  send(fromPeerId, toPeerId, msg) {
    const msgId = `pmsg_${Date.now()}_${++_meshIdCounter}`;
    const envelope = {
      id: msgId,
      from: fromPeerId,
      to: toPeerId,
      type: msg.type || 'message',
      payload: msg.payload ?? msg,
      sentAt: Date.now(),
    };

    this.messageLog.push(envelope);
    if (this.messageLog.length > 1000) this.messageLog = this.messageLog.slice(-500);
    this.stats.messages++;

    const toPeer = this.peers.get(toPeerId);
    if (toPeer) toPeer.messageCount++;

    // Deliver in-process
    const delivered = this._deliver(toPeerId, envelope);

    // Fan out to remote transport if attached
    if (this._remoteTransport) {
      try { this._remoteTransport.publish(toPeerId, envelope); } catch { /* best-effort */ }
    }

    this.emit('message:sent', { msgId, from: fromPeerId, to: toPeerId });
    return { msgId, delivered, from: fromPeerId, to: toPeerId };
  }

  /**
   * Broadcast a message to all registered peers except the sender.
   */
  broadcast(fromPeerId, msg) {
    const msgId = `bcast_${Date.now()}_${++_meshIdCounter}`;
    const envelope = {
      id: msgId,
      from: fromPeerId,
      to: '*',
      type: msg.type || 'broadcast',
      payload: msg.payload ?? msg,
      sentAt: Date.now(),
    };

    this.stats.broadcasts++;
    let deliveredCount = 0;

    for (const peerId of this.peers.keys()) {
      if (peerId === fromPeerId) continue;
      if (this._deliver(peerId, envelope)) deliveredCount++;
    }

    if (this._remoteTransport) {
      try { this._remoteTransport.publish('*', envelope); } catch {}
    }

    this.emit('message:broadcast', { msgId, from: fromPeerId, recipients: deliveredCount });
    return { msgId, deliveredCount };
  }

  /**
   * Attach an external transport for cross-node delivery.
   * Transport must implement: publish(channel, message) and subscribe(channel, handler).
   */
  attachTransport(transport) {
    this._remoteTransport = transport;
    // Route inbound remote messages to local handlers
    transport.subscribe('*', (envelope) => {
      if (envelope.to && envelope.to !== '*') {
        this._deliver(envelope.to, envelope);
      } else if (envelope.to === '*') {
        for (const peerId of this.peers.keys()) {
          if (peerId !== envelope.from) this._deliver(peerId, envelope);
        }
      }
    });
  }

  /** Internal: deliver envelope to local handlers for peerId. */
  _deliver(peerId, envelope) {
    const set = this.handlers.get(peerId);
    if (!set || set.size === 0) return false;
    set.forEach((fn) => { try { fn(envelope); } catch {} });
    this.stats.delivered++;
    return true;
  }

  /**
   * List all registered peers.
   */
  getPeers() {
    return Array.from(this.peers.values());
  }

  /**
   * Get recent message log (last N messages).
   */
  getMessageLog(limit = 50) {
    return this.messageLog.slice(-limit);
  }

  getStats() {
    return { ...this.stats, peersOnline: this.peers.size };
  }
}

// Singleton for the process — all agents share one mesh
let _globalMesh = null;
function getGlobalMesh() {
  if (!_globalMesh) _globalMesh = new PeerMesh();
  return _globalMesh;
}

module.exports = { PeerMesh, getGlobalMesh };
