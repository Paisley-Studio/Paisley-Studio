/* =========================================================
   Paisley TECH — Cloud Functions
   -----------------------------------------------------------
   TECH is its own architecture, separate from the tutoring LMS:

     techStudents/{uid}       TECH enrolment (any signed-in account can
                              apply, including IGCSE / CBC / remote students)
     techCoaches/{uid}        TECH coaches (not tutors)
     techGuardianLinks/{parentUid}_{studentUid}
                              guardian -> builder; the guardian's login is
                              their parentAccounts/{uid} identity, so a parent
                              who already uses the Parent Portal keeps one login
     techGuardianChats/{parentUid}_{studentUid} (+ /messages)
                              guardian <-> the builder's current coach
     techNotifications/{id}   TECH-only bell feed for students, coaches,
                              guardians and admins (never personalNotifications)

   Triggers
     onTechEnrolmentCreated   new application: admins alerted, guardians told
                              access follows approval, applicant gets a receipt.
     onTechEnrolmentUpdated   first approval: welcome + guardian accounts linked;
                              coach change: coach, builder and guardians told,
                              builds re-pointed at the new coach.
     onTechBuildCreated       coach + guardians told a mission or self-led
                              project started.
     onTechBuildUpdated       submissions / resubmissions -> coach (email) and
                              guardians; review outcomes, publication and
                              mastery go on the activity timeline (techActivity);
                              published -> builder + guardians with the
                              /tech/p/{id} link; mastery -> techProgress
                              recomputed, "next level unlocked" per discipline.
     onTechFeedbackCreated    coach review (approve / revision / grade) ->
                              builder + guardians, bell and email.
     onTechContentWritten     mission / challenge released -> its audience
                              (all active builders or studentIds) + guardians.
     onTechLiveClassWritten   live class scheduled / changed / cancelled ->
                              builders, guardians, coach, admins; fills
                              parentUids so guardians can read the class.
     onTechFamilyDeskMessage  TECH guardian -> Studio Desk (parentConversations)
                              raises the admin TECH bell.
     onTechMessageCreated     builder <-> coach chat.
     onTechGuardianMessageCreated  guardian <-> coach chat.
   Callables (admin only)
     createTechCoach          create / promote a TECH coach login.
     techLinkGuardians        (re)link a builder's guardians, optionally adding one.
     migrateTechArchitecture  one-off move of legacy TECH data (students
                              studentType "tech", tutor coaches, tutorId fields).
   HTTP
     techShare                GET /tech/b/:id share page (unchanged).
========================================================= */
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { render, PORTALS } = require("./email-templates");
const notifications = require("./notifications");
const { SMTP_SECRETS } = require("./work-shared");

const LOCATION = "us-central1";
const FV = () => admin.firestore.FieldValue;
const APP = new URL(PORTALS.admin).origin;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const first = (n, fb) => String(n || "").trim().split(/\s+/)[0] || fb || "there";

/* Paisley TECH creator-level ladder — must stay in sync with TechUI.LEVELS */
const TECH_LEVELS = ["DISCOVER", "MAKE", "BUILD", "SOLVE", "CREATE", "INVENT", "STUDIO"];
/* Paisley TECH disciplines — must stay in sync with TechUI.DISCIPLINES */
const TECH_DISCIPLINES = ["Coding", "AI", "Writing", "Research", "Design", "Media", "Music", "Entrepreneurship"];

/* Where each TECH role lands when it opens a notification. */
const LINKS = {
  student: "/tech/dashboard",
  coach: "/tech/coach/dashboard",
  guardian: "/tech/parent/dashboard",
  admin: "/admin#tech"
};

/* ---------------------------------------------------------
   TECH notifications — techNotifications only.
--------------------------------------------------------- */
/* extra.id makes the notification idempotent: the same event retried (or re-saved)
   writes the same doc once, so nobody gets a duplicate. Returns false when it already existed. */
async function techNotify(recipientId, recipientRole, type, title, message, extra) {
  if (!recipientId) return false;
  const x = extra || {};
  const doc = {
    recipientId, recipientRole, type, title: String(title || "").slice(0, 140), message: String(message || "").slice(0, 400),
    studentId: x.studentId || "", buildId: x.buildId || "", chatId: x.chatId || "",
    missionId: x.missionId || "", classId: x.classId || "",
    link: x.link || LINKS[recipientRole] || "/tech",
    read: false, createdAt: FV().serverTimestamp()
  };
  const col = admin.firestore().collection("techNotifications");
  try {
    if (x.id) await col.doc(String(x.id).replace(/[^w-]/g, "_").slice(0, 300) + "_" + recipientId).create(doc);
    else await col.add(doc);
    return true;
  } catch (e) {
    if (e && (e.code === 6 || /already exists/i.test(e.message || ""))) return false;
    console.warn("techNotify failed:", e.message); return false;
  }
}
/* One event on a builder's activity timeline (techActivity). Server-side events
   use the same shape as the ones builders record from the studio. */
