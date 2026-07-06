const express = require("express");
const router = express.Router();
const Attendance = require("../models/Attendance");
const Student = require("../models/Student");
const Building = require("../models/Building");
const Schedule = require("../models/Schedule"); // Import the new Schedule model
const Leave = require("../models/LeaveSchema"); // Import the new Schedule model
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { Parser } = require("json2csv");
const moment = require("moment");
const auth = require("../middleware/authMiddleware"); // Add this import

// Helper function to check if current time is within attendance window
const isWithinAttendanceWindow = async () => {
  try {
    // Find the most recent schedule
    const schedule = await Schedule.findOne().sort({ updatedAt: -1 });

    if (!schedule) {
      // If no schedule is set, allow attendance (default behavior)
      return { allowed: true };
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeString = `${currentHour
      .toString()
      .padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`;

    // Check if current time is within the attendance window
    if (
      currentTimeString >= schedule.startTime &&
      currentTimeString <= schedule.endTime
    ) {
      return { allowed: true };
    } else {
      return {
        allowed: false,
        message: `Attendance can only be taken between ${schedule.startTime} and ${schedule.endTime}`,
        schedule: {
          startTime: schedule.startTime,
          endTime: schedule.endTime,
        },
      };
    }
  } catch (error) {
    console.error("Error checking attendance window:", error);
    // In case of error, allow attendance by default
    return { allowed: true };
  }
};

// Get current schedule
router.get("/schedule", async (req, res) => {
  try {
    const schedule = await Schedule.findOne().sort({ updatedAt: -1 });

    if (schedule) {
      return res.json({
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        updatedAt: schedule.updatedAt,
      });
    } else {
      return res.json({
        startTime: "00:00",
        endTime: "23:59",
        message: "No schedule set. Using default (all day).",
      });
    }
  } catch (error) {
    console.error("Error fetching schedule:", error);
    res.status(500).json({ error: "Failed to fetch schedule" });
  }
});

// Update schedule
router.post("/schedule", async (req, res) => {
  try {
    const { startTime, endTime } = req.body;

    if (!startTime || !endTime) {
      return res
        .status(400)
        .json({ error: "Start time and end time are required" });
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res
        .status(400)
        .json({ error: "Invalid time format. Use HH:MM (24-hour format)" });
    }

    // Ensure end time is after start time
    if (startTime >= endTime) {
      return res
        .status(400)
        .json({ error: "End time must be after start time" });
    }

    // Create or update schedule
    let schedule = await Schedule.findOne().sort({ updatedAt: -1 });

    if (!schedule) {
      schedule = new Schedule({
        startTime,
        endTime,
        createdBy: req.user ? req.user._id : null,
      });
    } else {
      schedule.startTime = startTime;
      schedule.endTime = endTime;
      schedule.updatedAt = Date.now();
    }

    await schedule.save();

    res.json({
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      updatedAt: schedule.updatedAt,
    });
  } catch (error) {
    console.error("Error saving schedule:", error);
    res.status(500).json({ error: "Failed to save schedule" });
  }
});

// Get student details after face recognition
router.post("/verify-student", async (req, res) => {
  try {
    // Check if within attendance window
    const windowCheck = await isWithinAttendanceWindow();

    if (!windowCheck.allowed) {
      return res.status(403).json({
        error: windowCheck.message,
        schedule: windowCheck.schedule,
        status: "outside_window",
      });
    }

    const { regNo, confidence, imagePath } = req.body;

    if (!regNo) {
      return res.status(400).json({ error: "Registration number is required" });
    }

    // Find student in database
    const student = await Student.findOne({ regNo });

    if (!student) {
      return res.status(404).json({
        matched: true,
        confidence: confidence,
        error: "Student not found in database",
      });
    }

    // Return student details
    res.json({
      matched: true,
      student: {
        _id: student._id,
        name: student.name,
        regNo: student.regNo,
        photo: student.photo,
        year: student.year,
        building: student.building,
        wing: student.wing,
        floor: student.floor,
        room: student.room,
      },
      confidence: confidence,
    });
  } catch (error) {
    console.error("Error verifying student:", error);
    res.status(500).json({ error: "Failed to verify student" });
  }
});

// Mark attendance
router.post("/mark", async (req, res) => {
  try {
    // Check if within attendance window
    const windowCheck = await isWithinAttendanceWindow();

    if (!windowCheck.allowed) {
      return res.status(403).json({
        error: windowCheck.message,
        schedule: windowCheck.schedule,
        status: "outside_window",
      });
    }

    const { regNo, status = "present" } = req.body;

    if (!regNo) {
      return res
        .status(400)
        .json({ error: "Student registration number is required" });
    }

    // Find student by registration number
    const student = await Student.findOne({ regNo });
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Create today's date (without time)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Try to find existing attendance record
    let attendance = await Attendance.findOne({
      buildingId: student.buildingId,
      wing: student.wing,
      floor: student.floor,
      room: student.room,
      date: today,
      time: "Morning", // Default time
    });

    if (!attendance) {
      // Get building name
      const building = await Building.findById(student.buildingId);
      const buildingName = building ? building.name : "Unknown";

      // Create new attendance record
      attendance = new Attendance({
        date: today,
        time: "Morning", // Default time
        buildingId: student.buildingId,
        buildingName: buildingName,
        wing: student.wing,
        floor: student.floor,
        room: student.room,
        students: [],
        createdAt: new Date(),
        createdBy: req.user ? req.user._id : null,
      });
    }

    // Check if student is already in the attendance record
    const studentIndex = attendance.students.findIndex(
      (s) => s.regNo === regNo
    );

    if (studentIndex === -1) {
      // Add student to attendance record
      attendance.students.push({
        studentId: student._id,
        name: student.name,
        regNo: student.regNo,
        present: status === "present",
      });
    } else {
      // Update existing student record
      attendance.students[studentIndex].present = status === "present";
    }

    await attendance.save();

    res.json({
      success: true,
      message: `Attendance marked as ${status} successfully`,
    });
  } catch (error) {
    console.error("Error marking attendance:", error);
    res.status(500).json({ error: "Failed to mark attendance" });
  }
});

// Attendance stats with date parameter - MODIFIED
router.get("/stats", async (req, res) => {
  try {
    // Parse date from query parameter or use today's date
    let targetDate;
    if (req.query.date) {
      targetDate = new Date(req.query.date);
    } else {
      targetDate = new Date();
    }
    targetDate.setHours(0, 0, 0, 0);

    // Build query criteria with date
    const matchCriteria = { date: targetDate };

    // Get total students enrolled
    const total = await Student.countDocuments();

    // Get attendance records for the specified date
    const attendanceRecords = await Attendance.find(matchCriteria);

    const presentStudents = new Set();
    const onLeaveStudents = new Set();

    attendanceRecords.forEach((record) => {
      record.students.forEach((student) => {
        // Only count as present if they're not on leave
        if (student.present && !student.onLeave) {
          presentStudents.add(student.regNo);
        }

        if (student.onLeave) {
          onLeaveStudents.add(student.regNo);
        }
      });
    });

    const present = presentStudents.size;
    const onLeave = onLeaveStudents.size;
    // Adjust to prevent double-counting on-leave students as absent
    const absent = total - present - onLeave;

    // Get building-wise statistics
    const buildingWiseStats = await Attendance.aggregate([
      { $match: matchCriteria },
      { $unwind: "$students" },
      {
        $match: { "students.present": true, "students.onLeave": { $ne: true } },
      },
      {
        $group: {
          _id: "$buildingName",
          count: { $sum: 1 },
        },
      },
    ]);

    const buildingCount = {};
    buildingWiseStats.forEach((b) => {
      buildingCount[b._id] = b.count;
    });

    res.json({
      date: targetDate,
      pieData: [
        { name: "Present", value: present },
        { name: "Absent", value: absent },
        { name: "On Leave", value: onLeave },
      ],
      buildingCount,
      totalStudents: total,
      presentCount: present,
      absentCount: absent,
      leaveCount: onLeave,
      attendancePercentage:
        total > 0 ? ((present / total) * 100).toFixed(2) : 0,
    });
  } catch (error) {
    console.error("Error fetching attendance stats:", error);
    res.status(500).json({ error: "Failed to fetch attendance statistics" });
  }
});

// Get building-wise attendance stats with date parameter - MODIFIED
router.get("/building-stats", async (req, res) => {
  try {
    // Get all buildings
    const buildings = await Building.find();

    // Parse date from query parameter or use today's date
    let targetDate;
    if (req.query.date) {
      targetDate = new Date(req.query.date);
    } else {
      targetDate = new Date();
    }
    targetDate.setHours(0, 0, 0, 0);

    // Prepare results array
    const results = [];

    // For each building, calculate the present and total students
    for (const building of buildings) {
      // Get total students in this building
      const totalCount = await Student.countDocuments({
        buildingId: building._id,
      });

      // Get attendance records for this building on the specified date
      const attendanceRecords = await Attendance.find({
        buildingId: building._id,
        date: targetDate,
      });

      const presentStudents = new Set();
      const onLeaveStudents = new Set();

      attendanceRecords.forEach((record) => {
        record.students.forEach((student) => {
          // Only count as present if they're not on leave
          if (student.present && !student.onLeave) {
            presentStudents.add(student.regNo);
          }

          if (student.onLeave) {
            onLeaveStudents.add(student.regNo);
          }
        });
      });

      const presentCount = presentStudents.size;
      const onLeaveCount = onLeaveStudents.size;

      results.push({
        building: building.buildingName,
        buildingId: building._id,
        presentCount: presentCount,
        onLeaveCount: onLeaveCount,
        totalCount: totalCount,
        attendancePercentage:
          totalCount > 0 ? ((presentCount / totalCount) * 100).toFixed(2) : 0,
      });
    }
    res.json(results);
  } catch (error) {
    console.error("Error fetching building stats:", error);
    res.status(500).json({ error: "Failed to fetch building statistics" });
  }
});

// Add a new endpoint to check if attendance can be marked
router.get("/check-window", async (req, res) => {
  try {
    const windowCheck = await isWithinAttendanceWindow();
    res.json(windowCheck);
  } catch (error) {
    console.error("Error checking attendance window:", error);
    res.status(500).json({ error: "Failed to check attendance window" });
  }
});

// Get student by registration number for validation
router.get("/validate-student/:regNo", async (req, res) => {
  try {
    const { regNo } = req.params;

    if (!regNo) {
      return res.status(400).json({ error: "Registration number is required" });
    }

    // Find student in database
    const student = await Student.findOne({ regNo });

    if (!student) {
      return res.json({
        found: false,
        message: "Student not found",
      });
    }

    // Find building name if needed
    let buildingName = "Unknown";
    if (student.buildingId) {
      const building = await Building.findById(student.buildingId);
      if (building) {
        buildingName = building.buildingName || building.name;
      }
    }

    // Return student details
    res.json({
      found: true,
      student: {
        _id: student._id,
        name: student.name,
        regNo: student.regNo,
        photo: student.photo,
        year: student.year,
        building: buildingName,
        wing: student.wing,
        floor: student.floor,
        room: student.room,
      },
    });
  } catch (error) {
    console.error("Error validating student:", error);
    res.status(500).json({ error: "Failed to validate student" });
  }
});

// Mark a student on leave - MODIFIED
router.post("/mark-leave", async (req, res) => {
  try {
    const { regNo, name, numberOfDays, startDate, endDate, reason } = req.body;

    if (!regNo || !name || !numberOfDays || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Find student by registration number
    const student = await Student.findOne({ regNo });
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Check for existing active leave
    const existingLeave = await Leave.findOne({
      regNo,
      status: "active",
      $or: [
        // Check if startDate or endDate falls within existing leave period
        { startDate: { $lte: new Date(endDate), $gte: new Date(startDate) } },
        { endDate: { $lte: new Date(endDate), $gte: new Date(startDate) } },
        // Check if existing leave is contained within new leave period
        {
          $and: [
            { startDate: { $gte: new Date(startDate) } },
            { endDate: { $lte: new Date(endDate) } },
          ],
        },
      ],
    });

    if (existingLeave) {
      return res.status(400).json({
        error: "Student already has active leave during this period",
      });
    }

    // Create new leave record
    const leave = new Leave({
      studentId: student._id,
      regNo,
      name,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      numberOfDays: parseInt(numberOfDays),
      reason,
      createdBy: req.user ? req.user._id : null,
      status: "active",
    });

    await leave.save();

    // Mark attendance for each day in the leave period
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    // Function to mark a single day's attendance
    const markDayAttendance = async (date) => {
      // Create a new date object to avoid reference issues
      const currentDate = new Date(date);
      currentDate.setHours(0, 0, 0, 0);

      // Find building info
      const building = await Building.findById(student.buildingId);
      const buildingName = building
        ? building.buildingName || building.name
        : "Unknown";

      // Try to find existing attendance record
      let attendance = await Attendance.findOne({
        buildingId: student.buildingId,
        wing: student.wing,
        floor: student.floor,
        room: student.room,
        date: currentDate,
        time: "Morning", // Default time
      });

      if (!attendance) {
        // Create new attendance record
        attendance = new Attendance({
          date: currentDate,
          time: "Morning", // Default time
          buildingId: student.buildingId,
          buildingName: buildingName,
          wing: student.wing,
          floor: student.floor,
          room: student.room,
          students: [],
          createdAt: new Date(),
          createdBy: req.user ? req.user._id : null,
        });
      }

      // Check if student is already in the attendance record
      const studentIndex = attendance.students.findIndex(
        (s) => s.regNo === regNo
      );

      if (studentIndex === -1) {
        // Add student to attendance record with onLeave flag
        // MODIFIED: set present to false to avoid double-counting
        attendance.students.push({
          studentId: student._id,
          name: student.name,
          regNo: student.regNo,
          present: false, // Changed to false - students on leave are not present
          onLeave: true,
        });
      } else {
        // Update existing student record
        attendance.students[studentIndex].present = false; // Changed to false
        attendance.students[studentIndex].onLeave = true;
      }

      await attendance.save();
    };

    // Loop through each day in the leave period and mark attendance
    for (
      let d = new Date(startDateObj);
      d <= endDateObj;
      d.setDate(d.getDate() + 1)
    ) {
      await markDayAttendance(new Date(d));
    }

    res.json({
      success: true,
      leave: leave,
      message: `Leave marked successfully for ${name} for ${numberOfDays} days`,
    });
  } catch (error) {
    console.error("Error marking leave:", error);
    res.status(500).json({ error: "Failed to mark leave" });
  }
});

// Get active leaves
router.get("/active-leaves", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find all active leaves where endDate >= today
    const activeLeaves = await Leave.find({
      status: "active",
      endDate: { $gte: today },
    }).sort({ startDate: 1 });

    res.json(activeLeaves);
  } catch (error) {
    console.error("Error fetching active leaves:", error);
    res.status(500).json({ error: "Failed to fetch active leaves" });
  }
});

