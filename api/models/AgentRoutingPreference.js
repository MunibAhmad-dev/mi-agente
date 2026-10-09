const mongoose = require('mongoose');
const { Schema } = mongoose;

const metricsSchema = new Schema(
  {
    total: { type: Number, default: 0 },
    byTier: { type: Schema.Types.Mixed, default: {} },
    fallbacks: { type: Number, default: 0 },
    lastRoutedModel: { type: String, default: null },
    lastTier: { type: String, default: null },
    lastAt: { type: Date, default: null },
  },
  { _id: false },
);

const tiersSchema = new Schema(
  {
    small: { type: String, default: '' },
    medium: { type: String, default: '' },
    large: { type: String, default: '' },
  },
  { _id: false },
);

const agentRoutingPreferenceSchema = new Schema(
  {
    agentId: { type: String, required: true, index: true, unique: true },
    userId: { type: String, index: true },
    mode: { type: String, enum: ['auto', 'manual'], default: 'manual' },
    tiers: { type: tiersSchema, default: () => ({}) },
    metrics: { type: metricsSchema, default: () => ({}) },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.AgentRoutingPreference ||
  mongoose.model('AgentRoutingPreference', agentRoutingPreferenceSchema);
