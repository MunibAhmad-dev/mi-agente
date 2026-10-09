const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * ReputationTarget — entity to monitor (person, brand, company).
 */
const reputationTargetSchema = new Schema(
  {
    name: { type: String, required: true },
    keywords: { type: [String], default: [] },
    language: { type: String, default: 'en' },
    sources: {
      type: [String],
      default: ['web', 'news'],
      enum: ['web', 'news', 'social', 'reddit', 'youtube'],
    },
    scanIntervalHours: { type: Number, default: 24 },
    lastScannedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    createdBy: { type: String },
  },
  { timestamps: true },
);

const ReputationTarget =
  mongoose.models.ReputationTarget ||
  mongoose.model('ReputationTarget', reputationTargetSchema);

/**
 * ReputationScan — one scan result for a target.
 */
const reputationScanSchema = new Schema(
  {
    targetId: { type: Schema.Types.ObjectId, ref: 'ReputationTarget', index: true },
    targetName: { type: String },
    query: { type: String },
    sources: { type: [String], default: [] },
    results: { type: Schema.Types.Mixed, default: [] },
    mentions: { type: Number, default: 0 },
    sentiment: {
      positive: { type: Number, default: 0 },
      negative: { type: Number, default: 0 },
      neutral: { type: Number, default: 0 },
      overall: { type: String, enum: ['positive', 'negative', 'neutral', 'mixed'], default: 'neutral' },
    },
    alerts: { type: [String], default: [] },
    summary: { type: String, default: '' },
    error: { type: String, default: null },
  },
  { timestamps: true },
);

reputationScanSchema.index({ targetId: 1, createdAt: -1 });

const ReputationScan =
  mongoose.models.ReputationScan ||
  mongoose.model('ReputationScan', reputationScanSchema);

module.exports = { ReputationTarget, ReputationScan };