async function logActivity(studentId, type, label, extra) {
  if (!studentId) return;
  const x = extra || {};
  try {
    await admin.firestore().collection("techActivity").add({
      studentId, studentName: x.studentName || "", type, label: String(label || "").slice(0, 200),
      buildId: x.buildId || "", missionId: x.missionId || "", origin: x.origin || "", by: x.by || "system",
      at: FV().serverTimestamp()
    });
  } catch (e) { console.warn("logActivity failed:", e.message); }
}
const sha = (s) => crypto.createHash("sha1").update(String(s)).digest("hex");
const isSelfLed = (b) => !(b && (b.missionId || b.challengeId));
const projectWord = (b) => (isSelfLed(b) ? "self-led project" : "mission");
async function email(to, subject, opts) {
  if (!to) return false;
  try { return !!(await notifications.sendEmail(to, subject, render(opts)) || {}).sent; } catch (e) { console.warn("tech email failed:", e.message); return false; }
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
async function notifyAdmins(type, title, message, extra, mail) {
  for (const a of await adminList()) {
    await techNotify(a.id, "admin", type, title, message, extra);
    if (mail) await email(a.email, mail.subject, mail.opts);
  }
}
async function techStudent(id) {
  if (!id) return null;
  const d = await admin.firestore().collection("techStudents").doc(id).get();
  return d.exists ? Object.assign({ id: d.id }, d.data()) : null;
}
async function coachEmail(coachId) {
  if (!coachId) return "";
  const d = await admin.firestore().collection("techCoaches").doc(coachId).get();
  return d.exists ? (d.data().email || "") : "";
}
/* Every guardian linked to a builder: [{ parentUid, email, name }]. */
async function guardiansOf(studentId) {
  if (!studentId) return [];
  const db = admin.firestore();
  const links = await db.collection("techGuardianLinks").where("studentUid", "==", studentId).get();
  const out = [];
  for (const l of links.docs) {
    const p = await db.collection("parentAccounts").doc(l.data().parentUid).get();
    const pd = p.exists ? p.data() : {};
    out.push({ parentUid: l.data().parentUid, email: pd.email || "", name: pd.name || l.data().guardianName || "" });
  }
  return out;
}
async function notifyGuardians(studentId, type, title, message, extra, mail) {
  for (const g of await guardiansOf(studentId)) {
    await techNotify(g.parentUid, "guardian", type, title, message, Object.assign({ studentId }, extra || {}));
    if (mail) await email(g.email, mail.subject, mail.opts(g));
  }
}

/* ---------------------------------------------------------
   Guardian accounts
   -----------------------------------------------------------
   Guardians sign in to /tech/parent with their parentAccounts
   identity. A guardian who already uses the Parent Portal (an
   IGCSE / CBC / remote parent) keeps the same login; a new one
   gets an account whose first password is their phone number
   (the same rule the Parent Portal uses), or a set-password
   link when no usable phone was given.

   Guardians come from three places, de-duplicated:
     1. the TECH application (techStudents.guardians)
     2. the builder's normal student record (students.guardians)
     3. parents already linked in the Parent Portal (parentStudentLinks)
--------------------------------------------------------- */
async function linkTechGuardians(db, studentId, s) {
  const results = [];
  const seenEmail = new Set(), seenUid = new Set();
  const studentEmail = String(s.email || "").trim().toLowerCase();
  const candidates = [];
  (Array.isArray(s.guardians) ? s.guardians : []).forEach((g) => candidates.push({ name: g.name, email: g.email, phone: g.phone, relationship: g.relationship, source: "tech" }));
  const stuDoc = await db.collection("students").doc(studentId).get();
  if (stuDoc.exists) notifications.guardiansOf(stuDoc.data() || {}).forEach((g) => candidates.push({ name: g.name, email: g.email, phone: g.phone, source: "student" }));
  const plinks = await db.collection("parentStudentLinks").where("studentUid", "==", studentId).get();
  plinks.docs.forEach((l) => candidates.push({ parentUid: l.data().parentUid, source: "parentPortal" }));

  for (const g of candidates) {
    let parentUid = g.parentUid || "", created = false, phonePassword = "";
    const mail = String(g.email || "").trim(), key = mail.toLowerCase();
    if (!parentUid) {
      if (!/^\S+@\S+\.\S+$/.test(mail)) { results.push({ email: mail, skipped: "invalid email" }); continue; }
      if (seenEmail.has(key)) continue;
      seenEmail.add(key);
      if (key === studentEmail) { results.push({ email: mail, skipped: "same as the builder's own email" }); continue; }
      try {
        parentUid = (await admin.auth().getUserByEmail(mail)).uid;
      } catch (e) {
        if (e && e.code && e.code !== "auth/user-not-found") throw e;
        phonePassword = notifications.normalizePhonePassword(g.phone);
        parentUid = (await admin.auth().createUser({
          email: mail, password: phonePassword || crypto.randomBytes(18).toString("base64url"), displayName: g.name || "Parent/Guardian"
        })).uid;
        created = true;
      }
    }
    if (seenUid.has(parentUid)) continue;
    seenUid.add(parentUid);
    if (parentUid === studentId) { results.push({ email: mail, skipped: "same login as the builder" }); continue; }

    const pRef = db.collection("parentAccounts").doc(parentUid);
    const pSnap = await pRef.get();
    const pd = pSnap.exists ? pSnap.data() : {};
    const pKey = notifications.phoneKey(g.phone);
    await pRef.set({
      name: pd.name || g.name || "",
      email: pd.email || mail,
      techGuardian: true,
      ...(pKey ? { phoneKeys: FV().arrayUnion(pKey) } : {}),
      ...(pSnap.exists ? {} : { createdAt: FV().serverTimestamp() })
    }, { merge: true });

    const lRef = db.collection("techGuardianLinks").doc(parentUid + "_" + studentId);
    const newLink = !(await lRef.get()).exists;
    if (newLink) {
      await lRef.set({
        parentUid, studentUid: studentId, studentName: s.name || "", guardianName: pd.name || g.name || "",
        relationship: g.relationship || "", source: g.source, createdAt: FV().serverTimestamp()
      });
    }

    const to = pd.email || mail, name = pd.name || g.name || "";
    const child = esc(s.name || "your child");
    let emailSent = false;
    if (created && phonePassword) {
      emailSent = await email(to, "Your Paisley TECH guardian account", {
        preheader: "Follow your child's TECH projects.", heading: "Your guardian account is ready.",
        intro: `Hi ${esc(first(name))}, ${child} has joined Paisley TECH.`,
        body: `<p style="margin:0 0 8px;">You can follow their projects, see their progress and message their coach.</p>` +
          `<p style="margin:0 0 4px;"><strong>Sign in:</strong> ${esc(to)} (or your phone number)</p>` +
          `<p style="margin:0 0 8px;"><strong>Password:</strong> ${esc(phonePassword)}</p>` +
          `<p style="margin:0;">Please change your password after you sign in.</p>`,
        cta: { label: "Open the TECH guardian portal", url: PORTALS.techParent }
      });
    } else if (created) {
      let link = null;
      try { link = await admin.auth().generatePasswordResetLink(to, notifications.actionSettings("techParent")); } catch (e) { console.warn("tech guardian reset link failed:", e.message); }
      if (link) {
        emailSent = await email(to, "Set up your Paisley TECH guardian account", {
          preheader: "Follow your child's TECH projects.", heading: "Your guardian account is ready.",
          intro: `Hi ${esc(first(name))}, ${child} has joined Paisley TECH.`,
          body: `<p style="margin:0;">Choose a password to follow their projects, see their progress and message their coach.</p>`,
          cta: { label: "Set my password", url: link }
        });
      }
    } else if (newLink) {
      emailSent = await email(to, `${s.name || "Your child"} joined Paisley TECH`, {
        preheader: "TECH is now on your guardian account.", heading: "TECH is on your account.",
        intro: `Hi ${esc(first(name))}, ${child} has joined Paisley TECH.`,
        body: `<p style="margin:0;">Sign in with your existing Paisley parent login to follow their projects, see their progress and message their coach.</p>`,
        cta: { label: "Open the TECH guardian portal", url: PORTALS.techParent }
      });
    }
    results.push({ email: to, parentUid, created, newLink, emailSent, source: g.source });
  }
  await refreshGuardianSummary(db, studentId);
  return results;
}

/* techStudents.guardianAccounts = [{ parentUid, name }] so the coach (who cannot
   read techGuardianLinks) knows which families they can message. */
async function refreshGuardianSummary(db, studentId) {
  const links = await db.collection("techGuardianLinks").where("studentUid", "==", studentId).get();
  const list = links.docs.map((l) => ({ parentUid: l.data().parentUid, name: l.data().guardianName || "" }));
  await db.collection("techStudents").doc(studentId).set({ guardianAccounts: list }, { merge: true });
}

/* Which other Paisley programme (if any) this account already belongs to. */
async function otherProgrammes(db, uid) {
  const out = [];
  const st = await db.collection("students").doc(uid).get();
  if (st.exists) {
    const d = st.data() || {};
    if (d.studentType !== "tech") out.push(d.studentType === "tuition" ? "CBC tuition" : d.studentType === "remote" ? "Remote" : (d.keyStage ? String(d.keyStage).replace(/\s*\(.*/, "") : "Online"));
  }
  if ((await db.collection("tutorAccounts").doc(uid).get()).exists) out.push("Tutor");
  return out;
}

/* =========================================================
   Enrolment
========================================================= */
exports.onTechEnrolmentCreated = onDocumentCreated(
  { document: "techStudents/{studentId}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const s = event.data.data() || {};
    if (s.migratedFrom) return;
    const sid = event.params.studentId, db = admin.firestore();
    const programmes = await otherProgrammes(db, sid);
    if (programmes.length) await event.data.ref.set({ programmes }, { merge: true });

    const also = programmes.length ? ` Already with Paisley: ${programmes.join(", ")}.` : "";
    const msg = `${s.name || "A new builder"} applied to TECH and is waiting for approval.${also}`;
    await notifyAdmins("tech_application", "New TECH application", msg, { studentId: sid }, {
      subject: `New TECH application — ${s.name || "builder"}`,
      opts: {
        preheader: msg, heading: "Admin alert", intro: "New TECH application",
        body: `<p style="margin:0 0 8px;"><strong>${esc(s.name)}</strong> (${esc(s.email)}) applied to Paisley TECH.</p><p style="margin:0;">${esc((s.techProfile && s.techProfile.identity) || "")}${/^u/.test(s.ageGroup || "") ? " · under 18" : ""}${esc(also)}</p>`,
        cta: { label: "Open TECH applications", url: PORTALS.admin + "#tech" }
      }
    });
    await techNotify(sid, "student", "tech_application", "Application received", "The Studio Desk will approve your TECH account soon.", { studentId: sid });
    for (const g of (Array.isArray(s.guardians) ? s.guardians : [])) {
      if (!/^\S+@\S+\.\S+$/.test(String(g.email || ""))) continue;
      await email(g.email, `${s.name || "Your child"} applied to Paisley TECH`, {
        preheader: "You'll get guardian access once they're approved.", heading: "TECH application received",
        intro: `Hi ${esc(first(g.name))}, ${esc(s.name || "your child")} applied to Paisley TECH and listed you as their parent or guardian.`,
        body: `<p style="margin:0;">Once the Studio Desk approves the application we'll email you a guardian login so you can follow their projects, see their progress and talk to their coach.</p>`
      });
    }
  }
);

exports.onTechEnrolmentUpdated = onDocumentUpdated(
  { document: "techStudents/{studentId}", region: LOCATION, secrets: SMTP_SECRETS, timeoutSeconds: 120 },
  async (event) => {
    const b = event.data.before.data() || {}, a = event.data.after.data() || {};
    const sid = event.params.studentId, db = admin.firestore();

    if (b.status !== "Active" && a.status === "Active") {
      if (!a.welcomedAt) {
        await techNotify(sid, "student", "tech_welcome", "Welcome to TECH", "Your account is approved. Let's build something.", { studentId: sid });
        await email(a.email, "Welcome to Paisley TECH", {
          preheader: "Your TECH account is approved.", heading: "Welcome to TECH.", intro: `Hi ${esc(first(a.name))}, you're in.`,
          body: `<p style="margin:0;">Your account is approved. Open your studio, pick a mission or start your own idea, and build something.</p>`,
          cta: { label: "Open TECH Studio", url: APP + LINKS.student }
        });
        let results = [];
        try { results = await linkTechGuardians(db, sid, a); } catch (e) { console.error("linkTechGuardians failed:", e); }
        await event.data.after.ref.set({ welcomedAt: FV().serverTimestamp(), guardianLinkResults: results.map((r) => ({ email: r.email || "", created: !!r.created, skipped: r.skipped || "" })) }, { merge: true });
      } else {
        await techNotify(sid, "student", "tech_unlocked", "Account unlocked", "Your TECH studio is open again.", { studentId: sid });
      }
    }

    const coachChanged = (a.coachId || "") !== (b.coachId || "") && a.status === "Active";
    const approvedWithCoach = b.status !== "Active" && a.status === "Active" && a.coachId && !b.welcomedAt;
    if ((a.coachId || "") !== (b.coachId || "")) {
      /* Builds and family conversations follow the builder's coach (or lose it when
         the coach is removed), so reviews and messages land with whoever coaches them now. */
      const cid = a.coachId || "", cname = cid ? (a.coachName || "") : "";
      const batch = db.batch();
      const builds = await db.collection("techBuilds").where("studentId", "==", sid).get();
      builds.docs.forEach((d) => { if ((d.data().coachId || "") !== cid) batch.update(d.ref, { coachId: cid, coachName: cname }); });
      const gchats = await db.collection("techGuardianChats").where("studentId", "==", sid).get();
      gchats.docs.forEach((d) => { if ((d.data().coachId || "") !== cid) batch.update(d.ref, { coachId: cid, coachName: cname }); });
      await batch.commit();
    }
    if (coachChanged || approvedWithCoach) {
      if (a.coachId) {
        await techNotify(a.coachId, "coach", "tech_new_builder", "New builder", `${a.name || "A builder"} is now paired with you.`, { studentId: sid });
        const ce = await coachEmail(a.coachId);
        await email(ce, `New TECH builder — ${a.name || "builder"}`, {
          preheader: "A builder was paired with you.", heading: "New builder", intro: `${esc(a.name || "A builder")} is now paired with you.`,
          body: `<p style="margin:0;">Open your coach dashboard to see their projects and say hello.</p>`,
          cta: { label: "Open coach dashboard", url: APP + LINKS.coach }
        });
        await techNotify(sid, "student", "tech_coach", "You have a coach", `${a.coachName || "Your coach"} will review your builds.`, { studentId: sid });
        await notifyGuardians(sid, "tech_coach", "Coach assigned", `${a.coachName || "A coach"} is now coaching ${first(a.name, "your child")}. You can message them from the Coach tab.`);
      }
    }
  }
);

/* =========================================================
   Builds
========================================================= */
exports.onTechBuildCreated = onDocumentCreated(
  { document: "techBuilds/{pid}", region: LOCATION },
  async (event) => {
    const p = event.data.data() || {};
    const pid = event.params.pid;
    const extra = { studentId: p.studentId, buildId: pid, id: `build_${pid}_created` };
    const kind = isSelfLed(p) ? "a self-led project" : "a mission";
    const msg = `${p.studentName || "A builder"} started ${kind}: “${p.title || "New project"}”.`;
    if (p.coachId) await techNotify(p.coachId, "coach", "tech_build_started", isSelfLed(p) ? "New self-led project" : "Mission started", msg, extra);
    await notifyGuardians(p.studentId, "tech_build_started", isSelfLed(p) ? "New self-led project" : "Mission started",
      `${first(p.studentName, "Your child")} started ${kind}: “${p.title || "a new project"}”.`, extra);
  }
);

/* Levels are 1–7 from the number of mastered builds in each discipline:
   0 -> 1 (DISCOVER), 1 -> 2, ... 6+ -> 7 (STUDIO). Idempotent.
   Returns { levels, before } so callers can tell which levels went up. */
async function recomputeProgress(studentId, buildId) {
  const db = admin.firestore();
  const ref = db.collection("techProgress").doc(studentId);
  const prev = await ref.get();
  const before = (prev.exists && prev.data().levels) || {};
  const snap = await db.collection("techBuilds").where("studentId", "==", studentId).where("mastery", "==", "approved").get();
  const masteryCount = {};
  TECH_DISCIPLINES.forEach((d) => { masteryCount[d] = 0; });
  snap.docs.forEach((doc) => {
    const b = doc.data() || {};
    const discs = Array.isArray(b.disciplines) && b.disciplines.length ? b.disciplines : (b.discipline ? [b.discipline] : []);
    discs.forEach((d) => { if (TECH_DISCIPLINES.indexOf(d) !== -1) masteryCount[d] += 1; });
  });
  const levels = {};
  TECH_DISCIPLINES.forEach((d) => { levels[d] = Math.max(1, Math.min(TECH_LEVELS.length, (masteryCount[d] || 0) + 1)); });
  await ref.set({
    levels, masteryCount, updatedAt: FV().serverTimestamp(), updatedBy: "system:mastery-approved", lastBuildId: buildId
  }, { merge: true });
  return { levels, before };
}

exports.onTechBuildUpdated = onDocumentUpdated(
  { document: "techBuilds/{pid}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const b = event.data.before.data() || {}, a = event.data.after.data() || {};
    const pid = event.params.pid, sid = a.studentId, extra = { studentId: sid, buildId: pid };
    const who = a.studentName || "A builder", title = a.title || "a project";
    const act = { studentName: a.studentName || "", buildId: pid, missionId: a.missionId || "", origin: isSelfLed(a) ? "self" : "mission" };
    const n = Number(a.submissionCount) || 0;

    /* Builder asked for something — the coach (or the desk, if there's no coach yet) decides. */
    const asked = [];
    if (b.reviewState !== "requested" && a.reviewState === "requested") asked.push(n > 1 ? "a review of their revision" : "a review");
    if (b.showcase !== "requested" && a.showcase === "requested") asked.push("a public showcase");
    if (b.mastery !== "requested" && a.mastery === "requested") asked.push("mastery approval");
    if (asked.length) {
      const msg = `${who} asked for ${asked.join(" and ")} on the ${projectWord(a)} “${title}”.`;
      const key = { id: `build_${pid}_ask_${n}_${a.reviewState}_${a.showcase}_${a.mastery}` };
      if (a.coachId) {
        const fresh = await techNotify(a.coachId, "coach", "tech_review_request", n > 1 ? "Resubmission received" : "Submission received", msg, Object.assign({}, extra, key));
        if (fresh) {
          await email(await coachEmail(a.coachId), `${n > 1 ? "Resubmission" : "Submission"}: ${title}`, {
            preheader: msg, heading: n > 1 ? "A revision is ready to review." : "New work to review.",
            intro: esc(msg), body: `<p style="margin:0;">Open the coach portal to assess the work, grade it, and approve it or ask for a revision.</p>`,
            cta: { label: "Open the coach portal", url: APP + LINKS.coach }
          });
        }
      } else await notifyAdmins("tech_review_request", "Submission received (no coach)", msg, Object.assign({}, extra, key));
      if (b.reviewState !== "requested" && a.reviewState === "requested") {
        await notifyGuardians(sid, "tech_submitted", n > 1 ? "Revision submitted" : "Work submitted",
          `${first(who)} submitted the ${projectWord(a)} “${title}” for their coach to review.`, Object.assign({}, extra, key));
      }
    }

    /* Review outcomes go on the timeline here; people are told by onTechFeedbackCreated,
       which carries the coach's words and grade. */
    if (b.reviewState !== a.reviewState) {
      if (a.reviewState === "approved") await logActivity(sid, "approved", `Approved: ${title}`, act);
      if (a.reviewState === "changes") await logActivity(sid, "revision_requested", `Revision requested: ${title}`, act);
      if (a.reviewState === "reviewing") await logActivity(sid, "under_review", `Coach started reviewing: ${title}`, act);
    }

    if (b.showcase !== "approved" && a.showcase === "approved") {
      const url = `${APP}/tech/p/${pid}`;
      const pubKey = { id: `build_${pid}_published_${sha(String(a.publishedAt && a.publishedAt.seconds || "")).slice(0, 8)}` };
      await logActivity(sid, "published", `Published: ${title}`, act);
      const fresh = await techNotify(sid, "student", "tech_showcase", "Your project is published", `${title} is now public. Your link: ${url}`, Object.assign({}, extra, pubKey));
      await notifyGuardians(sid, "tech_showcase", "Project published", `${first(who)}'s project “${title}” was approved for the public TECH showcase.`, Object.assign({}, extra, pubKey), fresh ? {
        subject: `${first(who)}'s project is published`,
        opts: (g) => ({
          preheader: "A TECH project was approved for the public showcase.", heading: "Published on Paisley TECH.",
          intro: `Hi ${esc(first(g.name))}, ${esc(first(who))}'s project “${esc(title)}” is now on the public TECH showcase. Only their first name is shown.`,
          body: `<p style="margin:0;">You can share this link: ${esc(url)}</p>`,
          cta: { label: "View the project", url }
        })
      } : null);
      const st = fresh ? await techStudent(sid) : null;
      if (st && st.email) {
        await email(st.email, `Published — ${title}`, {
          preheader: "Your project is on the TECH showcase.", heading: "Your project is published.",
          intro: `Hi ${esc(first(st.name))}, your coach approved “${esc(title)}” for the public showcase.`,
          body: `<p style="margin:0;">Share it with this link: ${esc(url)}</p>`, cta: { label: "View your project", url }
        });
      }
    }
    if (b.showcase === "approved" && a.showcase !== "approved") await logActivity(sid, "unpublished", `Taken off the showcase: ${title}`, act);

    if (b.mastery !== "approved" && a.mastery === "approved" && sid) {
      let res = null;
      try { res = await recomputeProgress(sid, pid); } catch (e) { console.warn("recomputeProgress failed", e.message || e); }
      const levels = res && res.levels;
      const discs = Array.isArray(a.disciplines) && a.disciplines.length ? a.disciplines : TECH_DISCIPLINES;
      const top = levels ? discs.filter((d) => levels[d]).sort((x, y) => levels[y] - levels[x])[0] : "";
      const lvl = top ? TECH_LEVELS[levels[top] - 1] : "";
      const line = lvl ? `You're now ${lvl} in ${top}.` : "Keep building.";
      await logActivity(sid, "mastered", `Mastered: ${title}`, act);
      const fresh = await techNotify(sid, "student", "tech_mastery", "Mastery approved 🎉", `${title} was approved. ${line}`, Object.assign({ id: `build_${pid}_mastery_${sha(String(a.masteryAt && a.masteryAt.seconds || "")).slice(0, 8)}` }, extra));
      /* Next level unlocked — only for disciplines whose level actually went up. */
      const ups = levels ? TECH_DISCIPLINES.filter((d) => (levels[d] || 1) > ((res.before && res.before[d]) || 1)) : [];
      for (const d of ups) {
        const L = TECH_LEVELS[levels[d] - 1], lk = { id: `level_${sid}_${d}_${levels[d]}` };
        await logActivity(sid, "level_unlocked", `${L} unlocked in ${d}`, act);
        await techNotify(sid, "student", "tech_level", `${L} unlocked in ${d}`, `New ${d} missions at ${L} are open to you.`, Object.assign({}, extra, lk));
        await notifyGuardians(sid, "tech_level", `${L} unlocked in ${d}`, `${first(who)} reached ${L} in ${d}.`, Object.assign({}, extra, lk));
        if (a.coachId) await techNotify(a.coachId, "coach", "tech_level", `${first(who)} reached ${L} in ${d}`, `After mastering “${title}”.`, Object.assign({}, extra, lk));
      }
      if (!fresh) return;
      const st = await techStudent(sid);
      if (st && st.email) {
        await email(st.email, `Mastery approved — ${title}`, {
          preheader: "Your coach approved your build.", heading: "Mastery approved.",
          intro: `Hi ${esc(first(st.name))}, your coach approved “${esc(title)}”.`,
          body: `<p style="margin:0;">${esc(line)}${ups.length ? " Unlocked: " + esc(ups.map((d) => TECH_LEVELS[levels[d] - 1] + " in " + d).join(", ")) + "." : ""} Open your studio to see what is next.</p>`,
          cta: { label: "Open TECH Studio", url: APP + LINKS.student }
        });
      }
      await notifyGuardians(sid, "tech_mastery", "Mastery approved", `${first(who)} mastered “${title}”.${lvl ? ` Now ${lvl} in ${top}.` : ""}`, Object.assign({ id: `build_${pid}_mastery` }, extra), {
        subject: `${first(who)} mastered a TECH project`,
        opts: (g) => ({
          preheader: "A coach approved a TECH project.", heading: "Mastery approved.",
          intro: `Hi ${esc(first(g.name))}, ${esc(first(who))}'s coach approved “${esc(title)}”.`,
          body: `<p style="margin:0;">${lvl ? `They're now <strong>${esc(lvl)}</strong> in ${esc(top)}. ` : ""}Open the guardian portal to see the project and their progress.</p>`,
          cta: { label: "Open the TECH guardian portal", url: APP + LINKS.guardian }
        })
      });
    }
  }
);

/* Feedback on a build. A coach review (kind "changes" / "approved", optionally with a grade)
   tells the builder and their guardians, by bell and email. */
exports.onTechFeedbackCreated = onDocumentCreated(
  { document: "techBuilds/{pid}/feedback/{fid}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const f = event.data.data() || {};
    const pid = event.params.pid, fid = event.params.fid;
    const p = (await admin.firestore().collection("techBuilds").doc(pid).get()).data();
    if (!p) return;
    const extra = { studentId: p.studentId, buildId: pid, id: `fb_${fid}` };
    const preview = String(f.text || "").slice(0, 160);
    if (f.role === "student") {
      if (p.coachId) await techNotify(p.coachId, "coach", "tech_feedback", `${p.studentName || "A builder"} replied`, `${p.title}: ${preview}`, extra);
      return;
    }
    const grade = f.gradeLabel ? ` Grade: ${f.gradeLabel}${f.gradeScore != null && f.gradeScore !== "" ? ` (${f.gradeScore}%)` : ""}.` : "";
    const title = f.kind === "approved" ? "Project approved" : f.kind === "changes" ? "Revision requested" : (grade ? "Grade released" : "New feedback");
    const fresh = await techNotify(p.studentId, "student", "tech_feedback", title, `${p.title}:${grade} ${preview}`, extra);
    if (!fresh || !(f.kind === "approved" || f.kind === "changes" || grade)) return;
    await notifyGuardians(p.studentId, "tech_feedback", title, `${first(p.studentName, "Your child")}'s coach on “${p.title}”:${grade} ${preview}`, extra, {
      subject: `${title}: ${p.title}`,
      opts: (g) => ({
        preheader: preview, heading: title + ".",
        intro: `Hi ${esc(first(g.name))}, ${esc(first(p.studentName, "your child"))}'s coach reviewed “${esc(p.title)}”.`,
        body: `${grade ? `<p style="margin:0 0 8px;"><strong>${esc(grade.trim())}</strong></p>` : ""}<p style="margin:0;white-space:pre-wrap;">${esc(preview)}</p>`,
        cta: { label: "Open the TECH guardian portal", url: APP + LINKS.guardian }
      })
    });
    const st = await techStudent(p.studentId);
    if (st && st.email) {
      await email(st.email, `${title}: ${p.title}`, {
        preheader: preview, heading: title + ".",
        intro: `Hi ${esc(first(st.name))}, your coach reviewed “${esc(p.title)}”.`,
        body: `${grade ? `<p style="margin:0 0 8px;"><strong>${esc(grade.trim())}</strong></p>` : ""}<p style="margin:0;white-space:pre-wrap;">${esc(preview)}</p>` +
          (f.kind === "changes" ? `<p style="margin:12px 0 0;">Open the same project, make the changes, then resubmit.</p>` : ""),
        cta: { label: f.kind === "changes" ? "Revise my project" : "Open TECH Studio", url: APP + LINKS.student + "#projects" }
      });
    }
  }
);

/* =========================================================
   Missions released — techContent kind mission / challenge
   moving to "published". audience "selected" = studentIds only;
   otherwise every active builder. One bell (and email) per builder
   per mission, however often it is re-saved or re-published.
========================================================= */
async function missionAudience(c) {
  if (c.audience === "selected" && Array.isArray(c.studentIds)) {
    const out = [];
    for (const id of c.studentIds.slice(0, 500)) { const s = await techStudent(id); if (s && s.status === "Active") out.push(s); }
    return out;
  }
  const snap = await admin.firestore().collection("techStudents").where("status", "==", "Active").get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}
exports.onTechContentWritten = onDocumentWritten(
  { document: "techContent/{cid}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const b = event.data.before.exists ? event.data.before.data() : null;
    const a = event.data.after.exists ? event.data.after.data() : null;
    if (!a || ["mission", "challenge"].indexOf(a.kind) === -1) return;
    if (a.status !== "published" || (b && b.status === "published")) return;
    const cid = event.params.cid, kind = a.kind === "challenge" ? "challenge" : "mission";
    const lvl = a.level ? TECH_LEVELS[Math.max(1, Math.min(7, a.level)) - 1] : "";
    const msg = `${a.title || "A new " + kind}${lvl ? ` (${lvl})` : ""}${a.deadline ? ` · due ${a.deadline}` : ""}. ${String(a.summary || "").slice(0, 160)}`;
    for (const s of await missionAudience(a)) {
      const fresh = await techNotify(s.id, "student", "tech_mission", `New ${kind} released`, msg, { studentId: s.id, missionId: cid, id: `mission_${cid}`, link: LINKS.student + "#missions" });
      if (!fresh) continue;
      if (s.email) {
        await email(s.email, `New TECH ${kind}: ${a.title || ""}`, {
          preheader: msg, heading: `A new ${kind} is ready.`,
          intro: `Hi ${esc(first(s.name))}, ${esc(a.createdByName || "your coach")} released “${esc(a.title || "")}”.`,
          body: `<p style="margin:0;">${esc(String(a.summary || "Open your studio to read the brief, study the materials and practise before you build."))}</p>`,
          cta: { label: "Open the mission", url: APP + LINKS.student + "#missions" }
        });
      }
      for (const g of await guardiansOf(s.id)) {
        await techNotify(g.parentUid, "guardian", "tech_mission", `New ${kind} for ${first(s.name)}`, msg, { studentId: s.id, missionId: cid, id: `mission_${cid}_${s.id}` });
      }
    }
  }
);

/* =========================================================
   Live classes (Google Meet) — techLiveClasses/{id}
   { topic, description, learn, coachId, coachName, startAt, durationMins,
     meetUrl, status: scheduled | cancelled | completed,
     audience: all | selected, studentIds[], parentUids[] (filled here), notifyKey }
   Builders, their guardians, the coach and admins are told when a class is
   scheduled, when its time / link / topic / audience changes, and when it is
   cancelled. notifyKey (a hash of what people were told) stops repeats.
========================================================= */
function whenText(ts) {
  const d = ts && typeof ts.toDate === "function" ? ts.toDate() : (ts ? new Date(ts) : null);
  if (!d || isNaN(d)) return "";
  return d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }) + " (EAT)";
}
exports.onTechLiveClassWritten = onDocumentWritten(
  { document: "techLiveClasses/{id}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const db = admin.firestore();
    const id = event.params.id;
    const b = event.data.before.exists ? event.data.before.data() : null;
    const a = event.data.after.exists ? event.data.after.data() : null;
    const c = a || b;
    const start = c.startAt && c.startAt.toDate ? c.startAt.toDate().getTime() : 0;
    const key = sha([c.topic, start, c.durationMins, c.meetUrl, c.status, c.audience, (c.studentIds || []).slice().sort().join(",")].join("|")).slice(0, 16);
    let action;
    if (!a) {
      /* Deleting a class that was still to come counts as cancelling it. */
      if (b.status === "cancelled" || !start || start < Date.now()) return;
      action = "cancelled";
    } else {
      if (a.notifyKey === key) return;
      action = a.status === "cancelled" ? "cancelled" : (!b || !b.notifyKey ? "scheduled" : "updated");
      if (a.status === "completed") action = "";
    }

    let students;
    if (c.audience === "all") {
      const snap = await db.collection("techStudents").where("status", "==", "Active").get();
      students = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    } else {
      students = [];
      for (const sid of (c.studentIds || []).slice(0, 300)) { const s = await techStudent(sid); if (s) students.push(s); }
    }
    const guardians = [];
    for (const s of students) for (const g of await guardiansOf(s.id)) guardians.push(Object.assign({ studentId: s.id, studentName: s.name }, g));
    const parentUids = Array.from(new Set(guardians.map((g) => g.parentUid))).slice(0, 2000);
    if (a) await event.data.after.ref.set({ parentUids, notifyKey: key, notifiedAt: FV().serverTimestamp() }, { merge: true });
    if (!action) return;

    const when = whenText(c.startAt);
    const verb = { scheduled: "Live class scheduled", updated: "Live class updated", cancelled: "Live class cancelled" }[action];
    const line = `${c.topic || "TECH live class"} · ${when}${c.coachName ? ` · with ${c.coachName}` : ""}`;
    const nid = `live_${id}_${key}`;
    const mail = (name, portal) => ({
      preheader: line, heading: verb + ".",
      intro: `Hi ${esc(first(name))}, ${action === "cancelled" ? "this class has been cancelled" : action === "updated" ? "a live class has changed" : "a live class is on the timetable"}:`,
      body: `<p style="margin:0 0 6px;"><strong>${esc(c.topic || "TECH live class")}</strong></p>` +
        `<p style="margin:0 0 6px;">${esc(when)}${c.durationMins ? ` · ${esc(c.durationMins)} min` : ""}${c.coachName ? ` · ${esc(c.coachName)}` : ""}</p>` +
        (c.learn ? `<p style="margin:0 0 6px;">What you will learn: ${esc(c.learn)}</p>` : "") +
        (action !== "cancelled" && c.meetUrl ? `<p style="margin:0;">Google Meet: ${esc(c.meetUrl)}</p>` : ""),
      cta: { label: action === "cancelled" ? "Open Paisley TECH" : "Open the class", url: APP + portal }
    });
    for (const s of students) {
      if (s.status !== "Active") continue;
      const fresh = await techNotify(s.id, "student", "tech_live", verb, line, { studentId: s.id, classId: id, id: nid, link: LINKS.student + "#live" });
      if (fresh && s.email) await email(s.email, `${verb}: ${c.topic || "TECH live class"}`, mail(s.name, LINKS.student + "#live"));
    }
    for (const g of guardians) {
      const fresh = await techNotify(g.parentUid, "guardian", "tech_live", `${verb} for ${first(g.studentName)}`, line, { studentId: g.studentId, classId: id, id: `${nid}_${g.studentId}`, link: LINKS.guardian + "#live" });
      if (fresh && g.email) await email(g.email, `${verb} for ${first(g.studentName)}: ${c.topic || "TECH live class"}`, mail(g.name, LINKS.guardian + "#live"));
    }
    if (c.coachId) {
      const fresh = await techNotify(c.coachId, "coach", "tech_live", verb, line, { classId: id, id: nid, link: LINKS.coach + "#live" });
      if (fresh) await email(await coachEmail(c.coachId), `${verb}: ${c.topic || "TECH live class"}`, mail(c.coachName, LINKS.coach + "#live"));
    }
    for (const ad of await adminList()) await techNotify(ad.id, "admin", "tech_live", verb, line, { classId: id, id: nid });
  }
);