// Cancel a leave
router.delete("/cancel-leave/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Find and update leave status
    const leave = await Leave.findById(id);

    if (!leave) {
      return res.status(404).json({ error: "Leave record not found" });
    }

    // Update leave status
    leave.status = "cancelled";
    await leave.save();

    // Find and update attendance records to remove onLeave status for future dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Only update attendance records for today and future dates
    // Past attendance remains unchanged
    const startDate = new Date(Math.max(leave.startDate, today));
    const endDate = new Date(leave.endDate);

    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      const currentDate = new Date(d);
      currentDate.setHours(0, 0, 0, 0);

      // Find attendance record for this date and student
      const attendanceRecord = await Attendance.findOne({
        buildingId: { $exists: true }, // We need some criteria
        date: currentDate,
        "students.regNo": leave.regNo,
      });

      if (attendanceRecord) {
        // Find the student in the attendance record
        const studentIndex = attendanceRecord.students.findIndex(
          (s) => s.regNo === leave.regNo
        );

        if (studentIndex !== -1) {
          // If it's today or in the future, remove the onLeave flag
          // Also set present to false if it's today (they need to mark attendance normally)
          // For future dates, just remove the record entirely as they'll need to be marked fresh
          if (currentDate.getTime() === today.getTime()) {
            // For today, just remove onLeave flag and set present to false
            attendanceRecord.students[studentIndex].onLeave = false;
            attendanceRecord.students[studentIndex].present = false;
            await attendanceRecord.save();
          } else {
            // For future dates, remove the student from this attendance record entirely
            attendanceRecord.students.splice(studentIndex, 1);
            await attendanceRecord.save();
          }
        }
      }
    }

    res.json({
      success: true,
      message: "Leave cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling leave:", error);
    res.status(500).json({ error: "Failed to cancel leave" });
  }
});

