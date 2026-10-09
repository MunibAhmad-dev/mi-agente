/**
 * SkillInstaller — Instala skills desde distintas fuentes.
 *
 * Métodos de instalación:
 *   - git clone (GitHub repos)
 *   - npm install (paquetes npm)
 *   - hf download (HuggingFace)
 *   - npx (MCP servers)
 *   - local copy (skills locales)
 *
 * Destino: ~/.agent/skills/ (compatible con Claude Code, Codex, OpenCode)
 * También enlaza a ~/.claude/skills/ y ~/.codex/skills/ si existen.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SKILLS_DIR = path.join(os.homedir(), '.agent', 'skills');

/**
 * Asegura que el directorio de skills existe.
 * @param {string} [baseDir]
 * @returns {string}
 */
function ensureSkillsDir(baseDir) {
  const dir = baseDir || SKILLS_DIR;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Detecta el método de instalación desde el campo install.
 * @param {string} installCmd
 * @returns {string}
 */
function detectMethod(installCmd) {
  const cmd = (installCmd || '').toLowerCase();
  if (cmd.startsWith('git clone')) return 'git';
  if (cmd.startsWith('npm ') || cmd.startsWith('npm install')) return 'npm';
  if (cmd.startsWith('npx')) return 'npx';
  if (cmd.startsWith('hf download')) return 'hf';
  if (cmd.startsWith('docker')) return 'docker';
  if (cmd.startsWith('pip')) return 'pip';
  if (cmd === 'browse-only') return 'browse-only';
  return 'manual';
}

/**
 * Instala via git clone.
 * @param {string} url
 * @param {string} name
 * @param {string} [baseDir]
 * @param {object} [opts]
 * @param {boolean} [opts.authorized] - must be true; enforces that callers pass explicit authorization
 * @returns {object}
 */
function installGit(url, name, baseDir, opts = {}) {
  if (!opts.authorized) {
    throw new Error('installGit requires opts.authorized=true — call only from an admin-gated code path');
  }
  const dir = ensureSkillsDir(baseDir);
  const target = path.join(dir, name);
  if (fs.existsSync(target)) {
    return { method: 'git', status: 'already-installed', path: target };
  }
  try {
    execSync(`git clone --depth 1 ${url} "${target}"`, {
      timeout: 60000,
      stdio: 'pipe',
    });
    linkToOtherAgents(name, target);
    return { method: 'git', status: 'installed', path: target };
  } catch (e) {
    return { method: 'git', status: 'error', error: e.message };
  }
}

/**
 * Instala via npm.
 * @param {string} pkg
 * @param {object} [opts]
 * @param {boolean} [opts.authorized] - must be true; enforces that callers pass explicit authorization
 * @returns {object}
 */
function installNpm(pkg, opts = {}) {
  if (!opts.authorized) {
    throw new Error('installNpm requires opts.authorized=true — call only from an admin-gated code path');
  }
  try {
    execSync(`npm install -g ${pkg}`, { timeout: 60000, stdio: 'pipe' });
    return { method: 'npm', status: 'installed', package: pkg };
  } catch (e) {
    return { method: 'npm', status: 'error', error: e.message };
  }
}

/**
 * Instala via hf download (HuggingFace).
 * @param {string} repoId
 * @param {string} name
 * @param {string} [baseDir]
 * @param {object} [opts]
 * @param {boolean} [opts.authorized] - must be true; enforces that callers pass explicit authorization
 * @returns {object}
 */
function installHf(repoId, name, baseDir, opts = {}) {
  if (!opts.authorized) {
    throw new Error('installHf requires opts.authorized=true — call only from an admin-gated code path');
  }
  const dir = ensureSkillsDir(baseDir);
  const target = path.join(dir, name);
  try {
    execSync(`hf download ${repoId} --local-dir "${target}"`, {
      timeout: 120000,
      stdio: 'pipe',
    });
    return { method: 'hf', status: 'installed', path: target };
  } catch (e) {
    return { method: 'hf', status: 'error', error: e.message };
  }
}

/**
 * Registra un MCP server via npx (no instala, solo configura).
 * @param {string} command
 * @returns {object}
 */
function registerNpx(command) {
  return { method: 'npx', status: 'registered', command };
}

/**
 * Enlaza el skill a los directorios de otros agents si existen.
 * @param {string} name
 * @param {string} source
 */
function linkToOtherAgents(name, source) {
  const home = os.homedir();
  const targets = [path.join(home, '.claude', 'skills'), path.join(home, '.codex', 'skills')];
  for (const target of targets) {
    if (fs.existsSync(path.dirname(target))) {
      const link = path.join(target, name);
      if (!fs.existsSync(link)) {
        try {
          fs.symlinkSync(source, link, 'dir');
        } catch {
          // symlink puede fallar en Windows sin permisos
        }
      }
    }
  }
}

/**
 * Instala un skill desde un entry del registry.
 * @param {object} entry — entry normalizado del DiscoveryProvider
 * @param {string} [baseDir]
 * @param {object} [opts]
 * @param {boolean} [opts.authorized] - must be true; propagated to install methods
 * @returns {object}
 */
function install(entry, baseDir, opts = {}) {
  if (!entry) throw new Error('No entry provided');
  if (!opts.authorized) {
    throw new Error('install() requires opts.authorized=true — must be called from an admin-gated HTTP route');
  }
  const method = detectMethod(entry.install);
  const name = entry.name || entry.id;
  switch (method) {
    case 'git':
      return installGit(extractGitUrl(entry.install), name, baseDir, opts);
    case 'npm':
      return installNpm(extractNpmPackage(entry.install), opts);
    case 'hf':
      return installHf(extractHfRepo(entry.install), name, baseDir, opts);
    case 'npx':
      return registerNpx(entry.install);
    case 'browse-only':
      return { method: 'browse', status: 'browse-only', url: entry.url };
    default:
      return { method: 'manual', status: 'requires-manual', entry };
  }
}

/**
 * Extrae la URL de git del comando install.
 * @param {string} cmd
 * @returns {string}
 */
function extractGitUrl(cmd) {
  const match = (cmd || '').match(/git clone\s+(?:--depth\s+1\s+)?(https:\/\/\S+)/);
  return match ? match[1] : '';
}

/**
 * Extrae el paquete npm.
 * @param {string} cmd
 * @returns {string}
 */
function extractNpmPackage(cmd) {
  const match = (cmd || '').match(/npm install\s+(?:-g\s+)?(\S+)/);
  return match ? match[1] : cmd.replace('npm install', '').trim();
}

/**
 * Extrae el repo ID de HF.
 * @param {string} cmd
 * @returns {string}
 */
function extractHfRepo(cmd) {
  const match = (cmd || '').match(/hf download\s+(\S+)/);
  return match ? match[1] : '';
}

/**
 * Lista los skills instalados localmente.
 * @param {string} [baseDir]
 * @returns {Array}
 */
function listInstalled(baseDir) {
  const dir = baseDir || SKILLS_DIR;
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const skillPath = path.join(dir, e.name);
      const skillMd = path.join(skillPath, 'SKILL.md');
      let description = '';
      if (fs.existsSync(skillMd)) {
        try {
          const content = fs.readFileSync(skillMd, 'utf8');
          const match = content.match(/description:\s*(.+)/);
          if (match) description = match[1].trim();
        } catch {
          // ignore
        }
      }
      return {
        name: e.name,
        path: skillPath,
        hasSKILLMd: fs.existsSync(skillMd),
        description,
      };
    });
}

/**
 * Desinstala un skill.
 * @param {string} name
 * @param {string} [baseDir]
 * @returns {boolean}
 */
function uninstall(name, baseDir) {
  const dir = baseDir || SKILLS_DIR;
  const target = path.join(dir, name);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    // Limpiar symlinks
    const home = os.homedir();
    const links = [
      path.join(home, '.claude', 'skills', name),
      path.join(home, '.codex', 'skills', name),
    ];
    for (const link of links) {
      if (fs.existsSync(link)) {
        try {
          fs.unlinkSync(link);
        } catch {
          // ignore
        }
      }
    }
    return true;
  }
  return false;
}

module.exports = {
  install,
  installGit,
  installNpm,
  installHf,
  registerNpx,
  listInstalled,
  uninstall,
  detectMethod,
  ensureSkillsDir,
  SKILLS_DIR,
};
