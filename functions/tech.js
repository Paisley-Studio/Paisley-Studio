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
   onTechBuildMasteryApproved  build mastery approved: recompute per-discipline
                           levels into techProgress/{uid} (student read-only).
   techShare               GET /tech/b/:id — HTML with Open Graph tags for an
                           APPROVED build or a valid FAMILY-SHARE token, then
                           redirects to /tech?build=:id. Never serves a private
                           build without a matching token.
========================================================= */
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { render, PORTALS } = require("./email-templates");
const notifications = require("./notifications");
const { SMTP_SECRETS } = require("./work-shared");

const LOCATION = "us-central1";
const FV = () => admin.firestore.FieldValue;
const APP = new URL(PORTALS.admin).origin;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Paisley TECH creator-level ladder — must stay in sync with TechUI.LEVELS */
const TECH_LEVELS = ["DISCOVER", "MAKE", "BUILD", "SOLVE", "CREATE", "INVENT", "STUDIO"];
/* Paisley TECH disciplines — must stay in sync with TechUI.DISCIPLINES */
const TECH_DISCIPLINES = ["Coding", "AI", "Writing", "Research", "Design", "Media", "Music", "Entrepreneurship"];

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
        body: `<p style="margin:0 0 8px;"><strong>${esc(s.name)}</strong> (${esc(s.email)}) registered for Paisley TECH.</p><p style="margin:0;">${esc((s.techProfile && s.techProfile.identity) || "")}${/^u/.test(s.ageGroup || "") ? " · under 18" : ""}</p>`,
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
    if (/^u/.test(a.ageGroup || "") && a.guardianEmail) {
      await email(a.guardianEmail, "Your child’s Paisley TECH account is active", {
        preheader: "Paisley TECH account approved.", heading: "TECH account approved",
        intro: `${esc(a.name || "Your child")} can now use Paisley TECH.`,
        body: `<p style="margin:0;">Paisley TECH teaches practical AI literacy through projects, with a Paisley coach reviewing every build. Only builds approved by a coach are ever shown publicly, and only with a first name.</p>`
      });
    }
  }
);

