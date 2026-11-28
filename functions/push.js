/* =========================================================
   Paisley push notifications (Firebase Cloud Messaging, web push)
   -----------------------------------------------------------
     pushTokens/{sha256(token)}  { uid, token, app, role, device, createdAt, updatedAt }
       One per browser that turned notifications on (js/ui/push.js). No client
       reads or writes it: registerPushToken files it under the caller.

   Callables
     registerPushToken   { token, on, app, role, device }  on:false forgets the token
     sendTestPush        a test notification to the caller's own devices
   Trigger
     onTechNotificationPush   every Tech Studio bell (techNotifications) also goes to
                              the recipient's devices; frozen ones never do.
   Helper
     sendToUsers(uids, { title, body, link, tag, image })   used by other modules
========================================================= */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const crypto = require("crypto");
const freeze = require("./dev-freeze");
const { PORTALS } = require("./email-templates");

const LOCATION = "us-central1";
const APP = new URL(PORTALS.admin).origin;
const FV = () => admin.firestore.FieldValue;
const keyOf = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const DEAD = /registration-token-not-registered|invalid-registration-token|invalid-argument|mismatched-credential|unregistered/i;

function absolute(link) {
  const l = String(link || "");
  if (/^https:\/\//i.test(l)) return l;
  return APP + (l.charAt(0) === "/" ? l : "/" + l);
}
/* The FCM message for a list of tokens. Web push only; the service worker shows it. */
function buildMessage(tokens, m) {
  const link = absolute(m.link || "/");
  const notification = {
    title: String(m.title || "Paisley Studio").slice(0, 120),
    body: String(m.body || "").slice(0, 300),
    icon: APP + "/icon-192.png",
    badge: APP + "/icon-192.png"
  };
  if (m.tag) { notification.tag = String(m.tag).slice(0, 120); notification.renotify = true; }
  if (/^https:\/\//.test(m.image || "")) notification.image = String(m.image);
  return {
    tokens,
    data: { link, tag: String(m.tag || "") },
    webpush: { notification, fcmOptions: { link }, headers: { Urgency: "high", TTL: String(m.ttl || 86400) } }
  };
}
/* Every device of every uid. Returns how many devices it reached. Never throws. */
async function sendToUsers(uids, m) {
  const ids = Array.from(new Set((uids || []).filter(Boolean)));
  if (!ids.length) return 0;
  const db = admin.firestore();
  const docs = [];
  try {
    for (let i = 0; i < ids.length; i += 30) {
      const s = await db.collection("pushTokens").where("uid", "in", ids.slice(i, i + 30)).get();
      s.docs.forEach((d) => docs.push(d));
    }
  } catch (e) { console.warn("push tokens:", e.message); return 0; }
  if (!docs.length) return 0;
  let sent = 0;
  for (let i = 0; i < docs.length; i += 500) {
    const chunk = docs.slice(i, i + 500), tokens = chunk.map((d) => d.data().token);
    try {
      const r = await admin.messaging().sendEachForMulticast(buildMessage(tokens, m));
      sent += r.successCount;
      const dead = [];
      r.responses.forEach((x, k) => { if (!x.success && DEAD.test((x.error && (x.error.code + " " + x.error.message)) || "")) dead.push(chunk[k].ref); });
      await Promise.all(dead.map((ref) => ref.delete().catch(() => {})));
    } catch (e) { console.warn("push send:", e.message); }
  }
  return sent;
}

exports.registerPushToken = onCall({ region: LOCATION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const d = req.data || {}, token = String(d.token || "");
  if (token.length < 20 || token.length > 4096) throw new HttpsError("invalid-argument", "That is not a notification token.");
  const ref = admin.firestore().collection("pushTokens").doc(keyOf(token));
  if (d.on === false) { await ref.delete().catch(() => {}); return { ok: true, on: false }; }
  const snap = await ref.get();
  await ref.set({
    uid: req.auth.uid, token,
    app: String(d.app || "").slice(0, 20), role: String(d.role || "").slice(0, 20), device: String(d.device || "").slice(0, 80),
    updatedAt: FV().serverTimestamp(), createdAt: snap.exists && snap.data().uid === req.auth.uid ? snap.data().createdAt || FV().serverTimestamp() : FV().serverTimestamp()
  });
  return { ok: true, on: true };
});

exports.sendTestPush = onCall({ region: LOCATION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const sent = await sendToUsers([req.auth.uid], {
    title: "Notifications are working", body: "This is how Paisley tells you about new messages, group chats and marked work.",
    link: req.data && req.data.link ? String(req.data.link) : "/tech", tag: "pz-test"
  });
  return { sent };
});

/* Every Tech Studio bell also goes to the recipient's devices. techNotify already
   holds frozen notifications; one written elsewhere while a freeze is on is
   removed by the safety net, so it is not pushed either. */
exports.onTechNotificationPush = onDocumentCreated(
  { document: "techNotifications/{id}", region: LOCATION },
  async (event) => {
    const n = event.data && event.data.data();
    if (!n || !n.recipientId || n.noPush) return;
    if (!n.freezeChecked && await freeze.isOn()) return;
    await sendToUsers([n.recipientId], {
      title: n.title || "Paisley Tech Studio", body: n.message || "", link: n.link || "/tech",
      tag: n.type ? `${n.type}_${n.chatId || n.buildId || n.lessonId || ""}` : "", image: n.image
    });
  }
);

module.exports.sendToUsers = sendToUsers;
module.exports._buildMessage = buildMessage;
