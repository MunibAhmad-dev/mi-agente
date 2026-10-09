/**
 * agentRuntime.test.js — test de integración del router /api/agent-runtime.
 * Verifica que los servicios F9-F15 están cableados al HTTP y responden.
 */
const express = require('express');
const request = require('supertest');

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, _res, next) => {
    req.user = { id: 'test-user', role: 'USER' };
    next();
  },
}));

const agentRuntime = require('./agentRuntime');

let app;
beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/agent-runtime', agentRuntime);
});

describe('GET /api/agent-runtime', () => {
  it('F9 — firewall/check valida una acción', async () => {
    const res = await request(app)
      .post('/api/agent-runtime/firewall/check')
      .send({ action: 'read', filePath: '/workspace/project/a.js' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('F10 — memory remember + recall + stats', async () => {
    const create = await request(app)
      .post('/api/agent-runtime/memory')
      .send({ layer: 'PROJECT', content: 'el modelo favorito es deepseek', importance: 0.9 });
    expect(create.status).toBe(200);
    expect(create.body.entry.id).toBeDefined();

    const recall = await request(app).get('/api/agent-runtime/memory?query=modelo');
    expect(recall.status).toBe(200);
    expect(recall.body.entries.length).toBeGreaterThan(0);

    const stats = await request(app).get('/api/agent-runtime/memory/stats');
    expect(stats.status).toBe(200);
    expect(stats.body.stats.total).toBeGreaterThan(0);
  });

  it('F10 — memory remember rechaza sin content', async () => {
    const res = await request(app).post('/api/agent-runtime/memory').send({ layer: 'PROJECT' });
    expect(res.status).toBe(400);
  });

  it('F11 — subagents list roles + dispatch + authorize', async () => {
    const roles = await request(app).get('/api/agent-runtime/subagents/roles');
    expect(roles.status).toBe(200);
    expect(roles.body.roles).toContain('explorer');

    const dispatch = await request(app)
      .post('/api/agent-runtime/subagents/dispatch')
      .send({ role: 'explorer', task: 'explora el directorio src' });
    expect(dispatch.status).toBe(200);
    expect(dispatch.body.descriptor.role).toBe('explorer');

    const auth = await request(app)
      .post('/api/agent-runtime/subagents/authorize')
      .send({ role: 'coder', action: 'write', filePath: '/workspace/project/x.js' });
    expect(auth.status).toBe(200);
    expect(auth.body.decision).toBeDefined();
  });

  it('F11 — dispatch rechaza rol desconocido', async () => {
    const res = await request(app)
      .post('/api/agent-runtime/subagents/dispatch')
      .send({ role: 'nope', task: 't' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
  });

  it('F13 — observability start + step + end + list + get', async () => {
    const start = await request(app)
      .post('/api/agent-runtime/observability/start')
      .send({ task: 'fix bug', modelId: 'deepseek', input: { f: 'a.js' } });
    expect(start.status).toBe(200);
    const traceId = start.body.traceId;

    const step = await request(app)
      .post(`/api/agent-runtime/observability/${traceId}/step`)
      .send({ type: 'model_call', tokensIn: 100, tokensOut: 50 });
    expect(step.status).toBe(200);

    const end = await request(app)
      .post(`/api/agent-runtime/observability/${traceId}/end`)
      .send({ status: 'completed' });
    expect(end.status).toBe(200);
    expect(end.body.trace.status).toBe('completed');

    const list = await request(app).get('/api/agent-runtime/observability');
    expect(list.status).toBe(200);
    expect(list.body.traces.length).toBeGreaterThan(0);

    const get = await request(app).get(`/api/agent-runtime/observability/${traceId}`);
    expect(get.status).toBe(200);
    expect(get.body.trace.traceId).toBe(traceId);
  });

  it('F13 — observability replay + compare', async () => {
    const a = await request(app)
      .post('/api/agent-runtime/observability/start')
      .send({ task: 't', modelId: 'deepseek' });
    await request(app).post(`/api/agent-runtime/observability/${a.body.traceId}/end`).send({});
    const b = await request(app)
      .post(`/api/agent-runtime/observability/${a.body.traceId}/replay`)
      .send({ modelId: 'claude' });
    expect(b.status).toBe(200);
    expect(b.body.replay.modelId).toBe('claude');

    const cmp = await request(app).get(
      `/api/agent-runtime/observability/${a.body.traceId}/compare/${b.body.replay.traceId}`,
    );
    expect(cmp.status).toBe(200);
  });

  it('F14 — evaluation cases + results + compare + score', async () => {
    const c = await request(app)
      .post('/api/agent-runtime/evaluation/cases')
      .send({ name: 'fix', level: 5, task: 't', successCriteria: 'lint' });
    expect(c.status).toBe(200);
    const caseId = c.body.case.id;

    const list = await request(app).get('/api/agent-runtime/evaluation/cases');
    expect(list.status).toBe(200);

    const res = await request(app)
      .post('/api/agent-runtime/evaluation/results')
      .send({
        caseId,
        configuration: 'runtime_full',
        metrics: {
          success: true,
          tokens: 1000,
          latency_ms: 5000,
          retries: 0,
          ram_mb: 512,
          vram_mb: 0,
        },
      });
    expect(res.status).toBe(200);

    const cmp = await request(app).get('/api/agent-runtime/evaluation/compare');
    expect(cmp.status).toBe(200);

    const score = await request(app).get('/api/agent-runtime/evaluation/score/runtime_full');
    expect(score.status).toBe(200);
  });

  it('F15 — optimization recommend + validate + apply', async () => {
    const rec = await request(app).get('/api/agent-runtime/optimization/recommend');
    expect(rec.status).toBe(200);

    const val = await request(app)
      .post('/api/agent-runtime/optimization/validate')
      .send({ maxParallelAgents: 2 });
    expect(val.status).toBe(200);
    expect(val.body.valid).toBe(true);

    const apply = await request(app)
      .post('/api/agent-runtime/optimization/apply')
      .send({ maxParallelAgents: 3 });
    expect(apply.status).toBe(200);
    expect(apply.body.config.maxParallelAgents).toBe(3);
  });
});
