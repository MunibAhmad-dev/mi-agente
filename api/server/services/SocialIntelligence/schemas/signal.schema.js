/**
 * Signal MongoDB Schema
 * =====================
 * Stores extracted signals from social content.
 */

let mongoose;
try { mongoose = require('mongoose'); } catch { mongoose = null; }

function getSignalSchema() {
  if (!mongoose) return null;
  const schema = new mongoose.Schema({
    signalId: { type: String, index: true, unique: true },
    type: { type: String, index: true, required: true },
    source: { type: String, index: true },
    evidenceIds: [{ type: String }],
    confidence: { type: Number, default: 0.5 },
    strength: { type: Number, default: 0.5 },
    contentId: { type: String, index: true },
    accountId: { type: String, index: true },
    communityId: { type: String, index: true },
    topics: [{ type: String }],
    keywords: [{ type: String }],
    sentiment: { type: Number, default: 0 },
    detectedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  }, { timestamps: true });
  schema.index({ type: 1, detectedAt: -1 });
  schema.index({ confidence: -1 });
  schema.index({ topics: 1 });
  return schema;
}

let SignalModel = null;
function getSignalModel() {
  if (SignalModel) return SignalModel;
  if (!mongoose) { try { mongoose = require('mongoose'); } catch { return null; } }
  if (!mongoose.connection || mongoose.connection.readyState !== 1) return null;
  try { SignalModel = mongoose.model('SocialSignal'); } catch {
    const s = getSignalSchema();
    if (!s) return null;
    SignalModel = mongoose.model('SocialSignal', s, 'social_signals');
  }
  return SignalModel;
}

module.exports = { getSignalModel, getSignalSchema };
