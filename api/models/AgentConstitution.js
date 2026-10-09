const mongoose = require('mongoose');
const { Schema } = mongoose;

const agentConstitutionSchema = new Schema(
  {
    name: { type: String, required: true, default: 'default' },
    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: false },
    persona: { type: String, default: '' },
    values: { type: [String], default: [] },
    operatingPrinciples: { type: [String], default: [] },
    constraints: { type: [String], default: [] },
    fullText: { type: String, default: '' },
    activatedBy: { type: String, default: null },
    activatedAt: { type: Date, default: null },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);

agentConstitutionSchema.index({ name: 1, version: 1 }, { unique: true });
agentConstitutionSchema.index({ isActive: 1 });

const AgentConstitution =
  mongoose.models.AgentConstitution ||
  mongoose.model('AgentConstitution', agentConstitutionSchema);

/** Get the single active constitution, or null. */
async function getActiveConstitution() {
  return AgentConstitution.findOne({ isActive: true }).lean();
}

/** Set constitution as active (deactivates all others). */
async function activateConstitution(id, activatedBy) {
  await AgentConstitution.updateMany({}, { $set: { isActive: false } });
  return AgentConstitution.findByIdAndUpdate(
    id,
    { $set: { isActive: true, activatedBy, activatedAt: new Date() } },
    { new: true },
  );
}

/** Create or update a constitution version. */
async function upsertConstitution(data, userId) {
  const { name = 'default', version, ...rest } = data;
  // Compute next version if not provided
  let ver = version;
  if (!ver) {
    const latest = await AgentConstitution.findOne({ name }).sort({ version: -1 }).lean();
    ver = latest ? latest.version + 1 : 1;
  }
  return AgentConstitution.findOneAndUpdate(
    { name, version: ver },
    { $set: { ...rest, name, version: ver } },
    { new: true, upsert: true },
  );
}

module.exports = {
  AgentConstitution,
  getActiveConstitution,
  activateConstitution,
  upsertConstitution,
};
