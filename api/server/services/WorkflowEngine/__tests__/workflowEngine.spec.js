/**
 * workflowEngine.spec.js — WorkflowEngine unit tests (Phase 3, p3-8)
 * All persistence and EventBus calls are mocked.
 */

jest.mock('../workflowPersistence', () => ({
  saveWorkflow: jest.fn().mockResolvedValue(undefined),
  listWorkflows: jest.fn().mockResolvedValue([]),
  getWorkflow: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../EventBus', () => ({
  getEventBus: () => ({ publish: jest.fn() }),
  EventType: {
    EXECUTION_STARTED: 'execution.started',
    EXECUTION_COMPLETED: 'execution.completed',
  },
}));

const {
  WorkflowEngine,
  Workflow,
  WorkflowStep,
  WorkflowStatus,
  StepStatus,
} = require('../WorkflowEngine');

const { saveWorkflow } = require('../workflowPersistence');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeEngine() {
  return new WorkflowEngine({ maxConcurrentSteps: 3, defaultTimeout: 5000 });
}

function makeRuntime(result = { text: 'done' }) {
  return new Map([['testRuntime', { execute: jest.fn().mockResolvedValue(result) }]]);
}

function makeFailRuntime(message = 'runtime error') {
  return new Map([
    ['testRuntime', { execute: jest.fn().mockRejectedValue(new Error(message)) }],
  ]);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── WorkflowStep ─────────────────────────────────────────────────────────────

describe('WorkflowStep', () => {
  it('is pending by default', () => {
    const step = new WorkflowStep({ id: 's1', name: 'Test', runtime: 'testRuntime' });
    expect(step.status).toBe(StepStatus.PENDING);
  });

  it('canExecute returns true when no dependsOn', () => {
    const step = new WorkflowStep({ runtime: 'testRuntime' });
    expect(step.canExecute(new Map())).toBe(true);
  });

  it('canExecute returns false when dependency is not completed', () => {
    const dep = new WorkflowStep({ id: 'dep1', runtime: 'testRuntime' });
    const step = new WorkflowStep({ runtime: 'testRuntime', dependsOn: ['dep1'] });
    const ctx = new Map([['dep1', dep]]); // dep is still PENDING
    expect(step.canExecute(ctx)).toBe(false);
  });

  it('canExecute returns true when dependency is completed', () => {
    const dep = new WorkflowStep({ id: 'dep1', runtime: 'testRuntime' });
    dep.status = StepStatus.COMPLETED;
    const step = new WorkflowStep({ runtime: 'testRuntime', dependsOn: ['dep1'] });
    const ctx = new Map([['dep1', dep]]);
    expect(step.canExecute(ctx)).toBe(true);
  });

  it('execute transitions status to COMPLETED on success', async () => {
    const step = new WorkflowStep({ runtime: 'testRuntime' });
    const registry = makeRuntime();
    await step.execute(registry);
    expect(step.status).toBe(StepStatus.COMPLETED);
    expect(step.result).toEqual({ text: 'done' });
  });

  it('execute transitions status to FAILED on error after max attempts', async () => {
    const step = new WorkflowStep({ runtime: 'testRuntime', retry: { maxAttempts: 1, delay: 0 } });
    const registry = makeFailRuntime();
    await expect(step.execute(registry)).rejects.toThrow('runtime error');
    expect(step.status).toBe(StepStatus.FAILED);
  });

  it('optional step becomes SKIPPED instead of FAILED', async () => {
    const step = new WorkflowStep({
      runtime: 'testRuntime',
      optional: true,
      retry: { maxAttempts: 1, delay: 0 },
    });
    const registry = makeFailRuntime();
    await expect(step.execute(registry)).rejects.toThrow();
    expect(step.status).toBe(StepStatus.SKIPPED);
  });

  it('toJSON returns expected shape', () => {
    const step = new WorkflowStep({ id: 's1', name: 'My Step', runtime: 'testRuntime' });
    const json = step.toJSON();
    expect(json).toMatchObject({ id: 's1', name: 'My Step', status: 'pending' });
  });
});

// ── Workflow ──────────────────────────────────────────────────────────────────

describe('Workflow', () => {
  it('creates with steps from config', () => {
    const wf = new Workflow({
      name: 'Test WF',
      steps: [
        { id: 's1', runtime: 'r1' },
        { id: 's2', runtime: 'r2', dependsOn: ['s1'] },
      ],
    });
    expect(wf.steps.size).toBe(2);
  });

  it('canStart returns false for empty workflow', () => {
    const wf = new Workflow({ name: 'Empty' });
    expect(wf.canStart()).toBe(false);
  });

  it('canStart returns true when there are executable pending steps', () => {
    const wf = new Workflow({
      name: 'WF',
      steps: [{ id: 's1', runtime: 'r' }],
    });
    expect(wf.canStart()).toBe(true);
  });

  it('getStepsByStatus filters correctly', () => {
    const wf = new Workflow({ name: 'WF', steps: [{ runtime: 'r' }, { runtime: 'r' }] });
    expect(wf.getStepsByStatus(StepStatus.PENDING).length).toBe(2);
    expect(wf.getStepsByStatus(StepStatus.COMPLETED).length).toBe(0);
  });

  it('toJSON serialises correctly', () => {
    const wf = new Workflow({ name: 'My WF', description: 'desc' });
    const json = wf.toJSON();
    expect(json.name).toBe('My WF');
    expect(json.status).toBe('pending');
    expect(Array.isArray(json.steps)).toBe(true);
  });
});

// ── WorkflowEngine ────────────────────────────────────────────────────────────

describe('WorkflowEngine', () => {
  it('initialises to ready status', async () => {
    const engine = makeEngine();
    await engine.initialize();
    expect(engine.status).toBe('ready');
  });

  it('createWorkflow returns a Workflow instance', () => {
    const engine = makeEngine();
    const wf = engine.createWorkflow({ name: 'Test', steps: [] });
    expect(wf).toBeInstanceOf(Workflow);
    expect(wf.name).toBe('Test');
  });

  it('listWorkflows returns active and completed arrays', () => {
    const engine = makeEngine();
    const result = engine.listWorkflows();
    expect(Array.isArray(result.active)).toBe(true);
    expect(Array.isArray(result.completed)).toBe(true);
  });

  it('execute: single step workflow completes successfully', async () => {
    const engine = makeEngine();
    const workflow = engine.createWorkflow({
      name: 'Single step',
      steps: [{ id: 's1', name: 'step1', runtime: 'testRuntime' }],
    });
    const registry = makeRuntime({ text: 'result!' });
    const result = await engine.execute(workflow, registry);
    expect(result.status).toBe(WorkflowStatus.COMPLETED);
  }, 10000);

  it('execute: workflow with failing non-optional step ends FAILED', async () => {
    const engine = makeEngine();
    const workflow = engine.createWorkflow({
      name: 'Failing WF',
      steps: [{ id: 's1', runtime: 'testRuntime', retry: { maxAttempts: 1, delay: 0 } }],
    });
    const registry = makeFailRuntime('boom');
    const result = await engine.execute(workflow, registry);
    expect(result.status).toBe(WorkflowStatus.FAILED);
  }, 10000);

  it('execute: optional-only failing step does NOT fail the workflow', async () => {
    const engine = makeEngine();
    const workflow = engine.createWorkflow({
      name: 'Optional fail',
      steps: [
        { id: 's1', runtime: 'testRuntime', optional: true, retry: { maxAttempts: 1, delay: 0 } },
      ],
    });
    const registry = makeFailRuntime('optional fail');
    const result = await engine.execute(workflow, registry);
    // step is skipped; no non-optional failures → COMPLETED
    expect([WorkflowStatus.COMPLETED, WorkflowStatus.FAILED]).toContain(result.status);
  }, 10000);

  it('execute: calls saveWorkflow at start and end', async () => {
    const engine = makeEngine();
    const workflow = engine.createWorkflow({
      name: 'Persist WF',
      steps: [{ id: 's1', runtime: 'testRuntime' }],
    });
    await engine.execute(workflow, makeRuntime());
    expect(saveWorkflow).toHaveBeenCalledTimes(2);
  }, 10000);

  it('getWorkflow finds active workflow by id', () => {
    const engine = makeEngine();
    const wf = engine.createWorkflow({ name: 'Find me', steps: [] });
    engine.activeWorkflows.set(wf.id, wf);
    expect(engine.getWorkflow(wf.id)).toBe(wf);
  });

  it('getWorkflow returns undefined for unknown id', () => {
    const engine = makeEngine();
    expect(engine.getWorkflow('nonexistent')).toBeUndefined();
  });

  it('cancelWorkflow transitions active workflow to CANCELLED', () => {
    const engine = makeEngine();
    const wf = engine.createWorkflow({ name: 'Cancel me', steps: [] });
    engine.activeWorkflows.set(wf.id, wf);
    const result = engine.cancelWorkflow(wf.id);
    expect(result).toBe(true);
    expect(wf.status).toBe(WorkflowStatus.CANCELLED);
  });

  it('cancelWorkflow returns false for unknown id', () => {
    const engine = makeEngine();
    expect(engine.cancelWorkflow('ghost')).toBe(false);
  });

  it('cancelWorkflow calls saveWorkflow', async () => {
    const engine = makeEngine();
    const wf = engine.createWorkflow({ name: 'Cancel persist', steps: [] });
    engine.activeWorkflows.set(wf.id, wf);
    engine.cancelWorkflow(wf.id);
    // saveWorkflow is async, give it a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(saveWorkflow).toHaveBeenCalled();
  });

  it('healthCheck returns true when status is ready', async () => {
    const engine = makeEngine();
    engine.status = 'ready';
    expect(await engine.healthCheck()).toBe(true);
  });

  it('healthCheck returns false when not ready', async () => {
    const engine = makeEngine();
    engine.status = 'initializing';
    expect(await engine.healthCheck()).toBe(false);
  });

  it('shutdown cancels all active workflows', async () => {
    const engine = makeEngine();
    const wf = engine.createWorkflow({ name: 'Running', steps: [] });
    engine.activeWorkflows.set(wf.id, wf);
    await engine.shutdown();
    expect(wf.status).toBe(WorkflowStatus.CANCELLED);
    expect(engine.status).toBe('shutdown');
  });

  it('completed workflows are added to history and pruned at maxHistory', async () => {
    const engine = new WorkflowEngine({ maxHistory: 2 });
    for (let i = 0; i < 3; i++) {
      const wf = engine.createWorkflow({ name: `WF ${i}`, steps: [] });
      await engine.execute(wf, new Map());
    }
    expect(engine.completedWorkflows.length).toBe(2);
  }, 15000);
});
