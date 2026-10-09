const mongoose = require('mongoose');
const { Schema } = mongoose;

const userStreakSchema = new Schema(
  {
    userId: { type: String, required: true, index: true, unique: true },
    streak: { type: Number, default: 0 },
    bestStreak: { type: Number, default: 0 },
    totalActiveDays: { type: Number, default: 0 },
    firstActiveDate: { type: Date },
    lastActiveDate: { type: Date },
    lastGiftClaimedStreak: { type: Number, default: 0 },
    extraSessionsPerDay: { type: Number, default: 0 },
    dailySessionLimit: { type: Number, default: -1 },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.UserStreak || mongoose.model('UserStreak', userStreakSchema);
