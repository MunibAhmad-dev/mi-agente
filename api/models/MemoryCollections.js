'use strict';

/**
 * MemoryCollections — Face performance: MongoDB indexes for memory recall.
 *
 * Three purpose-separated collections replace a single flat Memory table:
 *
 *   SessionMemory    — short-lived facts tied to one conversation session
 *   ProjectMemory    — persistent facts scoped to a project / agent config
 *   HistoricalMemory — event log for long-term learning and experience replay
 *
 * Each schema declares compound indexes on the most common query patterns
 * so recall stays fast as the collections grow.
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

/* ──────────────────────────────────────────────────────────
   SessionMemory
   Fast lookup: userId + sessionId (primary access pattern)
────────────────────────────────────────────────────────── */
const sessionMemorySchema = new Schema(
  {
    userId:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId:      { type: String, required: true },
    conversationId: { type: String },
    key:            { type: String, required: true },
    value:          { type: String, required: true },
    metadata:       { type: Schema.Types.Mixed, default: {} },
    // TTL index: documents auto-expire after `expiresAt`
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

// Primary recall: fetch all memories for a session
sessionMemorySchema.index({ userId: 1, sessionId: 1 });
// Secondary: fetch by user alone (cross-session recall)
sessionMemorySchema.index({ userId: 1 });
// Compound uniqueness: one value per key per session per user
sessionMemorySchema.index({ userId: 1, sessionId: 1, key: 1 }, { unique: true });
// TTL auto-expiry
sessionMemorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

/* ──────────────────────────────────────────────────────────
   ProjectMemory
   Fast lookup: userId + projectId
────────────────────────────────────────────────────────── */
const projectMemorySchema = new Schema(
  {
    userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    projectId: { type: String, required: true },
    agentId:   { type: String },
    key:       { type: String, required: true },
    value:     { type: String, required: true },
    category:  { type: String },
    importance: { type: Number, min: 1, max: 10, default: 5 },
    metadata:  { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// Primary recall: fetch all facts for a project
projectMemorySchema.index({ userId: 1, projectId: 1 });
// Secondary: look up by user + agent within project
projectMemorySchema.index({ userId: 1, projectId: 1, agentId: 1 });
// Compound uniqueness: one fact per key per project per user
projectMemorySchema.index({ userId: 1, projectId: 1, key: 1 }, { unique: true });
// Filter by category within a project
projectMemorySchema.index({ userId: 1, projectId: 1, category: 1 });

/* ──────────────────────────────────────────────────────────
   HistoricalMemory
   Event log for long-term learning — append-only, never unique
────────────────────────────────────────────────────────── */
const historicalMemorySchema = new Schema(
  {
    userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: { type: String },
    agentId:   { type: String },
    event:     { type: String, required: true },
    context:   { type: Schema.Types.Mixed },
    outcome:   { type: String, enum: ['success', 'failure', 'partial', 'unknown'], default: 'unknown' },
    score:     { type: Number, min: 0, max: 1 },
    tags:      [{ type: String }],
    metadata:  { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// Primary recall: all history for a user, newest first
historicalMemorySchema.index({ userId: 1, createdAt: -1 });
// Filter by agent within a user
historicalMemorySchema.index({ userId: 1, agentId: 1, createdAt: -1 });
// Filter by session
historicalMemorySchema.index({ userId: 1, sessionId: 1 });
// Filter by outcome for experience replay
historicalMemorySchema.index({ userId: 1, outcome: 1, createdAt: -1 });
// Tag-based recall
historicalMemorySchema.index({ userId: 1, tags: 1 });

/* ──────────────────────────────────────────────────────────
   Model registration (safe for hot-reload environments)
────────────────────────────────────────────────────────── */
const SessionMemory   = mongoose.models.SessionMemory   || mongoose.model('SessionMemory',   sessionMemorySchema);
const ProjectMemory   = mongoose.models.ProjectMemory   || mongoose.model('ProjectMemory',   projectMemorySchema);
const HistoricalMemory = mongoose.models.HistoricalMemory || mongoose.model('HistoricalMemory', historicalMemorySchema);

/* ──────────────────────────────────────────────────────────
   Helper functions
────────────────────────────────────────────────────────── */

/** Upsert a session memory fact (insert or update existing key). */
async function setSessionMemory(userId, sessionId, key, value, opts = {}) {
  return SessionMemory.findOneAndUpdate(
    { userId, sessionId, key },
    { $set: { value, metadata: opts.metadata || {}, expiresAt: opts.expiresAt } },
    { upsert: true, new: true },
  );
}

/** Get all session memories for a session, optionally filtered by keys. */
async function getSessionMemories(userId, sessionId, keys) {
  const filter = { userId, sessionId };
  if (keys?.length) filter.key = { $in: keys };
  return SessionMemory.find(filter).lean();
}

/** Upsert a project memory fact. */
async function setProjectMemory(userId, projectId, key, value, opts = {}) {
  return ProjectMemory.findOneAndUpdate(
    { userId, projectId, key },
    { $set: { value, agentId: opts.agentId, category: opts.category, importance: opts.importance, metadata: opts.metadata || {} } },
    { upsert: true, new: true },
  );
}

/** Get all facts for a project, optionally by category. */
async function getProjectMemories(userId, projectId, opts = {}) {
  const filter = { userId, projectId };
  if (opts.agentId)   filter.agentId = opts.agentId;
  if (opts.category)  filter.category = opts.category;
  return ProjectMemory.find(filter).sort({ importance: -1 }).lean();
}

/** Append a historical event (no upsert — every event is kept). */
async function recordHistoricalEvent(userId, data) {
  return HistoricalMemory.create({ userId, ...data });
}

/** Retrieve recent history for a user, optionally filtered. */
async function getHistoricalMemories(userId, opts = {}) {
  const filter = { userId };
  if (opts.agentId)   filter.agentId = opts.agentId;
  if (opts.sessionId) filter.sessionId = opts.sessionId;
  if (opts.outcome)   filter.outcome = opts.outcome;
  if (opts.tags)      filter.tags = { $in: opts.tags };
  return HistoricalMemory.find(filter)
    .sort({ createdAt: -1 })
    .limit(opts.limit || 100)
    .lean();
}

module.exports = {
  SessionMemory,
  ProjectMemory,
  HistoricalMemory,
  setSessionMemory,
  getSessionMemories,
  setProjectMemory,
  getProjectMemories,
  recordHistoricalEvent,
  getHistoricalMemories,
};
