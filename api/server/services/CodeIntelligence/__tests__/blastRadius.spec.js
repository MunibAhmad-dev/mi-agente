/**
 * blastRadius.spec.js — Fase 6: change impact analysis + risk engine.
 */

const { CodeIntelligenceService, SymbolKind } = require('../codeIntelligence');
const { RiskLevel, assessRisk, classifyRisk, analyzeChangeImpact } = require('../blastRadius');

describe('blastRadius (Fase 6 — Blast Radius)', () => {
  describe('classifyRisk', () => {
    it('clasifica scores en niveles correctos', () => {
      expect(classifyRisk(0)).toBe(RiskLevel.LOW);
      expect(classifyRisk(1)).toBe(RiskLevel.LOW);
      expect(classifyRisk(3)).toBe(RiskLevel.MEDIUM);
      expect(classifyRisk(7)).toBe(RiskLevel.HIGH);
      expect(classifyRisk(12)).toBe(RiskLevel.CRITICAL);
      expect(classifyRisk(20)).toBe(RiskLevel.CRITICAL);
    });
  });

  describe('assessRisk', () => {
    it('puntúa por número de archivos afectados', () => {
      const r = assessRisk({ affectedFiles: ['a.js', 'b.js', 'c.js', 'd.js'] });
      expect(r.score).toBeGreaterThan(0);
      expect(r.reasons.some((x) => x.includes('4 archivo'))).toBe(true);
    });

    it('detecta exports públicos afectados', () => {
      const changedSymbols = new Map([['a.js', [{ name: 'doThing', kind: SymbolKind.EXPORT }]]]);
      const r = assessRisk({ affectedFiles: ['a.js'], changedSymbols });
      expect(r.publicExportsAffected).toContain('doThing');
      expect(r.reasons.some((x) => x.includes('export público'))).toBe(true);
    });

    it('suma peso por tipo de símbolo', () => {
      const changedSymbols = new Map([
        [
          'a.js',
          [
            { name: 'exp', kind: SymbolKind.EXPORT },
            { name: 'fn', kind: SymbolKind.FUNCTION },
          ],
        ],
      ]);
      const r = assessRisk({ affectedFiles: [], changedSymbols });
      // EXPORT=3 + FUNCTION=1 = 4
      expect(r.score).toBeGreaterThanOrEqual(4);
    });
  });

  describe('analyzeChangeImpact', () => {
    function buildGraph() {
      const svc = new CodeIntelligenceService();
      svc.indexFile('/proj/leaf.js', 'export const v = 1;');
      svc.indexFile('/proj/mid.js', "import { v } from './leaf'; export const w = v + 1;");
      svc.indexFile('/proj/top.js', "import { w } from './mid';");
      return svc;
    }

    it('computa blast radius + riesgo + summary', () => {
      const svc = buildGraph();
      const r = analyzeChangeImpact({
        changedFiles: '/proj/leaf.js',
        codeIntelligence: svc,
      });
      expect(r.affectedFiles).toContain('/proj/leaf.js');
      expect(r.affectedFiles).toContain('/proj/mid.js');
      expect(r.affectedFiles).toContain('/proj/top.js');
      expect(r.riskLevel).toBeDefined();
      expect(typeof r.score).toBe('number');
      expect(r.summary).toContain('Blast radius');
      expect(r.summary).toContain(riskLabel(r.riskLevel));
    });

    it('detecta exports públicos consumidos por dependientes', () => {
      const svc = buildGraph();
      const r = analyzeChangeImpact({
        changedFiles: '/proj/leaf.js',
        codeIntelligence: svc,
      });
      // leaf exporta v, mid exporta w → ambos son públicos
      expect(r.publicExportsAffected).toContain('v');
    });

    it('riesgo HIGH/CRITICAL sugiere verificación completa', () => {
      const svc = buildGraph();
      // forzar score alto: muchos exports afectados
      const changedSymbols = new Map([
        ['/proj/leaf.js', [{ name: 'v', kind: SymbolKind.EXPORT, exported: true }]],
        ['/proj/mid.js', [{ name: 'w', kind: SymbolKind.EXPORT, exported: true }]],
        ['/proj/top.js', [{ name: 'x', kind: SymbolKind.EXPORT, exported: true }]],
      ]);
      const r = analyzeChangeImpact({
        changedFiles: ['/proj/leaf.js', '/proj/mid.js', '/proj/top.js'],
        codeIntelligence: svc,
        changedSymbols,
      });
      expect(r.score).toBeGreaterThanOrEqual(RISK_THRESHOLDS_VAL()[RiskLevel.HIGH]);
      expect(r.summary).toContain('verificación');
    });

    it('acepta archivos cambiados no indexados (no crashea)', () => {
      const svc = buildGraph();
      const r = analyzeChangeImpact({
        changedFiles: '/proj/unknown.js',
        codeIntelligence: svc,
      });
      expect(r.affectedFiles).toContain('/proj/unknown.js');
      expect(r.riskLevel).toBeDefined();
    });
  });
});

function riskLabel(level) {
  return { low: 'LOW', medium: 'MEDIUM', high: 'HIGH', critical: 'CRITICAL' }[level];
}
function RISK_THRESHOLDS_VAL() {
  return { low: 0, medium: 3, high: 7, critical: 12 };
}
