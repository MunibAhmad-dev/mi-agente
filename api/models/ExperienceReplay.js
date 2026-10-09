const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * ExperienceReplay — persists agent experiences for Face 9 learning loop.
 *
 * Each document captures one agent turn: what was asked, what the agent did,
 * what happened, and a score. The LearningEngine uses these for reflection,
 * root-cause analysis, and strategy improvement.
 */
const experienceReplaySchema = new Schema(
  {
    sessionId: { type: String, index: true },
    conversationId: { type: String, index: true },
    userId: { type: String, index: true },
    agentId: { type: String, index: true },
    task: { type: String, required: true },
    taskType: { type: String, default: 'general' },
    actions: { type: Schema.Types.Mixed, default: [] },
    result: { type: Schema.Types.Mixed, default: {} },
    outcome: { type: String, enum: ['success', 'failure', 'partial', 'unknown'], default: 'unknown' },
    score: { type: Number, min: 0, max: 1, default: null },
    feedback: { type: String, default: '' },
    duration: { type: Number, default: 0 },
    toolCalls: { type: Number, default: 0 },
    reflection: { type: Schema.Types.Mixed, default: null },
    lessons: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
    tags: { type: [String], default: [] },
  },
  { timestamps: true },
);

experienceReplaySchema.index({ taskType: 1, outcome: 1 });
experienceReplaySchema.index({ createdAt: -1 });

const ExperienceReplay =
  mongoose.models.ExperienceReplay ||
  mongoose.model('ExperienceReplay', experienceReplaySchema);

/** Save a new experience. */
async function saveExperience(data) {
  return ExperienceReplay.create(data);
}

/** Get recent experiences, optionally filtered by taskType or outcome. */
async function getExperiences({ taskType, outcome, limit = 20, skip = 0 } = {}) {
  const filter = {};
  if (taskType) filter.taskType = taskType;
  if (outcome) filter.outcome = outcome;
  return ExperienceReplay.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
}

/** Get aggregated stats per task type. */
async function getLearningStats() {
  return ExperienceReplay.aggregate([
    {
      $group: {
        _id: '$taskType',
        total: { $sum: 1 },
        successes: { $sum: { $cond: [{ $eq: ['$outcome', 'success'] }, 1, 0] } },
        failures: { $sum: { $cond: [{ $eq: ['$outcome', 'failure'] }, 1, 0] } },
        avgScore: { $avg: '$score' },
        avgDuration: { $avg: '$duration' },
      },
    },
    { $sort: { total: -1 } },
  ]);
}

module.exports = {
  ExperienceReplay,
  saveExperience,
  getExperiences,
  getLearningStats,
};
