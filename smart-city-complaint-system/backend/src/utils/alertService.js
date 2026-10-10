/**
 * Admin alert service.
 *
 * - Persists alerts (Alert collection) so admins see them even if they were offline.
 * - Pushes them live to every connected admin browser over Server-Sent Events
 *   (GET /api/alerts/stream) - no extra npm package needed.
 * - Optionally posts them to a webhook (Slack / Discord / Teams / custom) when
 *   ALERT_WEBHOOK_URL is set, and e-mails them when SMTP_* + ALERT_EMAIL_TO are set
 *   and `nodemailer` is installed.
 * - De-duplicates: the same dedupKey is not raised again within its cooldown window.
 *
 * Environment variables (all optional):
 *   SURGE_ALERTS=off            disable alert creation (e.g. while running benchmarks)
 *   ALERT_WEBHOOK_URL=https://hooks.slack.com/...   (or Discord / Teams incoming webhook)
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_EMAIL_TO, ALERT_EMAIL_FROM
 */
const axios = require("axios");
const Alert = require("../models/Alert");

const clients = new Set(); // active SSE responses

function addClient(res) {
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

function broadcast(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(data);
    } catch (e) {
      clients.delete(res);
    }
  }
}

// keep proxies from closing idle SSE connections
setInterval(() => {
  for (const res of clients) {
    try {
      res.write(": ping\n\n");
    } catch (e) {
      clients.delete(res);
    }
  }
}, 25000).unref();

async function postWebhook(alert) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  const icon = { critical: "🚨", warning: "⚠️", watch: "👀", info: "ℹ️" }[alert.level] || "🔔";
  const text = `${icon} *${alert.title}*\n${alert.message}`;
  // Slack uses `text`, Discord uses `content`, Teams accepts `text`
  await axios.post(url, { text, content: text, alert }, { timeout: 5000 });
}

let mailer = null;
async function sendEmail(alert) {
  if (!process.env.SMTP_HOST || !process.env.ALERT_EMAIL_TO) return;
  if (alert.level !== "critical" && alert.level !== "warning") return;
  if (!mailer) {
    let nodemailer;
    try {
      nodemailer = require("nodemailer");
    } catch (e) {
      console.warn("[Alerts] SMTP configured but nodemailer is not installed (npm i nodemailer).");
      return;
    }
    mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_PORT === "465",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
  }
  await mailer.sendMail({
    from: process.env.ALERT_EMAIL_FROM || process.env.SMTP_USER,
    to: process.env.ALERT_EMAIL_TO,
    subject: `[Smart City] ${alert.title}`,
    text: alert.message
  });
}

/**
 * Create (or skip, if a duplicate is within cooldown) an alert and fan it out.
 * @param {object} data      Alert fields (type, level, title, message, category, cellId, centroid, surgeId, metrics)
 * @param {object} options   { dedupKey, cooldownMinutes }
 * @returns {Promise<object|null>} the created alert, or null if suppressed
 */
async function raiseAlert(data, { dedupKey, cooldownMinutes = 30 } = {}) {
  if ((process.env.SURGE_ALERTS || "").toLowerCase() === "off") return null;
  try {
    if (dedupKey) {
      const since = new Date(Date.now() - cooldownMinutes * 60 * 1000);
      const recent = await Alert.findOne({ dedupKey, createdAt: { $gte: since } }).select("_id");
      if (recent) return null;
    }
    const alert = await Alert.create({ ...data, dedupKey });
    const obj = alert.toObject();
    console.log(`[Alerts] ${obj.level.toUpperCase()} ${obj.type}: ${obj.title}`);
    broadcast("alert", obj);
    postWebhook(obj).catch(err => console.error("[Alerts] webhook failed:", err.message));
    sendEmail(obj).catch(err => console.error("[Alerts] email failed:", err.message));
    return obj;
  } catch (err) {
    console.error("[Alerts] failed to raise alert:", err.message);
    return null;
  }
}

module.exports = { raiseAlert, addClient, broadcast, clientCount: () => clients.size };
