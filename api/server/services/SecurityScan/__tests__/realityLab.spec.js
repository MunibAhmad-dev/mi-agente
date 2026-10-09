'use strict';

const { RealityLab, NullDriver, SnapshotManager } = require('../RealityLab');

describe('RealityLab', () => {
  let lab;
  beforeEach(() => { lab = new RealityLab({ driver: 'null' }); });

  test('driverName is "null" when null driver is forced', () => {
    expect(lab.driverName).toBe('null');
  });

  test('run returns exit_code and driver', async () => {
    const result = await lab.run('console.log("hi")', { timeoutMs: 5000 });
    expect(result).toHaveProperty('exit_code');
    expect(result.driver).toBe('null');
    expect(result).toHaveProperty('duration_ms');
    expect(result).toHaveProperty('code_hash');
  }, 10000);

  test('snapshot creates a snapshot entry', async () => {
    const snap = await lab.snapshot();
    expect(snap.id).toMatch(/null_snap_/);
    expect(lab.listSnapshots().length).toBe(1);
  });

  test('restore returns restored true for null driver', async () => {
    const snap = await lab.snapshot();
    const res = await lab.restore(snap.id);
    expect(res.restored).toBe(true);
  });

  test('restore throws for unknown snapshot', async () => {
    await expect(lab.restore('bad-id')).rejects.toThrow();
  });

  test('listRuns returns run history', async () => {
    await lab.run('1+1');
    expect(lab.listRuns().length).toBe(1);
  }, 10000);

  test('deleteSnapshot removes entry', async () => {
    const snap = await lab.snapshot();
    lab.deleteSnapshot(snap.id);
    expect(lab.listSnapshots().length).toBe(0);
  });
});

describe('SnapshotManager', () => {
  test('save and get work correctly', () => {
    const mgr = new SnapshotManager();
    const snap = { id: 'test-1', driver: 'null' };
    const saved = mgr.save(snap);
    expect(saved.created_at).toBeDefined();
    expect(mgr.get('test-1')).toBe(saved);
  });

  test('list returns all snapshots', () => {
    const mgr = new SnapshotManager();
    mgr.save({ id: 'a', driver: 'null' });
    mgr.save({ id: 'b', driver: 'null' });
    expect(mgr.list().length).toBe(2);
  });

  test('delete removes entry', () => {
    const mgr = new SnapshotManager();
    mgr.save({ id: 'x' });
    mgr.delete('x');
    expect(mgr.get('x')).toBeNull();
  });
});