// Update an existing leave record
router.put("/update-leave/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { regNo, name, numberOfDays, startDate, endDate, reason } = req.body;

    if (!regNo || !startDate || !endDate || !numberOfDays) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Find the existing leave record
    const leave = await Leave.findById(id);
    if (!leave) {
      return res.status(404).json({ error: "Leave record not found" });
    }

    // Find student by registration number
    const student = await Student.findOne({ regNo });
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Store old dates to update attendance records
    const oldStartDate = new Date(leave.startDate);
    const oldEndDate = new Date(leave.endDate);
    
    // Parse new dates
    const newStartDate = new Date(startDate);
    const newEndDate = new Date(endDate);
    
    // Check for overlapping leave periods (excluding the current leave)
    const existingLeave = await Leave.findOne({
      _id: { $ne: id }, // Exclude current leave
      regNo,
      status: "active",
      $or: [
        // Check if new startDate or endDate falls within existing leave period
        { startDate: { $lte: newEndDate, $gte: newStartDate } },
        { endDate: { $lte: newEndDate, $gte: newStartDate } },
        // Check if existing leave is contained within new leave period
        {
          $and: [
            { startDate: { $gte: newStartDate } },
            { endDate: { $lte: newEndDate } },
          ],
        },
      ],
    });

    if (existingLeave) {
      return res.status(400).json({
        error: "Student already has active leave during this period",
      });
    }

    // Update leave record with new information
    leave.startDate = newStartDate;
    leave.endDate = newEndDate;
    leave.numberOfDays = parseInt(numberOfDays);
    leave.reason = reason;
    leave.updatedAt = new Date();

    await leave.save();

    // Remove old leave records from attendance
    // First, remove the old leave dates from attendance records
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Only process future attendance records (keep history)
    const clearStartDate = new Date(Math.max(oldStartDate, today));
    
    // Step 1: Clear old leave dates (only future ones)
    for (
      let d = new Date(clearStartDate);
      d <= oldEndDate;
      d.setDate(d.getDate() + 1)
    ) {
      const currentDate = new Date(d);
      currentDate.setHours(0, 0, 0, 0);

      // Find attendance record for this date and student
      const attendanceRecord = await Attendance.findOne({
        date: currentDate,
        "students.regNo": regNo,
      });

      if (attendanceRecord) {
        // Find the student in the attendance record
        const studentIndex = attendanceRecord.students.findIndex(
          (s) => s.regNo === regNo
        );

        if (studentIndex !== -1) {
          // Remove old leave record
          if (currentDate.getTime() === today.getTime()) {
            // For today, just update flags
            attendanceRecord.students[studentIndex].onLeave = false;
            attendanceRecord.students[studentIndex].present = false;
            await attendanceRecord.save();
          } else {
            // For future dates, remove the student completely
            attendanceRecord.students.splice(studentIndex, 1);
            await attendanceRecord.save();
          }
        }
      }
    }

    // Find building info for new attendance records
    const building = await Building.findById(student.buildingId);
    const buildingName = building
      ? building.buildingName || building.name
      : "Unknown";

    // Step 2: Add new leave dates
    for (
      let d = new Date(Math.max(newStartDate, today));
      d <= newEndDate;
      d.setDate(d.getDate() + 1)
    ) {
      const currentDate = new Date(d);
      currentDate.setHours(0, 0, 0, 0);

      // Try to find existing attendance record
      let attendance = await Attendance.findOne({
        buildingId: student.buildingId,
        wing: student.wing,
        floor: student.floor,
        room: student.room,
        date: currentDate,
        time: "Morning", // Default time
      });

      if (!attendance) {
        // Create new attendance record
        attendance = new Attendance({
          date: currentDate,
          time: "Morning", // Default time
          buildingId: student.buildingId,
          buildingName: buildingName,
          wing: student.wing,
          floor: student.floor,
          room: student.room,
          students: [],
          createdAt: new Date(),
          createdBy: req.user ? req.user._id : null,
        });
      }

      // Check if student is already in the attendance record
      const studentIndex = attendance.students.findIndex(
        (s) => s.regNo === regNo
      );

      if (studentIndex === -1) {
        // Add student with onLeave flag
        attendance.students.push({
          studentId: student._id,
          name: student.name,
          regNo: student.regNo,
          present: false, // Students on leave are not present
          onLeave: true,
        });
      } else {
        // Update existing student record
        attendance.students[studentIndex].present = false;
        attendance.students[studentIndex].onLeave = true;
      }

      await attendance.save();
    }

    res.json({
      success: true,
      message: "Leave record updated successfully",
      leave,
    });
  } catch (error) {
    console.error("Error updating leave:", error);
    res.status(500).json({ error: "Failed to update leave record" });
  }
});

