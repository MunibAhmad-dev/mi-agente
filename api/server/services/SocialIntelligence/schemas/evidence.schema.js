/**
 * Evidence MongoDB Schema
 * =======================
 * Stores evidence backing every claim.
 */

let mongoose;
try { mongoose = require('mongoose'); } catch { mongoose = null; }

function getEvidenceSchema() {
  if (!mongoose) return null;
  const schema = new mongoose.Schema({
    evidenceId: { type: String, index: true, unique: true },
    source: { type: String, index: true },
    url: { type: String },
    content: { type: String },
    timestamp: { type: Date },
    retrievedAt: { type: Date, default: Date.now },
    hash: { type: String, index: true },
    authorRef: { type: String },
    processingMethod: { type: String, default: 'direct' },
    confidence: { type: Number, default: 0.5 },
    type: { type: String, index: true, default: 'observed' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  }, { timestamps: true });
  schema.index({ source: 1, timestamp: -1 });
  schema.index({ type: 1, confidence: -1 });
  return schema;
}

let EvidenceModel = null;
function getEvidenceModel() {
  if (EvidenceModel) return EvidenceModel;
  if (!mongoose) { try { mongoose = require('mongoose'); } catch { return null; } }
  if (!mongoose.connection || mongoose.connection.readyState !== 1) return null;
  try { EvidenceModel = mongoose.model('SocialEvidence'); } catch {
    const s = getEvidenceSchema();
    if (!s) return null;
    EvidenceModel = mongoose.model('SocialEvidence', s, 'social_evidence');
  }
  return EvidenceModel;
}

module.exports = { getEvidenceModel, getEvidenceSchema };
