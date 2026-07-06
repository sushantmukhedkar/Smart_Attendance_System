const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const buildingRoutes = require("./routes/buildingRoutes");
const studentRoutes = require("./routes/studentRoutes");
const attendance = require("./routes/attendanceRoutes.js");
const auth = require("./routes/auth");
const authMiddleware = require("./middleware/authMiddleware"); // ✅ Import
const bookRecRoutes = require("./routes/bookRecRoutes");
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "20mb" }));

// DB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.log("Error connecting to MongoDB:", err));

// Auth Routes

app.use("/api/auth", auth); // For signup/login/profile

app.use("/api/bookrec", bookRecRoutes);
// Protect building routes with authMiddleware ✅
app.use("/api/buildings", authMiddleware, buildingRoutes);

app.use("/api/students", studentRoutes);

app.use("/api/attendance", attendance);

// In your main server.js file
app.get("/test", (req, res) => {
  res.json({ message: "Server is working" });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
