'use strict';

/**
 * LessonEngine - Extracts, validates, and stores lessons from experiences
 */
class LessonEngine {
  constructor(config = {}) {
    this.config = config;
    this.lessons = new Map();
    this.lessonCount = 0;
    this.maxLessons = config.maxLessons || 5000;
  }

  /**
   * Create a lesson from an experience
   */
  createLesson(data) {
    const lesson = {
      id: `lesson_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type: data.type || 'error_learning', // error, failure, loop, recovery, user_feedback, skill, tool, workflow, task, domain, procedural, strategic, planning, reasoning, security, environment, model
      task: data.task || '',
      problem: data.problem || '',
      symptom: data.symptom || '',
      cause: data.cause || '',
      rootCause: data.rootCause || '',
      failedActions: data.failedActions || [],
      successfulActions: data.successfulActions || [],
      solution: data.solution || '',
      prevention: data.prevention || '',
      evidence: data.evidence || '',
      source: data.source || 'system',
      confidence: data.confidence || 0.5,
      applicability: data.applicability || 'general',
      environment: data.environment || {},
      model: data.model || null,
      tools: data.tools || [],
      skills: data.skills || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastValidated: null,
      usageCount: 0,
      successCount: 0,
      failureCount: 0,
      status: 'unverified', // unverified, low_confidence, provisional, verified, high_confidence
    };

    this.lessons.set(lesson.id, lesson);
    this.lessonCount++;
    return lesson;
  }

  /**
   * Validate a lesson with evidence
   */
  validateLesson(lessonId, evidence, confidence = 0.8) {
    const lesson = this.lessons.get(lessonId);
    if (!lesson) return null;

    lesson.evidence = evidence;
    lesson.confidence = confidence;
    lesson.lastValidated = new Date().toISOString();
    lesson.updatedAt = new Date().toISOString();

    if (confidence >= 0.8) lesson.status = 'high_confidence';
    else if (confidence >= 0.6) lesson.status = 'verified';
    else if (confidence >= 0.4) lesson.status = 'provisional';
    else lesson.status = 'low_confidence';

    return lesson;
  }

  /**
   * Record lesson usage
   */
  recordUsage(lessonId, success) {
    const lesson = this.lessons.get(lessonId);
    if (!lesson) return null;
    lesson.usageCount++;
    if (success) lesson.successCount++;
    else lesson.failureCount++;
    lesson.updatedAt = new Date().toISOString();
    return lesson;
  }

  /**
   * Find relevant lessons for a task/problem
   */
  findRelevant(query, options = {}) {
    const { type, minConfidence = 0.3, limit = 10 } = options;
    const queryLower = (query || '').toLowerCase();

    let candidates = Array.from(this.lessons.values());

    if (type) candidates = candidates.filter(l => l.type === type);
    if (minConfidence) candidates = candidates.filter(l => l.confidence >= minConfidence);

    // Score by relevance
    const scored = candidates.map(l => {
      let score = 0;
      if (l.task && queryLower.includes(l.task.toLowerCase())) score += 3;
      if (l.problem && queryLower.includes(l.problem.toLowerCase())) score += 2;
      if (l.solution && queryLower.includes(l.solution.toLowerCase())) score += 2;
      if (l.cause && queryLower.includes(l.cause.toLowerCase())) score += 1;
      score += l.confidence;
      score += (l.successCount / Math.max(l.usageCount, 1)) * 0.5;
      return { lesson: l, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.lesson);
  }

  /**
   * Detect contradictions between lessons
   */
  detectContradictions() {
    const contradictions = [];
    const lessons = Array.from(this.lessons.values());

    for (let i = 0; i < lessons.length; i++) {
      for (let j = i + 1; j < lessons.length; j++) {
        const a = lessons[i], b = lessons[j];
        // Same task but different solutions
        if (a.task === b.task && a.solution !== b.solution && a.task) {
          contradictions.push({
            lessonA: a.id,
            lessonB: b.id,
            type: 'conflicting_solutions',
            task: a.task,
          });
        }
        // Same cause but different prevention
        if (a.cause === b.cause && a.prevention !== b.prevention && a.cause) {
          contradictions.push({
            lessonA: a.id,
            lessonB: b.id,
            type: 'conflicting_prevention',
            cause: a.cause,
          });
        }
      }
    }
    return contradictions;
  }

  /**
   * Get lesson by ID
   */
  getLesson(id) { return this.lessons.get(id); }

  /**
   * Get all lessons
   */
  getAllLessons(limit = 100) { return Array.from(this.lessons.values()).slice(-limit); }

  /**
   * Get statistics
   */
  getStats() {
    const typeCounts = {};
    const statusCounts = {};
    for (const l of this.lessons.values()) {
      typeCounts[l.type] = (typeCounts[l.type] || 0) + 1;
      statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
    }
    return { total: this.lessons.size, typeCounts, statusCounts };
  }
}

module.exports = LessonEngine;