/* Parent ↔ Studio Desk uses parentConversations (shared with the Parent Portal). A TECH
   guardian's message raises the TECH bell for admins; onParentConversationMessage
   already emails the desk's replies to the parent. */
exports.onTechFamilyDeskMessage = onDocumentCreated(
  { document: "parentConversations/{cid}/messages/{mid}", region: LOCATION },
  async (event) => {
    const m = event.data.data() || {};
    if (m.senderRole !== "parent") return;
    const cid = event.params.cid;
    const link = await admin.firestore().collection("techGuardianLinks").doc(cid).get();
    if (!link.exists) return;
    const l = link.data() || {};
    await notifyAdmins("tech_desk_message", `${m.senderName || "A TECH guardian"} wrote to the Studio Desk`,
      `About ${first(l.studentName, "their child")}: ${String(m.text || "").slice(0, 160)}`, { studentId: l.studentUid || "", id: `desk_${event.params.mid}`, link: "/admin#tech" });
  }
);

/* =========================================================
   Chats
========================================================= */
exports.onTechMessageCreated = onDocumentCreated(
  { document: "techChats/{chatId}/messages/{mid}", region: LOCATION },
  async (event) => {
    const m = event.data.data() || {};
    const c = (await admin.firestore().collection("techChats").doc(event.params.chatId).get()).data() || {};
    const coachId = c.coachId || c.tutorId, coachName = c.coachName || c.tutorName;
    const extra = { studentId: c.studentId, chatId: event.params.chatId };
    const preview = String(m.text || "").slice(0, 140);
    if (m.senderRole === "student") { await techNotify(coachId, "coach", "tech_message", `Message from ${c.studentName || "a builder"}`, preview, extra); return; }
    await techNotify(c.studentId, "student", "tech_message", `Message from ${m.senderRole === "admin" ? "Paisley" : coachName || "your coach"}`, preview, extra);
    if (m.senderRole === "admin") await techNotify(coachId, "coach", "tech_message", "Studio Desk joined a builder chat", preview, extra);
  }
);

