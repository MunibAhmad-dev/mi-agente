/**
 * repairService.js — Fase 8 (Repair): reparación de cambios fallidos.
 *
 * Recibe los resultados de Verification (Fase 7), clasifica los fallos y
 * aplica reparaciones deterministas. Reutiliza el file checkpointer de la
 * Fase 3 (rewind) para revertir cambios que no pasan verificación.
 *
 * Loop: verify → (si falla) repair → verify → ... hasta MAX_ATTEMPTS.
 *
 * Regla del doc (§10 Repair): "el agente debe poder revertir y reintentar".
 * Regla 6: operaciones peligrosas (revertir) requieren políticas.
 */

const { VerificationStatus, VerificationKind } = require('../Verification/verificationService');

/** Categorías de fallo para elegir la estrategia de reparación. */
const FailureCategory = Object.freeze({
  SYNTAX: 'syntax',
  TYPE: 'type',
  LINT: 'lint',
  TEST: 'test',
  BUILD: 'build',
  BLAST_RADIUS: 'blast_radius',
  UNKNOWN: 'unknown',
});

/** Acciones de reparación (deterministas, no generan código). */
const RepairAction = Object.freeze({
  REWIND: 'rewind',
  RETRY_LINT_FIX: 'retry_lint_fix',
  RETRY_TYPECHECK: 'retry_typecheck',
  REVERT_FILE: 'revert_file',
  ESCALATE: 'escalate',
});

const MAX_REPAIR_ATTEMPTS = 3;

/** Clasifica un fallo por su kind de verificación. */
function classifyFailure(result) {
  if (
    !result ||
    (result.status !== VerificationStatus.FAIL && result.status !== VerificationStatus.ERROR)
  ) {
    return null;
  }
  switch (result.kind) {
    case VerificationKind.COMPILE_CHECK:
      return FailureCategory.SYNTAX;
    case VerificationKind.TYPECHECK:
      return FailureCategory.TYPE;
    case VerificationKind.LINT:
      return FailureCategory.LINT;
    case VerificationKind.TESTS:
      return FailureCategory.TEST;
    case VerificationKind.BUILD:
      return FailureCategory.BUILD;
    case VerificationKind.BLAST_RADIUS:
      return FailureCategory.BLAST_RADIUS;
    default:
      return FailureCategory.UNKNOWN;
  }
}

/**
 * Decide la acción de reparación para una categoría de fallo.
 * Determinista: no genera código, aplica estrategias conocidas.
 */
function decideRepairAction(category, attempt) {
  if (attempt >= MAX_REPAIR_ATTEMPTS) {
    return RepairAction.ESCALATE;
  }
  switch (category) {
    case FailureCategory.SYNTAX:
      return RepairAction.REWIND;
    case FailureCategory.LINT:
      return RepairAction.RETRY_LINT_FIX;
    case FailureCategory.TYPE:
      return attempt === 0 ? RepairAction.REWIND : RepairAction.ESCALATE;
    case FailureCategory.BUILD:
      return RepairAction.REVERT_FILE;
    case FailureCategory.BLAST_RADIUS:
      return RepairAction.REWIND;
    case FailureCategory.TEST:
      return attempt === 0 ? RepairAction.RETRY_TYPECHECK : RepairAction.ESCALATE;
    default:
      return RepairAction.ESCALATE;
  }
}

/**
 * Ejecuta una acción de reparación.
 * @param {object} ctx - { checkpointer, files, cwd }
 * @param {string} action - RepairAction
 * @returns {{ applied: boolean, detail: string }}
 */
