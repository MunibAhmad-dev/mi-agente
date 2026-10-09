/**
 * verificationService.spec.js — Verification service (Fase 7)
 * child_process.execFileSync is mocked so no real shell commands run.
 */

jest.mock('child_process');

const { execFileSync } = require('child_process');
const {
  VerificationKind,
  VerificationStatus,
  STRATEGY_BY_RISK,
  runCommand,
  runVerification,
  verifications,
} = require('../verificationService');

// Lazily import BlastRiskLevel via require so we can use it in tests.
const { RiskLevel: BlastRiskLevel } = require('../../CodeIntelligence/blastRadius');

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockPass(output = 'ok') {
  execFileSync.mockReturnValueOnce(output);
}

function mockFail(stdout = '', stderr = 'error', exitCode = 1) {
  const err = Object.assign(new Error('command failed'), {
    status: exitCode,
    stdout,
    stderr,
  });
  execFileSync.mockImplementationOnce(() => { throw err; });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── VerificationKind / VerificationStatus constants ───────────────────────────

describe('constants', () => {
  it('VerificationKind has expected values', () => {
    expect(VerificationKind.TYPECHECK).toBe('typecheck');
    expect(VerificationKind.LINT).toBe('lint');
    expect(VerificationKind.TESTS).toBe('tests');
    expect(VerificationKind.BUILD).toBe('build');
    expect(VerificationKind.COMPILE_CHECK).toBe('compile_check');
    expect(VerificationKind.BLAST_RADIUS).toBe('blast_radius');
  });

  it('VerificationStatus has pass/fail/skip/error', () => {
    expect(VerificationStatus.PASS).toBe('pass');
    expect(VerificationStatus.FAIL).toBe('fail');
    expect(VerificationStatus.SKIP).toBe('skip');
    expect(VerificationStatus.ERROR).toBe('error');
  });
});

// ── STRATEGY_BY_RISK ──────────────────────────────────────────────────────────

describe('STRATEGY_BY_RISK', () => {
  it('LOW risk only runs lint + compile_check', () => {
    const kinds = STRATEGY_BY_RISK[BlastRiskLevel.LOW];
    expect(kinds).toContain(VerificationKind.LINT);
    expect(kinds).toContain(VerificationKind.COMPILE_CHECK);
    expect(kinds).not.toContain(VerificationKind.TESTS);
    expect(kinds).not.toContain(VerificationKind.BUILD);
  });

  it('MEDIUM risk includes tests', () => {
    const kinds = STRATEGY_BY_RISK[BlastRiskLevel.MEDIUM];
    expect(kinds).toContain(VerificationKind.TESTS);
    expect(kinds).not.toContain(VerificationKind.BUILD);
  });

  it('HIGH risk includes tests + build', () => {
    const kinds = STRATEGY_BY_RISK[BlastRiskLevel.HIGH];
    expect(kinds).toContain(VerificationKind.TESTS);
    expect(kinds).toContain(VerificationKind.BUILD);
    expect(kinds).not.toContain(VerificationKind.BLAST_RADIUS);
  });

  it('CRITICAL risk includes blast_radius', () => {
    const kinds = STRATEGY_BY_RISK[BlastRiskLevel.CRITICAL];
    expect(kinds).toContain(VerificationKind.BLAST_RADIUS);
  });
});

// ── runCommand ────────────────────────────────────────────────────────────────

describe('runCommand', () => {
  it('returns PASS when execFileSync succeeds', () => {
    mockPass('Build successful\n');
    const r = runCommand('npm', ['run', 'build']);
    expect(r.status).toBe(VerificationStatus.PASS);
    expect(r.output).toContain('Build successful');
  });

  it('returns FAIL when command exits with non-zero code', () => {
    mockFail('', 'type error: foo', 1);
    const r = runCommand('npx', ['tsc', '--noEmit']);
    expect(r.status).toBe(VerificationStatus.FAIL);
    expect(r.output).toContain('type error');
  });

  it('returns ERROR when exception has no exit code (timeout / ENOENT)', () => {
    execFileSync.mockImplementationOnce(() => { throw new Error('ENOENT: no such file'); });
    const r = runCommand('nonexistent', ['--version']);
    expect(r.status).toBe(VerificationStatus.ERROR);
  });

  it('truncates very long output to 2000 chars', () => {
    mockPass('x'.repeat(5000));
    const r = runCommand('node', ['--version']);
    expect(r.output.length).toBeLessThanOrEqual(2000);
  });
});

// ── verifications[kind] — individual checks (use exported verifications map) ──

describe('verifications.compile_check', () => {
  it('skips when no files provided', () => {
    const r = verifications[VerificationKind.COMPILE_CHECK]({ files: [] });
    expect(r.status).toBe(VerificationStatus.SKIP);
  });

  it('skips non-.js files, overall status PASS', () => {
    const r = verifications[VerificationKind.COMPILE_CHECK]({ files: ['style.css'] });
    expect(r.status).toBe(VerificationStatus.PASS);
  });

  it('passes when node --check succeeds', () => {
    mockPass('');
    const r = verifications[VerificationKind.COMPILE_CHECK]({ files: ['src/app.js'] });
    expect(r.status).toBe(VerificationStatus.PASS);
  });

  it('fails when node --check finds a syntax error', () => {
    mockFail('', 'SyntaxError: Unexpected token', 1);
    const r = verifications[VerificationKind.COMPILE_CHECK]({ files: ['src/broken.js'] });
    expect(r.status).toBe(VerificationStatus.FAIL);
  });
});

describe('verifications.lint', () => {
  it('passes when eslint exits 0', () => {
    mockPass('');
    const r = verifications[VerificationKind.LINT]({});
    expect(r.status).toBe(VerificationStatus.PASS);
    expect(r.kind).toBe(VerificationKind.LINT);
  });

  it('fails when eslint exits non-zero', () => {
    mockFail('', '3 errors found', 1);
    const r = verifications[VerificationKind.LINT]({ files: ['src/'] });
    expect(r.status).toBe(VerificationStatus.FAIL);
  });
});

describe('verifications.typecheck', () => {
  it('passes when tsc exits 0', () => {
    mockPass('');
    const r = verifications[VerificationKind.TYPECHECK]({});
    expect(r.status).toBe(VerificationStatus.PASS);
    expect(r.kind).toBe(VerificationKind.TYPECHECK);
  });

  it('fails on type errors', () => {
    mockFail('', "error TS2345: Argument of type 'number'", 2);
    const r = verifications[VerificationKind.TYPECHECK]({});
    expect(r.status).toBe(VerificationStatus.FAIL);
    expect(r.output).toContain('TS2345');
  });
});

describe('verifications.blast_radius', () => {
  it('skips when no blast radius data provided', () => {
    const r = verifications[VerificationKind.BLAST_RADIUS]({});
    expect(r.status).toBe(VerificationStatus.SKIP);
  });

  it('passes for non-CRITICAL blast radius', () => {
    const r = verifications[VerificationKind.BLAST_RADIUS]({
      blastRadiusResult: { riskLevel: BlastRiskLevel.HIGH, summary: 'high risk' },
    });
    expect(r.status).toBe(VerificationStatus.PASS);
  });

  it('fails for CRITICAL blast radius', () => {
    const r = verifications[VerificationKind.BLAST_RADIUS]({
      blastRadiusResult: { riskLevel: BlastRiskLevel.CRITICAL, summary: 'critical' },
    });
    expect(r.status).toBe(VerificationStatus.FAIL);
  });
});

// ── runVerification (full strategy) ──────────────────────────────────────────

describe('runVerification — full strategy', () => {
  it('returns { results, passed, summary }', () => {
    mockPass(''); mockPass(''); // LOW = lint + compile_check
    const r = runVerification({ riskLevel: BlastRiskLevel.LOW, files: [] });
    expect(Array.isArray(r.results)).toBe(true);
    expect(typeof r.passed).toBe('boolean');
    expect(typeof r.summary).toBe('string');
  });

  it('passed:true when all checks pass', () => {
    mockPass(''); mockPass('');
    const r = runVerification({ riskLevel: BlastRiskLevel.LOW, files: [] });
    expect(r.passed).toBe(true);
  });

  it('passed:false when a check fails', () => {
    // Use MEDIUM so lint + typecheck + tests all run; make lint fail, rest pass
    mockFail('', 'lint error', 1); // lint: fail
    mockPass('');                  // typecheck: pass
    mockPass('');                  // tests: pass
    const r = runVerification({ riskLevel: BlastRiskLevel.MEDIUM, files: ['src/app.js'] });
    expect(r.passed).toBe(false);
    expect(r.summary).toMatch(/FALLÓ/);
  });
});
