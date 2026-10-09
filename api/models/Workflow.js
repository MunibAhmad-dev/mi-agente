const mongoose = require('mongoose');
const { Schema } = mongoose;

const stepSchema = new Schema(
  {
    id: { type: String, required: true },
    name: String,
    type: String,
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
      default: 'pending',
    },
    result: { type: Schema.Types.Mixed },
    error: String,
    attempts: { type: Number, default: 0 },
    startedAt: Date,
    completedAt: Date,
    duration: Number,
  },
  { _id: false },
);

const workflowSchema = new Schema(
  {
    workflowId: { type: String, required: true, index: true, unique: true },
    name: { type: String, required: true },
    description: String,
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    steps: { type: [stepSchema], default: [] },
    result: { type: Schema.Types.Mixed },
    error: String,
    createdBy: { type: String, index: true },
    startedAt: Date,
    completedAt: Date,
    duration: Number,
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.Workflow || mongoose.model('Workflow', workflowSchema);
