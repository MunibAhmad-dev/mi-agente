'use strict';

const crypto = require('crypto');

/**
 * SkillEngine - Extract, validate, version, and evolve skills.
 */
class SkillEngine {
  constructor(config = {}) {
    this.config = config;
    this.skills = new Map();
    this.stats = { extracted: 0, validated: 0, evolved: 0 };
  }

  async extract(pattern) {
    const id = `skill_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const skill = {
      id,
      name: pattern.name || `skill_${id}`,
      description: pattern.description || '',
      type: pattern.type || 'general',
      steps: pattern.steps || [],
      prerequisites: pattern.prerequisites || [],
      successRate: 0,
      version: 1,
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      history: [],
    };
    this.skills.set(id, skill);
    this.stats.extracted++;
    return skill;
  }

  async validate(skillId) {
    const skill = this.skills.get(skillId);
    if (!skill) return null;
    const isValid = skill.steps.length > 0 && skill.name.length > 0;
    skill.status = isValid ? 'validated' : 'invalid';
    this.stats.validated++;
    return { skill, valid: isValid };
  }

  async version(skillId, changes) {
    const skill = this.skills.get(skillId);
    if (!skill) return null;
    skill.history.push({ version: skill.version, ...skill, savedAt: Date.now() });
    Object.assign(skill, changes, { version: skill.version + 1, updatedAt: Date.now() });
    return skill;
  }

  async evolve(skillId, feedback) {
    const skill = this.skills.get(skillId);
    if (!skill) return null;
    skill.successRate = feedback.success
      ? Math.min(1, skill.successRate + 0.1)
      : Math.max(0, skill.successRate - 0.1);
    skill.updatedAt = Date.now();
    this.stats.evolved++;
    return skill;
  }

  async approve(skillId) {
    const skill = this.skills.get(skillId);
    if (skill) skill.status = 'approved';
    return skill;
  }

  async rollback(skillId, version) {
    const skill = this.skills.get(skillId);
    if (!skill) return null;
    const prev = skill.history.find(h => h.version === version);
    if (prev) { Object.assign(skill, prev, { updatedAt: Date.now() }); }
    return skill;
  }

  getSkill(id) { return this.skills.get(id); }
  getAllSkills() { return Array.from(this.skills.values()); }
  getByStatus(status) { return Array.from(this.skills.values()).filter(s => s.status === status); }

  getStats() {
    return {
      ...this.stats,
      total: this.skills.size,
      draft: this.getByStatus('draft').length,
      validated: this.getByStatus('validated').length,
      approved: this.getByStatus('approved').length,
    };
  }
}

module.exports = { SkillEngine };