exports.onTechGuardianMessageCreated = onDocumentCreated(
  { document: "techGuardianChats/{chatId}/messages/{mid}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const m = event.data.data() || {};
    const db = admin.firestore();
    const c = (await db.collection("techGuardianChats").doc(event.params.chatId).get()).data() || {};
    const st = await techStudent(c.studentId);
    const coachId = (st && st.coachId) || c.coachId;
    const extra = { studentId: c.studentId, chatId: event.params.chatId };
    const preview = String(m.text || "").slice(0, 200);
    const child = first(c.studentName, "their child");

    if (m.senderRole === "guardian") {
      if (coachId) {
        await techNotify(coachId, "coach", "tech_guardian_message", `${c.parentName || "A guardian"} (${child}'s family)`, preview, extra);
        await email(await coachEmail(coachId), `Message from ${c.parentName || "a guardian"} about ${child}`, {
          preheader: preview, heading: "Message from a guardian", intro: `${esc(c.parentName || "A guardian")} wrote about ${esc(child)}:`,
          body: `<p style="margin:0;white-space:pre-wrap;">${esc(preview)}</p>`,
          cta: { label: "Reply in the coach dashboard", url: APP + LINKS.coach }
        });
      } else {
        await notifyAdmins("tech_guardian_message", `Guardian message (no coach yet)`, `${c.parentName || "A guardian"} about ${child}: ${preview}`, extra);
      }
      return;
    }
    const from = m.senderRole === "admin" ? "Paisley TECH" : (m.senderName || "Your child's coach");
    await techNotify(c.parentUid, "guardian", "tech_guardian_message", `Message from ${from}`, preview, extra);
    const p = await db.collection("parentAccounts").doc(c.parentUid).get();
    if (p.exists) {
      await email(p.data().email, `${from} replied about ${child}`, {
        preheader: preview, heading: "New message", intro: `${esc(from)} wrote about ${esc(child)}:`,
        body: `<p style="margin:0;white-space:pre-wrap;">${esc(preview)}</p>`,
        cta: { label: "Open the TECH guardian portal", url: APP + LINKS.guardian }
      });
    }
  }
);

