/**
 * repairService.spec.js — Repair service (Fase 8)
 * Tests: failure classification, repair decisions, repairLoop flow.
 * runCommand inside repairService is mocked via jest.mock.
 */

jest.mock('../../Verification/verificationService', () => ({
  VerificationStatus: { PASS: 'pass', FAIL: 'fail', SKIP: 'skip', ERROR: 'error' },
  VerificationKind: {
    TYPECHECK: 'typecheck',
    LINT: 'lint',
    TESTS: 'tests',
    BUILD: 'build',
    COMPILE_CHECK: 'compile_check',
    BLAST_RADIUS: 'blast_radius',
  },
  runCommand: jest.fn(),
}));

const { runCommand } = require('../../Verification/verificationService');

const {
  FailureCategory,
  RepairAction,
  MAX_REPAIR_ATTEMPTS,
  classifyFailure,
  decideRepairAction,
  applyRepairAction,
  repairLoop,
} = require('../repairService');

beforeEach(() => {
  jest.clearAllMocks();
});

// ── classifyFailure ───────────────────────────────────────────────────────────

describe('classifyFailure', () => {
  it('returns null for a passing result', () => {
    expect(classifyFailure({ kind: 'lint', status: 'pass' })).toBeNull();
  });

  it('returns null for null input', () => {
    expect(classifyFailure(null)).toBeNull();
  });

  it('maps compile_check → SYNTAX', () => {
    expect(classifyFailure({ kind: 'compile_check', status: 'fail' })).toBe(FailureCategory.SYNTAX);
  });

  it('maps typecheck → TYPE', () => {
    expect(classifyFailure({ kind: 'typecheck', status: 'fail' })).toBe(FailureCategory.TYPE);
  });

  it('maps lint → LINT', () => {
    expect(classifyFailure({ kind: 'lint', status: 'fail' })).toBe(FailureCategory.LINT);
  });

  it('maps tests → TEST', () => {
    expect(classifyFailure({ kind: 'tests', status: 'fail' })).toBe(FailureCategory.TEST);
  });

  it('maps build → BUILD', () => {
    expect(classifyFailure({ kind: 'build', status: 'fail' })).toBe(FailureCategory.BUILD);
  });

  it('maps blast_radius → BLAST_RADIUS', () => {
    expect(classifyFailure({ kind: 'blast_radius', status: 'fail' })).toBe(FailureCategory.BLAST_RADIUS);
  });

  it('maps unknown kind → UNKNOWN', () => {
    expect(classifyFailure({ kind: 'something_else', status: 'fail' })).toBe(FailureCategory.UNKNOWN);
  });

  it('also classifies ERROR status results', () => {
    expect(classifyFailure({ kind: 'lint', status: 'error' })).toBe(FailureCategory.LINT);
  });
});

// ── decideRepairAction ────────────────────────────────────────────────────────

describe('decideRepairAction', () => {
  it('escalates immediately when MAX_REPAIR_ATTEMPTS reached', () => {
    expect(decideRepairAction(FailureCategory.LINT, MAX_REPAIR_ATTEMPTS)).toBe(RepairAction.ESCALATE);
    expect(decideRepairAction(FailureCategory.SYNTAX, MAX_REPAIR_ATTEMPTS)).toBe(RepairAction.ESCALATE);
  });

  it('SYNTAX → REWIND', () => {
    expect(decideRepairAction(FailureCategory.SYNTAX, 0)).toBe(RepairAction.REWIND);
  });

  it('LINT → RETRY_LINT_FIX', () => {
    expect(decideRepairAction(FailureCategory.LINT, 0)).toBe(RepairAction.RETRY_LINT_FIX);
  });

  it('TYPE first attempt → REWIND', () => {
    expect(decideRepairAction(FailureCategory.TYPE, 0)).toBe(RepairAction.REWIND);
  });

  it('TYPE second attempt → ESCALATE', () => {
    expect(decideRepairAction(FailureCategory.TYPE, 1)).toBe(RepairAction.ESCALATE);
  });

  it('BUILD → REVERT_FILE', () => {
    expect(decideRepairAction(FailureCategory.BUILD, 0)).toBe(RepairAction.REVERT_FILE);
  });

  it('BLAST_RADIUS → REWIND', () => {
    expect(decideRepairAction(FailureCategory.BLAST_RADIUS, 0)).toBe(RepairAction.REWIND);
  });

  it('TEST first attempt → RETRY_TYPECHECK', () => {
    expect(decideRepairAction(FailureCategory.TEST, 0)).toBe(RepairAction.RETRY_TYPECHECK);
  });

  it('TEST second attempt → ESCALATE', () => {
    expect(decideRepairAction(FailureCategory.TEST, 1)).toBe(RepairAction.ESCALATE);
  });

  it('UNKNOWN → ESCALATE', () => {
    expect(decideRepairAction(FailureCategory.UNKNOWN, 0)).toBe(RepairAction.ESCALATE);
  });
});

