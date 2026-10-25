/* =========================================================
   Paisley TECH — Cloud Functions
   -----------------------------------------------------------
   onTechStudentCreated    new TECH sign-up: bell + email to every admin.
   onTechStudentActivated  Pending → Active: bell + welcome email to the student
                           (and a short notice to the guardian for under-18s).
   onTechFeedbackCreated   build comment: bell to the other side
                           (student → project coaches, coach/admin → builder).
   onTechMessageCreated    chat message: bell to the other side.
   onTechShowcaseApproved  build approved for the TECH Wall: bell to the builder.
   techShare               GET /tech/b/:id — HTML with Open Graph tags for an
                           APPROVED build, then redirects people to /tech?build=:id.
========================================================= */
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { render, PORTALS } = require("./email-templates");
const notifications = require("./notifications");
const { SMTP_SECRETS } = require("./work-shared");

const LOCATION = "us-central1";
const FV = () => admin.firestore.FieldValue;
const APP = new URL(PORTALS.admin).origin;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function bell(recipientId, recipientType, type, title, message, entity, entityId) {
  if (!recipientId) return;
  try {
    await admin.firestore().collection("personalNotifications").add({
      recipientId, recipientType, type, title, message,
      relatedEntity: entity || "", relatedEntityId: entityId || "",
      read: false, emailSent: false, createdAt: FV().serverTimestamp()
    });
  } catch (e) { console.warn("tech bell failed:", e.message); }
}
async function email(to, subject, opts) {
  if (!to) return;
  try { await notifications.sendEmail(to, subject, render(opts)); } catch (e) { console.warn("tech email failed:", e.message); }
}
async function adminList() {
  const snap = await admin.firestore().collection("admins").get();
  const out = [];
  for (const d of snap.docs) {
    let em = (d.data() || {}).email;
    if (!em) { try { em = (await admin.auth().getUser(d.id)).email; } catch (e) { /* ignore */ } }
    out.push({ id: d.id, email: em });
  }
  return out;
}

exports.onTechStudentCreated = onDocumentCreated(
  { document: "students/{studentId}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const s = event.data.data() || {};
    if (s.studentType !== "tech") return;
    const msg = `${s.name || "A new student"} joined TECH and is waiting for approval.`;
    for (const a of await adminList()) {
      await bell(a.id, "admin", "tech_signup", "New TECH account", msg, "students", event.params.studentId);
      await email(a.email, `New TECH account — ${s.name || "student"}`, {
        preheader: msg, heading: "Admin alert", intro: "New TECH account",
        body: `<p style="margin:0 0 8px;"><strong>${esc(s.name)}</strong> (${esc(s.email)}) registered for Paisley TECH.</p><p style="margin:0;">${esc((s.techProfile && s.techProfile.identity) || "")}${s.ageGroup === "u18" ? " · under 18" : ""}</p>`,
        cta: { label: "Open TECH panel", url: PORTALS.admin + "#tech" }
      });
    }
  }
);

exports.onTechStudentActivated = onDocumentUpdated(
  { document: "students/{studentId}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const b = event.data.before.data() || {}, a = event.data.after.data() || {};
    if (a.studentType !== "tech") return;
    if (String(b.status || "").toLowerCase() !== "pending" || String(a.status || "").toLowerCase() !== "active") return;
    const url = APP + "/tech/dashboard";
    await bell(event.params.studentId, "student", "tech_welcome", "Welcome to TECH", "Your account is approved. Let’s build something.", "students", event.params.studentId);
    await email(a.email, "Welcome to Paisley TECH", {
      preheader: "Your TECH account is approved.", heading: "Welcome to TECH.", intro: `Hi ${esc((a.name || "").split(" ")[0] || "there")}, you’re in.`,
      body: `<p style="margin:0;">Your account is approved. Open your studio, pick a mission or start your own idea, and build something.</p>`,
      cta: { label: "Open TECH Studio", url }
    });
    if (a.ageGroup === "u18" && a.guardianEmail) {
      await email(a.guardianEmail, "Your child’s Paisley TECH account is active", {
        preheader: "Paisley TECH account approved.", heading: "TECH account approved",
        intro: `${esc(a.name || "Your child")} can now use Paisley TECH.`,
        body: `<p style="margin:0;">Paisley TECH teaches practical AI literacy through projects, with a Paisley coach reviewing every build. Only builds approved by a coach are ever shown publicly, and only with a first name.</p>`
      });
    }
  }
);

