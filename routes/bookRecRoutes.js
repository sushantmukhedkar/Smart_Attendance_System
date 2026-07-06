// Inside routes/bookRecRoutes.js
const express = require("express");
const router = express.Router();
const BookRecord = require("../models/BookRecord");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/", async (req, res) => {
  try {
    const records = await BookRecord.find()
      .populate('buildingId', 'name')
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(records);
  } catch (error) {
    console.error("Error fetching book records:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { title, description, roomNumber, buildingId } = req.body;
    
    const newRecord = new BookRecord({
      title,
      description,
      roomNumber,
      buildingId,
      userId: req.user.userId
    });
    
    await newRecord.save();
    res.status(201).json({ message: "Record created successfully", record: newRecord });
  } catch (error) {
    console.error("Error creating book record:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;