// ── applyRepairAction ─────────────────────────────────────────────────────────

describe('applyRepairAction', () => {
  it('REWIND calls checkpointer.rewind() and returns applied:true', () => {
    const checkpointer = { rewind: jest.fn() };
    const r = applyRepairAction({ checkpointer }, RepairAction.REWIND);
    expect(checkpointer.rewind).toHaveBeenCalledTimes(1);
    expect(r.applied).toBe(true);
  });

  it('REWIND without checkpointer returns applied:false', () => {
    const r = applyRepairAction({}, RepairAction.REWIND);
    expect(r.applied).toBe(false);
  });

  it('REWIND when rewind() throws returns applied:false', () => {
    const checkpointer = { rewind: jest.fn(() => { throw new Error('disk full'); }) };
    const r = applyRepairAction({ checkpointer }, RepairAction.REWIND);
    expect(r.applied).toBe(false);
    expect(r.detail).toMatch(/disk full/);
  });

  it('RETRY_LINT_FIX calls eslint --fix and returns applied:true on pass', () => {
    runCommand.mockReturnValueOnce({ status: 'pass', output: '' });
    const r = applyRepairAction({ files: ['src/foo.js'] }, RepairAction.RETRY_LINT_FIX);
    expect(runCommand).toHaveBeenCalledWith('npx', ['eslint', '--fix', 'src/foo.js'], expect.any(Object));
    expect(r.applied).toBe(true);
  });

  it('RETRY_LINT_FIX returns applied:false when eslint --fix fails', () => {
    runCommand.mockReturnValueOnce({ status: 'fail', output: 'unfixable errors' });
    const r = applyRepairAction({ files: [] }, RepairAction.RETRY_LINT_FIX);
    expect(r.applied).toBe(false);
  });

  it('REVERT_FILE calls git checkout for each file', () => {
    runCommand.mockReturnValue({ status: 'pass', output: '' });
    const r = applyRepairAction({ files: ['a.js', 'b.js'] }, RepairAction.REVERT_FILE);
    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(r.applied).toBe(true);
  });

  it('ESCALATE returns applied:false', () => {
    const r = applyRepairAction({}, RepairAction.ESCALATE);
    expect(r.applied).toBe(false);
    expect(r.detail).toMatch(/escalado/);
  });
});

// ── repairLoop ────────────────────────────────────────────────────────────────

describe('repairLoop', () => {
  it('returns immediately when first verify passes', () => {
    const verifyFn = jest.fn().mockReturnValue({ results: [], passed: true });
    const r = repairLoop({ verifyFn, ctx: {} });
    expect(r.finalPassed).toBe(true);
    expect(verifyFn).toHaveBeenCalledTimes(1);
    expect(r.attempts.length).toBe(1);
  });

  it('retries after failed verify and passes on second attempt', () => {
    const verifyFn = jest.fn()
      .mockReturnValueOnce({ results: [{ kind: 'lint', status: 'fail' }], passed: false })
      .mockReturnValueOnce({ results: [], passed: true });

    runCommand.mockReturnValue({ status: 'pass', output: '' });

    const r = repairLoop({ verifyFn, ctx: { files: ['src/app.js'] } });
    expect(r.finalPassed).toBe(true);
    expect(verifyFn).toHaveBeenCalledTimes(2);
  });

  it('escalates after MAX_REPAIR_ATTEMPTS and still fails', () => {
    const verifyFn = jest.fn().mockReturnValue({
      results: [{ kind: 'tests', status: 'fail' }],
      passed: false,
    });

    runCommand.mockReturnValue({ status: 'fail', output: '' });

    const r = repairLoop({ verifyFn, ctx: {} });
    expect(r.finalPassed).toBe(false);
    // verify is called once initially + once per attempt
    expect(verifyFn.mock.calls.length).toBeGreaterThan(1);
  });

  it('summary string is always present', () => {
    const verifyFn = jest.fn().mockReturnValue({ results: [], passed: true });
    const r = repairLoop({ verifyFn, ctx: {} });
    expect(typeof r.summary).toBe('string');
    expect(r.summary.length).toBeGreaterThan(0);
  });
});