/* =========================================================
   Admin callables
========================================================= */
/* Personal coach link /tech/coach/{slug}: techCoachSlugs/{slug} = { slug, name, email, status, coachId }.
   Same slug rules as tutors (lms-helpers tutorSlugify); a taken slug gets -2, -3, … */
function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}
async function claimCoachSlug(db, coachId, wanted, coach) {
  const base = slugify(wanted) || "coach";
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : base + "-" + n;
    const ref = db.collection("techCoachSlugs").doc(slug);
    const snap = await ref.get();
    if (snap.exists && snap.data().coachId && snap.data().coachId !== coachId) continue;
    await ref.set({ slug, coachId, name: coach.name || "", email: coach.email || "", status: coach.status || "Active", updatedAt: FV().serverTimestamp() }, { merge: true });
    return slug;
  }
  return "";
}

async function requireAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  if (!(await admin.firestore().collection("admins").doc(request.auth.uid).get()).exists) throw new HttpsError("permission-denied", "Admins only.");
}

exports.createTechCoach = onCall(
  { cors: true, region: LOCATION, secrets: SMTP_SECRETS },
  async (request) => {
    await requireAdmin(request);
    const d = request.data || {};
    const name = String(d.name || "").trim().slice(0, 120), mail = String(d.email || "").trim();
    if (name.length < 2) throw new HttpsError("invalid-argument", "Coach name is required.");
    if (!/^\S+@\S+\.\S+$/.test(mail)) throw new HttpsError("invalid-argument", "A valid email is required.");
    const db = admin.firestore();
    let uid, created = false;
    try { uid = (await admin.auth().getUserByEmail(mail)).uid; } catch (e) {
      if (e && e.code && e.code !== "auth/user-not-found") throw e;
      uid = (await admin.auth().createUser({ email: mail, password: crypto.randomBytes(18).toString("base64url"), displayName: name })).uid;
      created = true;
    }
    if ((await db.collection("techStudents").doc(uid).get()).exists) throw new HttpsError("failed-precondition", "That email belongs to a TECH builder. Coaches need their own login.");
    const ref = db.collection("techCoaches").doc(uid);
    const prev = await ref.get(), existed = prev.exists;
    const slug = (existed && prev.data().slug) || await claimCoachSlug(db, uid, d.slug || name, { name, email: mail, status: "Active" });
    await ref.set({
      slug,
      name, email: mail, phone: String(d.phone || "").trim().slice(0, 40),
      disciplines: (Array.isArray(d.disciplines) ? d.disciplines : []).filter((x) => TECH_DISCIPLINES.indexOf(x) !== -1),
      bio: String(d.bio || "").slice(0, 600), status: "Active", updatedAt: FV().serverTimestamp(),
      ...(existed ? {} : { createdAt: FV().serverTimestamp(), createdBy: request.auth.uid })
    }, { merge: true });

    let emailSent = false;
    if (created) {
      let link = null;
      try { link = await admin.auth().generatePasswordResetLink(mail, notifications.actionSettings("techCoach")); } catch (e) { console.warn("coach reset link failed:", e.message); }
      if (link) emailSent = await email(mail, "Your Paisley TECH coach account", {
        preheader: "Set your password to start coaching.", heading: "Welcome, coach.", intro: `Hi ${esc(first(name))}, you're now a Paisley TECH coach.`,
        body: `<p style="margin:0;">Choose a password, then sign in to review builds, message your builders and their families, and publish missions.</p>`,
        cta: { label: "Set my password", url: link }
      });
    } else if (!existed) {
      emailSent = await email(mail, "You're now a Paisley TECH coach", {
        preheader: "Use your existing Paisley login.", heading: "Welcome, coach.", intro: `Hi ${esc(first(name))}, you're now a Paisley TECH coach.`,
        body: `<p style="margin:0;">Sign in to the TECH coach portal with your existing Paisley email and password.</p>`,
        cta: { label: "Open your coach link", url: APP + "/tech/coach/" + slug }
      });
    }
    return { uid, created, emailSent, slug };
  }
);

