const express = require("express");
const cors = require("cors");
const path = require("path");
const analyticsRoutes = require("./routes/analyticsRoutes");
const authRoutes = require("./routes/authRoutes");
const testRoutes = require("./routes/testRoutes");
const complaintRoutes = require("./routes/complaintRoutes");

const app = express();

app.use(cors());
app.use(express.json());

// Serve static files
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use("/api/ml-plots", express.static(path.join(__dirname, "../../ml/data")));

app.use("/api/auth", authRoutes);
app.use("/api/test", testRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/analytics", analyticsRoutes);

app.get("/api/health",(req,res)=>{
    res.status(200).json({status:"Backend is running"});
});

module.exports = app;