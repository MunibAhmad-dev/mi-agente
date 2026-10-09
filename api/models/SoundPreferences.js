const mongoose = require('mongoose');
const { Schema } = mongoose;

const eventPrefSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    soundId: { type: String, default: '' },
    volume: { type: Number, default: null },
  },
  { _id: false },
);

const soundPreferencesSchema = new Schema(
  {
    user: { type: String, required: true, index: true, unique: true },
    soundsEnabled: { type: Boolean, default: true },
    masterVolume: { type: Number, default: 75, min: 0, max: 100 },
    backgroundSoundsEnabled: { type: Boolean, default: true },
    reduceDuringIntenseActivity: { type: Boolean, default: false },
    events: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.SoundPreferences || mongoose.model('SoundPreferences', soundPreferencesSchema);
