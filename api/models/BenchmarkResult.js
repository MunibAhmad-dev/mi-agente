const mongoose = require('mongoose');
const { Schema } = mongoose;

const benchmarkResultSchema = new Schema(
  {
    caseId: { type: String, required: true, index: true },
    configuration: { type: String, required: true },
    metrics: { type: Schema.Types.Mixed, default: {} },
    traceId: { type: String, default: null },
    timestamp: { type: Number, required: true },
  },
  { timestamps: false },
);

benchmarkResultSchema.index({ caseId: 1, configuration: 1 });

module.exports = mongoose.model('BenchmarkResult', benchmarkResultSchema);
