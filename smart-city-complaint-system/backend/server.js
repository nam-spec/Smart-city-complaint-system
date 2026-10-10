require("dotenv").config();
const connectDB = require("./src/config/db");
const app = require("./src/app");
const { initBaselineCron } = require("./src/jobs/baselineJob");
const { initSurgeLifecycleCron } = require("./src/jobs/surgeLifecycleJob");
const { initSurgeMonitorCron } = require("./src/jobs/surgeMonitorJob");

connectDB().then(() => {
  initBaselineCron();
  initSurgeLifecycleCron();
  initSurgeMonitorCron();
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});