exports.onTechFeedbackCreated = onDocumentCreated(
  { document: "techProjects/{pid}/feedback/{fid}", region: LOCATION },
  async (event) => {
    const f = event.data.data() || {};
    const p = (await admin.firestore().collection("techProjects").doc(event.params.pid).get()).data();
    if (!p) return;
    const preview = String(f.text || "").slice(0, 140);
    if (f.role === "student") {
      for (const c of p.coachIds || []) await bell(c, "tutor", "tech_feedback", `${p.ownerName || "A builder"} replied`, `${p.title}: ${preview}`, "techProjects", event.params.pid);
    } else {
      const title = f.type === "approved" ? "Build approved" : f.type === "changes" ? "Changes requested" : "New feedback";
      await bell(p.ownerId, "student", "tech_feedback", title, `${p.title}: ${preview}`, "techProjects", event.params.pid);
    }
  }
);

exports.onTechMessageCreated = onDocumentCreated(
  { document: "techChats/{chatId}/messages/{mid}", region: LOCATION },
  async (event) => {
    const m = event.data.data() || {};
    const c = (await admin.firestore().collection("techChats").doc(event.params.chatId).get()).data() || {};
    const preview = String(m.text || "").slice(0, 140);
    if (m.senderRole === "student") await bell(c.tutorId, "tutor", "tech_message", `Message from ${c.studentName || "a builder"}`, preview, "techChats", event.params.chatId);
    else {
      await bell(c.studentId, "student", "tech_message", `Message from ${m.senderRole === "admin" ? "Paisley" : c.tutorName || "your coach"}`, preview, "techChats", event.params.chatId);
      if (m.senderRole === "admin") await bell(c.tutorId, "tutor", "tech_message", "Studio Desk joined a TECH chat", preview, "techChats", event.params.chatId);
    }
  }
);

exports.onTechShowcaseApproved = onDocumentUpdated(
  { document: "techProjects/{pid}", region: LOCATION },
  async (event) => {
    const b = event.data.before.data() || {}, a = event.data.after.data() || {};
    if (b.showcase === "approved" || a.showcase !== "approved") return;
    await bell(a.ownerId, "student", "tech_showcase", "You’re on the TECH Wall", `${a.title} is now public. Share it with your family and friends.`, "techProjects", event.params.pid);
  }
);

exports.techShare = onRequest({ region: LOCATION }, async (req, res) => {
  const id = decodeURIComponent(String(req.path || "").split("/").filter(Boolean).pop() || "").slice(0, 80);
  let w = null;
  if (id && !id.includes("/")) {
    try { const d = await admin.firestore().collection("techShowcase").doc(id).get(); if (d.exists) w = d.data(); } catch (e) { /* fall through */ }
  }
  const dest = `${APP}/tech${w ? "?build=" + encodeURIComponent(id) : ""}`;
  const title = w ? `${w.title} — built with Paisley TECH` : "Paisley TECH | Digital AI Literacy";
  const desc = w ? `Built by ${w.displayName || "a Paisley student"}. ${String(w.description || "").slice(0, 160)}` : "Learn what you can do with AI.";
  res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  res.status(w ? 200 : 404).send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:url" content="${esc(dest)}"><meta property="og:site_name" content="Paisley Studio">
<meta property="og:image" content="https://aws-filez.s3.eu-north-1.amazonaws.com/cropped-Paisely-logo-Resized.png"><meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0;url=${esc(dest)}"></head><body><p><a href="${esc(dest)}">Open this build on Paisley TECH</a></p></body></html>`);
});
