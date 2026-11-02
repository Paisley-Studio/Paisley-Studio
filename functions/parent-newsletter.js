/* =========================================================
   Paisley Studio: newsletters to parents and guardians
   -----------------------------------------------------------
   sendParentNewsletter (admin only) emails one parentNewsletters doc to
   every main Parent Portal parent (a parentStudentLinks entry), skipping anyone who turned newsletters off.
   Retrying is safe: deliveries/{parentUid} records who already has it, so
   nobody gets the same newsletter twice.

   parentNewsletterUnsubscribe is the link in every email. Opening it only
   shows a page with a button, because mail scanners open links on their own.
   One-click clients POST to it (List-Unsubscribe-Post).
========================================================= */
const crypto = require("crypto");
const admin = require("firebase-admin");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { SMTP_SECRETS, sendEmail, LOCATION } = require("./work-shared");
const { templates, APP_URL } = require("./email-templates");

const SMTP_PASS = defineSecret("SMTP_PASS");
const FV = () => admin.firestore.FieldValue;
const CONCURRENCY = 5;
const STALE_SEND_MS = 11 * 60 * 1000;   // longer than the function can run
const STOP_AFTER_MS = 480 * 1000;       // leave time to save the result before the 540s limit

function unsubToken(uid, key) {
  return crypto.createHmac("sha256", String(key)).update("newsletter-unsub:" + uid).digest("hex").slice(0, 40);
}
function tokenOk(uid, token, key) {
  const want = Buffer.from(unsubToken(uid, key)), got = Buffer.from(String(token || ""));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
function unsubUrl(uid, key) {
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "paisley-89c77";
  return `https://${LOCATION}-${project}.cloudfunctions.net/parentNewsletterUnsubscribe?u=${encodeURIComponent(uid)}&t=${unsubToken(uid, key)}`;
}

/* Who gets it: one send per email address, opted-out parents removed. */
function buildRecipients(parents, optedOut, delivered) {
  const seen = new Set(), out = [];
  for (const p of parents) {
    const email = String(p.email || "").trim();
    const key = email.toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || seen.has(key)) continue;
    seen.add(key);
    if (optedOut.has(p.uid)) continue;
    if (delivered.has(p.uid)) continue;
    out.push({ uid: p.uid, email, name: p.name || "" });
  }
  return out;
}

/* A claim decides whether this call may start sending. */
function claimError(status, startedAt, now) {
  if (status === "sent") return "This newsletter has already been sent.";
  if (status === "sending" && startedAt && now - startedAt < STALE_SEND_MS) return "This newsletter is being sent right now.";
  return "";
}

function checkContent(n) {
  if (!String(n.subject || "").trim()) return "Add an email subject.";
  if (!String(n.body || "").trim() && !n.imageUrl && !n.videoUrl) return "Add a message, a picture or a video.";
  return "";
}

/* Only parents in the main Parent Portal. A Tech Studio guardian with no other child is left out. */
function mainPortalParents(parents, links) {
  const linked = new Set(links.map((l) => l.parentUid));
  return parents.filter((p) => linked.has(p.uid));
}

async function loadAudience(db, newsletterId) {
  const [parents, links, opted, done] = await Promise.all([
    db.collection("parentAccounts").get(),
    db.collection("parentStudentLinks").get(),
    db.collection("parentNewsletterPrefs").where("emailOptOut", "==", true).get(),
    db.collection("parentNewsletters").doc(newsletterId).collection("deliveries").get()
  ]);
  return {
    recipients: buildRecipients(
      mainPortalParents(parents.docs.map((d) => ({ uid: d.id, ...d.data() })), links.docs.map((d) => d.data())),
      new Set(opted.docs.map((d) => d.id)),
      new Set(done.docs.map((d) => d.id))
    ),
    delivered: done.size
  };
}

