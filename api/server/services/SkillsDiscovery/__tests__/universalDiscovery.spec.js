'use strict';

/**
 * universalDiscovery.spec.js — Phase 15: Universal Capability Discovery Engine tests.
 */

const {
  UniversalCapabilityDiscovery,
  UniversalNormalizer,
  CompatibilityEngine,
  CapabilitySecurityEngine,
  CapabilitySandboxEngine,
  EvaluationEngine,
  UniversalRegistry,
  AISkillCreator,
  SkillFormat,
} = require('../UniversalCapabilityDiscovery');

describe('UniversalCapabilityDiscovery — Phase 15', () => {
  // -------------------------------------------------------------------------
  // UniversalNormalizer
  // -------------------------------------------------------------------------
  describe('UniversalNormalizer', () => {
    const normalizer = new UniversalNormalizer();

    it('normalizes a Claude-format skill', () => {
      const raw = {
        name: 'code-review-skill',
        description: 'Automated code review',
        version: '2.0.0',
        tools: [{ name: 'analyze_code' }],
        permissions: ['filesystem:read'],
      };
      const result = normalizer.normalize(raw, SkillFormat.CLAUDE);
      expect(result.name).toBe('code-review-skill');
      expect(result.description).toBe('Automated code review');
      expect(result.version).toBe('2.0.0');
      expect(result.format).toBe(SkillFormat.CLAUDE);
      expect(result.tools).toHaveLength(1);
    });

    it('normalizes an MCP-format skill', () => {
      const raw = {
        name: 'filesystem-mcp',
        description: 'Filesystem MCP server',
        tools: ['read_file', 'write_file', 'list_dir'],
        version: '1.1.0',
      };
      const result = normalizer.normalize(raw, SkillFormat.MCP);
      expect(result.name).toBe('filesystem-mcp');
      expect(result.format).toBe(SkillFormat.MCP);
      expect(result.tools).toHaveLength(3);
    });

    it('normalizes a Copilot-format skill using displayName', () => {
      const raw = {
        displayName: 'GitHub Copilot Extension',
        shortDescription: 'Code completion assistant',
        functions: [{ name: 'complete_code' }, { name: 'explain_code' }],
      };
      const result = normalizer.normalize(raw, SkillFormat.COPILOT);
      expect(result.name).toBe('GitHub Copilot Extension');
      expect(result.format).toBe(SkillFormat.COPILOT);
      expect(result.tools).toHaveLength(2);
    });

    it('generates a stable id for unknown format', () => {
      const raw = { name: 'my-tool', description: 'A tool' };
      const r1 = normalizer.normalize(raw, SkillFormat.UNKNOWN);
      const r2 = normalizer.normalize(raw, SkillFormat.UNKNOWN);
      expect(r1.id).toBe(r2.id);
    });

    it('handles null/undefined gracefully', () => {
      const result = normalizer.normalize(null, null);
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe('unnamed');
    });
  });

  // -------------------------------------------------------------------------
  // CompatibilityEngine
  // -------------------------------------------------------------------------
  describe('CompatibilityEngine', () => {
    const compat = new CompatibilityEngine();

    it('returns high score for well-formed skill', () => {
      const skill = {
        id: 'cap_test',
        name: 'well-formed-skill',
        description: 'A well-described skill for code analysis',
        format: SkillFormat.CLAUDE,
        tools: [],
        license: 'MIT',
      };
      const result = compat.check(skill);
      expect(result.compatible).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0.8);
      expect(result.issues).toHaveLength(0);
    });

    it('flags missing name as an issue', () => {
      const skill = {
        id: 'cap_bad',
        name: 'unnamed',
        description: '',
        format: SkillFormat.UNKNOWN,
        tools: [],
        license: 'GPL-3.0',
      };
      const result = compat.check(skill);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(1.0);
    });

    it('returns fixes array alongside issues', () => {
      const skill = { id: 'cap_x', name: 'unnamed', description: '', format: SkillFormat.UNKNOWN, tools: [] };
      const result = compat.check(skill);
      expect(Array.isArray(result.fixes)).toBe(true);
    });

    it('penalizes non-permissive licenses', () => {
      const permissive = { id: 'a', name: 'good', description: 'ok', format: SkillFormat.CLAUDE, tools: [], license: 'MIT' };
      const restrictive = { id: 'b', name: 'bad', description: 'ok', format: SkillFormat.CLAUDE, tools: [], license: 'GPL-3.0' };
      const rPermissive = compat.check(permissive);
      const rRestrictive = compat.check(restrictive);
      expect(rPermissive.score).toBeGreaterThan(rRestrictive.score);
    });
  });

  // -------------------------------------------------------------------------
  // EvaluationEngine
  // -------------------------------------------------------------------------
  describe('EvaluationEngine', () => {
    const evaluator = new EvaluationEngine();

    it('returns evaluation with all dimensional scores', () => {
      const skill = {
        name: 'test-skill',
        description: 'A skill with many tools and tests',
        tools: [{ name: 'tool_a' }, { name: 'tool_b' }],
        hasTests: true,
        format: SkillFormat.CLAUDE,
      };
      const results = {
        compatibility: { compatible: true, score: 0.9, issues: [], fixes: [] },
        security: { safe: true, risks: [], severity: 'none' },
      };
      const eval_ = evaluator.evaluate(skill, results);
      expect(eval_).toHaveProperty('score');
      expect(eval_).toHaveProperty('dimensions');
      expect(eval_.dimensions).toHaveProperty('accuracy');
      expect(eval_.dimensions).toHaveProperty('latency');
      expect(eval_.dimensions).toHaveProperty('safety');
      expect(eval_.dimensions).toHaveProperty('usefulness');
      expect(eval_.dimensions).toHaveProperty('compatibility');
      expect(eval_.score).toBeGreaterThan(0);
      expect(eval_.score).toBeLessThanOrEqual(1);
    });

    it('penalizes unsafe skills in safety dimension', () => {
      const skill = { name: 'risky', description: 'x', tools: [], hasTests: false };
      const safeResult = { compatibility: { score: 0.8 }, security: { severity: 'none' } };
      const unsafeResult = { compatibility: { score: 0.8 }, security: { severity: 'critical' } };
      const evalSafe = evaluator.evaluate(skill, safeResult);
      const evalUnsafe = evaluator.evaluate(skill, unsafeResult);
      expect(evalSafe.dimensions.safety).toBeGreaterThan(evalUnsafe.dimensions.safety);
    });
  });

  // -------------------------------------------------------------------------
  // UniversalRegistry
  // -------------------------------------------------------------------------
  describe('UniversalRegistry', () => {
    it('registers a skill and retrieves it', () => {
      const reg = new UniversalRegistry();
      const skill = { id: 'cap_reg1', name: 'my-skill', format: SkillFormat.CLAUDE, description: 'test' };
      const evaluation = { score: 0.85, dimensions: {} };
      reg.register(skill, evaluation);
      expect(reg.size).toBe(1);
      const entries = reg.list({});
      expect(entries).toHaveLength(1);
      expect(entries[0].skill.name).toBe('my-skill');
    });

    it('findBest returns highest-scoring match for a task', () => {
      const reg = new UniversalRegistry();
      const skillA = { id: 'cap_a', name: 'code-analyzer', description: 'Analyze code quality', format: SkillFormat.CLAUDE };
      const skillB = { id: 'cap_b', name: 'web-fetcher', description: 'Fetch web pages', format: SkillFormat.MCP };
      reg.register(skillA, { score: 0.9 });
      reg.register(skillB, { score: 0.5 });

      const best = reg.findBest('code analysis');
      expect(best).not.toBeNull();
      expect(best.skill.name).toBe('code-analyzer');
    });

    it('returns null findBest when registry is empty', () => {
      const reg = new UniversalRegistry();
      expect(reg.findBest('any task')).toBeNull();
    });

    it('filters by format', () => {
      const reg = new UniversalRegistry();
      reg.register({ id: 'a', name: 'claude-skill', format: SkillFormat.CLAUDE }, { score: 0.8 });
      reg.register({ id: 'b', name: 'mcp-skill', format: SkillFormat.MCP }, { score: 0.7 });
      const claudeOnly = reg.list({ format: SkillFormat.CLAUDE });
      expect(claudeOnly).toHaveLength(1);
      expect(claudeOnly[0].skill.format).toBe(SkillFormat.CLAUDE);
    });

    it('getStats returns total, byFormat, avgScore, topSkills', () => {
      const reg = new UniversalRegistry();
      reg.register({ id: 'x', name: 'skill-x', format: SkillFormat.CLAUDE }, { score: 0.9 });
      reg.register({ id: 'y', name: 'skill-y', format: SkillFormat.MCP }, { score: 0.7 });
      const stats = reg.getStats();
      expect(stats.total).toBe(2);
      expect(stats.byFormat[SkillFormat.CLAUDE]).toBe(1);
      expect(stats.avgScore).toBe(0.8);
      expect(Array.isArray(stats.topSkills)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // AISkillCreator
  // -------------------------------------------------------------------------
  describe('AISkillCreator', () => {
    const creator = new AISkillCreator();

    it('produces a valid skill template from task description', () => {
      const result = creator.create('Read and write files on the local filesystem');
      expect(result).not.toHaveProperty('error');
      expect(result.name).toBeDefined();
      expect(result.description).toBeDefined();
      expect(result.version).toBe('1.0.0');
      expect(result.format).toBe(SkillFormat.CLAUDE);
      expect(typeof result.template).toBe('string');
    });

    it('infers file_operations tool from file-related description', () => {
      const result = creator.create('Read and write configuration files');
      expect(result.tools.find((t) => t.name === 'file_operations')).toBeDefined();
    });

    it('infers web_search tool from search-related description', () => {
      const result = creator.create('Search the web for latest documentation');
      expect(result.tools.find((t) => t.name === 'web_search')).toBeDefined();
    });

    it('returns error for empty task description', () => {
      const result = creator.create('');
      expect(result.error).toBeDefined();
    });

    it('generates stable name from task description', () => {
      const r1 = creator.create('Deploy a docker container');
      const r2 = creator.create('Deploy a docker container');
      expect(r1.name).toBe(r2.name);
    });
  });

  // -------------------------------------------------------------------------
  // CapabilitySecurityEngine
  // -------------------------------------------------------------------------
  describe('CapabilitySecurityEngine', () => {
    const sec = new CapabilitySecurityEngine();

    it('flags skills containing dangerous patterns', () => {
      const skill = {
        name: 'danger-skill',
        description: 'Runs rm -rf on temp dirs',
        tools: [],
        raw: { script: 'rm -rf /tmp/*' },
      };
      const result = sec.scan(skill);
      expect(result.safe).toBe(false);
      expect(result.risks.length).toBeGreaterThan(0);
      expect(result.severity).toBe('critical');
    });

    it('passes clean skills with none severity', () => {
      const skill = {
        name: 'safe-skill',
        description: 'Reads JSON config files',
        tools: [{ name: 'read_json' }],
        raw: {},
      };
      const result = sec.scan(skill);
      expect(result.severity).toBe('none');
      expect(result.safe).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // CapabilitySandboxEngine
  // -------------------------------------------------------------------------
  describe('CapabilitySandboxEngine', () => {
    const sandbox = new CapabilitySandboxEngine();

    it('simulates a skill and returns output', () => {
      const skill = {
        name: 'my-skill',
        tools: [{ name: 'read_file' }, { name: 'write_file' }],
      };
      const result = sandbox.simulate(skill, { input: 'test' });
      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(Array.isArray(result.sideEffects)).toBe(true);
      expect(result.sideEffects.length).toBeGreaterThan(0);
    });

    it('reports no side effects for tools without dangerous names', () => {
      const skill = { name: 'calc', tools: [{ name: 'add_numbers' }] };
      const result = sandbox.simulate(skill, {});
      expect(result.sideEffects).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // UniversalCapabilityDiscovery.discover()
  // -------------------------------------------------------------------------
  describe('UniversalCapabilityDiscovery.discover()', () => {
    it('discovers and returns evaluated capabilities', async () => {
      const discovery = new UniversalCapabilityDiscovery();
      const results = await discovery.discover('code review', { sources: ['github'] });
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('skill');
      expect(results[0]).toHaveProperty('evaluation');
    });

    it('populates the registry after discovery', async () => {
      const discovery = new UniversalCapabilityDiscovery();
      await discovery.discover('file management');
      const stats = discovery.getRegistryStats();
      expect(stats.total).toBeGreaterThan(0);
    });
  });
});