// Get absent students - MODIFIED
router.get("/absent-students", auth, async (req, res) => {
  try {
    // Parse the query date or use current date
    const queryDate = req.query.date ? new Date(req.query.date) : new Date();
    queryDate.setHours(0, 0, 0, 0); // Normalize to start of day

    // Get all students
    const allStudents = await Student.find()
      .select("_id name regNo buildingId wing floor room phone photo")
      .lean();

    // Get attendance records for the date
    const attendanceRecords = await Attendance.find({
      date: queryDate,
    });

    // Get active leaves that cover the selected date
    const activeLeaves = await Leave.find({
      startDate: { $lte: queryDate },
      endDate: { $gte: queryDate },
      status: "active",
    });

    // Create sets for quick lookups
    const presentRegNos = new Set();
    const onLeaveRegNos = new Set();

    // Collect present students from attendance records
    attendanceRecords.forEach((record) => {
      record.students.forEach((student) => {
        // Only mark as present if they're actually present and not on leave
        if (student.present && !student.onLeave) {
          presentRegNos.add(student.regNo);
        }
        if (student.onLeave) {
          onLeaveRegNos.add(student.regNo);
        }
      });
    });

    // Add students on leave based on leave records
    activeLeaves.forEach((leave) => {
      onLeaveRegNos.add(leave.regNo);
    });

    // Find buildings for all students to include names
    const buildings = await Building.find().lean();
    const buildingMap = {};
    buildings.forEach((building) => {
      buildingMap[building._id] = building.buildingName || building.name;
    });

    // Filter to find only absent students (not present AND not on leave)
    const absentStudents = allStudents
      .filter(
        (student) =>
          !presentRegNos.has(student.regNo) && !onLeaveRegNos.has(student.regNo)
      )
      .map((student) => ({
        ...student,
        building: buildingMap[student.buildingId] || "Unknown",
        phoneNumber: student.phone, // Map phone field to phoneNumber for frontend
      }));

    res.json(absentStudents);
  } catch (error) {
    console.error("Error fetching absent students:", error);
    res.status(500).json({ error: "Failed to fetch absent students" });
  }
});

