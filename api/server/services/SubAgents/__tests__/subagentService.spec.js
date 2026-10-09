/**
 * subagentService.spec.js — Fase 11: Subagents (roles bajo demanda).
 */

const { SubagentRole, ROLE_PROFILES, SubagentService } = require('../subagentService');
const { Action, Decision } = require('../../Security/agentFirewall');
const { MemoryService, MemoryLayer } = require('../../Memory/memoryService');

describe('subagentService (Fase 11 — Subagents)', () => {
  describe('ROLE_PROFILES', () => {
    it('tiene los 6 roles del doc', () => {
      expect(Object.keys(ROLE_PROFILES).sort()).toEqual(
        [
          SubagentRole.EXPLORER,
          SubagentRole.RESEARCHER,
          SubagentRole.CODER,
          SubagentRole.TESTER,
          SubagentRole.REVIEWER,
          SubagentRole.SECURITY,
        ].sort(),
      );
    });

    it('cada rol tiene systemPrompt, tools, policy, memoryLayers', () => {
      for (const p of Object.values(ROLE_PROFILES)) {
        expect(typeof p.systemPrompt).toBe('string');
        expect(p.systemPrompt.length).toBeGreaterThan(10);
        expect(Array.isArray(p.allowedTools)).toBe(true);
        expect(p.allowedTools.length).toBeGreaterThan(0);
        expect(['restricted', 'standard', 'full']).toContain(p.policy);
        expect(Array.isArray(p.memoryLayers)).toBe(true);
      }
    });

    it('roles read-only no pueden escribir (canWrite false)', () => {
      expect(ROLE_PROFILES[SubagentRole.EXPLORER].canWrite).toBe(false);
      expect(ROLE_PROFILES[SubagentRole.RESEARCHER].canWrite).toBe(false);
      expect(ROLE_PROFILES[SubagentRole.REVIEWER].canWrite).toBe(false);
      expect(ROLE_PROFILES[SubagentRole.SECURITY].canWrite).toBe(false);
    });

    it('Coder y Tester pueden escribir', () => {
      expect(ROLE_PROFILES[SubagentRole.CODER].canWrite).toBe(true);
      expect(ROLE_PROFILES[SubagentRole.TESTER].canWrite).toBe(true);
    });

    it('Explorer no tiene write_file en tools', () => {
      expect(ROLE_PROFILES[SubagentRole.EXPLORER].allowedTools).not.toContain('write_file');
    });
  });

  describe('SubagentService.dispatch', () => {
    it('despacha un rol con contexto independiente', () => {
      const svc = new SubagentService({});
      const td = svc.dispatch({
        role: SubagentRole.CODER,
        task: 'arregla el bug en auth.js',
      });
      expect(td.role).toBe(SubagentRole.CODER);
      expect(td.task).toContain('bug');
      expect(td.systemPrompt).toBeDefined();
      expect(td.allowedTools).toContain('write_file');
      expect(td.policy).toBe('standard');
      expect(td.canWrite).toBe(true);
    });

    it('lanza error para rol desconocido', () => {
      const svc = new SubagentService({});
      expect(() => svc.dispatch({ role: 'unknown', task: 'x' })).toThrow();
    });

    it('inyecta memoria por relevancia filtrada por las capas del rol', () => {
      const mem = new MemoryService();
      mem.remember({ layer: MemoryLayer.PROJECT, content: 'auth usa JWT', tags: ['auth'] });
      mem.remember({ layer: MemoryLayer.HISTORICAL, content: 'patrón viejo', tags: ['auth'] });
      const svc = new SubagentService({ memoryService: mem });
      // Coder usa PROJECT + SESSION + SHORT, no HISTORICAL
      const td = svc.dispatch({ role: SubagentRole.CODER, task: 'auth' });
      const layers = td.memoryContext.map((e) => e.layer);
      expect(layers).toContain(MemoryLayer.PROJECT);
      expect(layers).not.toContain(MemoryLayer.HISTORICAL);
    });

    it('contexto es independiente por rol (distinct system prompts)', () => {
      const svc = new SubagentService({});
      const coder = svc.dispatch({ role: SubagentRole.CODER, task: 'x' });
      const reviewer = svc.dispatch({ role: SubagentRole.REVIEWER, task: 'x' });
      expect(coder.systemPrompt).not.toBe(reviewer.systemPrompt);
      expect(coder.canWrite).not.toBe(reviewer.canWrite);
    });

    it('extraContext se inyecta', () => {
      const svc = new SubagentService({});
      const td = svc.dispatch({
        role: SubagentRole.CODER,
        task: 'x',
        extraContext: { files: ['a.js'] },
      });
      expect(td.extraContext).toEqual({ files: ['a.js'] });
    });
  });

  describe('SubagentService.listRoles / getProfile', () => {
    it('listRoles devuelve los 6', () => {
      const svc = new SubagentService({});
      expect(svc.listRoles().length).toBe(6);
    });

    it('getProfile devuelve el perfil', () => {
      const svc = new SubagentService({});
      const p = svc.getProfile(SubagentRole.SECURITY);
      expect(p.policy).toBe('restricted');
    });

    it('getProfile null para rol desconocido', () => {
      const svc = new SubagentService({});
      expect(svc.getProfile('nope')).toBeNull();
    });
  });

  describe('authorizeAction', () => {
    it('deniega acción no permitida para el rol', () => {
      const svc = new SubagentService({});
      const r = svc.authorizeAction(SubagentRole.EXPLORER, {
        action: Action.WRITE_FILE,
        filePath: './a.js',
      });
      expect(r.decision).toBe(Decision.DENY);
      expect(r.reason).toContain('no permitida');
    });

    it('permite acción dentro del allowlist del rol', () => {
      const svc = new SubagentService({});
      const r = svc.authorizeAction(SubagentRole.EXPLORER, {
        action: Action.READ_FILE,
        filePath: './src/a.js',
      });
      // sin firewall → allow (modo testing); con firewall validaríamos restricted
      expect(r.decision).toBe(Decision.ALLOW);
    });

    it('con firewall aplica la policy del rol', () => {
      const firewall = {
        check: () => ({
          decision: Decision.DENY,
          reason: 'firewall deny',
          resource: 'filesystem',
        }),
      };
      const svc = new SubagentService({ firewall });
      const r = svc.authorizeAction(SubagentRole.CODER, {
        action: Action.WRITE_FILE,
        filePath: './a.js',
      });
      expect(r.decision).toBe(Decision.DENY);
    });
  });
});
