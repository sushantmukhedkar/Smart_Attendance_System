const express = require("express");
const router = express.Router();
const Student = require("../models/Student");
const authMiddleware = require("../middleware/authMiddleware");

// POST /api/students/add - Create a new student
router.post("/add", async (req, res) => {
  try {
    const {
      name,
      regNo,
      year,
      phone, // Add phone field
      photo,
      buildingId,
      building,
      wing,
      floor,
      room,
    } = req.body;

    if (
      !name ||
      !regNo ||
      !year ||
      !phone ||
      !building ||
      !wing ||
      !floor ||
      !room
    ) {
      return res.status(400).json({ error: "All fields are required." });
    }

    // Check if a student with this registration number already exists
    const existingStudent = await Student.findOne({ regNo });
    if (existingStudent) {
      return res.status(400).json({
        error: "A student with this registration number already exists.",
      });
    }

    const newStudent = new Student({
      name,
      regNo,
      year,
      phone, // Add phone field
      photo,
      buildingId,
      building,
      wing,
      floor,
      room,
    });

    await newStudent.save();
    res
      .status(201)
      .json({ message: "Student saved successfully", student: newStudent });
  } catch (err) {
    console.error("Error saving student:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PUT /api/students/:id - Update an existing student
router.put("/:id", async (req, res) => {
  try {
    const {
      name,
      regNo,
      year,
      phone, // Add phone field
      photo,
      buildingId,
      building,
      wing,
      floor,
      room,
    } = req.body;
    const studentId = req.params.id;

    if (
      !name ||
      !regNo ||
      !year ||
      !phone ||
      !building ||
      !wing ||
      !floor ||
      !room
    ) {
      return res.status(400).json({ error: "All fields are required." });
    }

    // Check if registration number already exists for another student
    const existingStudent = await Student.findOne({
      regNo,
      _id: { $ne: studentId },
    });

    if (existingStudent) {
      return res.status(400).json({
        error: "A student with this registration number already exists.",
      });
    }

    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      {
        name,
        regNo,
        year,
        phone, // Add phone field
        photo,
        buildingId,
        building,
        wing,
        floor,
        room,
      },
      { new: true }
    );

    if (!updatedStudent) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.json({
      message: "Student updated successfully",
      student: updatedStudent,
    });
  } catch (err) {
    console.error("Error updating student:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/students/room - Get students for a specific room
router.get("/room", async (req, res) => {
  try {
    const { buildingId, wing, floor, room } = req.query;

    if (!buildingId || !wing || !floor || !room) {
      return res.status(400).json({ error: "Missing room parameters" });
    }

    const students = await Student.find({
      buildingId,
      wing,
      floor,
      room,
    });

    res.json({ students });
  } catch (err) {
    console.error("Error fetching students for room:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// DELETE /api/students/:id - Delete a student
router.delete("/:id", async (req, res) => {
  try {
    const studentId = req.params.id;
    const deletedStudent = await Student.findByIdAndDelete(studentId);

    if (!deletedStudent) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.json({ message: "Student deleted successfully" });
  } catch (err) {
    console.error("Error deleting student:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const studentId = req.params.id;
    const updatedData = req.body;

    // Input validation (add more as needed)
    if (!updatedData.name || !updatedData.regNo) {
      return res.status(400).json({ error: "Required fields missing" });
    }

    // Find and update the student
    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      updatedData,
      { new: true } // Return updated document
    );

    if (!updatedStudent) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.status(200).json({
      message: "Student updated successfully",
      student: updatedStudent,
    });
  } catch (error) {
    console.error("Error updating student:", error);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

router.get("/filter", authMiddleware, async (req, res) => {
  try {
    const { buildingId, wing, floor, room } = req.query;
    const filter = {};

    // Build filter based on provided query parameters
    if (buildingId) filter.buildingId = buildingId;
    if (wing) filter.wing = wing;
    if (floor) filter.floor = parseInt(floor);
    if (room) filter.room = parseInt(room);

    // Find students matching the filter
    const students = await Student.find(filter);

    res.status(200).json(students);
  } catch (error) {
    console.error("Error filtering students:", error);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

module.exports = router;
