const mongoose = require("mongoose");

const scheduleSchema = new mongoose.Schema({
  startTime: {
    type: String,
    required: true,
    // Format: HH:MM (24-hour)
    match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  endTime: {
    type: String,
    required: true,
    // Format: HH:MM (24-hour)
    match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
});

scheduleSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Schedule", scheduleSchema);