// Preview attendance data for export
router.get("/preview", auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ message: "Start and end dates are required" });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Validate date range
    if (start > end) {
      return res
        .status(400)
        .json({ message: "End date must be after start date" });
    }

    // Prepare data structure for results
    const previewData = [];

    // Process one day at a time
    for (
      let currentDate = new Date(start);
      currentDate <= end;
      currentDate.setDate(currentDate.getDate() + 1)
    ) {
      const date = new Date(currentDate);
      date.setHours(0, 0, 0, 0);

      // Get all attendance records for this date
      const attendanceRecords = await Attendance.find({ date });

      // Get all students (for finding absent students)
      const allStudents = await Student.find().lean();

      // Get active leaves for this date
      const activeLeaves = await Leave.find({
        startDate: { $lte: date },
        endDate: { $gte: date },
        status: "active",
      });

      // Create sets for quick lookups
      const presentRegNos = new Set();
      const onLeaveRegNos = new Set();

      // Build maps for building and room info
      const buildingMap = {};
      const buildings = await Building.find();
      buildings.forEach((building) => {
        buildingMap[building._id] = building.buildingName || building.name;
      });

      // Process attendance records for present students
      attendanceRecords.forEach((record) => {
        record.students.forEach((student) => {
          if (student.present && !student.onLeave) {
            presentRegNos.add(student.regNo);

            // Add to preview data
            previewData.push({
              regNo: student.regNo,
              studentName: student.name,
              date: date,
              status: "present",
              building:
                record.buildingName ||
                buildingMap[record.buildingId] ||
                "Unknown",
              room: `${record.wing}-${record.floor}-${record.room}`,
            });
          }

          if (student.onLeave) {
            onLeaveRegNos.add(student.regNo);
          }
        });
      });

      // Process leave records
      activeLeaves.forEach((leave) => {
        onLeaveRegNos.add(leave.regNo);

        // Find student info
        const student = allStudents.find((s) => s.regNo === leave.regNo);
        if (student) {
          const building = buildingMap[student.buildingId] || "Unknown";
          const room =
            student.wing && student.floor && student.room
              ? `${student.wing}-${student.floor}-${student.room}`
              : "Unknown";

          // Add to preview data
          previewData.push({
            regNo: leave.regNo,
            studentName: leave.name,
            date: date,
            status: "leave",
            building: building,
            room: room,
          });
        }
      });

      // Process absent students
      allStudents.forEach((student) => {
        if (
          !presentRegNos.has(student.regNo) &&
          !onLeaveRegNos.has(student.regNo)
        ) {
          const building = buildingMap[student.buildingId] || "Unknown";
          const room =
            student.wing && student.floor && student.room
              ? `${student.wing}-${student.floor}-${student.room}`
              : "Unknown";

          // Add to preview data
          previewData.push({
            regNo: student.regNo,
            studentName: student.name,
            date: date,
            status: "absent",
            building: building,
            room: room,
          });
        }
      });
    }

    res.json(previewData);
  } catch (error) {
    console.error("Error generating preview data:", error);
    res.status(500).json({ message: "Failed to generate preview data" });
  }
});

