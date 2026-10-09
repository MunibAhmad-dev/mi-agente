/**
 * codeIntelligence.spec.js — Fase 5: symbol index + dependency graph + blast radius.
 */

const path = require('path');
const {
  SymbolKind,
  languageOf,
  parseJavaScriptSource,
  CodeIntelligenceService,
} = require('../codeIntelligence');

describe('codeIntelligence (Fase 5 — Code Intelligence)', () => {
  describe('languageOf', () => {
    it('detecta extensión soportada', () => {
      expect(languageOf('a.js')).toBe('js');
      expect(languageOf('b.tsx')).toBe('tsx');
      expect(languageOf('c.py')).toBe('py');
    });
    it('devuelve null para extensión no soportada', () => {
      expect(languageOf('a.md')).toBeNull();
      expect(languageOf('b.json')).toBeNull();
    });
  });

  describe('parseJavaScriptSource', () => {
    const src = `
const { foo } = require('./utils');
import bar from './bar';
export function doThing() { return 1; }
const arrow = (x) => x + 1;
class MyClass {
  methodA() {}
  async methodB(p) { return p; }
}
export default class Default {}
interface Iface {}
type MyType = string;
if (x) {}
for (let i of xs) {}
`;

    const { symbols, imports } = parseJavaScriptSource(src, 'ts');

    it('extrae imports ESM y CJS', () => {
      const froms = imports.map((i) => i.from);
      expect(froms).toContain('./utils');
      expect(froms).toContain('./bar');
      const cjs = imports.find((i) => i.kind === 'cjs');
      expect(cjs.spec).toBe('{ foo }');
    });

    it('extrae funciones y arrow functions', () => {
      const names = symbols.map((s) => s.name);
      expect(names).toContain('doThing');
      expect(names).toContain('arrow');
      const fn = symbols.find((s) => s.name === 'doThing' && s.kind === SymbolKind.FUNCTION);
      expect(fn).toBeDefined();
      expect(fn.exported).toBe(true);
    });

    it('extrae clases y métodos', () => {
      const names = symbols.map((s) => s.name);
      expect(names).toContain('MyClass');
      expect(names).toContain('methodA');
      expect(names).toContain('methodB');
      const cls = symbols.find((s) => s.name === 'MyClass');
      expect(cls.kind).toBe(SymbolKind.CLASS);
    });

    it('extrae interface y type en TS', () => {
      const names = symbols.map((s) => s.name);
      expect(names).toContain('Iface');
      expect(names).toContain('MyType');
    });

    it('no confunde if/for con símbolos', () => {
      const names = symbols.map((s) => s.name);
      expect(names).not.toContain('if');
      expect(names).not.toContain('of');
    });
  });

  describe('CodeIntelligenceService', () => {
    it('indexFile extrae símbolos y resuelve imports relativos', () => {
      const svc = new CodeIntelligenceService();
      svc.indexFile('/proj/utils.js', 'export function foo() {}');
      const r = svc.indexFile('/proj/main.js', "const { foo } = require('./utils');");
      expect(r.symbols).toBe(0);
      expect(r.imports).toBe(1);
      // la dependencia se resuelve al archivo indexado
      const deps = svc.findDependencies('/proj/main.js');
      expect(deps).toContain('/proj/utils.js');
    });

    it('findDefinitions localiza dónde se define un símbolo', () => {
      const svc = new CodeIntelligenceService();
      svc.indexFile('/proj/a.js', 'function alpha() {}');
      svc.indexFile('/proj/b.js', 'const alpha = () => {};');
      const defs = svc.findDefinitions('alpha');
      expect(defs).toHaveLength(2);
      expect(defs.map((d) => d.file).sort()).toEqual(['/proj/a.js', '/proj/b.js']);
    });

    it('findDependents encuentra quién importa un archivo', () => {
      const svc = new CodeIntelligenceService();
      svc.indexFile('/proj/base.js', 'export const x = 1;');
      svc.indexFile('/proj/mid.js', "import { x } from './base';");
      svc.indexFile('/proj/top.js', "import y from './mid';");
      expect(svc.findDependents('/proj/base.js')).toContain('/proj/mid.js');
      expect(svc.findDependents('/proj/mid.js')).toContain('/proj/top.js');
    });

    it('computeBlastRadius propaga transitivamente', () => {
      const svc = new CodeIntelligenceService();
      svc.indexFile('/proj/leaf.js', 'export const v = 1;');
      svc.indexFile('/proj/mid.js', "import { v } from './leaf';");
      svc.indexFile('/proj/top.js', "import { v2 } from './mid';");
      const affected = svc.computeBlastRadius('/proj/leaf.js');
      expect(affected).toContain('/proj/leaf.js');
      expect(affected).toContain('/proj/mid.js');
      expect(affected).toContain('/proj/top.js');
    });

    it('computeBlastRadius acepta múltiples archivos semilla', () => {
      const svc = new CodeIntelligenceService();
      svc.indexFile('/proj/a.js', 'export const a = 1;');
      svc.indexFile('/proj/b.js', 'export const b = 2;');
      svc.indexFile('/proj/c.js', "import { a } from './a'; import { b } from './b';");
      const affected = svc.computeBlastRadius(['/proj/a.js', '/proj/b.js']);
      expect(affected).toContain('/proj/c.js');
    });

    it('no se cuela en imports de paquete (no relativos)', () => {
      const svc = new CodeIntelligenceService();
      svc.indexFile('/proj/a.js', "const x = require('lodash');");
      // lodash no se resuelve (no indexado), no genera arista falsa
      expect(svc.findDependencies('/proj/a.js')).toHaveLength(0);
    });

    it('stats reporta conteos', () => {
      const svc = new CodeIntelligenceService();
      svc.indexFile('/proj/a.js', 'export const x = 1;');
      svc.indexFile('/proj/b.js', "import { x } from './a';");
      const s = svc.stats();
      expect(s.files).toBe(2);
      expect(s.symbols).toBeGreaterThanOrEqual(1);
      expect(s.totalEdges).toBe(1);
    });

    it('indexDirectory indexa un árbol real (temporal)', () => {
      const os = require('os');
      const tmp = path.join(os.tmpdir(), `ci-test-${Date.now()}`);
      const fs = require('fs');
      fs.mkdirSync(path.join(tmp, 'sub'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'a.js'), 'export const a = 1;');
      fs.writeFileSync(path.join(tmp, 'sub', 'b.js'), "import { a } from '../a';");
      fs.writeFileSync(path.join(tmp, 'ignore.txt'), 'no code');
      const svc = new CodeIntelligenceService();
      const r = svc.indexDirectory(tmp);
      expect(r.files).toBe(2);
      expect(svc.findDependents(path.join(tmp, 'a.js'))).toContain(path.join(tmp, 'sub', 'b.js'));
      fs.rmSync(tmp, { recursive: true, force: true });
    });
  });
});
