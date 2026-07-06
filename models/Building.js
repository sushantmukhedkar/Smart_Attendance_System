const mongoose = require("mongoose");

const BuildingSchema = new mongoose.Schema({
  buildingName: { type: String, required: true },
  wings: { type: [String], required: true }, // Change: Now it's an array of strings
  floorsPerWing: { type: Number, required: true },
  roomsPerFloor: { type: [Number], required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
});

module.exports = mongoose.model("Building", BuildingSchema);
