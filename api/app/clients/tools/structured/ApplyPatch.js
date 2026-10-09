const { Tool } = require('@librechat/agents/langchain/tools');
const fs = require('fs');
const path = require('path');

const applyPatchJsonSchema = {
  type: 'object',
  properties: {
    file_path: {
      type: 'string',
      minLength: 1,
      description: 'Absolute path to the file to patch.',
    },
    old_string: {
      type: 'string',
      description:
        'The exact string in the file to be replaced. Must match exactly including whitespace.',
    },
    new_string: {
      type: 'string',
      description: 'The new string to replace old_string with.',
    },
    create_if_missing: {
      type: 'boolean',
      description: 'If true and file does not exist, create it with new_string as content.',
    },
  },
  required: ['file_path', 'new_string'],
};

/**
 * ApplyPatch — Apply a string-based patch to a file.
 *
 * Supports:
 *   - Replace exact string (old_string → new_string)
 *   - Create new file (create_if_missing)
 *   - Append to file (old_string omitted)
 *
 * No external dependencies: uses Node.js fs module directly.
 */
class ApplyPatch extends Tool {
  static lc_name() {
    return 'apply_patch';
  }

  static get jsonSchema() {
    return applyPatchJsonSchema;
  }

  constructor(fields = {}) {
    super(fields);
    this.name = 'apply_patch';
    this.description =
      'Apply a patch to a file by replacing an exact string (old_string) with new content (new_string). ' +
      'Can also create new files (create_if_missing=true) or append content (old_string omitted). ' +
      'The old_string must match exactly including all whitespace and indentation.';
    this.schema = applyPatchJsonSchema;
  }

  async _call(input) {
    const { file_path, old_string, new_string, create_if_missing } = input;
    if (!file_path) {
      throw new Error('file_path is required');
    }
    if (new_string === undefined || new_string === null) {
      throw new Error('new_string is required');
    }

    const filePath = path.resolve(file_path);
    let content = '';
    let fileExists = false;
    try {
      content = fs.readFileSync(filePath, 'utf8');
      fileExists = true;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      if (!create_if_missing && old_string) {
        throw new Error(`File not found: ${filePath}. Set create_if_missing=true to create it.`);
      }
    }

    // Create new file
    if (!fileExists && create_if_missing) {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, new_string, 'utf8');
      return JSON.stringify({
        file_path: filePath,
        action: 'created',
        bytes_written: Buffer.byteLength(new_string, 'utf8'),
      });
    }

    // Append (no old_string)
    if (!old_string) {
      const updated = content + new_string;
      fs.writeFileSync(filePath, updated, 'utf8');
      return JSON.stringify({
        file_path: filePath,
        action: 'appended',
        bytes_written: Buffer.byteLength(new_string, 'utf8'),
      });
    }

    // Replace exact string
    const idx = content.indexOf(old_string);
    if (idx === -1) {
      throw new Error(
        `old_string not found in ${filePath}. Ensure exact match including whitespace.`,
      );
    }
    const occurrences = content.split(old_string).length - 1;
    if (occurrences > 1) {
      throw new Error(
        `old_string found ${occurrences} times in ${filePath}. Provide more context for a unique match.`,
      );
    }
    const updated =
      content.substring(0, idx) + new_string + content.substring(idx + old_string.length);
    fs.writeFileSync(filePath, updated, 'utf8');
    return JSON.stringify({
      file_path: filePath,
      action: 'replaced',
      bytes_removed: Buffer.byteLength(old_string, 'utf8'),
      bytes_added: Buffer.byteLength(new_string, 'utf8'),
    });
  }
}

module.exports = ApplyPatch;