// Export attendance data to CSV
router.get("/export", auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ message: "Start and end dates are required" });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Validate date range
    if (start > end) {
      return res
        .status(400)
        .json({ message: "End date must be after start date" });
    }

    // Prepare data structure for results
    const exportData = [];

    // Process one day at a time
    for (
      let currentDate = new Date(start);
      currentDate <= end;
      currentDate.setDate(currentDate.getDate() + 1)
    ) {
      const date = new Date(currentDate);
      date.setHours(0, 0, 0, 0);

      // Get all attendance records for this date
      const attendanceRecords = await Attendance.find({ date });

      // Get all students (for finding absent students)
      const allStudents = await Student.find().lean();

      // Get active leaves for this date
      const activeLeaves = await Leave.find({
        startDate: { $lte: date },
        endDate: { $gte: date },
        status: "active",
      });

      // Create sets for quick lookups
      const presentRegNos = new Set();
      const onLeaveRegNos = new Set();

      // Build maps for building and room info
      const buildingMap = {};
      const buildings = await Building.find();
      buildings.forEach((building) => {
        buildingMap[building._id] = building.buildingName || building.name;
      });

      // Process attendance records for present students
      attendanceRecords.forEach((record) => {
        record.students.forEach((student) => {
          if (student.present && !student.onLeave) {
            presentRegNos.add(student.regNo);

            // Add to export data
            exportData.push({
              Date: date.toLocaleDateString(),
              RegNo: student.regNo,
              StudentName: student.name,
              Status: "Present",
              Building:
                record.buildingName ||
                buildingMap[record.buildingId] ||
                "Unknown",
              Wing: record.wing || "Unknown",
              Floor: record.floor || "Unknown",
              Room: record.room || "Unknown",
            });
          }

          if (student.onLeave) {
            onLeaveRegNos.add(student.regNo);
          }
        });
      });

      // Process leave records
      activeLeaves.forEach((leave) => {
        onLeaveRegNos.add(leave.regNo);

        // Find student info
        const student = allStudents.find((s) => s.regNo === leave.regNo);
        if (student) {
          const building = buildingMap[student.buildingId] || "Unknown";

          // Add to export data
          exportData.push({
            Date: date.toLocaleDateString(),
            RegNo: leave.regNo,
            StudentName: leave.name,
            Status: "On Leave",
            Building: building,
            Wing: student.wing || "Unknown",
            Floor: student.floor || "Unknown",
            Room: student.room || "Unknown",
            LeaveReason: leave.reason || "",
          });
        }
      });

      // Process absent students
      allStudents.forEach((student) => {
        if (
          !presentRegNos.has(student.regNo) &&
          !onLeaveRegNos.has(student.regNo)
        ) {
          const building = buildingMap[student.buildingId] || "Unknown";

          // Add to export data
          exportData.push({
            Date: date.toLocaleDateString(),
            RegNo: student.regNo,
            StudentName: student.name,
            Status: "Absent",
            Building: building,
            Wing: student.wing || "Unknown",
            Floor: student.floor || "Unknown",
            Room: student.room || "Unknown",
          });
        }
      });
    }

    // Generate CSV
    const fields = [
      "Date",
      "RegNo",
      "StudentName",
      "Status",
      "Building",
      "Wing",
      "Floor",
      "Room",
      "LeaveReason",
    ];
    const parser = new Parser({ fields });
    const csv = parser.parse(exportData);

    // Set response headers for file download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=attendance_export_${
        start.toISOString().split("T")[0]
      }_to_${end.toISOString().split("T")[0]}.csv`
    );

    // Send CSV data
    res.send(csv);
  } catch (error) {
    console.error("Error exporting attendance data:", error);
    res.status(500).json({ message: "Failed to export attendance data" });
  }
});

// Process image from frontend for face recognition
router.post("/process-image", async (req, res) => {
  try {
    // First check if we're within the attendance window
    const windowCheck = await isWithinAttendanceWindow();

    if (!windowCheck.allowed) {
      return res.status(403).json({
        error: windowCheck.message,
        schedule: windowCheck.schedule,
        status: "outside_window",
      });
    }

    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: "Image data is required" });
    }

    const modelPath = path.join(__dirname, "../models/face_dataset.pth");

    // Create a child process to run the Python script
    const pythonProcess = spawn("python", [
      path.join(__dirname, "../scripts/webcam_face_verify.py"),
      modelPath,
    ]);

    // Send the image data to the Python script
    pythonProcess.stdin.write(JSON.stringify({ image }));
    pythonProcess.stdin.end();

    // Collect data from the Python script
    let resultData = "";
    pythonProcess.stdout.on("data", (data) => {
      resultData += data.toString();
    });

    // Collect any error output
    let errorData = "";
    pythonProcess.stderr.on("data", (data) => {
      errorData += data.toString();
      console.error("Python script error:", data.toString());
    });

    // Handle when Python process exits
    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error(`Python process exited with code ${code}`);
        return res.status(500).json({
          error: errorData || "Face recognition process failed",
          exitCode: code,
        });
      }

      try {
        const jsonData = JSON.parse(resultData);
        res.json(jsonData);
      } catch (error) {
        console.error("Error parsing Python output:", error);
        res.status(500).json({
          error: "Failed to parse recognition results",
          pythonOutput: resultData,
          parseError: error.message,
        });
      }
    });

    // Handle errors in the Python process
    pythonProcess.on("error", (error) => {
      console.error("Error in Python process:", error);
      res
        .status(500)
        .json({ error: "Face recognition process failed to start" });
    });
  } catch (error) {
    console.error("Error processing image:", error);
    res.status(500).json({ error: "Failed to process image" });
  }
});

// Get time series data for attendance analytics
router.get("/time-series", auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Start date and end date are required" });
    }
    
    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Validate dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }
    
    // Get all attendance records between start and end dates
    const attendanceRecords = await Attendance.find({
      date: {
        $gte: start,
        $lte: end
      }
    }).sort({ date: 1 });
    
    // Process data for time series
    const timeSeriesData = [];
    
    // Create a map to track dates we've processed
    const processedDates = new Map();
    
    // Process each attendance record
    attendanceRecords.forEach(record => {
      const dateStr = record.date.toISOString().split('T')[0];
      
      if (!processedDates.has(dateStr)) {
        // Count students by status for this date
        const presentCount = record.students.filter(s => s.status === 'present').length;
        const absentCount = record.students.filter(s => s.status === 'absent').length;
        const leaveCount = record.students.filter(s => s.status === 'onLeave').length;
        
        timeSeriesData.push({
          date: dateStr,
          presentCount,
          absentCount,
          leaveCount
        });
        
        processedDates.set(dateStr, true);
      }
    });
    
    // Fill in missing dates with zero counts
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      if (!processedDates.has(dateStr)) {
        timeSeriesData.push({
          date: dateStr,
          presentCount: 0,
          absentCount: 0,
          leaveCount: 0
        });
      }
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Sort by date
    timeSeriesData.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    res.json(timeSeriesData);
  } catch (error) {
    console.error("Error fetching time series data:", error);
    res.status(500).json({ error: "Failed to fetch time series data" });
  }
});

module.exports = router;
