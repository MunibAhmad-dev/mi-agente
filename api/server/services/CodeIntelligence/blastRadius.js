/**
 * blastRadius.js — Fase 6 (Blast Radius): change impact analysis + risk engine.
 *
 * Construido sobre CodeIntelligenceService (Fase 5): dado un conjunto de
 * archivos cambiados, determina:
 *   - el radio de explosión (archivos transitivamente afectados),
 *   - un nivel de riesgo (LOW/MEDIUM/HIGH/CRITICAL),
 *   - si se ven afectados exports públicos (API surface),
 *   - un resumen accionable para el agente de verificación.
 *
 * Regla del doc (§23 Change Risk Engine): "el agente debe entender el
 * impacto de sus cambios antes de aplicarlos". Regla 6: operaciones
 * peligrosas requieren políticas.
 */

const { SymbolKind } = require('../CodeIntelligence/codeIntelligence');

const RiskLevel = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
});

/** Heurística de peso por tipo de símbolo tocado. */
const SYMBOL_RISK_WEIGHT = Object.freeze({
  [SymbolKind.EXPORT]: 3, // API pública
  [SymbolKind.CLASS]: 2,
  [SymbolKind.INTERFACE]: 2,
  [SymbolKind.TYPE]: 2,
  [SymbolKind.FUNCTION]: 1,
  [SymbolKind.METHOD]: 1,
  [SymbolKind.ARROW_FUNCTION]: 1,
  [SymbolKind.VARIABLE]: 0.5,
});

/** Umbrales para clasificar el riesgo (sobre el score agregado). */
const RISK_THRESHOLDS = Object.freeze({
  [RiskLevel.CRITICAL]: 12,
  [RiskLevel.HIGH]: 7,
  [RiskLevel.MEDIUM]: 3,
});

/**
 * Calcula el score de riesgo de un cambio.
 * @param {object} params
 * @param {string[]} params.affectedFiles - archivos en el blast radius
 * @param {Map<string, object[]>} [params.changedSymbols] - file -> símbolos cambiados
 * @param {CodeIntelligenceService} params.codeIntelligence - índice
 * @returns {{ score: number, publicExportsAffected: string[], reasons: string[] }}
 */
function assessRisk({ affectedFiles = [], changedSymbols, codeIntelligence }) {
  let score = 0;
  const reasons = [];
  const publicExportsAffected = new Set();

  // Peso por archivos afectados
  score += affectedFiles.length * 0.5;
  if (affectedFiles.length > 0) {
    reasons.push(`${affectedFiles.length} archivo(s) en el blast radius`);
  }

  // Peso por tipo de símbolo cambiado
  if (changedSymbols) {
    for (const [file, syms] of changedSymbols.entries()) {
      for (const sym of syms || []) {
        const w = SYMBOL_RISK_WEIGHT[sym.kind] ?? 1;
        score += w;
        if (sym.kind === SymbolKind.EXPORT || sym.exported) {
          publicExportsAffected.add(sym.name);
          reasons.push(`export público afectado: ${sym.name} (${file})`);
        }
      }
    }
  }

  // Peso adicional si un archivo afectado es entry point (index.*)
  if (codeIntelligence) {
    for (const file of affectedFiles) {
      if (/(^|\/)index\.(js|ts|jsx|tsx)$/.test(file)) {
        score += 2;
        reasons.push(`entry point afectado: ${file}`);
      }
      // exports públicos consumidos por dependientes
      const syms = codeIntelligence.fileSymbols.get(file) || [];
      for (const sym of syms) {
        if (sym.exported) {
          publicExportsAffected.add(sym.name);
        }
      }
    }
  }

  return {
    score: Math.round(score * 10) / 10,
    publicExportsAffected: Array.from(publicExportsAffected).sort(),
    reasons,
  };
}

/** Clasifica un score en nivel de riesgo. */
function classifyRisk(score) {
  if (score >= RISK_THRESHOLDS[RiskLevel.CRITICAL]) return RiskLevel.CRITICAL;
  if (score >= RISK_THRESHOLDS[RiskLevel.HIGH]) return RiskLevel.HIGH;
  if (score >= RISK_THRESHOLDS[RiskLevel.MEDIUM]) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
}

/**
 * Análisis completo de impacto de un cambio.
 * @param {object} params
 * @param {string|string[]} params.changedFiles - archivos modificados
 * @param {CodeIntelligenceService} params.codeIntelligence
 * @param {Map<string, object[]>} [params.changedSymbols] - símbolos cambiados por archivo
 * @param {number} [params.maxDepth=10]
 * @returns {object} { affectedFiles, riskLevel, score, publicExportsAffected, reasons, summary }
 */
function analyzeChangeImpact({ changedFiles, codeIntelligence, changedSymbols, maxDepth = 10 }) {
  const affected = codeIntelligence.computeBlastRadius(changedFiles, maxDepth);
  // los archivos cambiados que NO están indexados también cuentan como afectados
  const seeds = Array.isArray(changedFiles) ? changedFiles : [changedFiles];
  for (const s of seeds) {
    if (!affected.includes(s)) affected.push(s);
  }

  const { score, publicExportsAffected, reasons } = assessRisk({
    affectedFiles: affected,
    changedSymbols,
    codeIntelligence,
  });
  const riskLevel = classifyRisk(score);

  let suggestedAction;
  if (riskLevel === RiskLevel.CRITICAL || riskLevel === RiskLevel.HIGH) {
    suggestedAction = 'verificación completa + tests de integración antes de aplicar.';
  } else if (riskLevel === RiskLevel.MEDIUM) {
    suggestedAction = 'verificación dirigida a los archivos afectados.';
  } else {
    suggestedAction = 'verificación ligera.';
  }

  const summary =
    `Blast radius: ${affected.length} archivo(s). ` +
    `Riesgo: ${riskLevel.toUpperCase()} (score ${score}). ` +
    (publicExportsAffected.length
      ? `Exports públicos afectados: ${publicExportsAffected.join(', ')}. `
      : '') +
    `Acción sugerida: ${suggestedAction}`;

  return {
    affectedFiles: affected,
    riskLevel,
    score,
    publicExportsAffected,
    reasons,
    summary,
  };
}

module.exports = {
  RiskLevel,
  SYMBOL_RISK_WEIGHT,
  RISK_THRESHOLDS,
  assessRisk,
  classifyRisk,
  analyzeChangeImpact,
};
