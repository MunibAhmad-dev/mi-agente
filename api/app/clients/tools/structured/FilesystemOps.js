'use strict';

const { Tool } = require('@librechat/agents/langchain/tools');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const filesystemOpsJsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['read', 'write', 'list', 'create_dir', 'delete', 'exists', 'copy'],
      description:
        'read: read a text file; write: create/overwrite a text file; list: list directory contents; ' +
        'create_dir: create a directory; delete: delete a file or empty dir; exists: check if path exists; ' +
        'copy: copy any file (including images/binaries) from src to dest. ' +
        'Paths starting with Desktop/ resolve to the user\'s Desktop. Use absolute paths or Desktop/ prefix.',
    },
    path: {
      type: 'string',
      description:
        'File or directory path. For action=copy this is the SOURCE path. Examples: "Desktop/my-project/file.txt" (user Desktop), ' +
        '"~/Documents/file.txt" (home dir), or absolute like "C:\\\\Users\\\\...\\\\file.txt".',
    },
    dest: {
      type: 'string',
      description: 'Destination path (required for action=copy). Supports same path formats as path.',
    },
    content: {
      type: 'string',
      description: 'Content to write (required for action=write).',
    },
  },
  required: ['action', 'path'],
};

const BLOCKED = ['node_modules', '.git', '.env'];

function safeCheck(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  for (const b of BLOCKED) {
    if (normalized.includes(`/${b}`) || normalized.startsWith(b)) {
      throw new Error(`Access denied: ${b} is protected`);
    }
  }
}

function resolvePath(filePath) {
  if (path.isAbsolute(filePath)) return filePath;
  const home = os.homedir();
  // ~/... → home dir
  if (filePath.startsWith('~/') || filePath === '~') {
    return path.join(home, filePath.slice(2));
  }
  // Desktop/... or Desktop → user's actual Desktop
  if (filePath === 'Desktop' || filePath.startsWith('Desktop/') || filePath.startsWith('Desktop\\')) {
    return path.join(home, filePath);
  }
  // Documents/, Downloads/, Pictures/ → user home subdirs
  for (const wellKnown of ['Documents', 'Downloads', 'Pictures', 'Videos', 'Music']) {
    if (filePath === wellKnown || filePath.startsWith(wellKnown + '/') || filePath.startsWith(wellKnown + '\\')) {
      return path.join(home, filePath);
    }
  }
  // Fallback: relative to cwd
  return path.join(process.cwd(), filePath);
}

class FilesystemOps extends Tool {
  static lc_name() {
    return 'filesystem_ops';
  }

  static get jsonSchema() {
    return filesystemOpsJsonSchema;
  }

  constructor(fields = {}) {
    super(fields);
    this.name = 'filesystem_ops';
    this.description =
      'Read, write, copy, list, create, and delete files and directories on the local filesystem. ' +
      'Use action=copy to move or duplicate any file including images and screenshots. ' +
      'Use this to create project files, read configuration, list directories, and manage files.';
    this.schema = filesystemOpsJsonSchema;
  }

  async _call(input) {
    try {
      const { action, path: filePath, dest, content } = input;
      if (!filePath) return JSON.stringify({ error: 'path is required' });

      safeCheck(filePath);
      const resolved = resolvePath(filePath);

      if (action === 'read') {
        const data = await fs.readFile(resolved, 'utf8');
        return JSON.stringify({ path: filePath, content: data.slice(0, 8000) });
      }

      if (action === 'write') {
        if (content === undefined) return JSON.stringify({ error: 'content is required for write' });
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        let existed = false;
        try { await fs.access(resolved); existed = true; } catch {}
        await fs.writeFile(resolved, content, 'utf8');
        return JSON.stringify({
          success: true,
          path: filePath,
          bytes: content.length,
          note: existed ? 'File already existed and was overwritten.' : 'File created.',
        });
      }

      if (action === 'list') {
        const entries = await fs.readdir(resolved, { withFileTypes: true });
        const items = entries.map((e) => ({
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
        }));
        return JSON.stringify({ path: filePath, entries: items });
      }

      if (action === 'create_dir') {
        let existed = false;
        try { await fs.access(resolved); existed = true; } catch {}
        await fs.mkdir(resolved, { recursive: true });
        return JSON.stringify({
          success: true,
          path: resolved,
          note: existed
            ? 'Directory already existed — no changes made to existing contents.'
            : 'Directory created.',
        });
      }

      if (action === 'delete') {
        await fs.rm(resolved, { recursive: false });
        return JSON.stringify({ success: true, path: filePath });
      }

      if (action === 'copy') {
        if (!dest) return JSON.stringify({ error: 'dest is required for copy' });
        safeCheck(dest);
        const resolvedDest = resolvePath(dest);
        await fs.mkdir(path.dirname(resolvedDest), { recursive: true });
        await fs.copyFile(resolved, resolvedDest);
        const stat = await fs.stat(resolvedDest);
        return JSON.stringify({ success: true, src: filePath, dest, bytes: stat.size });
      }

      if (action === 'exists') {
        try {
          await fs.access(resolved);
          const stat = await fs.stat(resolved);
          return JSON.stringify({
            exists: true,
            type: stat.isDirectory() ? 'dir' : 'file',
            size: stat.size,
          });
        } catch {
          return JSON.stringify({ exists: false });
        }
      }

      return JSON.stringify({ error: `Unknown action: ${action}` });
    } catch (err) {
      const msg = err.message || String(err);
      // Give the agent a clear hint so it can self-correct the path
      const hint = msg.includes('ENOENT') && msg.includes('scandir')
        ? `${msg}. Hint: use "Desktop/folder" to target the user's Desktop, or provide an absolute path.`
        : msg;
      return JSON.stringify({ error: hint });
    }
  }
}

module.exports = FilesystemOps;
