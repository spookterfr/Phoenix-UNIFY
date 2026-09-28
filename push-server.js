/* Web Push scheduler for Phoenix UNIFY.

   The browser sends its push subscription plus its upcoming reminders to
   /api/push/sync. This server keeps them and, when one comes due, sends a push
   to the device — so the notification appears even if the app is closed.

   SETUP
     npm install express web-push
     node push-server.js            # standalone: serves the app + push API on :3000

   ALREADY HAVE A SERVER? Mount the router instead:
     const push = require("./push-server");
     app.use(push.router);
     push.start();

   VAPID keys are generated on first run and saved to push-data/vapid.json.
   To use your own, set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (and VAPID_SUBJECT,
   e.g. "mailto:you@example.com"). Push requires HTTPS (localhost is fine for testing). */

const fs = require("fs");
const path = require("path");
const express = require("express");
const webpush = require("web-push");

const DATA_DIR = process.env.PUSH_DATA_DIR || path.join(__dirname, "push-data");
const SUBS_FILE = path.join(DATA_DIR, "subscriptions.json");
const VAPID_FILE = path.join(DATA_DIR, "vapid.json");
const CHECK_EVERY_MS = 15 * 1000;
const MAX_LATE_MS = 6 * 3600 * 1000;      // don't send reminders that are more than 6h overdue
const MAX_PER_DEVICE = 500;

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---- VAPID keys ---- */
function loadVapid() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  try { return JSON.parse(fs.readFileSync(VAPID_FILE, "utf8")); } catch (e) {}
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2));
  return keys;
}
const vapid = loadVapid();
webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", vapid.publicKey, vapid.privateKey);

/* ---- storage: { [endpoint]: { subscription, notifications: [{id, at, title, body, tag}] } } ---- */
let devices = {};
try { devices = JSON.parse(fs.readFileSync(SUBS_FILE, "utf8")); } catch (e) {}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = SUBS_FILE + ".tmp";
    fs.writeFile(tmp, JSON.stringify(devices), (err) => {
      if (!err) fs.rename(tmp, SUBS_FILE, () => {});
    });
  }, 300);
}

/* ---- API ---- */
const router = express.Router();
router.use("/api/push", express.json({ limit: "300kb" }));

router.get("/api/push/key", (req, res) => res.json({ key: vapid.publicKey }));

router.post("/api/push/sync", (req, res) => {
  const { subscription, notifications } = req.body || {};
  if (!subscription || typeof subscription.endpoint !== "string" || !subscription.keys) {
    return res.status(400).json({ error: "Missing subscription" });
  }
  if (!Array.isArray(notifications)) return res.status(400).json({ error: "Missing notifications" });

  const clean = notifications
    .filter((n) => n && typeof n.id === "string" && Number.isFinite(n.at))
    .slice(0, MAX_PER_DEVICE)
    .map((n) => ({
      id: n.id.slice(0, 80),
      at: n.at,
      title: String(n.title || "Reminder").slice(0, 120),
      body: String(n.body || "").slice(0, 300),
      tag: String(n.tag || n.id).slice(0, 80)
    }));

  devices[subscription.endpoint] = { subscription, notifications: clean };
  save();
  res.json({ ok: true, scheduled: clean.length });
});

router.post("/api/push/unsubscribe", (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  if (endpoint && devices[endpoint]) { delete devices[endpoint]; save(); }
  res.json({ ok: true });
});

/* ---- scheduler ---- */
async function tick() {
  const now = Date.now();
  for (const endpoint of Object.keys(devices)) {
    const device = devices[endpoint];
    const due = device.notifications.filter((n) => n.at <= now);
    if (!due.length) continue;

    device.notifications = device.notifications.filter((n) => n.at > now);
    save();

    for (const n of due) {
      if (now - n.at > MAX_LATE_MS) continue;
      try {
        await webpush.sendNotification(
          device.subscription,
          JSON.stringify({ title: n.title, body: n.body, tag: n.tag, url: "./" }),
          { TTL: 3600, urgency: "high" }
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {   // subscription expired or revoked
          delete devices[endpoint];
          save();
          break;
        }
        console.warn("Push failed:", err.statusCode || err.message);
      }
    }
  }
}

let timer = null;
function start() {
  if (timer) return;
  timer = setInterval(() => tick().catch((e) => console.warn("tick error:", e.message)), CHECK_EVERY_MS);
  console.log("Push scheduler running.");
}

module.exports = { router, start };

if (require.main === module) {
  const app = express();
  app.use(router);
  // never serve the server code, stored subscriptions or the VAPID private key
  app.use((req, res, next) => (/^\/(push-data|push-server\.js|node_modules|package)/i.test(req.path) ? res.sendStatus(404) : next()));
  app.use(express.static(__dirname, { dotfiles: "ignore", index: "index.html" }));
  const port = process.env.PORT || 3000;
  app.listen(port, () => { console.log(`Phoenix UNIFY on http://localhost:${port}`); start(); });
}
