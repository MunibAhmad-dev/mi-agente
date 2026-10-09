'use strict';

/**
 * CurriculumGenerator — Face 10.
 * Generates structured learning curricula based on a learner profile,
 * knowledge gaps detected by the ResearchOS, and target capability goals.
 *
 * A Curriculum is: goal → modules[] → lessons[] → exercises[]
 * Each lesson can be delivered as a chat session, code challenge, or quiz.
 */

class CurriculumGenerator {
  constructor() {
    this._curricula = new Map();
    this._id = 0;
  }

  /**
   * Generate a curriculum for a learner.
   * @param {object} opts
   * @param {string} opts.goal — e.g. "Understand transformer architectures"
   * @param {string[]} opts.knownTopics — topics the learner already knows
   * @param {string[]} opts.targetTopics — topics to cover
   * @param {string} opts.level — 'beginner'|'intermediate'|'advanced'
   * @param {string} opts.learner_id — optional learner id for tracking
   * @returns {Curriculum}
   */
  generate({ goal, knownTopics = [], targetTopics = [], level = 'intermediate', learner_id = null } = {}) {
    const id = `curr_${++this._id}_${Date.now()}`;
    const gaps = targetTopics.filter((t) => !knownTopics.includes(t));

    const modules = this._buildModules(goal, gaps, level);
    const curriculum = {
      id,
      goal,
      learner_id,
      level,
      known_topics: knownTopics,
      target_topics: targetTopics,
      gaps,
      modules,
      total_lessons: modules.reduce((sum, m) => sum + m.lessons.length, 0),
      estimated_hours: modules.reduce((sum, m) => sum + m.estimated_hours, 0),
      created_at: new Date().toISOString(),
      status: 'pending',
    };

    this._curricula.set(id, curriculum);
    return curriculum;
  }

  /**
   * Get a curriculum by id.
   */
  get(id) { return this._curricula.get(id) || null; }

  /**
   * List all curricula, optionally filtered by learner_id.
   */
  list({ learner_id } = {}) {
    const all = Array.from(this._curricula.values());
    if (learner_id) return all.filter((c) => c.learner_id === learner_id);
    return all;
  }

  /**
   * Mark a lesson as completed and return progress info.
   */
  completeLesson(curriculumId, moduleIdx, lessonIdx) {
    const c = this._curricula.get(curriculumId);
    if (!c) throw new Error(`Curriculum ${curriculumId} not found`);
    const lesson = c.modules[moduleIdx]?.lessons[lessonIdx];
    if (!lesson) throw new Error(`Lesson ${moduleIdx}/${lessonIdx} not found`);
    lesson.status = 'completed';
    lesson.completed_at = new Date().toISOString();
    const totalLessons = c.total_lessons;
    const completed = c.modules.flatMap((m) => m.lessons).filter((l) => l.status === 'completed').length;
    c.progress = Math.round((completed / totalLessons) * 100);
    if (c.progress === 100) c.status = 'completed';
    return { progress: c.progress, lesson, curriculum_id: curriculumId };
  }

  /**
   * Adapt curriculum based on new gap analysis.
   */
  adapt(curriculumId, newGaps = []) {
    const c = this._curricula.get(curriculumId);
    if (!c) throw new Error(`Curriculum ${curriculumId} not found`);
    const newModules = this._buildModules(c.goal, newGaps, c.level);
    c.modules.push(...newModules);
    c.gaps.push(...newGaps.filter((g) => !c.gaps.includes(g)));
    c.total_lessons = c.modules.reduce((sum, m) => sum + m.lessons.length, 0);
    c.estimated_hours = c.modules.reduce((sum, m) => sum + m.estimated_hours, 0);
    c.updated_at = new Date().toISOString();
    return c;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _buildModules(goal, gaps, level) {
    if (gaps.length === 0) {
      return [{
        id: 'module_intro',
        title: `Introduction: ${goal}`,
        description: 'Foundation concepts and overview',
        estimated_hours: 1,
        lessons: [this._lesson('Overview', 'chat', level), this._lesson('Key concepts', 'quiz', level)],
      }];
    }

    return gaps.map((topic, idx) => ({
      id: `module_${idx + 1}`,
      title: topic,
      description: `Deep dive: ${topic}`,
      estimated_hours: this._estimateHours(topic, level),
      lessons: this._buildLessons(topic, level),
    }));
  }

  _buildLessons(topic, level) {
    const lessons = [
      this._lesson(`What is ${topic}?`, 'chat', level),
      this._lesson(`${topic} in practice`, 'code', level),
    ];
    if (level !== 'beginner') {
      lessons.push(this._lesson(`Advanced ${topic}`, 'chat', level));
    }
    lessons.push(this._lesson(`${topic} quiz`, 'quiz', level));
    return lessons;
  }

  _lesson(title, type, level) {
    return {
      title,
      type,
      level,
      status: 'pending',
      created_at: new Date().toISOString(),
      exercises: type === 'quiz' ? this._exercises(title) : [],
    };
  }

  _exercises(topic) {
    return [
      { question: `Define the key term in "${topic}".`, type: 'short_answer' },
      { question: `Give an example of "${topic}" in a real system.`, type: 'short_answer' },
    ];
  }

  _estimateHours(topic, level) {
    const base = level === 'beginner' ? 1 : level === 'intermediate' ? 2 : 3;
    return base + (topic.length > 20 ? 1 : 0);
  }
}

let _instance = null;
function getCurriculumGenerator() {
  if (!_instance) _instance = new CurriculumGenerator();
  return _instance;
}

module.exports = { CurriculumGenerator, getCurriculumGenerator };