exports.onTechFeedbackCreated = onDocumentCreated(
  { document: "techBuilds/{pid}/feedback/{fid}", region: LOCATION },
  async (event) => {
    const f = event.data.data() || {};
    const p = (await admin.firestore().collection("techBuilds").doc(event.params.pid).get()).data();
    if (!p) return;
    const preview = String(f.text || "").slice(0, 140);
    if (f.role === "student") {
      if (p.tutorId) await bell(p.tutorId, "tutor", "tech_feedback", `${p.studentName || "A builder"} replied`, `${p.title}: ${preview}`, "techBuilds", event.params.pid);
    } else {
      const title = f.kind === "approved" ? "Build approved" : f.kind === "changes" ? "Changes requested" : "New feedback";
      await bell(p.studentId, "student", "tech_feedback", title, `${p.title}: ${preview}`, "techBuilds", event.params.pid);
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
  { document: "techBuilds/{pid}", region: LOCATION },
  async (event) => {
    const b = event.data.before.data() || {}, a = event.data.after.data() || {};
    if (b.showcase === "approved" || a.showcase !== "approved") return;
    await bell(a.studentId, "student", "tech_showcase", "You’re on the TECH Wall", `${a.title} is now public. Share it with your family and friends.`, "techBuilds", event.params.pid);
  }
);

/* =========================================================
   onTechBuildMasteryApproved
   -----------------------------------------------------------
   Fires when a coach/admin flips mastery to 'approved'.
   Recomputes per-discipline levels from that student's approved
   builds and writes techProgress/{uid}. Levels are 1–7 based on
   the number of mastered builds in that discipline:

     masteryCount in discipline    -> level
     0                             -> 1 (DISCOVER — everyone starts here)
     1                             -> 2 (MAKE)
     2                             -> 3 (BUILD)
     3                             -> 4 (SOLVE)
     4                             -> 5 (CREATE)
     5                             -> 6 (INVENT)
     6+                            -> 7 (STUDIO)

   This is deliberately simple and deterministic. Coaches can
   override a level manually from the admin panel later if the
   policy needs nuance — the write here is idempotent and safe to
   re-run.
========================================================= */
exports.onTechBuildMasteryApproved = onDocumentUpdated(
  { document: "techBuilds/{pid}", region: LOCATION },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    if (before.mastery === "approved" || after.mastery !== "approved") return;
    const studentId = after.studentId;
    if (!studentId) return;

    const db = admin.firestore();
    /* Recompute from all approved builds this student has. */
    let buildsSnap;
    try {
      buildsSnap = await db.collection("techBuilds")
        .where("studentId", "==", studentId)
        .where("mastery", "==", "approved")
        .get();
    } catch (e) {
      console.warn("onTechBuildMasteryApproved: query failed", e.message || e);
      return;
    }

    const masteryCount = {};
    TECH_DISCIPLINES.forEach((d) => { masteryCount[d] = 0; });

    buildsSnap.docs.forEach((doc) => {
      const b = doc.data() || {};
      /* A build may belong to one or many disciplines. */
      const discs = Array.isArray(b.disciplines) && b.disciplines.length
        ? b.disciplines
        : (b.discipline ? [b.discipline] : []);
      discs.forEach((d) => {
        if (TECH_DISCIPLINES.indexOf(d) !== -1) masteryCount[d] += 1;
      });
    });

    const levels = {};
    TECH_DISCIPLINES.forEach((d) => {
      const n = masteryCount[d] || 0;
      /* 0 -> 1, 1 -> 2, 2 -> 3, 3 -> 4, 4 -> 5, 5 -> 6, 6+ -> 7 */
      levels[d] = Math.max(1, Math.min(TECH_LEVELS.length, n + 1));
    });

    try {
      await db.collection("techProgress").doc(studentId).set({
        levels,
        masteryCount,
        updatedAt: FV().serverTimestamp(),
        updatedBy: "system:mastery-approved",
        lastBuildId: event.params.pid
      }, { merge: true });
    } catch (e) {
      console.warn("onTechBuildMasteryApproved: write failed", e.message || e);
    }

    /* Bell for the student. */
    try {
      const studentSnap = await db.collection("students").doc(studentId).get();
      const student = studentSnap.exists ? studentSnap.data() : {};
      const topDisc = TECH_DISCIPLINES.slice().sort((a, b) => levels[b] - levels[a])[0];
      const topLevel = topDisc ? levels[topDisc] : 1;
      const levelName = TECH_LEVELS[Math.max(0, Math.min(TECH_LEVELS.length - 1, topLevel - 1))];
      await bell(
        studentId, "student", "tech_mastery_approved",
        "Mastery approved 🎉",
        `${after.title || "Your build"} was approved. You're now ${levelName}${topDisc ? " in " + topDisc : ""}.`,
        "techBuilds", event.params.pid
      );
      if (student.email) {
        await email(student.email, `Mastery approved — ${after.title || "your build"}`, {
          preheader: "Your coach approved your build.",
          heading: "Mastery approved.",
          intro: `Hi ${esc((student.name || "").split(" ")[0] || "there")}, your coach approved “${esc(after.title || "your build")}”.`,
          body: `<p style="margin:0 0 8px;">You're now <strong>${esc(levelName)}</strong>${topDisc ? " in " + esc(topDisc) : ""}. Keep building.</p><p style="margin:0;">Open your studio to see what unlocked next.</p>`,
          cta: { label: "Open TECH Studio", url: APP + "/tech/dashboard" }
        });
      }
    } catch (e) { console.warn("onTechBuildMasteryApproved: bell/email failed", e.message || e); }
  }
);

/* =========================================================
   techShare — GET /tech/b/:id
   -----------------------------------------------------------
   Public share page with OG tags for an APPROVED build.
   Also accepts ?t=<family-share-token> for non-public builds.

   Security:
     - If build.showcase === 'approved' → serve.
     - Else if a valid, non-revoked token exists in
       shareTokens/{buildId} AND matches ?t → serve.
     - Else → 404.
     - Any build missing from techShowcase is not public;
       we still serve its OG tags from techBuilds when the
       token path is used so the family sees the title/image.
========================================================= */
exports.techShare = onRequest({ region: LOCATION, cors: true }, async (req, res) => {
  const pathParts = String(req.path || "").split("/").filter(Boolean);
  const id = decodeURIComponent(pathParts[pathParts.length - 1] || "").slice(0, 80);
  const token = String((req.query && req.query.t) || "").slice(0, 200);

  let build = null;
  let showcase = null;
  if (id && !id.includes("/")) {
    try {
      const d = await admin.firestore().collection("techBuilds").doc(id).get();
      if (d.exists) build = d.data();
    } catch (e) { /* fall through */ }
    try {
      const d = await admin.firestore().collection("techShowcase").doc(id).get();
      if (d.exists) showcase = d.data();
    } catch (e) { /* fall through */ }
  }

  /* Decide whether we can serve this build. */
  let allowed = false;
  let isPublic = false;
  if (build) {
    if (build.showcase === "approved" && showcase) {
      allowed = true;
      isPublic = true;
    } else if (token) {
      try {
        const t = await admin.firestore().collection("shareTokens").doc(id).get();
        if (t.exists) {
          const td = t.data() || {};
          if (td.revoked !== true && td.token === token) {
            allowed = true;
          }
        }
      } catch (e) { /* fall through */ }
    }
  }

  const dest = `${APP}/tech${allowed ? "?build=" + encodeURIComponent(id) : ""}`;
  const titleBase = build ? `${build.title || "Untitled build"} — built with Paisley TECH` : "Paisley TECH | Digital Creator Studio";
  const descBase = build
    ? `Built by ${build.displayName || "a Paisley student"}. ${String(build.brief || "").slice(0, 160)}`
    : "Learn what you can do with AI.";
  /* Private builds must not leak their title or description into the OG payload. */
  const safeTitle = allowed ? titleBase : "Paisley TECH | Digital Creator Studio";
  const safeDesc = allowed ? descBase : "Learn what you can do with AI.";

  res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  if (!allowed) {
    res.status(404).send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Not available</title>
<meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${esc(APP + "/tech")}"></head>
<body><p>This build is not available publicly. <a href="${esc(APP + "/tech")}">Open Paisley TECH</a>.</p></body></html>`);
    return;
  }
  res.status(200).send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(safeTitle)}</title>
<meta name="description" content="${esc(safeDesc)}"><meta property="og:title" content="${esc(safeTitle)}"><meta property="og:description" content="${esc(safeDesc)}">
<meta property="og:type" content="website"><meta property="og:url" content="${esc(dest)}"><meta property="og:site_name" content="Paisley Studio">
<meta property="og:image" content="https://aws-filez.s3.eu-north-1.amazonaws.com/cropped-Paisely-logo-Resized.png"><meta name="twitter:card" content="summary">
${isPublic ? "" : '<meta name="robots" content="noindex">'}
<meta http-equiv="refresh" content="0;url=${esc(dest)}${token ? (dest.indexOf("?") === -1 ? "?t=" : "&t=") + encodeURIComponent(token) : ""}"></head><body><p><a href="${esc(dest)}">Open this build on Paisley TECH</a></p></body></html>`);
});

/* Helper export used by other modules if they ever need to mint a token. */
exports._mintShareToken = async function mintShareToken(buildId, createdBy) {
  const token = crypto.randomBytes(18).toString("base64url");
  await admin.firestore().collection("shareTokens").doc(buildId).set({
    token, createdBy: createdBy || "system", revoked: false, createdAt: FV().serverTimestamp()
  }, { merge: true });
  return token;
};