exports.techLinkGuardians = onCall(
  { cors: true, region: LOCATION, secrets: SMTP_SECRETS, timeoutSeconds: 120 },
  async (request) => {
    await requireAdmin(request);
    const d = request.data || {};
    const db = admin.firestore();
    const ref = db.collection("techStudents").doc(String(d.studentId || ""));
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "TECH builder not found.");
    const s = snap.data() || {};
    const g = d.guardian || null;
    if (g && g.email) {
      if (!/^\S+@\S+\.\S+$/.test(String(g.email))) throw new HttpsError("invalid-argument", "That guardian email is not valid.");
      const list = Array.isArray(s.guardians) ? s.guardians.slice() : [];
      if (!list.some((x) => String(x.email || "").toLowerCase() === String(g.email).toLowerCase())) {
        if (list.length >= 4) throw new HttpsError("failed-precondition", "A builder can have at most four guardians.");
        list.push({ name: String(g.name || "").slice(0, 80), email: String(g.email).trim(), phone: String(g.phone || "").slice(0, 40), relationship: String(g.relationship || "").slice(0, 40) });
        await ref.update({ guardians: list, updatedAt: FV().serverTimestamp() });
        s.guardians = list;
      }
    }
    const results = await linkTechGuardians(db, snap.id, s);
    await ref.set({ guardianLinkResults: results.map((r) => ({ email: r.email || "", created: !!r.created, skipped: r.skipped || "" })) }, { merge: true });
    return { results };
  }
);

