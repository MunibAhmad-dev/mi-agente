'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { EventEmitter } = require('events');

// Mock spawn so runJob tests don't leave live processes after the suite ends
const mockChildProcess = Object.assign(new EventEmitter(), {
  stdout: new EventEmitter(),
  stderr: new EventEmitter(),
  pid: 12345,
});
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: jest.fn(() => mockChildProcess),
}));

const { FineTuningManager } = require('../FineTuningManager');

describe('FineTuningManager — detectBackend', () => {
  let manager;

  beforeEach(() => {
    manager = new FineTuningManager({ workDir: os.tmpdir(), modelsDir: os.tmpdir() });
  });

  test('detectBackend returns null or a string backend name', async () => {
    const backend = await manager.detectBackend();
    expect(backend === null || typeof backend === 'string').toBe(true);
    if (backend !== null) {
      expect(['unsloth', 'llamacpp', 'ollama-create']).toContain(backend);
    }
  });

  test('checkAvailability returns an object with python/pip/unsloth/llamacpp flags', async () => {
    const avail = await manager.checkAvailability();
    expect(typeof avail.python).toBe('boolean');
    expect(typeof avail.pip).toBe('boolean');
    expect(typeof avail.unsloth).toBe('boolean');
    expect(typeof avail.llamacpp).toBe('boolean');
    expect(typeof avail.recommendation).toBe('string');
  });
});

describe('FineTuningManager — startJob', () => {
  let manager;
  let tmpDir;
  let datasetPath;

  beforeAll(() => {
    tmpDir = os.tmpdir();
    datasetPath = path.join(tmpDir, `ds_test_${Date.now()}.jsonl`);
    fs.writeFileSync(datasetPath, JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }] }) + '\n');
  });

  beforeEach(() => {
    manager = new FineTuningManager({ workDir: tmpDir, modelsDir: tmpDir });
  });

  afterAll(() => {
    try { fs.unlinkSync(datasetPath); } catch {}
  });

  test('startJob with a valid datasetPath creates a job', async () => {
    const result = await manager.startJob({ preset: 'quick', datasetPath, baseModel: 'test-model' });
    expect(result.success).toBe(true);
    expect(result.job).toBeDefined();
    expect(result.job.id).toBeTruthy();
    expect(result.job.status).toBe('ready');
    expect(result.command).toContain('python');
  });

  test('startJob fails when no dataset given', async () => {
    const result = await manager.startJob({ preset: 'quick' });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('startJob fails when a job is already running', async () => {
    const firstResult = await manager.startJob({ preset: 'quick', datasetPath });
    manager._currentJob.status = 'running';
    const secondResult = await manager.startJob({ preset: 'quick', datasetPath });
    expect(secondResult.success).toBe(false);
    expect(secondResult.error).toMatch(/already running/i);
  });

  test('getPresets returns preset configs', () => {
    const presets = manager.getPresets();
    expect(Object.keys(presets)).toContain('quick');
    expect(Object.keys(presets)).toContain('balanced');
    expect(presets.quick.method).toBe('unsloth');
  });

  test('getJobs returns empty array initially', () => {
    const fresh = new FineTuningManager({ workDir: tmpDir, modelsDir: tmpDir });
    expect(fresh.getJobs()).toEqual([]);
  });
});

describe('FineTuningManager — runJob', () => {
  let manager;
  let tmpDir;
  let datasetPath;

  beforeAll(() => {
    tmpDir = os.tmpdir();
    datasetPath = path.join(tmpDir, `ds_run_${Date.now()}.jsonl`);
    fs.writeFileSync(datasetPath, JSON.stringify({ messages: [] }) + '\n');
  });

  beforeEach(() => {
    manager = new FineTuningManager({ workDir: tmpDir, modelsDir: tmpDir });
  });

  test('runJob returns started:false when no job exists', async () => {
    const result = await manager.runJob('nonexistent-id');
    expect(result.started).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('runJob after startJob returns started:true with a pid', async () => {
    const jobResult = await manager.startJob({ preset: 'quick', datasetPath });
    expect(jobResult.success).toBe(true);
    // The script file was created — now try to run (will fail quickly since python script is invalid,
    // but we just test that it spawned)
    const runResult = await manager.runJob(jobResult.job.id);
    expect(runResult.started).toBe(true);
    expect(typeof runResult.pid).toBe('number');
    expect(runResult.jobId).toBe(jobResult.job.id);
  }, 10000);
});
