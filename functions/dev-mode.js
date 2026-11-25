/* =========================================================
   Paisley Studio — Developer mode triggers (see dev-freeze.js)
   -----------------------------------------------------------
   The safety net for the freeze. Notifications written by the server helpers
   are checked before they are written (and carry freezeChecked while a freeze
   is on). Anything else that lands in personalNotifications or techNotifications
   while a freeze is on (older direct writes, notifications written by browsers)
   is checked here: if it should be held it is logged to devHeld and deleted at
   once, so it never stays in anyone's bell.

   While no freeze is on, each trigger reads one cached setting and stops.
========================================================= */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const freeze = require("./dev-freeze");
const { LOCATION } = require("./work-shared");

async function safetyNet(collection, snap) {
  if (!snap) return { skipped: "no doc" };
  const d = snap.data() || {};
  if (d.freezeChecked) return { skipped: "checked" };
  const cfg = await freeze.config();
  if (!freeze.active(cfg)) return { skipped: "off" };
  const role = d.recipientType || d.recipientRole || "";
  const recipientId = d.recipientId || "";
  const area = freeze.areaOfType(d.type || d.section || "", collection);
  if (!freeze.decide(cfg, { uid: recipientId, role }, area)) return { kept: true };
  await freeze.record("notification", {
    area, collection, recipientId: String(recipientId), role: String(role),
    type: String(d.type || "").slice(0, 80), title: String(d.title || "").slice(0, 200), message: String(d.message || "").slice(0, 400), caught: true
  });
  await snap.ref.delete();
  return { held: true };
}

exports.onFreezePersonalNotification = onDocumentCreated({ document: "personalNotifications/{id}", region: LOCATION }, (event) => safetyNet("personalNotifications", event.data));
exports.onFreezeTechNotification = onDocumentCreated({ document: "techNotifications/{id}", region: LOCATION }, (event) => safetyNet("techNotifications", event.data));
exports._test = { safetyNet };
