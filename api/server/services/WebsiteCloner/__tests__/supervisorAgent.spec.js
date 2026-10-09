'use strict';

const { SupervisorAgent, AGENT_DEFS } = require('../SupervisorAgent');

describe('SupervisorAgent', () => {
  test('AGENT_DEFS has 11 agents', () => {
    expect(AGENT_DEFS.length).toBe(11);
    expect(AGENT_DEFS.every((a) => a.id && a.name && a.role)).toBe(true);
  });

  test('getAgentDefs returns all agent definitions', () => {
    const sv = new SupervisorAgent();
    expect(sv.getAgentDefs().length).toBe(11);
  });

  test('listRuns returns empty initially', () => {
    const sv = new SupervisorAgent();
    expect(sv.listRuns()).toHaveLength(0);
  });

  test('orchestrate with fallback fetch completes', async () => {
    const sv = new SupervisorAgent({
      clonerService: { clone: async () => ({ html: '<html><head><title>Test</title></head><body><h1>Hello</h1><img src="x.png" alt="logo"></body></html>', url: 'http://example.com' }) },
    });

    const run = await sv.orchestrate('http://example.com');
    expect(run.id).toMatch(/^sv_run_/);
    expect(run.status).toBe('completed');
    expect(run.skills_executed.length).toBeGreaterThan(0);
    expect(run.scaffold).toBeDefined();
  });

  test('orchestrate marks run as failed when navigator fails', async () => {
    const sv = new SupervisorAgent({
      clonerService: { clone: async () => { throw new Error('fetch failed'); } },
    });
    sv.on('agent_error', () => {}); // suppress unhandled agent_error
    const run = await sv.orchestrate('http://bad.example');
    expect(run.status).toBe('failed');
    expect(run.error).toContain('Navigator failed');
  });

  test('emits start and complete events', async () => {
    const sv = new SupervisorAgent({
      clonerService: { clone: async () => ({ html: '<html><body>hi</body></html>' }) },
    });
    const events = [];
    sv.on('start', () => events.push('start'));
    sv.on('complete', () => events.push('complete'));
    sv.on('agent_error', () => {}); // suppress unhandled error events
    await sv.orchestrate('http://test.com');
    expect(events).toContain('start');
    expect(events).toContain('complete');
  });

  test('SEO extraction finds title', async () => {
    const sv = new SupervisorAgent({
      clonerService: { clone: async () => ({ html: '<html><head><title>My Site</title></head><body></body></html>' }) },
    });
    const run = await sv.orchestrate('http://test.com');
    expect(run.agents.seo?.result?.title).toBe('My Site');
  });
});