/* One-off, idempotent move of legacy TECH data:
     students (studentType "tech") -> techStudents (status, coach, guardians kept)
     tutors used as coaches        -> techCoaches (same login)
     techBuilds / techChats tutorId -> coachId
     optionally links guardians of Active builders (emails them).
   data: { dryRun (default true), linkGuardians (default true) } */
exports.migrateTechArchitecture = onCall(
  { cors: true, region: LOCATION, secrets: SMTP_SECRETS, timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    await requireAdmin(request);
    const d = request.data || {};
    const dryRun = d.dryRun !== false, withGuardians = d.linkGuardians !== false;
    const db = admin.firestore();
    const out = { dryRun, students: 0, alreadyMoved: 0, coaches: 0, builds: 0, chats: 0, guardiansLinked: 0, errors: [] };
    const coachIds = new Set();

    const legacy = await db.collection("students").where("studentType", "==", "tech").get();
    for (const doc of legacy.docs) {
      const s = doc.data() || {};
      const ref = db.collection("techStudents").doc(doc.id);
      if ((await ref.get()).exists) { out.alreadyMoved++; if (s.techCoachId) coachIds.add(s.techCoachId); continue; }
      out.students++;
      if (s.techCoachId) coachIds.add(s.techCoachId);
      if (dryRun) continue;
      const rec = {
        name: s.name || "", email: s.email || "", phone: s.phone || "", ageGroup: s.ageGroup || "",
        status: s.status || "Pending", techProfile: s.techProfile || {}, guardians: notifications.guardiansOf(s),
        coachId: s.techCoachId || "", coachName: s.techCoachName || "",
        migratedFrom: "students", migratedAt: FV().serverTimestamp(),
        createdAt: s.createdAt || FV().serverTimestamp(), updatedAt: FV().serverTimestamp()
      };
      ["approvedAt", "admittedBy", "lastLoginAt"].forEach((k) => { if (s[k]) rec[k] = s[k]; });
      if (rec.status === "Active") rec.welcomedAt = s.approvedAt || FV().serverTimestamp();
      await ref.set(rec);
      await doc.ref.set({ techMigratedAt: FV().serverTimestamp() }, { merge: true });
      if (withGuardians && rec.status === "Active") {
        try { out.guardiansLinked += (await linkTechGuardians(db, doc.id, rec)).filter((r) => r.parentUid).length; }
        catch (e) { out.errors.push(doc.id + ": " + (e.message || e)); }
      }
    }

    const builds = await db.collection("techBuilds").get();
    for (const b of builds.docs) {
      const x = b.data() || {};
      if (x.tutorId) coachIds.add(x.tutorId);
      if (x.coachId !== undefined || !x.tutorId) continue;
      out.builds++;
      if (!dryRun) await b.ref.update({ coachId: x.tutorId, coachName: x.tutorName || "" });
    }
    const chats = await db.collection("techChats").get();
    for (const c of chats.docs) {
      const x = c.data() || {};
      if (x.coachId !== undefined || !x.tutorId) continue;
      out.chats++;
      if (!dryRun) await c.ref.update({ coachId: x.tutorId, coachName: x.tutorName || "" });
    }

    for (const id of coachIds) {
      const ref = db.collection("techCoaches").doc(id);
      if ((await ref.get()).exists) continue;
      const t = await db.collection("tutorAccounts").doc(id).get();
      if (!t.exists) continue;
      out.coaches++;
      if (dryRun) continue;
      const td = t.data() || {};
      const slug = await claimCoachSlug(db, id, td.slug || td.name, { name: td.name, email: td.email, status: "Active" });
      await ref.set({ name: td.name || "", email: td.email || "", phone: td.phone || "", disciplines: [], bio: "", slug, status: "Active", migratedFromTutor: true, createdAt: FV().serverTimestamp() });
    }
    return out;
  }
);

/* =========================================================
   techShare — GET /tech/b/:id
   -----------------------------------------------------------
   Public share page with OG tags for an APPROVED build.
   Also accepts ?t=<family-share-token> for non-public builds.
     - build.showcase === 'approved' (and on techShowcase) → serve.
     - valid, non-revoked shareTokens/{buildId} matching ?t → serve.
     - otherwise → 404 without leaking title/description.
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
          if (td.revoked !== true && td.token === token) allowed = true;
        }
      } catch (e) { /* fall through */ }
    }
  }

  /* Published projects have their own page, /tech/p/{id} (tech/project.html). */
  const dest = isPublic ? `${APP}/tech/p/${encodeURIComponent(id)}` : `${APP}/tech${allowed ? "?build=" + encodeURIComponent(id) : ""}`;
  const titleBase = build ? `${build.title || "Untitled build"} — built with Paisley TECH` : "Paisley TECH | Digital Creator Studio";
  const descBase = build
    ? `Built by ${build.displayName || "a Paisley student"}. ${String(build.brief || "").slice(0, 160)}`
    : "Learn what you can do with AI.";
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

exports._internals = { LINKS, TECH_LEVELS, TECH_DISCIPLINES };
