const mongoose = require('mongoose');
const { Schema } = mongoose;

const scheduledJobSchema = new Schema(
  {
    jobId: { type: String, required: true, unique: true },
    expression: { type: String, required: true },
    options: { type: Schema.Types.Mixed, default: {} },
    active: { type: Boolean, default: true },
    runCount: { type: Number, default: 0 },
    lastRun: { type: String, default: null },
    lastError: { type: String, default: null },
    createdAt: { type: String },
  },
  { timestamps: false },
);

module.exports = mongoose.model('ScheduledJob', scheduledJobSchema);
