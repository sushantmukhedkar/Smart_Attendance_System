const express = require("express");
const Building = require("../models/Building");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();

// POST route to save building
router.post("/", authMiddleware, async (req, res) => {
  try {
    console.log("Incoming request body:", req.body);
    console.log("User ID from token:", req.user); // Log full user object

    const { name, wings, floorsPerWing, roomsPerFloor } = req.body;
    const userId = req.user.userId;

    if (!userId) {
      console.log("User ID missing!");
      return res.status(401).json({ error: "Unauthorized, user not found" });
    }

    if (!name || !wings || !floorsPerWing || !roomsPerFloor) {
      console.log("Missing fields");
      return res.status(400).json({ error: "All fields are required" });
    }

    // Convert wings string to array (if it's a comma-separated string)
    let wingsArray;
    if (typeof wings === "string") {
      wingsArray = wings.split(",").map((wing) => wing.trim());
    } else if (Array.isArray(wings)) {
      wingsArray = wings;
    } else {
      return res.status(400).json({ error: "Invalid wings format" });
    }

    console.log("Data to save:", {
      buildingName: name,
      wings: wingsArray,
      floorsPerWing,
      roomsPerFloor,
      userId,
    });

    const newBuilding = new Building({
      buildingName: name,
      wings: wingsArray,
      floorsPerWing,
      roomsPerFloor,
      userId,
    });

    await newBuilding.save();
    console.log("Building saved successfully!");

    return res.status(201).json({
      message: "Building saved successfully",
      building: newBuilding,
    });
  } catch (error) {
    console.error("Error saving building:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
});

// GET route to fetch buildings for logged-in user
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const buildings = await Building.find({ userId }); // Fetch buildings belonging to user
    return res.status(200).json(buildings);
  } catch (error) {
    console.error("Error fetching buildings:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const buildingId = req.params.id;
    const { name, wings, floorsPerWing, roomsPerFloor } = req.body;

    // Validate input
    if (!name || !wings || !floorsPerWing || !roomsPerFloor) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Convert wings to array if needed
    let wingsArray;
    if (typeof wings === "string") {
      wingsArray = wings.split(",").map((wing) => wing.trim());
    } else if (Array.isArray(wings)) {
      wingsArray = wings;
    } else {
      return res.status(400).json({ error: "Invalid wings format" });
    }

    // Find building and verify ownership
    const building = await Building.findById(buildingId);
    if (!building) {
      return res.status(404).json({ error: "Building not found" });
    }

    if (building.userId.toString() !== userId) {
      return res
        .status(403)
        .json({ error: "Unauthorized to update this building" });
    }

    // Update building
    const updatedBuilding = await Building.findByIdAndUpdate(
      buildingId,
      {
        buildingName: name,
        wings: wingsArray,
        floorsPerWing,
        roomsPerFloor,
      },
      { new: true }
    );

    return res.status(200).json({
      message: "Building updated successfully",
      building: updatedBuilding,
    });
  } catch (error) {
    console.error("Error updating building:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE route to delete building
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const buildingId = req.params.id;

    // Find building and verify ownership
    const building = await Building.findById(buildingId);
    if (!building) {
      return res.status(404).json({ error: "Building not found" });
    }

    if (building.userId.toString() !== userId) {
      return res
        .status(403)
        .json({ error: "Unauthorized to delete this building" });
    }

    // Delete building
    await Building.findByIdAndDelete(buildingId);

    // Here you would also delete associated students, or update their records
    // Example: await Student.deleteMany({ buildingId });

    return res.status(200).json({ message: "Building deleted successfully" });
  } catch (error) {
    console.error("Error deleting building:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
