'use strict';

/**
 * SkillVersionManager — Face 15.
 * Semantic versioning with rollback for skills.
 * Each skill has a version history; rollback restores a previous version.
 */

const semver = require('semver') || {
  valid: (v) => /^\d+\.\d+\.\d+/.test(v) ? v : null,
  gt: (a, b) => { const p = (s) => s.split('.').map(Number); const pa = p(a), pb = p(b); for (let i = 0; i < 3; i++) { if (pa[i] > pb[i]) return true; if (pa[i] < pb[i]) return false; } return false; },
  inc: (v, type) => { const [ma, mi, pa] = v.split('.').map(Number); if (type === 'major') return `${ma + 1}.0.0`; if (type === 'minor') return `${ma}.${mi + 1}.0`; return `${ma}.${mi}.${pa + 1}`; },
};

class SkillVersionManager {
  constructor() {
    this._skills = new Map(); // skillId → { current_version, versions: [] }
  }

  _getOrCreate(skillId) {
    if (!this._skills.has(skillId)) {
      this._skills.set(skillId, { skillId, current_version: null, versions: [] });
    }
    return this._skills.get(skillId);
  }

  /**
   * Publish a new version of a skill.
   * @param {string} skillId
   * @param {object} definition - Full skill definition
   * @param {string} version - Semantic version string (or 'auto' to auto-increment)
   * @param {string} bump - 'major' | 'minor' | 'patch' (used when version = 'auto')
   */
  publish(skillId, definition, version = 'auto', bump = 'patch') {
    const skill = this._getOrCreate(skillId);
    let ver;
    if (version === 'auto') {
      ver = skill.current_version ? (semver.inc || function(v, b){ const [ma,mi,pa]=v.split('.').map(Number); if(b==='major')return `${ma+1}.0.0`; if(b==='minor')return `${ma}.${mi+1}.0`; return `${ma}.${mi}.${pa+1}`; })(skill.current_version, bump) : '1.0.0';
    } else {
      ver = version;
    }

    if (skill.versions.find((v) => v.version === ver)) {
      throw new Error(`Version ${ver} already exists for skill ${skillId}`);
    }

    const entry = {
      version: ver,
      definition: JSON.parse(JSON.stringify(definition)),
      published_at: new Date().toISOString(),
      is_current: true,
    };

    // Mark all previous versions as not current
    skill.versions.forEach((v) => (v.is_current = false));
    skill.versions.push(entry);
    skill.current_version = ver;
    skill.updated_at = new Date().toISOString();
    return entry;
  }

  /**
   * Rollback a skill to a previous version.
   */
  rollback(skillId, targetVersion) {
    const skill = this._skills.get(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);
    const target = skill.versions.find((v) => v.version === targetVersion);
    if (!target) throw new Error(`Version ${targetVersion} not found for skill ${skillId}`);
    skill.versions.forEach((v) => (v.is_current = false));
    target.is_current = true;
    skill.current_version = targetVersion;
    skill.updated_at = new Date().toISOString();
    return { skillId, rolled_back_to: targetVersion, previous_version: skill.current_version };
  }

  getCurrentVersion(skillId) {
    const skill = this._skills.get(skillId);
    if (!skill || !skill.current_version) return null;
    return skill.versions.find((v) => v.is_current) || null;
  }

  getVersion(skillId, version) {
    const skill = this._skills.get(skillId);
    if (!skill) return null;
    return skill.versions.find((v) => v.version === version) || null;
  }

  getHistory(skillId) {
    const skill = this._skills.get(skillId);
    if (!skill) return [];
    return [...skill.versions].sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  }

  listSkills() {
    return Array.from(this._skills.values()).map((s) => ({
      skillId: s.skillId,
      current_version: s.current_version,
      version_count: s.versions.length,
      updated_at: s.updated_at,
    }));
  }

  deleteVersion(skillId, version) {
    const skill = this._skills.get(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);
    if (skill.current_version === version) throw new Error('Cannot delete current version');
    const idx = skill.versions.findIndex((v) => v.version === version);
    if (idx === -1) throw new Error(`Version not found: ${version}`);
    skill.versions.splice(idx, 1);
    return { deleted: version };
  }
}

let _instance = null;
function getSkillVersionManager() {
  if (!_instance) _instance = new SkillVersionManager();
  return _instance;
}

module.exports = { SkillVersionManager, getSkillVersionManager };
