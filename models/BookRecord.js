// Inside models/BookRecord.js
const mongoose = require("mongoose");

const BookRecordSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  roomNumber: { type: String, required: true },
  buildingId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Building', 
    required: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  createdAt: { type: Date, default: Date.now }
});

const BookRecord = mongoose.model("BookRecord", BookRecordSchema);
module.exports = BookRecord;