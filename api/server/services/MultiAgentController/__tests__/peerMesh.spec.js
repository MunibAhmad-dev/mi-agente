'use strict';

const { PeerMesh, getGlobalMesh } = require('../PeerMesh');

describe('PeerMesh — Face 13: Cross-node agent peer network', () => {
  let mesh;

  beforeEach(() => {
    mesh = new PeerMesh();
  });

  test('register() adds a peer and returns descriptor', () => {
    const peer = mesh.register('agent-1', { role: 'worker' });
    expect(peer.id).toBe('agent-1');
    expect(peer.online).toBe(true);
    expect(mesh.getPeers()).toHaveLength(1);
  });

  test('unregister() removes the peer', () => {
    mesh.register('agent-x');
    const removed = mesh.unregister('agent-x');
    expect(removed).toBe(true);
    expect(mesh.getPeers()).toHaveLength(0);
  });

  test('unregister() returns false for unknown peer', () => {
    expect(mesh.unregister('no-such-peer')).toBe(false);
  });

  test('subscribe() auto-registers peer if not already registered', () => {
    const unsub = mesh.subscribe('auto-peer', () => {});
    expect(mesh.peers.has('auto-peer')).toBe(true);
    unsub();
  });

  test('send() delivers message to subscribed handler', () => {
    const received = [];
    mesh.register('sender');
    mesh.subscribe('receiver', (msg) => received.push(msg));
    mesh.send('sender', 'receiver', { type: 'hello', payload: { data: 42 } });
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('hello');
    expect(received[0].from).toBe('sender');
    expect(received[0].to).toBe('receiver');
  });

  test('send() returns receipt with msgId', () => {
    mesh.register('a');
    mesh.subscribe('b', () => {});
    const receipt = mesh.send('a', 'b', { type: 'ping' });
    expect(receipt.msgId).toMatch(/^pmsg_/);
    expect(receipt.delivered).toBe(true);
  });

  test('broadcast() delivers to all peers except sender', () => {
    const log = [];
    mesh.register('broadcaster');
    mesh.subscribe('p1', (m) => log.push({ to: 'p1', m }));
    mesh.subscribe('p2', (m) => log.push({ to: 'p2', m }));
    mesh.broadcast('broadcaster', { type: 'announce', payload: 'hi' });
    expect(log).toHaveLength(2);
    expect(log.every((l) => l.m.from === 'broadcaster')).toBe(true);
  });

  test('getMessageLog() returns recent messages capped at limit', () => {
    mesh.register('s');
    mesh.subscribe('r', () => {});
    for (let i = 0; i < 5; i++) mesh.send('s', 'r', { type: 'tick' });
    expect(mesh.getMessageLog(3)).toHaveLength(3);
  });

  test('getStats() reflects registered + message counts', () => {
    mesh.register('n1');
    mesh.subscribe('n2', () => {});
    mesh.send('n1', 'n2', { type: 'x' });
    const stats = mesh.getStats();
    expect(stats.peersOnline).toBe(2);
    expect(stats.messages).toBe(1);
  });

  test('getGlobalMesh() returns the same singleton', () => {
    const m1 = getGlobalMesh();
    const m2 = getGlobalMesh();
    expect(m1).toBe(m2);
  });
});
