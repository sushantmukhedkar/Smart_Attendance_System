const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  time: {
    type: String,
    required: true,
    enum: ["Morning", "Afternoon", "Evening", "Night"],
  },
  buildingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Building",
    required: true,
  },
  // buildingName: {
  // type: String,
  // required: true,
  // },
  wing: {
    type: String,
    required: true,
  },
  floor: {
    type: Number,
    required: true,
  },
  room: {
    type: Number,
    required: true,
  },
  students: [
    {
      studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
      },
      name: {
        type: String,
        required: true,
      },
      regNo: {
        type: String,
        required: true,
      },
      present: {
        type: Boolean,
        default: false,
      },
      onLeave:{
        type:Boolean,
        default:false
      },
      numberOfDays:{
        type:Number,
        default:0
      }
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
});

// Create compound index for efficient querying
attendanceSchema.index({ buildingId: 1, wing: 1, floor: 1, room: 1, date: 1 });

module.exports = mongoose.model("Attendance", attendanceSchema);
