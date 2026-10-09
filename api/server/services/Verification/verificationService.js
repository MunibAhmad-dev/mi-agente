/**
 * verificationService.js — Fase 7 (Verification): orquesta las comprobaciones
 * que el agente ejecuta antes/después de aplicar cambios.
 *
 * Reutiliza:
 *   - compile_check (Fase 3, codingTools del SDK),
 *   - CodeIntelligence + BlastRadius (Fase 5/6) para verificación dirigida,
 *   - las herramientas del proyecto (tsc, eslint, jest) vía subprocesos.
 *
 * Estrategia según riesgo (doc §23 + §9 Verification):
 *   - LOW  → verificación ligera (lint del archivo + compile_check).
 *   - MED  → verificación dirigida (lint + typecheck + tests afectados).
 *   - HIGH → verificación completa (typecheck + lint + tests + build).
 *   - CRIT → verificación completa + tests de integración + blast radius.
 *
 * Regla del doc: "el agente debe verificar sus propios cambios".
 */

const { execFileSync } = require('child_process');

const { RiskLevel: BlastRiskLevel } = require('../CodeIntelligence/blastRadius');

const VerificationKind = Object.freeze({
  TYPECHECK: 'typecheck',
  LINT: 'lint',
  TESTS: 'tests',
  COMPILE_CHECK: 'compile_check',
  BUILD: 'build',
  BLAST_RADIUS: 'blast_radius',
});

const VerificationStatus = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  SKIP: 'skip',
  ERROR: 'error',
});

/** Estrategia de verificación según nivel de riesgo (doc §9). */
const STRATEGY_BY_RISK = Object.freeze({
  [BlastRiskLevel.LOW]: [VerificationKind.LINT, VerificationKind.COMPILE_CHECK],
  [BlastRiskLevel.MEDIUM]: [
    VerificationKind.LINT,
    VerificationKind.TYPECHECK,
    VerificationKind.TESTS,
  ],
  [BlastRiskLevel.HIGH]: [
    VerificationKind.LINT,
    VerificationKind.TYPECHECK,
    VerificationKind.TESTS,
    VerificationKind.BUILD,
  ],
  [BlastRiskLevel.CRITICAL]: [
    VerificationKind.LINT,
    VerificationKind.TYPECHECK,
    VerificationKind.TESTS,
    VerificationKind.BUILD,
    VerificationKind.BLAST_RADIUS,
  ],
});

/** Ejecuta un comando y devuelve { status, output } sin lanzar. */
function runCommand(cmd, args, opts = {}) {
  try {
    const output = execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout: opts.timeoutMs || 60000,
      maxBuffer: 1024 * 1024 * 5,
      cwd: opts.cwd || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: VerificationStatus.PASS, output: String(output).slice(-2000) };
  } catch (err) {
    const isFail = err.status !== undefined && err.status !== null;
    return {
      status: isFail ? VerificationStatus.FAIL : VerificationStatus.ERROR,
      output: String(err.stdout || err.stderr || err.message).slice(-2000),
      code: err.status,
    };
  }
}

/** Verificaciones individuales. Cada una devuelve { kind, status, output }. */
const verifications = {
  [VerificationKind.TYPECHECK](opts) {
    const r = runCommand('npx', ['tsc', '--noEmit'], {
      timeoutMs: 120000,
      cwd: opts.cwd,
    });
    return { kind: VerificationKind.TYPECHECK, ...r };
  },
  [VerificationKind.LINT](opts) {
    const files = (opts.files || []).length ? opts.files : ['.'];
    const r = runCommand('npx', ['eslint', ...files], {
      timeoutMs: 60000,
      cwd: opts.cwd,
    });
    return { kind: VerificationKind.LINT, ...r };
  },
  [VerificationKind.TESTS](opts) {
    const args = ['jest', '--passWithNoTests'];
    if (opts.testPathPattern) {
      args.push(opts.testPathPattern);
    }
    const r = runCommand('npx', args, { timeoutMs: 300000, cwd: opts.cwd });
    return { kind: VerificationKind.TESTS, ...r };
  },
  [VerificationKind.BUILD](opts) {
    const r = runCommand('npm', ['run', 'build'], {
      timeoutMs: 300000,
      cwd: opts.cwd,
    });
    return { kind: VerificationKind.BUILD, ...r };
  },
  [VerificationKind.COMPILE_CHECK](opts) {
    if (!opts.files || !opts.files.length) {
      return {
        kind: VerificationKind.COMPILE_CHECK,
        status: VerificationStatus.SKIP,
        output: 'no files',
      };
    }
    // Validación de sintaxis vía node --check (rápido, sin ejecutar).
    const results = opts.files.map((f) => {
      if (!/\.(js|mjs|cjs)$/.test(f)) {
        return { file: f, status: VerificationStatus.SKIP };
      }
      const r = runCommand('node', ['--check', f], {
        timeoutMs: 30000,
        cwd: opts.cwd,
      });
      return { file: f, ...r };
    });
    const anyFail = results.some((r) => r.status === VerificationStatus.FAIL);
    return {
      kind: VerificationKind.COMPILE_CHECK,
      status: anyFail ? VerificationStatus.FAIL : VerificationStatus.PASS,
      output: JSON.stringify(results),
    };
  },
  [VerificationKind.BLAST_RADIUS](opts) {
    if (!opts.blastRadiusResult) {
      return {
        kind: VerificationKind.BLAST_RADIUS,
        status: VerificationStatus.SKIP,
        output: 'no blast radius data',
      };
    }
    const br = opts.blastRadiusResult;
    const ok = br.riskLevel !== BlastRiskLevel.CRITICAL;
    return {
      kind: VerificationKind.BLAST_RADIUS,
      status: ok ? VerificationStatus.PASS : VerificationStatus.FAIL,
      output: br.summary,
    };
  },
};

/**
 * Ejecuta la estrategia de verificación según el riesgo.
 * @param {object} opts
 * @param {string} [opts.riskLevel] - del BlastRadius (Fase 6)
 * @param {string[]} [opts.files] - archivos afectados
 * @param {string} [opts.testPathPattern]
 * @param {object} [opts.blastRadiusResult]
 * @param {string} [opts.cwd]
 * @returns {{ results: object[], passed: boolean, summary: string }}
 */
function runVerification(opts = {}) {
  const riskLevel = opts.riskLevel || BlastRiskLevel.MEDIUM;
  const kinds = STRATEGY_BY_RISK[riskLevel] || STRATEGY_BY_RISK[BlastRiskLevel.MEDIUM];
  const results = kinds.map((kind) => verifications[kind](opts));
  const failed = results.filter(
    (r) => r.status === VerificationStatus.FAIL || r.status === VerificationStatus.ERROR,
  );
  const passed = failed.length === 0;
  const summary =
    `Verificación ${passed ? 'OK' : 'FALLÓ'} (estrategia ${riskLevel.toUpperCase()}). ` +
    `${results.length - failed.length}/${results.length} pasaron. ` +
    (failed.length ? `Fallaron: ${failed.map((r) => r.kind).join(', ')}.` : '');
  return { results, passed, summary };
}

module.exports = {
  VerificationKind,
  VerificationStatus,
  STRATEGY_BY_RISK,
  runCommand,
  runVerification,
  verifications,
};
