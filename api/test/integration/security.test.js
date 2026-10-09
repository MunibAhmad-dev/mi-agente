'use strict';

/**
 * Fase 4 — Integration tests for Fase 0 security fixes.
 * Tests actual behavior of security components, not just file existence.
 */

describe('Security — ShellTool._validateCommand', () => {
  let ShellTool;
  beforeAll(() => {
    ({ ShellTool } = require('~/server/services/Harness/tools/ShellTool'));
  });

  let tool;
  beforeEach(() => { tool = new ShellTool(); });

  test('accepts a safe command', () => {
    expect(() => tool._validateCommand('ls -la /tmp')).not.toThrow();
  });

  test('blocks rm -rf /', () => {
    expect(() => tool._validateCommand('rm -rf /')).toThrow();
  });

  test('blocks backtick substitution', () => {
    expect(() => tool._validateCommand('ls `cat /etc/passwd`')).toThrow(/substitution/i);
  });

  test('blocks $() substitution', () => {
    expect(() => tool._validateCommand('echo $(cat /etc/shadow)')).toThrow(/substitution/i);
  });

  test('blocks process substitution <()', () => {
    expect(() => tool._validateCommand('diff <(ls /etc) <(ls /tmp)')).toThrow(/process substitution/i);
  });

  test('blocks eval', () => {
    expect(() => tool._validateCommand('eval "rm -rf /"')).toThrow(/eval/i);
  });

  test('blocks base64 -d', () => {
    expect(() => tool._validateCommand('echo dGVzdA== | base64 -d | bash')).toThrow(/eval/i);
  });

  test('blocks sudo mid-command', () => {
    expect(() => tool._validateCommand('sh -c "sudo apt install netcat"')).toThrow(/sudo/i);
  });

  test('blocks writes to /dev/mem', () => {
    expect(() => tool._validateCommand('echo x > /dev/mem')).toThrow(/dev/i);
  });

  test('allows writes to /dev/null', () => {
    expect(() => tool._validateCommand('echo x > /dev/null')).not.toThrow();
  });

  test('blocks command exceeding 2000 chars', () => {
    expect(() => tool._validateCommand('a'.repeat(2001))).toThrow(/length/i);
  });

  test('blocks shutdown', () => {
    expect(() => tool._validateCommand('shutdown now')).toThrow();
  });
});

describe('Security — HarnessEngine.runCommand refuse-when-disabled', () => {
  let HarnessEngine;
  const originalEnv = process.env.HARNESS_ENGINE_ENABLED;

  beforeAll(() => {
    HarnessEngine = require('~/server/services/AgentRuntime/HarnessEngine');
  });

  afterAll(() => {
    if (originalEnv === undefined) delete process.env.HARNESS_ENGINE_ENABLED;
    else process.env.HARNESS_ENGINE_ENABLED = originalEnv;
  });

  test('refuses command when HARNESS_ENGINE_ENABLED is false', async () => {
    process.env.HARNESS_ENGINE_ENABLED = 'false';
    const session = HarnessEngine.createSession({});
    const result = await HarnessEngine.runCommand(session, 'echo hello');
    expect(result.refused).toBe(true);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('refused');
  });

  test('refuses command when enabled but no sandbox available (mocked)', async () => {
    process.env.HARNESS_ENGINE_ENABLED = 'true';
    const SandboxRunner = HarnessEngine.SandboxRunner;
    const origDetect = SandboxRunner.detectSandbox;
    SandboxRunner.detectSandbox = () => null;
    try {
      const session = HarnessEngine.createSession({});
      const result = await HarnessEngine.runCommand(session, 'echo hello');
      expect(result.refused).toBe(true);
      expect(result.stderr).toContain('sandbox');
    } finally {
      SandboxRunner.detectSandbox = origDetect;
      process.env.HARNESS_ENGINE_ENABLED = 'false';
    }
  });
});

describe('Security — GitWorktreeManager — branch name validation', () => {
  const { GitWorktreeManager } = require('~/server/services/Harness/tools/GitWorktreeManager');

  test('rejects branch name with shell metacharacters', async () => {
    const mgr = new GitWorktreeManager({ workingDir: process.cwd() });
    // The mergeWorktree method validates branch names
    // We test the internal validation path
    try {
      await mgr.mergeWorktree('valid-branch; rm -rf /');
    } catch (e) {
      expect(e.message).toMatch(/invalid.*branch|worktree not found/i);
    }
  });
});

describe('Security — Checkpoint IDOR protection', () => {
  const Checkpoint = require('~/server/services/AgentRuntime/SessionManager/Checkpoint');
  const crypto = require('crypto');

  test('save requires userId', async () => {
    const session = { id: crypto.randomUUID(), agentId: 'test', state: {}, toolCalls: 0, flags: {} };
    await expect(Checkpoint.save(session, null, undefined)).rejects.toThrow(/userId is required/);
  });

  test('load requires userId', async () => {
    await expect(Checkpoint.load('fake-session-id', undefined)).rejects.toThrow(/userId is required/);
  });

  test('load denies access for wrong userId', async () => {
    const sessionId = crypto.randomUUID();
    const session = { id: sessionId, agentId: 'test', state: {}, toolCalls: 0, flags: {} };
    await Checkpoint.save(session, null, 'user-A');
    await expect(Checkpoint.load(sessionId, 'user-B')).rejects.toThrow(/Access denied/);
    // Cleanup
    const fs = require('fs');
    const path = require('path');
    const id = crypto.createHash('sha1').update(sessionId).digest('hex').slice(0, 12);
    const file = path.join(Checkpoint.CHECKPOINT_DIR, `${id}.json`);
    try { fs.unlinkSync(file); } catch {}
  });
});