function applyRepairAction(ctx, action) {
  const { runCommand } = require('../Verification/verificationService');
  switch (action) {
    case RepairAction.REWIND: {
      if (ctx.checkpointer && typeof ctx.checkpointer.rewind === 'function') {
        try {
          ctx.checkpointer.rewind();
          return { applied: true, detail: 'cambios revertidos al checkpoint' };
        } catch (e) {
          return { applied: false, detail: `rewind falló: ${e.message}` };
        }
      }
      return { applied: false, detail: 'sin checkpointer, no se puede rewind' };
    }
    case RepairAction.RETRY_LINT_FIX: {
      const r = runCommand('npx', ['eslint', '--fix', ...(ctx.files || [])], {
        timeoutMs: 60000,
        cwd: ctx.cwd,
      });
      return {
        applied: r.status === VerificationStatus.PASS,
        detail: `eslint --fix: ${r.status}`,
      };
    }
    case RepairAction.REVERT_FILE: {
      const results = (ctx.files || []).map((f) => {
        const r = runCommand('git', ['checkout', '--', f], { cwd: ctx.cwd });
        return { file: f, status: r.status };
      });
      return {
        applied: results.every((r) => r.status === VerificationStatus.PASS),
        detail: `git checkout: ${JSON.stringify(results)}`,
      };
    }
    case RepairAction.RETRY_TYPECHECK:
    case RepairAction.ESCALATE:
    default:
      return {
        applied: false,
        detail: action === RepairAction.ESCALATE ? 'escalado a humano/LLM' : 'no-op',
      };
  }
}

/**
 * Loop de reparación: dada una función de verificación, repara y reintenta
 * hasta que pase o se agoten los intentos.
 * @param {object} params
 * @param {() => { results: object[], passed: boolean }} params.verifyFn
 * @param {object} params.ctx - { checkpointer, files, cwd }
 * @returns {{ attempts: object[], finalPassed: boolean, summary: string }}
 */
function repairLoop({ verifyFn, ctx }) {
  const attempts = [];
  let current = verifyFn();
  attempts.push({ phase: 'verify', result: current });

  if (current.passed) {
    return {
      attempts,
      finalPassed: true,
      summary: 'verificación inicial OK, sin reparación necesaria.',
    };
  }

  for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS; attempt += 1) {
    const failures = current.results
      .map((r) => ({ result: r, category: classifyFailure(r) }))
      .filter((f) => f.category !== null);
    if (!failures.length) {
      break;
    }
    const { category } = failures[0];
    const action = decideRepairAction(category, attempt);
    const repairResult = applyRepairAction(ctx, action);
    attempts.push({
      phase: 'repair',
      attempt,
      category,
      action,
      result: repairResult,
    });

    if (action === RepairAction.ESCALATE) {
      return {
        attempts,
        finalPassed: false,
        summary: `escalado tras ${attempt + 1} intento(s). No se reparó automáticamente.`,
      };
    }

    current = verifyFn();
    attempts.push({ phase: 'verify', attempt, result: current });
    if (current.passed) {
      return {
        attempts,
        finalPassed: true,
        summary: `reparado en ${attempt + 1} intento(s) (acción: ${action}).`,
      };
    }
  }

  return {
    attempts,
    finalPassed: false,
    summary: `no se pudo reparar tras ${MAX_REPAIR_ATTEMPTS} intentos.`,
  };
}

/**
 * Phase I — git rollback: revert a specific file to HEAD.
 * Used by REVERT_FILE when `ctx.files` is set and git is available.
 * @param {string} filePath - repo-relative path
 * @param {string} [cwd] - working directory (defaults to process.cwd())
 * @returns {{ applied: boolean, detail: string }}
 */
function gitRollback(filePath, cwd) {
  const { runCommand } = require('../Verification/verificationService');
  const r = runCommand('git', ['checkout', 'HEAD', '--', filePath], {
    cwd: cwd || process.cwd(),
    timeoutMs: 15_000,
  });
  return {
    applied: r.status === 'pass',
    detail: r.status === 'pass'
      ? `reverted ${filePath} to HEAD`
      : `git rollback failed: ${r.output || r.error || r.status}`,
  };
}

module.exports = {
  FailureCategory,
  RepairAction,
  MAX_REPAIR_ATTEMPTS,
  classifyFailure,
  decideRepairAction,
  applyRepairAction,
  repairLoop,
  gitRollback,
};
