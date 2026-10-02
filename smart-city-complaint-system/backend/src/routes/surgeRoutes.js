const express = require("express");
const router = express.Router();
const surgeController = require("../controllers/surgeController");

// Surge Analytics Endpoints
router.get("/", surgeController.getAllSurges);
router.post("/simulate", surgeController.simulateSurge);
router.get("/:id", surgeController.getSurgeById);

module.exports = router;
