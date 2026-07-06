const mongoose = require("mongoose");

const leaveSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
        required: true
    },
    regNo: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    numberOfDays: {
        type: Number,
        required: true,
        min: 1
    },
    reason: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    status: {
        type: String,
        enum: ["active", "completed", "cancelled"],
        default: "active"
    }
});

// const Leave = mongoose.model("Leave", leaveSchema);

module.exports = mongoose.model("Leave", leaveSchema);
