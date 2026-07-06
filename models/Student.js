const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  regNo: { type: String, required: true, unique: true },
  year: { type: String, required: true },
  phone: { type: String, required: true }, // Add phone number field
  photo: { type: String },
  buildingId: { type: mongoose.Schema.Types.ObjectId, ref: "Building" },
  building: { type: String, required: true },
  wing: { type: String, required: true },
  floor: { type: Number, required: true },
  room: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Create a compound index for efficient room-based queries
studentSchema.index({ buildingId: 1, wing: 1, floor: 1, room: 1 });

module.exports = mongoose.model("Student", studentSchema);