/* Runs `worker` over items, a few at a time, until `shouldStop` says otherwise. */
async function runPool(items, size, worker, shouldStop) {
  let i = 0;
  const lane = async () => {
    while (i < items.length) {
      if (shouldStop && shouldStop()) return;
      const item = items[i++];
      await worker(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, lane));
  return i;
}

exports.sendParentNewsletter = onCall(
  { cors: true, region: LOCATION, secrets: SMTP_SECRETS, timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const db = admin.firestore();
    if (!(await db.collection("admins").doc(request.auth.uid).get()).exists) throw new HttpsError("permission-denied", "Only admins can send newsletters.");

    const d = request.data || {};
    const id = String(d.newsletterId || "");
    if (!id || id.includes("/")) throw new HttpsError("invalid-argument", "newsletterId required.");
    const ref = db.collection("parentNewsletters").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "Newsletter not found.");
    const n = snap.data();
    const bad = checkContent(n);
    if (bad) throw new HttpsError("failed-precondition", bad);
    const key = SMTP_PASS.value();

    if (d.test) {
      const to = request.auth.token && request.auth.token.email;
      if (!to) throw new HttpsError("failed-precondition", "Your admin login has no email address.");
      const t = templates.parentNewsletter({ newsletter: n, parentName: "there", unsubUrl: APP_URL + "/parent/index.html" });
      const r = await sendEmail(to, "[Test] " + t.subject, t.html);
      if (!r.sent) throw new HttpsError("internal", "The test could not be sent: " + (r.reason || "unknown error"));
      return { test: true, to };
    }

    if (d.dryRun) {
      const { recipients, delivered } = await loadAudience(db, id);
      return { remaining: recipients.length, delivered };
    }

    /* Only one send at a time, and never a second send of a finished newsletter. */
    await db.runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data() || {};
      const started = cur.sendStartedAt && cur.sendStartedAt.toMillis ? cur.sendStartedAt.toMillis() : 0;
      const why = claimError(cur.status, started, Date.now());
      if (why) throw new HttpsError("failed-precondition", why);
      tx.update(ref, { status: "sending", sendStartedAt: FV().serverTimestamp(), sentBy: request.auth.uid });
    });

    const started = Date.now();
    let sentNow = 0, failedNow = 0, delivered = 0, remaining = 0, recipients = [];
    try {
      ({ recipients, delivered } = await loadAudience(db, id));
      if (!recipients.length && !delivered) throw new HttpsError("failed-precondition", "No parent has an email address to send to.");
      const attempted = await runPool(recipients, CONCURRENCY, async (p) => {
        const url = unsubUrl(p.uid, key);
        const t = templates.parentNewsletter({ newsletter: n, parentName: p.name, unsubUrl: url });
        const r = await sendEmail(p.email, t.subject, t.html, null, {
          "List-Unsubscribe": `<${url}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
        });
        if (r.sent) {
          sentNow++;
          await ref.collection("deliveries").doc(p.uid).set({ at: FV().serverTimestamp() });
        } else {
          failedNow++;
          console.warn("newsletter: send failed", p.uid, r.reason);
        }
      }, () => Date.now() - started > STOP_AFTER_MS);
      remaining = recipients.length - attempted;
    } catch (e) {
      await ref.update({ status: delivered ? "partial" : "failed", lastError: String(e.message || e).slice(0, 300) }).catch(() => {});
      throw e instanceof HttpsError ? e : new HttpsError("internal", "Sending stopped: " + (e.message || e));
    }

    const sentCount = delivered + sentNow;
    const unfinished = failedNow + remaining;
    const status = !unfinished ? "sent" : (sentCount ? "partial" : "failed");
    await ref.update({
      status,
      /* Parents see it in the tab as soon as anyone has it by email. */
      published: sentCount > 0,
      ...(sentCount > 0 && !n.sentAt ? { sentAt: FV().serverTimestamp() } : {}),
      sentCount, failedCount: unfinished,
      lastError: FV().delete(),
      updatedAt: FV().serverTimestamp()
    });
    return { status, sentCount, failedCount: unfinished };
  }
);

function page(title, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F1F9F7;color:#263331;font-family:Quicksand,Arial,sans-serif;padding:16px;box-sizing:border-box}main{background:#fff;border:3px solid #0B0B0B;border-radius:18px;box-shadow:7px 7px 0 #0B0B0B;padding:28px;max-width:440px;width:100%;box-sizing:border-box}h1{margin:0 0 10px;font-size:24px;color:#245F5A}p{margin:0 0 16px;line-height:1.5}button{background:#D7263D;color:#fff;border:3px solid #0B0B0B;border-radius:12px;padding:12px 20px;font:inherit;font-weight:800;cursor:pointer}a{color:#245F5A;font-weight:700}</style></head><body><main>${body}</main></body></html>`;
}

exports.parentNewsletterUnsubscribe = onRequest({ region: LOCATION, secrets: [SMTP_PASS] }, async (req, res) => {
  const uid = String((req.query && req.query.u) || "").slice(0, 128);
  const token = String((req.query && req.query.t) || "").slice(0, 80);
  res.set("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") { res.status(405).send("Method not allowed"); return; }
  if (!uid || uid.includes("/") || !tokenOk(uid, token, SMTP_PASS.value())) {
    res.status(400).send(page("Link not valid", `<h1>This link is not valid</h1><p>You can turn newsletters off from the Newsletter tab in your <a href="${APP_URL}/parent/index.html">Parent Portal</a>.</p>`));
    return;
  }
  if (req.method === "GET") {
    /* The form posts back to this same address, which still holds ?u= and ?t=. */
    res.status(200).send(page("Unsubscribe", `<h1>Stop newsletters?</h1><p>You will stop getting Paisley Studio offers and news by email. Messages about your child still reach you.</p><form method="post"><button type="submit">Unsubscribe</button></form>`));
    return;
  }
  await admin.firestore().collection("parentNewsletterPrefs").doc(uid).set({
    emailOptOut: true, optOutSource: "email-link", updatedAt: FV().serverTimestamp()
  }, { merge: true });
  res.status(200).send(page("Unsubscribed", `<h1>You are unsubscribed</h1><p>No more newsletters by email. You can turn them back on any time from the Newsletter tab in your <a href="${APP_URL}/parent/index.html">Parent Portal</a>.</p>`));
});

exports._internals = { mainPortalParents, unsubToken, tokenOk, unsubUrl, buildRecipients, claimError, checkContent, runPool };
