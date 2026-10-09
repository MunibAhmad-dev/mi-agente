'use strict';

/**
 * CreativePlan — Face 22: Creative Engine project state + task graph.
 *
 * Each project has a set of phases with tasks and dependencies.
 * State is persisted to data/creative_projects/{projectId}.json.
 *
 * Phases (in order):
 *   planning → characters → assets → scenes → assembly → qa → export
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const logger = {
  info : (...a) => console.log('[CreativePlan]', ...a),
  warn : (...a) => console.warn('[CreativePlan]', ...a),
  error: (...a) => console.error('[CreativePlan]', ...a),
};

// Resolve storage root relative to the repo root (two levels up from this file).
const PROJECTS_DIR = path.resolve(
  __dirname, '../../../../data/creative_projects',
);

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
}

// Phase definitions — order matters for sequential dependency checking.
const PHASE_DEFS = [
  {
    id: 'planning',
    label: 'Idea & Planning',
    description: 'Break down the creative brief into tasks and identify required assets.',
    tasks: ['brief_analysis', 'asset_list', 'timeline'],
    dependsOn: [],
  },
  {
    id: 'characters',
    label: 'Character Design',
    description: 'Design and generate character sprites, concept art, and voice profiles.',
    tasks: ['character_sheets', 'sprite_generation', 'voice_profile'],
    dependsOn: ['planning'],
  },
  {
    id: 'assets',
    label: 'Asset Generation',
    description: 'Generate backgrounds, props, music, and sound effects.',
    tasks: ['backgrounds', 'props', 'music', 'sfx'],
    dependsOn: ['planning'],
  },
  {
    id: 'scenes',
    label: 'Scene Composition',
    description: 'Compose individual scenes from generated assets.',
    tasks: ['scene_layout', 'dialogue', 'transitions'],
    dependsOn: ['characters', 'assets'],
  },
  {
    id: 'assembly',
    label: 'Assembly',
    description: 'Stitch scenes together with audio into a coherent timeline.',
    tasks: ['timeline_assembly', 'audio_sync', 'color_grade'],
    dependsOn: ['scenes'],
  },
  {
    id: 'qa',
    label: 'Quality Assurance',
    description: 'Review output, flag issues, and iterate on problem areas.',
    tasks: ['review', 'issue_log', 'revisions'],
    dependsOn: ['assembly'],
  },
  {
    id: 'export',
    label: 'Export & Delivery',
    description: 'Render final output and package for delivery.',
    tasks: ['render', 'package', 'metadata'],
    dependsOn: ['qa'],
  },
];

// Supported project types
const PROJECT_TYPES = ['game', 'animation', 'video', 'visual_novel', 'music_video', 'short_film'];

class CreativePlan {
  /**
   * @param {string} projectId  UUID
   * @param {object} [initial]  Initial fields (title, description, type) for a brand-new plan.
   */
  constructor(projectId, initial = null) {
    this.projectId = projectId;
    this._filePath = path.join(PROJECTS_DIR, `${projectId}.json`);

    if (initial) {
      this._data = this._scaffold(initial);
      this._save();
    } else {
      this._data = this._load();
    }
  }

  // ── Static helpers ─────────────────────────────────────────────────────────

  /** Create a brand-new project, persist it, return the CreativePlan instance. */
  static create(fields = {}) {
    const id   = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const plan = new CreativePlan(id, fields);
    return plan;
  }

  /** Load an existing project by id, or return null if not found. */
  static load(projectId) {
    ensureDir(PROJECTS_DIR);
    const fp = path.join(PROJECTS_DIR, `${projectId}.json`);
    if (!fs.existsSync(fp)) return null;
    try {
      return new CreativePlan(projectId);
    } catch (e) {
      logger.error('load failed', e.message);
      return null;
    }
  }

  /** List all projects. Returns array of plain objects (not full instances). */
  static listAll() {
    ensureDir(PROJECTS_DIR);
    try {
      return fs.readdirSync(PROJECTS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          try {
            return JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, f), 'utf8'));
          } catch { return null; }
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (e) {
      logger.warn('listAll error', e.message);
      return [];
    }
  }

  // ── Instance API ────────────────────────────────────────────────────────────

  /** Return the full project data snapshot (plain object). */
  snapshot() { return JSON.parse(JSON.stringify(this._data)); }

  /** Update top-level fields and persist. */
  update(fields = {}) {
    Object.assign(this._data, fields, { updatedAt: new Date().toISOString() });
    this._save();
    return this;
  }

  /** Return phase data by id, or null. */
  getPhase(phaseId) {
    return this._data.phases[phaseId] || null;
  }

  /**
   * Advance a phase to a new status.
   * Returns { ok, error } — does NOT throw.
   */
  setPhaseStatus(phaseId, status) {
    const phase = this._data.phases[phaseId];
    if (!phase) return { ok: false, error: `Unknown phase: ${phaseId}` };

    const valid = ['pending', 'in_progress', 'completed', 'skipped', 'failed'];
    if (!valid.includes(status)) return { ok: false, error: `Invalid status: ${status}` };

    // Check dependencies
    if (status === 'in_progress') {
      const def = PHASE_DEFS.find(p => p.id === phaseId);
      if (def) {
        for (const dep of def.dependsOn) {
          const depStatus = this._data.phases[dep]?.status;
          if (depStatus !== 'completed' && depStatus !== 'skipped') {
            return { ok: false, error: `Dependency '${dep}' must be completed first (status: ${depStatus})` };
          }
        }
      }
    }

    phase.status = status;
    if (status === 'in_progress' && !phase.startedAt) phase.startedAt = new Date().toISOString();
    if (['completed', 'skipped', 'failed'].includes(status)) phase.completedAt = new Date().toISOString();

    this._data.updatedAt = new Date().toISOString();
    this._save();
    return { ok: true };
  }

  /** Mark a specific task within a phase as completed. */
  completeTask(phaseId, taskId) {
    const phase = this._data.phases[phaseId];
    if (!phase) return { ok: false, error: `Unknown phase: ${phaseId}` };
    if (!phase.completedTasks) phase.completedTasks = [];
    if (!phase.completedTasks.includes(taskId)) phase.completedTasks.push(taskId);
    this._data.updatedAt = new Date().toISOString();
    this._save();
    return { ok: true };
  }

  /** Append a log entry to a phase. */
  logPhaseEvent(phaseId, event) {
    const phase = this._data.phases[phaseId];
    if (!phase) return;
    if (!phase.log) phase.log = [];
    phase.log.push({ ts: new Date().toISOString(), ...event });
    this._data.updatedAt = new Date().toISOString();
    this._save();
  }

  /** Return overall project status derived from phases. */
  computeStatus() {
    const phases = Object.values(this._data.phases);
    if (phases.every(p => p.status === 'completed' || p.status === 'skipped')) return 'completed';
    if (phases.some(p => p.status === 'failed')) return 'failed';
    if (phases.some(p => p.status === 'in_progress')) return 'in_progress';
    return 'created';
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _scaffold({ title = 'Untitled', description = '', type = 'video' }) {
    const type_ = PROJECT_TYPES.includes(type) ? type : 'video';
    const phases = {};
    for (const def of PHASE_DEFS) {
      phases[def.id] = {
        status: 'pending',
        label: def.label,
        description: def.description,
        tasks: def.tasks,
        completedTasks: [],
        dependsOn: def.dependsOn,
        startedAt: null,
        completedAt: null,
        log: [],
      };
    }
    return {
      id: this.projectId,
      title,
      description,
      type: type_,
      status: 'created',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phases,
      characters: [],
      assets: [],
      scenes: [],
      output: null,
    };
  }

  _load() {
    ensureDir(PROJECTS_DIR);
    if (!fs.existsSync(this._filePath)) throw new Error(`Project not found: ${this.projectId}`);
    return JSON.parse(fs.readFileSync(this._filePath, 'utf8'));
  }

  _save() {
    ensureDir(PROJECTS_DIR);
    fs.writeFileSync(this._filePath, JSON.stringify(this._data, null, 2), 'utf8');
  }
}

module.exports = { CreativePlan, PHASE_DEFS, PROJECT_TYPES };
