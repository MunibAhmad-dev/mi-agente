const mongoose = require('mongoose');
const { Schema } = mongoose;

const multiAgentSessionSchema = new Schema(
  {
    sid: { type: String, required: true, index: true, unique: true },
    agents: { type: Schema.Types.Mixed, default: [] },
    tasks: { type: Schema.Types.Mixed, default: [] },
    state: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: String },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.MultiAgentSession ||
  mongoose.model('MultiAgentSession', multiAgentSessionSchema);
