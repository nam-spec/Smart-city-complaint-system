const fs = require("fs");
const path = require("path");
const readline = require("readline");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const h3 = require("h3-js");
const User = require("../models/User");
const Complaint = require("../models/Complaint");
const { updateCellBaselines } = require("../jobs/baselineJob");

const CSV_PATH = path.join(__dirname, "../../../ml/data/final_priority_dataset.csv");

const seedData = async () => {
  try {
    // 1. Check if complaints already exist
    const count = await Complaint.countDocuments();
    if (count > 0 && count < 50) {
      console.log(`Clearing ${count} legacy complaints to trigger real-world 311 seeding...`);
      await Complaint.deleteMany({});
    } else if (count >= 50) {
      console.log(`Database already seeded with ${count} complaints. Skipping seeding.`);
      return;
    }

    console.log("Initializing seeding process...");

    // 2. Ensure default users exist
    const hashedPassword = await bcrypt.hash("password123", 10);
    
    let citizenUser = await User.findOne({ email: "citizen@311.gov" });
    if (!citizenUser) {
      citizenUser = await User.create({
        name: "Real-world 311 Citizen",
        email: "citizen@311.gov",
        password: hashedPassword,
        role: "citizen"
      });
      console.log("Created default citizen user (citizen@311.gov / password123)");
    }

    let adminUser = await User.findOne({ email: "admin@smartcity.gov" });
    if (!adminUser) {
      adminUser = await User.create({
        name: "System Admin",
        email: "admin@smartcity.gov",
        password: hashedPassword,
        role: "admin"
      });
      console.log("Created default admin user (admin@smartcity.gov / password123)");
    }

    // 3. Check if CSV file exists
    if (!fs.existsSync(CSV_PATH)) {
      console.warn(`WARNING: CSV file not found at ${CSV_PATH}. Seeding skipped.`);
      return;
    }

    console.log(`Parsing CSV from ${CSV_PATH} and seeding complaints...`);

    const fileStream = fs.createReadStream(CSV_PATH);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let headers = [];
    let seededCount = 0;
    const rawRows = [];
    const MAX_SEED_RECORDS = 2000;

    for await (const line of rl) {
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

      if (headers.length === 0) {
        headers = parts.map(h => h.trim().replace(/^"|"$/g, ''));
        continue;
      }

      const row = {};
      headers.forEach((h, index) => {
        row[h] = parts[index] ? parts[index].trim().replace(/^"|"$/g, '') : "";
      });

      rawRows.push(row);
      seededCount++;
      if (seededCount >= MAX_SEED_RECORDS) {
        break;
      }
    }

    rl.close();
    fileStream.destroy();

    // Map timestamps across the last 6 weeks (42 days) up to now
    const now = Date.now();
    const sixWeeksAgo = now - 42 * 24 * 60 * 60 * 1000;

    // Parse timestamps from raw rows to find CSV min and max
    const parsedTimes = rawRows.map(r => r["timestamp"] ? new Date(r["timestamp"]).getTime() : 0).filter(t => t > 0);
    const minCsvTime = parsedTimes.length > 0 ? Math.min(...parsedTimes) : 0;
    const maxCsvTime = parsedTimes.length > 0 ? Math.max(...parsedTimes) : 1;

    const complaintsToInsert = rawRows.map((row, idx) => {
      const text = row["text"] || "Civic complaint reported via 311";
      const category = (row["category_clean"] || "unclassified").toLowerCase();
      const latitude = parseFloat(row["lat"]);
      const longitude = parseFloat(row["lon"]);
      const severityScore = parseFloat(row["severity_score"]) || 0.5;
      const spatialDensity = parseFloat(row["spatial_density"]) || 0;
      const temporalDensity = parseFloat(row["temporal_density"]) || 0;
      const acceleration = parseFloat(row["acceleration"]) || 0;
      const priorityScore = parseFloat(row["priority_score"]) || 0;
      const priorityScoreS2 = parseFloat(row["stsep_stage2"]) || (0.76 * severityScore + 0.18 * (spatialDensity / 50) + 0.06 * (temporalDensity / 20));

      let createdAt;
      const rawT = row["timestamp"] ? new Date(row["timestamp"]).getTime() : 0;
      if (rawT > 0 && maxCsvTime > minCsvTime) {
        const ratio = (rawT - minCsvTime) / (maxCsvTime - minCsvTime);
        createdAt = new Date(sixWeeksAgo + ratio * (now - sixWeeksAgo));
      } else {
        createdAt = new Date(sixWeeksAgo + (idx / rawRows.length) * (now - sixWeeksAgo));
      }

      const cellId = (!isNaN(latitude) && !isNaN(longitude)) ? h3.latLngToCell(latitude, longitude, 8) : null;

      return {
        citizen: citizenUser._id,
        description: text,
        category,
        cellId,
        latitude,
        longitude,
        severityScore,
        spatialDensity,
        temporalDensity,
        acceleration,
        priorityScore,
        priorityScoreS2,
        isSeeded: true,
        status: Math.random() > 0.7 ? "Resolved" : (Math.random() > 0.5 ? "In Progress" : "Pending"),
        createdAt,
        updatedAt: createdAt
      };
    }).filter(c => c.cellId !== null);

    if (complaintsToInsert.length > 0) {
      console.log(`Inserting ${complaintsToInsert.length} complaints into MongoDB...`);
      await Complaint.insertMany(complaintsToInsert);
      console.log("Database seeded successfully!");

      console.log("Calculating initial 6-week H3 cell baselines...");
      await updateCellBaselines(6);
      console.log("Cell baselines populated successfully!");
    } else {
      console.log("No valid complaints found in CSV to seed.");
    }

  } catch (error) {
    console.error("Error seeding database:", error);
  }
};

module.exports = seedData;
