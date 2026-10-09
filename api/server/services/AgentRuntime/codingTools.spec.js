/**
 * codingTools.spec.js — Fase 3: tests del wrapper de coding tools locales.
 * Verifica que el SDK expone las coding tools y que el filtering de permisos
 * cumple la política de seguridad (readOnly excluye mutadoras).
 */

const {
  RiskLevel,
  ToolCategory,
  TOOL_METADATA,
  buildLocalExecutionConfig,
  filterToolsByPermission,
  getCodingToolDefinitions,
  getCodingToolRegistry,
  resolveCodingTools,
  listAvailableCodingToolNames,
} = require('./codingTools');

describe('codingTools (Fase 3 — Tool Runtime)', () => {
  describe('constantes y metadatos', () => {
    it('expone niveles de riesgo y categorías', () => {
      expect(RiskLevel).toEqual({
        LOW: 'low',
        MEDIUM: 'medium',
        HIGH: 'high',
      });
      expect(Object.values(ToolCategory).length).toBeGreaterThan(0);
    });

    it('TOOL_METADATA clasifica bash/execute_code como HIGH riesgo y mutadoras', () => {
      const { Constants } = require('@librechat/agents');
      expect(TOOL_METADATA[Constants.BASH_TOOL].risk).toBe(RiskLevel.HIGH);
      expect(TOOL_METADATA[Constants.BASH_TOOL].mutates).toBe(true);
      expect(TOOL_METADATA[Constants.EXECUTE_CODE].risk).toBe(RiskLevel.HIGH);
      expect(TOOL_METADATA[Constants.EXECUTE_CODE].mutates).toBe(true);
    });

    it('TOOL_METADATA clasifica read/grep/glob como LOW riesgo y solo-lectura', () => {
      const { Constants } = require('@librechat/agents');
      expect(TOOL_METADATA[Constants.READ_FILE].risk).toBe(RiskLevel.LOW);
      expect(TOOL_METADATA[Constants.READ_FILE].mutates).toBe(false);
      expect(TOOL_METADATA[Constants.GREP_SEARCH].mutates).toBe(false);
      expect(TOOL_METADATA[Constants.GLOB_SEARCH].mutates).toBe(false);
    });
  });

  describe('buildLocalExecutionConfig', () => {
    it('defaults seguros: readOnly, fileCheckpointing, postEditSyntaxCheck', () => {
      const cfg = buildLocalExecutionConfig();
      expect(cfg.readOnly).toBe(true);
      expect(cfg.fileCheckpointing).toBe(true);
      expect(cfg.postEditSyntaxCheck).toBe(true);
      expect(cfg.timeoutMs).toBe(120000);
    });

    it('acota el workspace root cuando se indica', () => {
      const cfg = buildLocalExecutionConfig({ workspaceRoot: '/tmp/proj' });
      expect(cfg.workspace).toEqual({ root: '/tmp/proj' });
      expect(cfg.cwd).toBe('/tmp/proj');
    });

    it('respeta overrides del caller', () => {
      const cfg = buildLocalExecutionConfig({ readOnly: false, timeoutMs: 5000 });
      expect(cfg.readOnly).toBe(false);
      expect(cfg.timeoutMs).toBe(5000);
    });
  });

  describe('filterToolsByPermission', () => {
    const makeTools = (names) => names.map((n) => ({ name: n }));

    it('en modo solo-lectura excluye tools mutadoras', () => {
      const { Constants } = require('@librechat/agents');
      const tools = makeTools([
        Constants.READ_FILE,
        Constants.WRITE_FILE,
        Constants.BASH_TOOL,
        Constants.GREP_SEARCH,
      ]);
      const allowed = filterToolsByPermission(tools, { read: true });
      const names = allowed.map((t) => t.name);
      expect(names).toContain(Constants.READ_FILE);
      expect(names).toContain(Constants.GREP_SEARCH);
      expect(names).not.toContain(Constants.WRITE_FILE);
      expect(names).not.toContain(Constants.BASH_TOOL);
    });

    it('con permiso de escritura incluye write/edit', () => {
      const { Constants } = require('@librechat/agents');
      const tools = makeTools([Constants.READ_FILE, Constants.WRITE_FILE, Constants.EDIT_FILE]);
      const allowed = filterToolsByPermission(tools, { read: true, write: true });
      const names = allowed.map((t) => t.name);
      expect(names).toContain(Constants.WRITE_FILE);
      expect(names).toContain(Constants.EDIT_FILE);
    });

    it('con permiso de ejecución incluye bash/execute_code', () => {
      const { Constants } = require('@librechat/agents');
      const tools = makeTools([Constants.BASH_TOOL, Constants.EXECUTE_CODE, Constants.READ_FILE]);
      const allowed = filterToolsByPermission(tools, {
        read: true,
        execute: true,
      });
      const names = allowed.map((t) => t.name);
      expect(names).toContain(Constants.BASH_TOOL);
      expect(names).toContain(Constants.EXECUTE_CODE);
    });

    it('tools sin metadatos se permiten (no se bloquean por defecto)', () => {
      const tools = makeTools(['unknown_custom_tool']);
      const allowed = filterToolsByPermission(tools, { read: true });
      expect(allowed).toHaveLength(1);
    });
  });

  describe('catálogos del SDK', () => {
    it('getCodingToolDefinitions devuelve un array', () => {
      const defs = getCodingToolDefinitions();
      expect(Array.isArray(defs)).toBe(true);
    });

    it('getCodingToolRegistry devuelve un Map', () => {
      const reg = getCodingToolRegistry();
      expect(reg).toBeInstanceOf(Map);
    });

    it('listAvailableCodingToolNames incluye las tools clave', () => {
      const { Constants } = require('@librechat/agents');
      const names = listAvailableCodingToolNames();
      expect(names).toContain(Constants.READ_FILE);
      expect(names).toContain(Constants.GREP_SEARCH);
      expect(names).toContain(Constants.BASH_TOOL);
      expect(names).toContain(Constants.COMPILE_CHECK);
    });
  });

  describe('resolveCodingTools (Tool Router)', () => {
    it('sin permisos de escritura no devuelve tools mutadoras', () => {
      const { Constants } = require('@librechat/agents');
      const tools = resolveCodingTools([], { permissions: { read: true } });
      const names = tools.map((t) => t.name);
      expect(names).toContain(Constants.READ_FILE);
      expect(names).toContain(Constants.GREP_SEARCH);
      expect(names).not.toContain(Constants.WRITE_FILE);
      expect(names).not.toContain(Constants.BASH_TOOL);
    });

    it('filtra por nombres solicitados', () => {
      const { Constants } = require('@librechat/agents');
      const tools = resolveCodingTools([Constants.READ_FILE], {
        permissions: { read: true },
      });
      const names = tools.map((t) => t.name);
      expect(names).toEqual([Constants.READ_FILE]);
    });
  });
});
