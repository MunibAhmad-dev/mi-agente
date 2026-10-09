const mongoose = require('mongoose');
const { Schema } = mongoose;

const webhookDeliverySchema = new Schema({
  deliveryId: { type: String, required: true, unique: true },
  webhookId: { type: String, required: true, index: true },
  event: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, default: {} },
  payloadHash: { type: String, default: null },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed', 'retrying'],
    default: 'pending',
    index: true,
  },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  lastAttemptAt: { type: String, default: null },
  nextAttemptAt: { type: String, default: null },
  createdAt: { type: String },
  completedAt: { type: String, default: null },
  response: { type: Schema.Types.Mixed, default: null },
  error: { type: String, default: null },
});

webhookDeliverySchema.index({ webhookId: 1, createdAt: -1 });
webhookDeliverySchema.index({ status: 1, nextAttemptAt: 1 });

module.exports =
  mongoose.models.WebhookDelivery ||
  mongoose.model('WebhookDelivery', webhookDeliverySchema);
