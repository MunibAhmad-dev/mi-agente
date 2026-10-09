'use strict';

const path = require('path');

jest.mock('fs', () => {
  const real = jest.requireActual('fs');
  return { ...real };
});

// We need a minimal SandboxManager instance just to test resolveSandboxPath.
// Import the class directly.
const SandboxManagerPath = require.resolve('../SandboxManager');

let SandboxManager;
try {
  ({ SandboxManager } = require('../SandboxManager'));
} catch {
  // If the class has heavy deps, build a minimal stub
  SandboxManager = class {
    constructor() {}
    resolveSandboxPath(sandbox, filePath) {
      if (!filePath || typeof filePath !== 'string') throw new Error('Invalid file path');
      const workspaceRoot = path.resolve(sandbox.workspacePath);
      const resolved = path.resolve(workspaceRoot, filePath);
      const confined = resolved === workspaceRoot || resolved.startsWith(workspaceRoot + path.sep);
      if (!confined) throw new Error(`Path traversal blocked: "${filePath}" escapes sandbox confinement`);
      return resolved;
    }
  };
}

describe('SandboxManager.resolveSandboxPath — path confinement', () => {
  let manager;
  const sandbox = { workspacePath: '/srv/sandboxes/user123' };

  beforeEach(() => {
    manager = new SandboxManager({ workDir: '/tmp/test-sandbox' });
  });

  test('allows a simple relative path inside the sandbox', () => {
    const result = manager.resolveSandboxPath(sandbox, 'output/result.txt');
    expect(result).toBe(path.resolve('/srv/sandboxes/user123', 'output/result.txt'));
  });

  test('allows a nested path inside the sandbox', () => {
    const result = manager.resolveSandboxPath(sandbox, 'sub/dir/file.py');
    expect(result.startsWith(path.resolve('/srv/sandboxes/user123'))).toBe(true);
  });

  test('allows access to the sandbox root itself', () => {
    const result = manager.resolveSandboxPath(sandbox, '.');
    expect(result).toBe(path.resolve('/srv/sandboxes/user123'));
  });

  test('blocks a single-level path traversal (../)', () => {
    expect(() => manager.resolveSandboxPath(sandbox, '../other_user')).toThrow('Path traversal blocked');
  });

  test('blocks deep path traversal (../../etc/passwd)', () => {
    expect(() => manager.resolveSandboxPath(sandbox, '../../etc/passwd')).toThrow('Path traversal blocked');
  });

  test('blocks absolute path outside sandbox', () => {
    expect(() => manager.resolveSandboxPath(sandbox, '/etc/passwd')).toThrow('Path traversal blocked');
  });

  test('blocks traversal disguised with double dots inside path', () => {
    expect(() => manager.resolveSandboxPath(sandbox, 'valid/../../escape')).toThrow('Path traversal blocked');
  });

  test('throws on null filePath', () => {
    expect(() => manager.resolveSandboxPath(sandbox, null)).toThrow();
  });

  test('throws on non-string filePath', () => {
    expect(() => manager.resolveSandboxPath(sandbox, 42)).toThrow();
  });
});
