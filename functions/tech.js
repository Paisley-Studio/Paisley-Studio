/* =========================================================
   Paisley Tech Studio — Cloud Functions
   -----------------------------------------------------------
   Tech Studio is its own architecture, separate from the tutoring LMS:

     techStudents/{uid}       Tech Studio enrolment (any signed-in account can
                              apply, including IGCSE / CBC / remote students)
     techCoaches/{uid}        Tech Studio coaches (not tutors)
     techGuardianLinks/{parentUid}_{studentUid}
                              guardian -> builder; the guardian's login is
                              their parentAccounts/{uid} identity, so a parent
                              who already uses the Parent Portal keeps one login
     techGuardianChats/{parentUid}_{studentUid} (+ /messages)
                              guardian <-> the builder's current coach
     techNotifications/{id}   Tech Studio-only bell feed for students, coaches,
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
     onTechFamilyDeskMessage  Tech Studio guardian -> Studio Desk (parentConversations)
                              raises the admin Tech Studio bell.
     onTechLessonWritten      class lesson / practice test posted -> every active
                              builder on its level + their guardians.
     onTechMessageCreated     builder <-> coach chat.
     onTechGuardianMessageCreated  guardian <-> coach chat.
   Callable (builders)
     submitTechQuiz           marks a quiz or practice test against the private
                              key and records the attempt.
   Callables (admin only)
     createTechCoach          create / promote a Tech Studio coach login.
     techLinkGuardians        (re)link a builder's guardians, optionally adding one.
     migrateTechArchitecture  one-off move of legacy Tech Studio data (students
                              studentType "tech", tutor coaches, tutorId fields).
   HTTP
     techShare                GET /tech/b/:id share page (unchanged).
========================================================= */
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { render, PORTALS, templates } = require("./email-templates");
const notifications = require("./notifications");
const { SMTP_SECRETS } = require("./work-shared");

const LOCATION = "us-central1";
const FV = () => admin.firestore.FieldValue;
const APP = new URL(PORTALS.admin).origin;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const first = (n, fb) => String(n || "").trim().split(/\s+/)[0] || fb || "there";

/* Paisley Tech Studio creator-level ladder — must stay in sync with TechUI.LEVELS */
const TECH_LEVELS = ["DISCOVER", "MAKE", "BUILD", "SOLVE", "CREATE", "INVENT", "STUDIO"];
/* Skill levels chosen at sign-up — must stay in sync with TechUI.SKILL_LEVELS / trackOf / tracksFor.
   Every level has its own classes; "advanced" is the old shared intermediate + expert track, still
   shown to both. No level yet counts as intermediate. */
const SKILL_LABEL = { beginner: "Beginner", intermediate: "Intermediate", expert: "Expert" };
const trackOf = (skill) => (SKILL_LABEL[skill] ? skill : "intermediate");
const tracksFor = (skill) => (trackOf(skill) === "beginner" ? ["beginner"] : [trackOf(skill), "advanced"]);
/* Paisley Tech Studio disciplines — must stay in sync with TechUI.DISCIPLINES */
/* AI runs through every discipline, so it is not one of its own. People see "Coding with AI".
   Old records tagged "AI" count towards Coding with AI. */
const TECH_DISCIPLINES = ["Coding", "Writing", "Research", "Design", "Media", "Music", "Entrepreneurship"];
const normDiscipline = (d) => (d === "AI" ? "Coding" : d);
const normDisciplines = (list) => Array.from(new Set((list || []).map(normDiscipline))).filter((d) => TECH_DISCIPLINES.indexOf(d) !== -1);
const disciplineLabel = (d) => `${normDiscipline(d)} with AI`;

/* Where each Tech Studio role lands when it opens a notification. */
const LINKS = {
  student: "/tech/dashboard",
  coach: "/tech/coach/dashboard",
  guardian: "/tech/parent/dashboard",
  admin: "/admin#tech"
};

/* ---------------------------------------------------------
   Tech Studio notifications — techNotifications only.
--------------------------------------------------------- */
/* extra.id makes the notification idempotent: the same event retried (or re-saved)
   writes the same doc once, so nobody gets a duplicate. Returns false when it already existed. */
async function techNotify(recipientId, recipientRole, type, title, message, extra) {
  if (!recipientId) return false;
  const x = extra || {};
  const doc = {
    recipientId, recipientRole, type, title: String(title || "").slice(0, 140), message: String(message || "").slice(0, 400),
    studentId: x.studentId || "", buildId: x.buildId || "", chatId: x.chatId || "",
    missionId: x.missionId || "", classId: x.classId || "", section: x.section || "",
    lessonId: x.lessonId || "", courseId: x.courseId || "",
    image: /^https:\/\//.test(x.image || "") ? String(x.image).slice(0, 1500) : "",
    link: x.link || LINKS[recipientRole] || "/tech",
    read: false, createdAt: FV().serverTimestamp()
  };
  const col = admin.firestore().collection("techNotifications");
  try {
    if (x.id) await col.doc(String(x.id).replace(/[^\w-]/g, "_").slice(0, 300) + "_" + recipientId).create(doc);
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
const isSelfLed = (b) => !(b && (b.missionId || b.challengeId || b.lessonId));
const projectWord = (b) => (isSelfLed(b) ? "self-led project" : (b && b.lessonId ? "class project" : "mission"));
async function email(to, subject, opts) {
  if (!to) return false;
  try { return !!(await notifications.sendEmail(to, subject, render(Object.assign({ programme: "tech" }, opts))) || {}).sent; } catch (e) { console.warn("tech email failed:", e.message); return false; }
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
     1. the Tech Studio application (techStudents.guardians)
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
      emailSent = await email(to, "Your Paisley Tech Studio guardian account", {
        preheader: "Follow your child's Tech Studio projects.", heading: "Your guardian account is ready.",
        intro: `Hi ${esc(first(name))}, ${child} has joined Paisley Tech Studio.`,
        body: `<p style="margin:0 0 8px;">You can follow their projects, see their progress and message their coach.</p>` +
          `<p style="margin:0 0 4px;"><strong>Sign in:</strong> ${esc(to)} (or your phone number)</p>` +
          `<p style="margin:0 0 8px;"><strong>Password:</strong> ${esc(phonePassword)}</p>` +
          `<p style="margin:0;">Please change your password after you sign in.</p>`,
        cta: { label: "Open the Tech Studio guardian portal", url: PORTALS.techParent }
      });
    } else if (created) {
      let link = null;
      try { link = await admin.auth().generatePasswordResetLink(to, notifications.actionSettings("techParent")); } catch (e) { console.warn("tech guardian reset link failed:", e.message); }
      if (link) {
        emailSent = await email(to, "Set up your Paisley Tech Studio guardian account", {
          preheader: "Follow your child's Tech Studio projects.", heading: "Your guardian account is ready.",
          intro: `Hi ${esc(first(name))}, ${child} has joined Paisley Tech Studio.`,
          body: `<p style="margin:0;">Choose a password to follow their projects, see their progress and message their coach.</p>`,
          cta: { label: "Set my password", url: link }
        });
      }
    } else if (newLink && s.admittedBy) {
      /* A Paisley parent whose child the Studio Desk admitted: same login, a new button. */
      emailSent = await email(to, `${s.name || "Your child"} is now in Paisley Tech Studio`, {
        preheader: "There is a new Paisley Tech Studio button in your Parent Portal.", heading: "Good news from Paisley Tech Studio.",
        intro: `Hi ${esc(first(name))}, ${child} has been admitted to Paisley Tech Studio.`,
        body: `<p style="margin:0 0 8px;">You don't need a new login. Sign in to your Parent Portal as usual: there is now a <strong>Paisley Tech Studio</strong> button where you can watch their progress, classes, homework and projects, and message their coach.</p>` +
          `<p style="margin:0;">Nothing changes for your child either: they sign in to Tech Studio with the email and password they already use.</p>`,
        cta: { label: "Open my Parent Portal", url: PORTALS.parent }
      });
    } else if (newLink) {
      emailSent = await email(to, `${s.name || "Your child"} joined Paisley Tech Studio`, {
        preheader: "Tech Studio is now on your guardian account.", heading: "Tech Studio is on your account.",
        intro: `Hi ${esc(first(name))}, ${child} has joined Paisley Tech Studio.`,
        body: `<p style="margin:0;">Sign in with your existing Paisley parent login to follow their projects, see their progress and message their coach.</p>`,
        cta: { label: "Open the Tech Studio guardian portal", url: PORTALS.techParent }
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
    /* Admitted by the Studio Desk (admitToTechStudio): no application to approve; the welcome comes on activation. */
    if (s.admittedBy) return;

    const also = programmes.length ? ` Already with Paisley: ${programmes.join(", ")}.` : "";
    const level = SKILL_LABEL[s.skillLevel] || "";
    const beginner = s.skillLevel === "beginner";
    const msg = `${s.name || "A new builder"} applied to Tech Studio${level ? ` (${level})` : ""} and is waiting for approval.${also}`;
    await notifyAdmins("tech_application", beginner ? "New beginner in Tech Studio" : "New Tech Studio application", msg, { studentId: sid }, {
      subject: `${beginner ? "New beginner" : "New Tech Studio application"} — ${s.name || "builder"}`,
      opts: {
        preheader: msg, heading: "Admin alert", intro: beginner ? "A beginner has signed up. They need Beginner classes posted for them." : "New Tech Studio application",
        body: `<p style="margin:0 0 8px;"><strong>${esc(s.name)}</strong> (${esc(s.email)}) applied to Paisley Tech Studio.</p><p style="margin:0;">${esc((s.techProfile && s.techProfile.identity) || "")}${/^u/.test(s.ageGroup || "") ? " · under 18" : ""}${level ? ` · ${esc(level)}` : ""}${esc(also)}</p>`,
        cta: { label: "Open Tech Studio applications", url: PORTALS.admin + "#tech" }
      }
    });
    await techNotify(sid, "student", "tech_application", "Application received", "The Studio Desk will approve your Tech Studio account soon.", { studentId: sid });
    for (const g of (Array.isArray(s.guardians) ? s.guardians : [])) {
      if (!/^\S+@\S+\.\S+$/.test(String(g.email || ""))) continue;
      await email(g.email, `${s.name || "Your child"} applied to Paisley Tech Studio`, {
        preheader: "You'll get guardian access once they're approved.", heading: "Tech Studio application received",
        intro: `Hi ${esc(first(g.name))}, ${esc(s.name || "your child")} applied to Paisley Tech Studio and listed you as their parent or guardian.`,
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

    /* A builder from before levels existed has just chosen Beginner. */
    if (!b.skillLevel && a.skillLevel === "beginner") {
      const msg = `${a.name || "A builder"} chose the Beginner level.`;
      await notifyAdmins("tech_beginner", "New beginner in Tech Studio", msg, { studentId: sid }, {
        subject: `New beginner — ${a.name || "builder"}`,
        opts: { preheader: msg, heading: "Admin alert", intro: msg, body: `<p style="margin:0;">They will see Beginner classes from now on.</p>`, cta: { label: "Open Tech Studio", url: PORTALS.admin + "#tech" } }
      });
    }

    if (b.status !== "Active" && a.status === "Active") {
      if (!a.welcomedAt) {
        await techNotify(sid, "student", "tech_welcome", a.admittedBy ? "Congratulations, you're in Tech Studio" : "Welcome to Tech Studio",
          a.admittedBy ? "The Studio Desk admitted you. Sign in with your usual Paisley login." : "Your account is approved. Let's build something.", { studentId: sid });
        if (a.email && a.admittedBy) {
          /* A Paisley student admitted by the Studio Desk keeps their login. */
          await email(a.email, `Congratulations ${first(a.name)}! You're in Paisley Tech Studio`, {
            preheader: "You've been admitted to Paisley Tech Studio. Sign in with the login you already use.",
            heading: `Congratulations, ${first(a.name)}!`,
            intro: "The Studio Desk has admitted you to Paisley Tech Studio.",
            body: `<p style="margin:0 0 12px;">You don't need a new account. Sign in to Tech Studio with the <strong>same email and password you use for Paisley Studio</strong>${a.coachName ? `. <strong>${esc(a.coachName)}</strong> is your coach` : ""}.</p>` +
              `<p style="margin:0 0 6px;"><strong>Sign-in page:</strong> ${esc(PORTALS.tech)}</p>` +
              `<p style="margin:0 0 6px;"><strong>Email:</strong> ${esc(a.email)}</p>` +
              `<p style="margin:0 0 12px;"><strong>Level:</strong> ${esc(SKILL_LABEL[a.skillLevel] || "Beginner")}</p>` +
              `<p style="margin:0;">Open <strong>Classes</strong> to start Level 1, check <strong>Timetable</strong> for your class times and <strong>Homework</strong> for anything your coach sets. Forgotten your password? Use “Forgot your password?” on the sign-in page.</p>`,
            cta: { label: "Sign in to Tech Studio", url: PORTALS.tech }
          });
        } else if (a.email) {
          const t = templates.techStudentApproved({ student: a, coachName: a.coachName || "" });
          try { await notifications.sendEmail(a.email, t.subject, t.html); } catch (e) { console.warn("tech approval email failed:", e.message); }
        }
        let results = [];
        try { results = await linkTechGuardians(db, sid, a); } catch (e) { console.error("linkTechGuardians failed:", e); }
        await event.data.after.ref.set({ welcomedAt: FV().serverTimestamp(), guardianLinkResults: results.map((r) => ({ email: r.email || "", created: !!r.created, skipped: r.skipped || "" })) }, { merge: true });
      } else {
        await techNotify(sid, "student", "tech_unlocked", "Account unlocked", "Your Tech Studio is open again.", { studentId: sid });
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
      /* Class work follows too, so hand-ins reach the new coach's Results. */
      const works = await db.collection("techLessonWork").where("studentId", "==", sid).get();
      works.docs.forEach((d) => { if ((d.data().coachId || "") !== cid) batch.update(d.ref, { coachId: cid }); });
      /* So does homework, so hand-ins reach the new coach. */
      const hws = await db.collection("techHomeworkWork").where("studentId", "==", sid).get();
      hws.docs.forEach((d) => { if ((d.data().coachId || "") !== cid) batch.update(d.ref, { coachId: cid }); });
      await batch.commit();
    }
    if (coachChanged || approvedWithCoach) {
      if (a.coachId) {
        await techNotify(a.coachId, "coach", "tech_new_builder", "New builder", `${a.name || "A builder"} is now paired with you.`, { studentId: sid });
        const ce = await coachEmail(a.coachId);
        await email(ce, `New Tech Studio builder — ${a.name || "builder"}`, {
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
    normDisciplines(discs).forEach((d) => { masteryCount[d] += 1; });
  });
  const levels = {};
  TECH_DISCIPLINES.forEach((d) => { levels[d] = Math.max(1, Math.min(TECH_LEVELS.length, (masteryCount[d] || 0) + 1)); });
  /* The old "AI" keys are folded into Coding above, so they go. */
  await ref.set({
    levels: { ...levels, AI: FV().delete() }, masteryCount: { ...masteryCount, AI: FV().delete() },
    updatedAt: FV().serverTimestamp(), updatedBy: "system:mastery-approved", lastBuildId: buildId
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

    /* A published project the builder saved: its public link shows the new version. */
    if (a.showcase === "approved" && b.showcase === "approved" && changedAny(b, a, BUILD_CONTENT_KEYS)) {
      await refreshShowcase(pid, buildShowcaseContent(a)).catch((e) => console.warn("showcase refresh:", e.message || e));
    }

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
      } else await notifyAdmins("tech_review_request", "Submission received (no coach)", msg, Object.assign({}, extra, key), {
        subject: `${n > 1 ? "Resubmission" : "Submission"}: ${title}`,
        opts: {
          preheader: msg, heading: n > 1 ? "A revision is ready to review." : "New work to review.",
          intro: esc(msg), body: `<p style="margin:0;">This builder has no coach yet, so it is waiting for the Studio Desk.</p>`,
          cta: { label: "Open Projects & reviews", url: PORTALS.admin + "#tech" }
        }
      });
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
      await notifyGuardians(sid, "tech_showcase", "Project published", `${first(who)}'s project “${title}” was approved for the public Tech Studio showcase.`, Object.assign({}, extra, pubKey), fresh ? {
        subject: `${first(who)}'s project is published`,
        opts: (g) => ({
          preheader: "A Tech Studio project was approved for the public showcase.", heading: "Published on Paisley Tech Studio.",
          intro: `Hi ${esc(first(g.name))}, ${esc(first(who))}'s project “${esc(title)}” is now on the public Tech Studio showcase. Only their first name is shown.`,
          body: `<p style="margin:0;">You can share this link: ${esc(url)}</p>`,
          cta: { label: "View the project", url }
        })
      } : null);
      const st = fresh ? await techStudent(sid) : null;
      if (st && st.email) {
        await email(st.email, `Published — ${title}`, {
          preheader: "Your project is on the Tech Studio showcase.", heading: "Your project is published.",
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
      const discs = normDisciplines(a.disciplines).length ? normDisciplines(a.disciplines) : TECH_DISCIPLINES;
      const top = levels ? discs.filter((d) => levels[d]).sort((x, y) => levels[y] - levels[x])[0] : "";
      const lvl = top ? TECH_LEVELS[levels[top] - 1] : "";
      const line = lvl ? `You're now ${lvl} in ${disciplineLabel(top)}.` : "Keep building.";
      await logActivity(sid, "mastered", `Mastered: ${title}`, act);
      const fresh = await techNotify(sid, "student", "tech_mastery", "Mastery approved", `${title} was approved. ${line}`, Object.assign({ id: `build_${pid}_mastery_${sha(String(a.masteryAt && a.masteryAt.seconds || "")).slice(0, 8)}` }, extra));
      /* Next level unlocked — only for disciplines whose level actually went up. */
      const ups = levels ? TECH_DISCIPLINES.filter((d) => (levels[d] || 1) > ((res.before && res.before[d]) || 1)) : [];
      for (const d of ups) {
        const L = TECH_LEVELS[levels[d] - 1], lk = { id: `level_${sid}_${d}_${levels[d]}` };
        const dl = disciplineLabel(d);
        await logActivity(sid, "level_unlocked", `${L} unlocked in ${dl}`, act);
        await techNotify(sid, "student", "tech_level", `${L} unlocked in ${dl}`, `New ${dl} missions at ${L} are open to you.`, Object.assign({}, extra, lk));
        await notifyGuardians(sid, "tech_level", `${L} unlocked in ${dl}`, `${first(who)} reached ${L} in ${dl}.`, Object.assign({}, extra, lk));
        if (a.coachId) await techNotify(a.coachId, "coach", "tech_level", `${first(who)} reached ${L} in ${dl}`, `After mastering “${title}”.`, Object.assign({}, extra, lk));
      }
      if (!fresh) return;
      const st = await techStudent(sid);
      if (st && st.email) {
        await email(st.email, `Mastery approved — ${title}`, {
          preheader: "Your coach approved your build.", heading: "Mastery approved.",
          intro: `Hi ${esc(first(st.name))}, your coach approved “${esc(title)}”.`,
          body: `<p style="margin:0;">${esc(line)}${ups.length ? " Unlocked: " + esc(ups.map((d) => TECH_LEVELS[levels[d] - 1] + " in " + d).join(", ")) + "." : ""} Open your studio to see what is next.</p>`,
          cta: { label: "Open Tech Studio", url: APP + LINKS.student }
        });
      }
      await notifyGuardians(sid, "tech_mastery", "Mastery approved", `${first(who)} mastered “${title}”.${lvl ? ` Now ${lvl} in ${top}.` : ""}`, Object.assign({ id: `build_${pid}_mastery` }, extra), {
        subject: `${first(who)} mastered a Tech Studio project`,
        opts: (g) => ({
          preheader: "A coach approved a Tech Studio project.", heading: "Mastery approved.",
          intro: `Hi ${esc(first(g.name))}, ${esc(first(who))}'s coach approved “${esc(title)}”.`,
          body: `<p style="margin:0;">${lvl ? `They're now <strong>${esc(lvl)}</strong> in ${esc(top)}. ` : ""}Open the guardian portal to see the project and their progress.</p>`,
          cta: { label: "Open the Tech Studio guardian portal", url: APP + LINKS.guardian }
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
      const msg = `${p.studentName || "A builder"} replied on “${p.title}”`;
      if (p.coachId) {
        const fresh = await techNotify(p.coachId, "coach", "tech_feedback", `${p.studentName || "A builder"} replied`, `${p.title}: ${preview}`, extra);
        if (fresh) {
          await email(await coachEmail(p.coachId), msg, {
            preheader: preview, heading: "A builder replied.", intro: esc(msg) + ":",
            body: `<p style="margin:0;white-space:pre-wrap;">${esc(preview)}</p>`,
            cta: { label: "Open the coach portal", url: APP + LINKS.coach }
          });
        }
      } else {
        await notifyAdmins("tech_feedback", `${p.studentName || "A builder"} replied`, `${p.title}: ${preview}`, extra);
      }
      return;
    }
    const grade = f.gradeLabel ? ` Grade: ${f.gradeLabel}${f.gradeScore != null && f.gradeScore !== "" ? ` (${f.gradeScore}%)` : ""}.` : "";
    const title = f.kind === "approved" ? "Project approved" : f.kind === "changes" ? "Revision requested" : (grade ? "Grade released" : "New feedback");
    const reviewer = f.role === "admin" ? "The Studio Desk" : (f.authorName || "Your coach");
    const isReview = f.kind === "approved" || f.kind === "changes" || !!grade;
    const fresh = await techNotify(p.studentId, "student", "tech_feedback", title, `${p.title}:${grade} ${preview}`, extra);
    if (!fresh) return;
    /* The builder hears about every word from their coach; families hear about review outcomes. */
    if (isReview) await notifyGuardians(p.studentId, "tech_feedback", title, `${first(p.studentName, "Your child")}'s coach on “${p.title}”:${grade} ${preview}`, extra, {
      subject: `${title}: ${p.title}`,
      opts: (g) => ({
        preheader: preview, heading: title + ".",
        intro: `Hi ${esc(first(g.name))}, ${esc(first(p.studentName, "your child"))}'s coach reviewed “${esc(p.title)}”.`,
        body: `${grade ? `<p style="margin:0 0 8px;"><strong>${esc(grade.trim())}</strong></p>` : ""}<p style="margin:0;white-space:pre-wrap;">${esc(preview)}</p>`,
        cta: { label: "Open the Tech Studio guardian portal", url: APP + LINKS.guardian }
      })
    });
    const st = await techStudent(p.studentId);
    if (st && st.email) {
      await email(st.email, `${title}: ${p.title}`, {
        preheader: preview, heading: title + ".",
        intro: `Hi ${esc(first(st.name))}, ${esc(reviewer)} ${isReview ? "reviewed" : "wrote on"} “${esc(p.title)}”.`,
        body: `${grade ? `<p style="margin:0 0 8px;"><strong>${esc(grade.trim())}</strong></p>` : ""}<p style="margin:0;white-space:pre-wrap;">${esc(preview)}</p>` +
          (f.kind === "changes" ? `<p style="margin:12px 0 0;">Open the same project, make the changes, then resubmit.</p>` : ""),
        cta: { label: f.kind === "changes" ? "Revise my project" : "Open Tech Studio", url: APP + LINKS.student + "#projects" }
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
/* Where each kind of posted item lives in the builder's studio. */
const CONTENT_SECTION = { mission: "missions", challenge: "missions", path: "learn", topic: "learn", resource: "learn", template: "learn", tool: "toolbox", aiTool: "toolbox" };
const CONTENT_WORD = { mission: "mission", challenge: "challenge", path: "learning path", topic: "topic", resource: "resource", template: "template", tool: "tool", aiTool: "AI tool" };
const sameList = (x, y) => JSON.stringify((x || []).slice().sort()) === JSON.stringify((y || []).slice().sort());
exports.onTechContentWritten = onDocumentWritten(
  { document: "techContent/{cid}", region: LOCATION, secrets: SMTP_SECRETS, timeoutSeconds: 540, memory: "512MiB" },
  async (event) => {
    const b = event.data.before.exists ? event.data.before.data() : null;
    const a = event.data.after.exists ? event.data.after.data() : null;
    if (!a || !CONTENT_SECTION[a.kind] || a.status !== "published") return;
    /* Already out: only a wider audience means there is anyone new to tell (the ids stop repeats). */
    const wasOut = b && b.status === "published";
    if (wasOut && (b.audience === a.audience && sameList(b.studentIds, a.studentIds))) return;
    const cid = event.params.cid, word = CONTENT_WORD[a.kind], section = CONTENT_SECTION[a.kind], emails = section === "missions";
    const lvl = a.level ? TECH_LEVELS[Math.max(1, Math.min(7, a.level)) - 1] : "";
    const msg = `${a.title || "A new " + word}${lvl ? ` (${lvl})` : ""}${a.deadline ? ` · due ${a.deadline}` : ""}. ${String(a.summary || "").slice(0, 160)}`;
    const url = APP + LINKS.student + "#" + section;
    for (const s of await missionAudience(a)) {
      const fresh = await techNotify(s.id, "student", emails ? "tech_mission" : "tech_content", `New ${word} posted`, msg, { studentId: s.id, missionId: cid, id: `mission_${cid}`, section, link: LINKS.student + "#" + section });
      if (!fresh || !emails) continue;
      if (s.email) {
        await email(s.email, `New ${word}: ${a.title || ""}`, {
          preheader: msg, heading: `A new ${word} is ready.`,
          intro: `Hi ${esc(first(s.name))}, ${esc(a.createdByName || "your coach")} posted “${esc(a.title || "")}”.`,
          body: `<p style="margin:0 0 8px;">${esc(String(a.summary || "Open your studio to read the brief, study the materials and practise before you build."))}</p>` +
            (a.deadline ? `<p style="margin:0;"><strong>Due:</strong> ${esc(a.deadline)}</p>` : ""),
          cta: { label: `Open the ${word}`, url }
        });
      }
      for (const g of await guardiansOf(s.id)) {
        const gFresh = await techNotify(g.parentUid, "guardian", "tech_mission", `New ${word} for ${first(s.name)}`, msg, { studentId: s.id, missionId: cid, id: `mission_${cid}_${s.id}` });
        if (gFresh) {
          await email(g.email, `New ${word} for ${first(s.name)}: ${title}`, {
            preheader: msg, heading: `A new ${word} for ${first(s.name)}.`,
            intro: `Hi ${esc(first(g.name))}, ${esc(a.createdByName || "their coach")} posted “${esc(a.title || "")}” for ${esc(first(s.name))}.`,
            body: `<p style="margin:0 0 8px;">${esc(String(a.summary || ""))}</p>` + (a.deadline ? `<p style="margin:0;"><strong>Due:</strong> ${esc(a.deadline)}</p>` : ""),
            cta: { label: "Open the guardian portal", url: APP + LINKS.guardian }
          });
        }
      }
    }
  }
);

/* =========================================================
   Classes — techLessons/{id} moving to "published" goes to every active
   builder on its level and their guardians: bell (with lessonId and courseId,
   so subject cards can show a bubble) and email. The ids stop repeats however
   often it is taken down and re-posted.
========================================================= */
async function trackAudience(track) {
  const snap = await admin.firestore().collection("techStudents").where("status", "==", "Active").get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((s) => tracksFor(s.skillLevel).indexOf(track) !== -1);
}
exports.onTechLessonWritten = onDocumentWritten(
  { document: "techLessons/{lid}", region: LOCATION, secrets: SMTP_SECRETS, timeoutSeconds: 540, memory: "512MiB" },
  async (event) => {
    const b = event.data.before.exists ? event.data.before.data() : null;
    const a = event.data.after.exists ? event.data.after.data() : null;
    if (!a || a.status !== "published" || (b && b.status === "published")) return;
    const lid = event.params.lid, course = a.courseName || "your class";
    /* Posted with the whole class: every lesson of the post shares one notification id, so the first wins. */
    const many = !!a.classPost && (a.classPostCount || 0) > 1;
    const word = many ? `${a.classPostCount} lessons` : (a.type === "test" ? "practice test" : "lesson");
    /* A lesson may have no title of its own: class > topic names it. */
    const title = lessonTitle(a);
    const msg = `${course}${a.topicTitle ? " · " + a.topicTitle : ""}${a.title ? " · " + a.title : ""}`;
    const extra = { lessonId: lid, courseId: a.courseId || "", section: "classes" };
    const nid = many ? `classpost_${a.classPost}` : `lesson_${lid}`;
    const url = APP + LINKS.student + "#classes";
    for (const s of await trackAudience(a.track)) {
      const fresh = await techNotify(s.id, "student", "tech_lesson", many ? `${course}: ${word} posted` : `New ${word} in ${course}`, many ? `The whole class is ready: ${word}.` : msg, Object.assign({ studentId: s.id, id: nid, link: LINKS.student + "#classes" }, extra));
      if (!fresh) continue;
      await email(s.email, many ? `${course} is ready: ${word}` : `New ${word} in ${course}: ${title}`, {
        preheader: msg, heading: many ? `${course} is ready.` : `A new ${word} is ready.`,
        intro: many ? `Hi ${esc(first(s.name))}, ${esc(a.createdByName || "your coach")} posted ${esc(word)} in ${esc(course)}.` : `Hi ${esc(first(s.name))}, ${esc(a.createdByName || "your coach")} posted “${esc(title)}” in ${esc(course)}.`,
        body: `<p style="margin:0;">Open your studio to ${many ? "start the class" : (a.type === "test" ? "take the test" : "watch the lesson")}.</p>`,
        cta: { label: `Open the ${word}`, url }
      });
      for (const g of await guardiansOf(s.id)) {
        const gFresh = await techNotify(g.parentUid, "guardian", "tech_lesson", many ? `${course} is ready for ${first(s.name)}` : `New ${word} for ${first(s.name)}`, many ? `${word} posted in ${course}.` : msg, Object.assign({ studentId: s.id, id: `${nid}_${s.id}`, link: LINKS.guardian + "#classes" }, extra));
        if (gFresh) {
          await email(g.email, many ? `${course} is ready for ${first(s.name)}` : `New ${word} for ${first(s.name)}: ${title}`, {
            preheader: msg, heading: many ? `${course} is ready for ${first(s.name)}.` : `A new ${word} for ${first(s.name)}.`,
            intro: many ? `Hi ${esc(first(g.name))}, ${esc(a.createdByName || "their coach")} posted ${esc(word)} in ${esc(course)} for ${esc(first(s.name))}.` : `Hi ${esc(first(g.name))}, ${esc(a.createdByName || "their coach")} posted “${esc(title)}” in ${esc(course)} for ${esc(first(s.name))}.`,
            body: `<p style="margin:0;">You can watch it and see their results in the guardian portal.</p>`,
            cta: { label: "Open the guardian portal", url: APP + LINKS.guardian + "#classes" }
          });
        }
      }
    }
  }
);

/* What people call a lesson: its own title, or its topic ("Flow lesson"). */
function lessonTitle(l) {
  const word = l && l.type === "test" ? "practice test" : "lesson";
  return String((l && l.title) || (l && l.topicTitle ? `${l.topicTitle} ${word}` : `New ${word}`)).slice(0, 160);
}

/* =========================================================
   Homework (js/tech/tech-homework.js)
   techHomework/{id} moving to "published" goes to every active builder on its
   class's level (bell + email) and their guardians (bell). A hand-in rings the
   builder's coach (or the Studio Desk when they have none); marking rings the
   builder (bell + email) and their guardians. Ids are deterministic, so a retried
   trigger never notifies twice.
========================================================= */
function dueLine(h) {
  if (!h.dueAt || !h.dueAt.toDate) return "";
  return h.dueAt.toDate().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Nairobi" });
}
exports.onTechHomeworkWritten = onDocumentWritten(
  { document: "techHomework/{hid}", region: LOCATION, secrets: SMTP_SECRETS, timeoutSeconds: 540, memory: "512MiB" },
  async (event) => {
    const b = event.data.before.exists ? event.data.before.data() : null;
    const a = event.data.after.exists ? event.data.after.data() : null;
    if (!a || a.status !== "published" || (b && b.status === "published")) return;
    const hid = event.params.hid, course = a.courseName || "your class", title = String(a.title || "Homework").slice(0, 140);
    const due = dueLine(a), from = a.createdByName || "your coach";
    const what = [];
    if (a.ide && a.ide.enabled) what.push("a Paisley VS Code practice");
    if (a.requireUpload) what.push("files to upload");
    if ((a.videos || []).length) what.push(`${a.videos.length} video${a.videos.length === 1 ? "" : "s"} to watch`);
    if ((a.files || []).length) what.push(`${a.files.length} file${a.files.length === 1 ? "" : "s"} to download`);
    const msg = `${course}: ${title}${due ? ` · due ${due}` : ""}`;
    const extra = { courseId: a.courseId || "", section: "homework", id: `hw_${hid}` };
    for (const s of await trackAudience(a.track)) {
      const fresh = await techNotify(s.id, "student", "tech_homework", `New homework in ${course}`, msg, Object.assign({ studentId: s.id, link: LINKS.student + "#homework" }, extra));
      if (!fresh) continue;
      await email(s.email, `New homework in ${course}: ${title}`, {
        preheader: msg, heading: "You have new homework.",
        intro: `Hi ${esc(first(s.name))}, ${esc(from)} set homework in ${esc(course)}.`,
        body: `<p style="margin:0 0 8px;"><strong>${esc(title)}</strong></p>` +
          (due ? `<p style="margin:0 0 8px;">Due: <strong>${esc(due)}</strong></p>` : "") +
          (what.length ? `<p style="margin:0;">It includes ${esc(what.join(", "))}.</p>` : `<p style="margin:0;">Open it in your studio to see what to do.</p>`),
        cta: { label: "Open my homework", url: APP + LINKS.student + "#homework" }
      });
      for (const g of await guardiansOf(s.id)) {
        await techNotify(g.parentUid, "guardian", "tech_homework", `New homework for ${first(s.name)}`, msg, Object.assign({ studentId: s.id, link: LINKS.guardian + "#homework" }, extra, { id: `hw_${hid}_${s.id}` }));
      }
    }
  }
);

exports.onTechHomeworkWorkWritten = onDocumentWritten(
  { document: "techHomeworkWork/{wid}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const b = event.data.before.exists ? event.data.before.data() : null;
    const a = event.data.after.exists ? event.data.after.data() : null;
    if (!a) return;
    const wid = event.params.wid, db = admin.firestore();
    const hs = await db.collection("techHomework").doc(a.homeworkId || "-").get();
    const h = hs.exists ? hs.data() : {};
    const title = String(h.title || "Homework").slice(0, 140), course = h.courseName || "class";
    const name = a.studentName || "A builder";

    /* Handed in (first time, or again after corrections). */
    if (a.status === "Submitted" && (!b || b.status !== "Submitted")) {
      const id = `hwsub_${wid}_${tsMs(a.submittedAt) || Date.now()}`;
      const msg = `${name} handed in “${title}” (${course}).`;
      const extra = { studentId: a.studentId, section: "homework", id, link: a.coachId ? LINKS.coach + "#homework" : LINKS.admin };
      if (a.coachId) {
        const fresh = await techNotify(a.coachId, "coach", "tech_homework_submitted", "Homework to mark", msg, extra);
        if (fresh) await email(await coachEmail(a.coachId), `Homework to mark: ${title}`, {
          preheader: msg, heading: "Homework to mark", intro: esc(msg),
          body: `<p style="margin:0;">Open Homework in your coach dashboard to mark it.</p>`,
          cta: { label: "Mark it", url: APP + LINKS.coach + "#homework" }
        });
      } else {
        await notifyAdmins("tech_homework_submitted", "Homework to mark (no coach)", msg, extra);
      }
      return;
    }

    /* Marked, or sent back for corrections. */
    const marked = (a.status === "Graded" || a.status === "Corrections") && tsMs(a.markedAt) && (!b || tsMs(b.markedAt) !== tsMs(a.markedAt));
    if (!marked) return;
    const st = await techStudent(a.studentId);
    const graded = a.status === "Graded";
    const id = `hwmark_${wid}_${tsMs(a.markedAt)}`;
    const head = graded ? `Homework marked${a.grade ? `: ${a.grade}` : ""}` : "Corrections asked";
    const msg = `${title} (${course})${a.feedback ? ` · ${String(a.feedback).slice(0, 160)}` : ""}`;
    const fresh = await techNotify(a.studentId, "student", graded ? "tech_homework_marked" : "tech_homework_corrections", head, msg, { studentId: a.studentId, section: "homework", id, link: LINKS.student + "#homework" });
    if (fresh && st && st.email) {
      await email(st.email, graded ? `Your homework is marked: ${title}` : `Corrections for your homework: ${title}`, {
        preheader: msg, heading: graded ? "Your homework is marked." : "Your coach asked for corrections.",
        intro: `Hi ${esc(first(st.name))}, ${esc(a.markedByName || "your coach")} ${graded ? "marked" : "looked at"} “${esc(title)}”.`,
        body: (graded && a.grade ? `<p style="margin:0 0 8px;">Grade: <strong>${esc(a.grade)}</strong></p>` : "") +
          (a.feedback ? `<p style="margin:0;white-space:pre-wrap;">${esc(String(a.feedback).slice(0, 1500))}</p>` : "") +
          (graded ? "" : `<p style="margin:8px 0 0;">Make the corrections and hand it in again.</p>`),
        cta: { label: "Open my homework", url: APP + LINKS.student + "#homework" }
      });
    }
    for (const g of await guardiansOf(a.studentId)) {
      await techNotify(g.parentUid, "guardian", graded ? "tech_homework_marked" : "tech_homework_corrections",
        graded ? `${first(name)}’s homework is marked${a.grade ? `: ${a.grade}` : ""}` : `Corrections for ${first(name)}’s homework`, msg,
        { studentId: a.studentId, section: "homework", id: `${id}_${g.parentUid}`, link: LINKS.guardian + "#homework" });
    }
  }
);

/* =========================================================
   Levels: passing a class unlocks the next class
   -----------------------------------------------------------
   The classes of a builder's level, in techCourses.order, are Level 1, 2, 3…
   Lessons inside a class are always open. Finishing a lesson takes
   lesson.gate { watch, quiz, pass, work } (no gate: every step the lesson has,
   50% pass mark); it must match gateOf / gateSteps in js/tech/tech-classes.js
   and is recorded quietly in techLessonProgress.passedAt. When every posted
   lesson of a class is finished, techCourseProgress/{uid}_{courseId} is created
   once and the builder, their coach, the admins (bell) and their guardians
   (bell and email) hear which class is next.
========================================================= */
const DEFAULT_PASS = 50;
/* A lesson may hold several videos (videos[]); video mirrors the first. watchedAt means all were watched. */
const hasVideo = (l) => (Array.isArray(l && l.videos) && l.videos.some((v) => v && v.url)) || !!(l && l.video && l.video.url);
function lessonGate(l) {
  const g = (l && l.gate) || { watch: true, quiz: true, work: true, pass: DEFAULT_PASS };
  const qs = Array.isArray(l && l.questions) ? l.questions : [];
  const pass = Number(g.pass);
  return {
    watch: !!g.watch && l.type !== "test" && hasVideo(l),
    quiz: !!g.quiz && qs.length > 0,
    marked: qs.some((q) => q && q.type !== "open"),
    pass: g.pass !== "" && g.pass != null && Number.isFinite(pass) ? Math.max(0, Math.min(100, Math.round(pass))) : DEFAULT_PASS,
    work: !!g.work && !!l.task
  };
}
const handedIn = (w) => !!w && ((w.submitCount || 0) > 0 || ["Submitted", "Graded", "Corrections"].indexOf(w.status) !== -1);
/* Class work finishes a lesson only when the coach has marked it and pressed Allow next lesson
   (nextAllowed, coach/admin only in the rules). Handing it in is not enough. */
const workCleared = (w) => !!w && w.nextAllowed === true;
function gateMet(l, p, w) {
  const g = lessonGate(l), pr = p || {};
  let any = false;
  if (g.watch) { any = true; if (!pr.watchedAt) return false; }
  if (g.quiz) {
    any = true;
    if (g.marked ? !(pr.bestPercent != null && pr.bestPercent >= g.pass) : !(pr.lastAttemptAt || (pr.attempts || 0) > 0)) return false;
  }
  if (g.work) { any = true; if (!workCleared(w)) return false; }
  return any || !!pr.openedAt;
}
/* The classes of a builder's level, in learning order: Level 1, 2, 3… Must match
   byCourse in js/tech/tech-classes.js (order, then name). */
const byCourse = (a, b) => (a.order || 0) - (b.order || 0) || String(a.name || "").localeCompare(String(b.name || ""));
async function classLadder(skill) {
  const snap = await admin.firestore().collection("techCourses").where("track", "in", tracksFor(skill)).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort(byCourse);
}
/* A class is passed when it has posted lessons and every one is finished. */
function classPassed(lessons, progress, works) {
  return lessons.length > 0 && lessons.every((l) => {
    const p = progress[l.id];
    return (p && p.passedAt) || gateMet(l, p, works[l.id]);
  });
}
async function checkLessonPass(uid, lessonId) {
  if (!uid || !lessonId) return;
  const db = admin.firestore();
  const lRef = db.collection("techLessons").doc(lessonId), pRef = db.collection("techLessonProgress").doc(uid + "_" + lessonId);
  const [ld, pd, wd] = await Promise.all([lRef.get(), pRef.get(), db.collection("techLessonWork").doc(uid + "_" + lessonId).get()]);
  if (!ld.exists || ld.data().status !== "published") return;
  const l = Object.assign({ id: ld.id }, ld.data());
  if (!(pd.exists && pd.data().passedAt)) {
    if (!gateMet(l, pd.exists ? pd.data() : null, wd.exists ? wd.data() : null)) return;
    /* The lesson is finished: recorded quietly. Only a whole class is announced. */
    await pRef.set({
      studentId: uid, lessonId, courseId: l.courseId || "", topicId: l.topicId || "", track: l.track || "",
      passedAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp()
    }, { merge: true });
  }
  if (l.courseId) await checkClassPass(uid, l.courseId);
}
async function checkClassPass(uid, courseId) {
  const db = admin.firestore();
  const cRef = db.collection("techCourseProgress").doc(uid + "_" + courseId);
  if ((await cRef.get()).exists) return;
  const less = await db.collection("techLessons").where("courseId", "==", courseId).where("status", "==", "published").get();
  const lessons = less.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  if (!lessons.length) return;
  const progress = {}, works = {};
  const [ps, ws] = await Promise.all([
    db.getAll(...lessons.map((l) => db.collection("techLessonProgress").doc(uid + "_" + l.id))),
    db.getAll(...lessons.map((l) => db.collection("techLessonWork").doc(uid + "_" + l.id)))
  ]);
  lessons.forEach((l, i) => { if (ps[i].exists) progress[l.id] = ps[i].data(); if (ws[i].exists) works[l.id] = ws[i].data(); });
  if (!classPassed(lessons, progress, works)) return;
  /* Only the first run records the pass and tells people. */
  try {
    await cRef.create({ studentId: uid, courseId, lessonCount: lessons.length, passedAt: FV().serverTimestamp() });
  } catch (e) {
    if (e && (e.code === 6 || /already exists/i.test(e.message || ""))) return;
    throw e;
  }
  const cd = await db.collection("techCourses").doc(courseId).get();
  await announceClassPass(uid, Object.assign({ id: courseId }, cd.exists ? cd.data() : { name: lessons[0].courseName || "their class" }), lessons.length);
}
async function announceClassPass(uid, c, lessonCount) {
  const s = await techStudent(uid);
  if (!s) return;
  const ladder = await classLadder(s.skillLevel);
  const i = ladder.findIndex((x) => x.id === c.id), n = i + 1, next = i > -1 ? ladder[i + 1] || null : null;
  const course = c.name || "their class", who = first(s.name, "Your child");
  const lvl = n > 0 ? `Level ${n} (${course})` : course;
  const nextLvl = next ? `Level ${n + 1} (${next.name})` : "";
  const idBase = `classpass_${uid}_${c.id}`;
  await techNotify(uid, "student", "tech_unlock", next ? `You passed ${lvl}! Unlock Level ${n + 1}` : `You passed ${course}!`,
    next ? `You finished every lesson in ${course}. Open Classes and press Unlock Level ${n + 1} to start ${next.name}.` : `You passed ${lvl}. That was the last class for now. Amazing work!`,
    { studentId: uid, id: idBase, section: "classes", courseId: next ? next.id : c.id, link: LINKS.student + "#classes" });
  const staffLine = `${s.name || "A builder"} passed ${lvl}` + (next ? ` and moves on to ${nextLvl}.` : ".");
  if (s.coachId) await techNotify(s.coachId, "coach", "tech_unlock", "Class passed", staffLine, { studentId: uid, id: idBase, section: "results", courseId: c.id });
  await notifyAdmins("tech_unlock", "Class passed", staffLine, { studentId: uid, id: idBase, section: "results", courseId: c.id });
  await logActivity(uid, "level_passed", `Passed ${lvl}`, { studentName: s.name || "", by: "system", origin: "class" });
  const heading = next ? `${who} passed Level ${n} and is moving on to Level ${n + 1}!` : `${who} passed ${lvl}!`;
  const famLine = next ? `${who} finished every lesson in ${course}, passing ${lvl}, and is moving on to ${nextLvl}.` : `${who} finished every lesson in ${course}, passing ${lvl}.`;
  for (const g of await guardiansOf(uid)) {
    const fresh = await techNotify(g.parentUid, "guardian", "tech_unlock", next ? `${who} passed Level ${n}` : `${who} passed ${course}`, famLine,
      { studentId: uid, id: idBase + "_" + g.parentUid, section: "classes", courseId: c.id, link: LINKS.guardian + "#classes" });
    if (fresh) await email(g.email, next ? `${who} passed Level ${n} and is moving on to Level ${n + 1}` : `${who} passed ${course}`, {
      preheader: famLine, heading,
      intro: `Hi ${esc(first(g.name))}, great news from Paisley Tech Studio.`,
      body: `<p style="margin:0 0 10px;">${esc(famLine)}</p>` +
        `<p style="margin:0 0 10px;"><b>${esc(course)}</b> · ${esc(lessonCount)} lesson${lessonCount === 1 ? "" : "s"} finished` + (ladder.length ? ` · Level ${esc(Math.max(n, 1))} of ${esc(ladder.length)}` : "") + `</p>` +
        `<p style="margin:0;">Each class opens only when the one before is passed, so this one was earned. A quick “well done” from you goes a long way. Keep encouraging them!</p>`,
      cta: { label: "See their progress", url: APP + LINKS.guardian + "#classes" }
    });
  }
}
/* Watching, a quiz score or opening it can finish a lesson, and so pass a class. */
exports.onTechLessonProgressWritten = onDocumentWritten(
  { document: "techLessonProgress/{pid}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const a = event.data.after.exists ? event.data.after.data() : null;
    if (!a || !a.studentId || !a.lessonId) return;
    /* Every write checks: the class page touches a finished lesson to ask again for a class
       finished before levels existed. checkClassPass stops at one read once the class is recorded. */
    await checkLessonPass(a.studentId, a.lessonId);
  }
);

/* Marks answers against the private key. questions never hold the answers,
   so this is the only place a builder learns which one was right.
   "open" questions (a written answer, no options) are kept for the coach to
   read and left out of the score; only open questions gives total 0, percent null. */
function gradeTechQuiz(questions, key, answers) {
  const given = answers || {}, k = key || {};
  const norm = (x) => String(x == null ? "" : x).trim().toLowerCase().replace(/\s+/g, " ");
  let score = 0, total = 0, openCount = 0;
  const review = (questions || []).map((q) => {
    const a = k[q.id] || {}, raw = given[q.id];
    if (q.type === "open") {
      openCount++;
      return { id: q.id, text: String(q.text || ""), given: String(raw == null ? "" : raw).slice(0, 3000), open: true, correct: null, answer: "", explanation: String(a.explanation || "") };
    }
    total++;
    let correct = false, shown = "", answer = "";
    if (q.type === "short") {
      const accepted = Array.isArray(a.accepted) ? a.accepted : [];
      shown = String(raw == null ? "" : raw).slice(0, 300);
      correct = norm(shown) !== "" && accepted.some((x) => norm(x) === norm(shown));
      answer = accepted[0] || "";
    } else {
      const opts = Array.isArray(q.options) ? q.options : [];
      const n = Number(raw), picked = raw !== "" && raw != null && Number.isInteger(n) && n >= 0 && n < opts.length;
      shown = picked ? String(opts[n]) : "";
      correct = picked && n === a.correct;
      answer = opts[a.correct] != null ? String(opts[a.correct]) : "";
    }
    if (correct) score++;
    return { id: q.id, text: String(q.text || ""), given: shown, correct, answer, explanation: String(a.explanation || "") };
  });
  return { score, total, percent: total ? Math.round((score / total) * 100) : null, openCount, review };
}

exports.submitTechQuiz = onCall({ region: LOCATION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Please sign in.");
  const db = admin.firestore(), uid = req.auth.uid;
  const { lessonId, answers, attemptKey } = req.data || {};
  if (typeof lessonId !== "string" || !lessonId) throw new HttpsError("invalid-argument", "Which quiz is this?");
  if (!answers || typeof answers !== "object") throw new HttpsError("invalid-argument", "No answers were sent.");
  const s = await techStudent(uid);
  if (!s || s.status !== "Active") throw new HttpsError("permission-denied", "Only active builders can take this.");
  const ref = db.collection("techLessons").doc(lessonId);
  const lesson = await ref.get();
  if (!lesson.exists || lesson.data().status !== "published") throw new HttpsError("not-found", "This is no longer available.");
  const l = lesson.data();
  if (!Array.isArray(l.questions) || !l.questions.length) throw new HttpsError("failed-precondition", "This has no questions.");
  const keyDoc = await ref.collection("private").doc("key").get();
  const res = gradeTechQuiz(l.questions, keyDoc.exists ? keyDoc.data().answers : {}, answers);

  /* A retry of the same submission (a dropped connection) records one attempt. */
  const attemptRef = db.collection("techAttempts").doc(sha(uid + "|" + lessonId + "|" + String(attemptKey || Date.now()).slice(0, 80)));
  const kind = l.type === "test" ? "test" : "quiz";
  try {
    await attemptRef.create({
      studentId: uid, studentName: s.name || "", coachId: s.coachId || "", lessonId, kind, title: lessonTitle(l),
      courseId: l.courseId || "", courseName: l.courseName || "", topicId: l.topicId || "", topicTitle: l.topicTitle || "", track: l.track || "",
      score: res.score, total: res.total, percent: res.percent, openCount: res.openCount, review: res.review, at: FV().serverTimestamp()
    });
  } catch (e) {
    if (e && (e.code === 6 || /already exists/i.test(e.message || ""))) return res;
    throw e;
  }
  const pRef = db.collection("techLessonProgress").doc(uid + "_" + lessonId), was = await pRef.get();
  const prog = {
    studentId: uid, lessonId, courseId: l.courseId || "", topicId: l.topicId || "", track: l.track || "", title: lessonTitle(l),
    attempts: FV().increment(1), lastAttemptAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp()
  };
  if (res.percent != null) {
    prog.lastPercent = res.percent;
    prog.bestPercent = Math.max(was.exists && was.data().bestPercent != null ? was.data().bestPercent : -1, res.percent);
  }
  await pRef.set(prog, { merge: true });

  const word = kind === "test" ? "practice test" : "quiz";
  const marked = res.percent != null;
  const written = res.openCount ? ` and wrote ${res.openCount} answer${res.openCount === 1 ? "" : "s"} to read` : "";
  await logActivity(uid, "quiz_done", marked ? `Scored ${res.percent}% on the ${word} “${lessonTitle(l)}”` : `Handed in answers to the ${word} “${lessonTitle(l)}”`, { studentName: s.name || "", by: "student" });
  /* The coach hears about every practice test, and about any written answers waiting to be read. */
  if (kind === "test" || res.openCount) {
    const who = s.name || "A builder";
    const line = marked ? `${who} scored ${res.score}/${res.total} (${res.percent}%) on “${lessonTitle(l)}”${written}.` : `${who} handed in written answers to “${lessonTitle(l)}”.`;
    if (s.coachId) await techNotify(s.coachId, "coach", "tech_result", kind === "test" ? "Practice test finished" : "Quiz answers to read", line, { studentId: uid, section: "results" });
    if (kind === "test") await notifyGuardians(uid, "tech_result", `Practice test ${marked ? "result" : "handed in"} for ${first(s.name)}`, line, { section: "classes" });
  }
  return res;
});

/* =========================================================
   Class work and group tasks: hand-in and marking
   -----------------------------------------------------------
   techLessonWork/{uid}_{lessonId}   one builder's code or writing for a lesson
   techGroups/{gid}/tasks/{tid}      one group's shared work, coded together
   Both carry status: Draft | Submitted | Graded | Corrections, and the fields
   InkGrader writes when a coach marks (feedback, grade, maxScore,
   gradedFileUrl, history). A hand-in tells the coach; a mark tells the
   builder(s) and their guardians, by bell and email. Notification ids include
   the round (submitCount, or the marking time), so a retry never repeats one.
========================================================= */
const WORK_STATES = ["Draft", "Submitted", "Graded", "Corrections"];
const tsMs = (t) => (t && t.toMillis ? t.toMillis() : (t ? new Date(t).getTime() || 0 : 0));
/* What changed between two versions of a work doc: "submitted", "graded", "corrections" or "". */
function workEvent(before, after) {
  const b = before || {}, a = after || {};
  if (WORK_STATES.indexOf(a.status) === -1) return "";
  if (a.status === "Submitted" && (b.status !== "Submitted" || (a.submitCount || 0) > (b.submitCount || 0))) return "submitted";
  /* Renew: the coach asked for a fresh hand-in of marked work (TechWork.renewWork). */
  if (a.status === "Corrections" && !!a.renewedAt && tsMs(a.renewedAt) !== tsMs(b.renewedAt)) return "renewed";
  const gradedNow = !!a.gradedAt && tsMs(a.gradedAt) !== tsMs(b.gradedAt);
  if (a.status === "Graded" && (b.status !== "Graded" || gradedNow)) return "graded";
  if (a.status === "Corrections" && (b.status !== "Corrections" || gradedNow)) return "corrections";
  return "";
}
function markLine(a) {
  const score = a.grade != null && a.maxScore ? `Score: ${a.grade}/${a.maxScore}.` : "";
  return `${score}${a.feedback ? " " + String(a.feedback).slice(0, 220) : ""}`.trim();
}
function workEmailBody(a) {
  return (a.grade != null && a.maxScore ? `<p style="margin:0 0 8px;"><span style="color:#5A6E6A;">Score</span>&nbsp; <b>${esc(a.grade)} / ${esc(a.maxScore)}</b></p>` : "") +
    (a.feedback ? `<p style="margin:0 0 8px;padding:10px 12px;background:#F4F8F7;border-radius:8px;white-space:pre-wrap;">${esc(String(a.feedback).slice(0, 2000))}</p>` : "") +
    (a.gradedFileUrl ? `<p style="margin:0;color:#5A6E6A;">The marked copy, with the coach's notes drawn on it, can be opened and downloaded there.</p>` : "");
}
/* The picture taken at hand-in, for the family's email ("" when there is none). */
function workSnapshotHtml(pic, kid) {
  if (!/^https:\/\//.test(pic || "")) return "";
  return `<p style="margin:0 0 14px;"><img src="${esc(pic)}" width="496" alt="What ${esc(kid)} built" style="display:block;width:100%;max-width:496px;height:auto;max-height:300px;object-fit:cover;object-position:top;border:1px solid #E3ECEA;border-radius:8px;"></p>`;
}
function workRound(a, ev) {
  if (ev === "submitted") return String(a.submitCount || 1);
  if (ev === "renewed") return "r" + String(tsMs(a.renewedAt) || (a.history || []).length);
  return String(tsMs(a.gradedAt) || (a.history || []).length);
}
/* The lesson after this one in its class (topic order, then lesson order; mirrors inOrder in tech-classes.js). */
async function nextLessonAfter(l) {
  if (!l || !l.courseId) return null;
  const db = admin.firestore();
  const byOrd = (x, y) => (x.order || 0) - (y.order || 0) || String(x.title || "").localeCompare(String(y.title || ""));
  const [ts, ls] = await Promise.all([
    db.collection("techTopics").where("courseId", "==", l.courseId).get(),
    db.collection("techLessons").where("courseId", "==", l.courseId).where("status", "==", "published").get()
  ]);
  const lessons = ls.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  const all = [];
  ts.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort(byOrd)
    .forEach((t) => lessons.filter((x) => x.topicId === t.id).sort(byOrd).forEach((x) => all.push(x)));
  const i = all.findIndex((x) => x.id === l.id);
  return i > -1 ? all[i + 1] || null : null;
}
/* The coach was pleased with the marked work and pressed Allow next lesson: the lesson is
   finished (checkLessonPass writes passedAt, which opens the next lesson on the dashboard),
   and the builder and their family hear about it by bell and email. Once per piece of work. */
async function announceNextAllowed(wid, a) {
  const sid = a.studentId, s = await techStudent(sid);
  if (!s) return;
  await checkLessonPass(sid, a.lessonId);
  const ld = await admin.firestore().collection("techLessons").doc(a.lessonId).get();
  const l = ld.exists ? Object.assign({ id: ld.id }, ld.data()) : null;
  const next = l ? await nextLessonAfter(l).catch(() => null) : null;
  const what = a.lessonTitle || (l ? lessonTitle(l) : "class work"), by = a.nextAllowedByName || "Your coach";
  const nextName = next ? lessonTitle(next) : "";
  const line = `${by} was happy with ${what}` + (next ? ` and opened the next lesson, “${nextName}”.` : ". That lesson is finished.");
  const fresh = await techNotify(sid, "student", "tech_unlock", next ? "Next lesson open" : "Lesson finished", line,
    { studentId: sid, id: `work_${wid}_next`, section: "classes", courseId: a.courseId || "", lessonId: next ? next.id : "", link: LINKS.student + "#classes" });
  if (fresh) {
    await email(s.email, next ? `Next lesson open: ${nextName}` : `Lesson finished: ${what}`, {
      preheader: line, heading: next ? "Your next lesson is open." : "Lesson finished.",
      intro: `Hi ${esc(first(s.name))}, ${esc(by)} marked ${esc(what)} and was happy with it.`,
      body: workEmailBody(a) + `<p style="margin:12px 0 0;">${next ? `Open Classes in your studio to start <b>${esc(nextName)}</b>.` : "Open Classes in your studio to see what is next."}</p>`,
      cta: { label: "Open Classes", url: APP + LINKS.student + "#classes" }
    });
    await logActivity(sid, "work_cleared", `Coach opened the next lesson after ${what}`, { studentName: s.name || "", by: "coach", origin: "class" });
  }
  const kid = first(s.name, "Your child");
  const famLine = `${by} was happy with ${kid}'s ${what}` + (next ? ` and opened the next lesson, “${nextName}”.` : ".");
  for (const g of await guardiansOf(sid)) {
    const gFresh = await techNotify(g.parentUid, "guardian", "tech_unlock", next ? `${kid} can move on` : `${kid} finished a lesson`, famLine,
      { studentId: sid, courseId: a.courseId || "", id: `work_${wid}_next_${g.parentUid}`, section: "classes", link: LINKS.guardian + "#classes" });
    if (gFresh) await email(g.email, next ? `${kid} can move on to the next lesson` : `${kid} finished ${what}`, {
      preheader: famLine, heading: next ? `${kid} can move on to the next lesson.` : `${kid} finished a lesson.`,
      intro: `Hi ${esc(first(g.name))}, ${esc(famLine)}`,
      body: workEmailBody(a) + `<p style="margin:12px 0 0;">Each lesson opens only when the coach is happy with the work before it, so this one was earned.</p>`,
      cta: { label: "See their progress", url: APP + LINKS.guardian + "#classes" }
    });
  }
}

exports.onTechLessonWorkWritten = onDocumentWritten(
  { document: "techLessonWork/{wid}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const b = event.data.before.exists ? event.data.before.data() : null;
    const a = event.data.after.exists ? event.data.after.data() : null;
    if (!a) return;
    /* Publishing is its own conversation, beside marking. */
    if (((b && b.publishState) || "") !== (a.publishState || "")) await publishEvent(event.params.wid, b, a);
    /* The builder saved published work: the public link shows the new version. */
    else if (b && a.publishState === "approved" && changedAny(b, a, WORK_CONTENT_KEYS)) {
      const w = workShowcase(liveWork(a), null);
      await refreshShowcase(showcaseIdOf(event.params.wid), { codeFiles: w.codeFiles, codeActive: w.codeActive, codeAssets: w.codeAssets, writingHtml: w.writingHtml, contentUpdatedAt: FV().serverTimestamp() })
        .catch((e) => console.warn("class work showcase refresh:", e.message || e));
    }
    /* Allow next lesson: the coach's OK is what finishes a lesson with class work. */
    if (a.nextAllowed === true && !(b && b.nextAllowed === true) && a.studentId && a.lessonId) await announceNextAllowed(event.params.wid, a);
    const ev = workEvent(b, a);
    if (!ev) return;
    const wid = event.params.wid, sid = a.studentId, s = await techStudent(sid);
    if (!s) return;
    const what = a.lessonTitle || "class work", where = `${a.courseName || "Class"}${a.topicTitle ? " · " + a.topicTitle : ""}`;
    const round = workRound(a, ev);
    const extra = { studentId: sid, lessonId: a.lessonId || "", courseId: a.courseId || "" };
    if (ev === "submitted") {
      const coach = s.coachId || a.coachId;
      const line = `${s.name || "A builder"} handed in ${what} (${where}).`;
      const pic = /^https:\/\//.test(a.snapshotUrl || "") ? a.snapshotUrl : "";
      if (coach) {
        const fresh = await techNotify(coach, "coach", "tech_work", (a.submitCount || 1) > 1 ? "Corrected work handed in" : "Class work handed in", line, Object.assign({ id: `work_${wid}_s${round}`, section: "results", image: pic }, extra));
        if (fresh) await email(await coachEmail(coach), `Work to mark: ${s.name || "builder"} · ${what}`, {
          preheader: line, heading: "Work to mark", intro: esc(line),
          body: `<p style="margin:0;">Open Results, then Class work, to run it and mark it.</p>`,
          cta: { label: "Open coach dashboard", url: APP + LINKS.coach + "#results" }
        });
      }
      /* Admins see every hand-in on their bell, with the picture; no email. */
      await notifyAdmins("tech_work", (a.submitCount || 1) > 1 ? "Corrected work handed in" : "Class work handed in", line + (coach ? "" : " The builder has no coach yet."), Object.assign({ id: `work_${wid}_s${round}`, section: "results", image: pic }, extra));
      await logActivity(sid, "work_submitted", `Handed in ${what}`, { studentName: s.name || "", by: "student", origin: "class" });
      /* The family sees what they built today: bell and email, with the picture. */
      const kid = first(s.name, "Your child");
      for (const g of await guardiansOf(sid)) {
        const gFresh = await techNotify(g.parentUid, "guardian", "tech_work", `See what ${kid} built today`, `${kid} handed in ${what} (${where}).`,
          { studentId: sid, courseId: a.courseId || "", id: `work_${wid}_s${round}_${g.parentUid}`, section: "results", image: pic, link: LINKS.guardian + "#results" });
        if (gFresh) await email(g.email, `See what ${kid} built today`, {
          preheader: `${kid} handed in ${what} at Paisley Tech Studio.`,
          heading: `See what ${kid} built today`,
          intro: `Hi ${esc(first(g.name))}, ${esc(kid)} just handed in ${esc(what)} (${esc(where)}) for their coach to mark.`,
          body: workSnapshotHtml(pic, kid) +
            `<p style="margin:0 0 10px;">Ask ${esc(kid)} to show you how it works. A few words of praise for something they made themselves goes a long way.</p>` +
            `<p style="margin:0;"><b>Keep encouraging them!</b> We will tell you again when their coach has marked it.</p>`,
          cta: { label: "Open the guardian portal", url: APP + LINKS.guardian + "#results" }
        });
      }
      /* Handing in can be what passes the level. */
      await checkLessonPass(sid, a.lessonId);
      return;
    }
    if (ev === "renewed") {
      const by = a.renewedByName || "Your coach";
      const rTitle = `Hand it in again: ${what}`, rLine = `${by} asked you to hand in ${what} afresh.` + (a.renewNote ? " " + String(a.renewNote).slice(0, 220) : "");
      const rFresh = await techNotify(sid, "student", "tech_work_corrections", rTitle, rLine, Object.assign({ id: `work_${wid}_${round}`, section: "results", link: LINKS.student + "#results" }, extra, { lessonId: "" }));
      if (rFresh) {
        await email(s.email, rTitle, {
          preheader: rLine, heading: "Your coach asked for a fresh hand-in.",
          intro: `Hi ${esc(first(s.name))}, ${esc(by)} opened ${esc(what)} (${esc(where)}) again so you can hand it in afresh.`,
          body: (a.renewNote ? `<p style="margin:0 0 8px;padding:10px 12px;background:#F4F8F7;border-radius:8px;white-space:pre-wrap;">${esc(String(a.renewNote).slice(0, 2000))}</p>` : "") +
            `<p style="margin:0;">Open Results in your studio, press Make corrections, then hand it in again. Your earlier marks stay in the history.</p>`,
          cta: { label: "Open Results", url: APP + LINKS.student + "#results" }
        });
        await logActivity(sid, "work_renewed", "Fresh hand-in asked: " + what, { studentName: s.name || "", by: "coach", origin: "class" });
      }
      return;
    }
    const graded = ev === "graded";
    const title = graded ? `Your work was marked: ${what}` : `Corrections asked: ${what}`;
    const line = (graded ? `${a.gradedByName || "Your coach"} marked ${what}.` : `${a.gradedByName || "Your coach"} asked for corrections on ${what}.`) + " " + markLine(a);
    const toResults = Object.assign({}, extra, { lessonId: "" });   // opening Results reads them, unlike posted lessons
    const fresh = await techNotify(sid, "student", graded ? "tech_work_marked" : "tech_work_corrections", title, line, Object.assign({ id: `work_${wid}_m${round}`, section: "results", link: LINKS.student + "#results" }, toResults));
    if (fresh) {
      await email(s.email, title, {
        preheader: line, heading: graded ? "Your work is marked." : "Your coach asked for corrections.",
        intro: `Hi ${esc(first(s.name))}, ${esc(a.gradedByName || "your coach")} ${graded ? "marked" : "looked at"} ${esc(what)} (${esc(where)}).`,
        body: workEmailBody(a) + (graded ? `<p style="margin:12px 0 0;">It is in Results in your studio, with the marked copy.${a.nextAllowed ? "" : " When your coach is happy with it, they open the next lesson and we will let you know."}</p>` : `<p style="margin:12px 0 0;">Open Results in your studio and press Make corrections, then hand it in again.</p>`),
        cta: { label: "Open Results", url: APP + LINKS.student + "#results" }
      });
      await logActivity(sid, graded ? "work_marked" : "work_corrections", (graded ? "Work marked: " : "Corrections asked: ") + what, { studentName: s.name || "", by: "coach", origin: "class" });
    }
    for (const g of await guardiansOf(sid)) {
      const gt = graded ? `${first(s.name)}'s work was marked` : `Corrections asked for ${first(s.name)}`;
      const gFresh = await techNotify(g.parentUid, "guardian", graded ? "tech_work_marked" : "tech_work_corrections", gt, `${what} · ${where}. ${markLine(a)}`.trim(), Object.assign({ id: `work_${wid}_m${round}_${sid}`, section: "results", link: LINKS.guardian + "#results" }, toResults));
      if (gFresh) await email(g.email, `${gt}: ${what}`, {
        preheader: line, heading: gt + ".",
        intro: `Hi ${esc(first(g.name))}, ${esc(a.gradedByName || "the coach")} ${graded ? "marked" : "asked for corrections on"} ${esc(first(s.name))}'s ${esc(what)} (${esc(where)}).`,
        body: workEmailBody(a) + `<p style="margin:12px 0 0;">The work, the feedback and the marked copy to download are in Results in the guardian portal.</p>`,
        cta: { label: "See the results", url: APP + LINKS.guardian + "#results" }
      });
    }
  }
);

/* ---------------------------------------------------------
   Publishing class work: the builder asks (publishState "requested"), their
   coach or an admin approves or declines with a note. Approved work gets a
   public copy at techShowcase/cw_{workId}, shown at /tech/p/cw_{workId}
   with only the builder's first name; declined or taken down removes it.
--------------------------------------------------------- */
const showcaseIdOf = (wid) => "cw_" + String(wid).replace(/[^\w-]/g, "_").slice(0, 200);

/* Published work stays live: when the builder saves, the public copy's content is refreshed
   (the approval, first name, featured flag and publish date stay as they were). The public
   page sanitises writing and runs code in a sandbox, as it does for the first copy. */
const sameVal = (x, y) => JSON.stringify(x === undefined ? null : x) === JSON.stringify(y === undefined ? null : y);
const changedAny = (b, a, keys) => keys.some((k) => !sameVal(b && b[k], a && a[k]));
const httpsOnly = (u) => (/^https:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "");
/* Mirrors TechUI.showcaseSnapshot (js/tech/tech-helpers.js) for the parts a builder can change. */
const BUILD_CONTENT_KEYS = ["title", "brief", "writingHtml", "workText", "codeFiles", "codeActive", "codeAssets", "files", "aiReflection", "workUrl"];
function buildShowcaseContent(b) {
  const files = (b.files || []).filter((f) => f && httpsOnly(f.url));
  const isType = (re) => (f) => re.test(f.type || "") || re.test(f.name || f.url || "");
  const images = files.filter(isType(/image\/|\.(png|jpe?g|gif|webp)(\?|$)/i)).slice(0, 12).map((f) => ({ url: f.url, name: f.name || "" }));
  const media = files.filter(isType(/video\/|audio\/|\.(mp4|webm|mov|mp3|wav|m4a|ogg)(\?|$)/i)).slice(0, 6).map((f) => ({ url: f.url, name: f.name || "", type: f.type || "" }));
  let size = 0;
  const code = (b.codeFiles || []).filter((f) => f && String(f.content || "").trim())
    .filter((f) => (size += String(f.content).length) < 400000)
    .map((f) => ({ name: String(f.name || ""), lang: f.lang || "", content: String(f.content) }));
  const r = b.aiReflection || {};
  return {
    title: String(b.title || "Untitled project").slice(0, 160), description: String(b.brief || "").slice(0, 1200),
    writingHtml: String(b.writingHtml || "").slice(0, 300000), workText: String(b.workText || "").slice(0, 4000),
    codeFiles: code, codeActive: b.codeActive || "",
    codeAssets: (b.codeAssets || []).slice(0, 60).map((x) => ({ name: (x && x.name) || "", url: httpsOnly(x && x.url), type: (x && x.type) || "" })),
    images, media, coverUrl: images[0] ? images[0].url : "", previewUrl: httpsOnly(b.workUrl),
    toolsUsed: (r.tools || []).slice(0, 12), contribution: String(r.contribution || r.kept || "").slice(0, 800),
    reflection: { purpose: String(r.purpose || "").slice(0, 600), learned: String(r.learned || "").slice(0, 600) },
    contentUpdatedAt: FV().serverTimestamp()
  };
}
async function refreshShowcase(id, content) {
  const ref = admin.firestore().collection("techShowcase").doc(id);
  const s = await ref.get();
  if (!s.exists) return false;
  await ref.update(content);
  return true;
}
/* Class work: once published, the builder edits a published version (live*) so the marked
   hand-in stays as it was. The public copy shows the published version when there is one. */
const WORK_CONTENT_KEYS = ["codeFiles", "codeAssets", "codeActive", "writingHtml",
  "liveCodeFiles", "liveCodeFolders", "liveCodeAssets", "liveCodeActive", "liveWritingHtml"];
function liveWork(a) {
  if (!a || !a.liveAt) return a;
  return Object.assign({}, a, {
    codeFiles: a.liveCodeFiles || a.codeFiles, codeAssets: a.liveCodeAssets || a.codeAssets,
    codeActive: a.liveCodeActive || a.codeActive, writingHtml: a.liveWritingHtml != null ? a.liveWritingHtml : a.writingHtml
  });
}
function workShowcase(a, s) {
  const writing = a.kind === "writing";
  const where = [a.courseName, a.topicTitle].filter(Boolean).join(" · ");
  return {
    title: String(a.lessonTitle || (writing ? "My writing" : "My project")).slice(0, 160),
    description: where ? `Made in ${where} at Paisley Tech Studio.` : "Made at Paisley Tech Studio.",
    category: writing ? "WRITING" : "CODE", origin: "class", displayName: first(s && s.name, "A Paisley student"),
    codeFiles: writing ? [] : (a.codeFiles || []).slice(0, 60), codeActive: a.codeActive || "", codeAssets: writing ? [] : (a.codeAssets || []).slice(0, 60),
    writingHtml: writing ? String(a.writingHtml || "").slice(0, 200000) : "",
    images: /^https:\/\//.test(a.snapshotUrl || "") ? [{ url: a.snapshotUrl, name: "Snapshot" }] : [],
    sourceType: "lessonWork", disciplines: [], skills: [],
    publishedAt: FV().serverTimestamp()
  };
}
async function publishEvent(wid, b, a) {
  const db = admin.firestore(), sid = a.studentId, s = await techStudent(sid);
  if (!s) return;
  const st = a.publishState || "", who = s.name || "A builder", kid = first(s.name, "Your child");
  const what = a.lessonTitle || "class work", where = `${a.courseName || "Class"}${a.topicTitle ? " · " + a.topicTitle : ""}`;
  const scId = showcaseIdOf(wid), round = tsMs(a.publishRequestedAt) || tsMs(a.publishDecidedAt) || Date.now();
  const pic = /^https:\/\//.test(a.snapshotUrl || "") ? a.snapshotUrl : "";
  const extra = { studentId: sid, courseId: a.courseId || "", image: pic, workId: wid };
  if (st === "requested") {
    const line = `${who} asks to publish ${what} (${where}).`;
    const coach = s.coachId || a.coachId;
    if (coach) await techNotify(coach, "coach", "tech_publish", "Publish request", line, Object.assign({ id: `pub_${wid}_${round}`, section: "results" }, extra));
    await notifyAdmins("tech_publish", "Publish request", line, Object.assign({ id: `pub_${wid}_${round}`, section: "wall" }, extra));
    return;
  }
  if (st === "approved") {
    await db.collection("techShowcase").doc(scId).set(workShowcase(liveWork(a), s));
    const url = APP + "/tech/p/" + encodeURIComponent(scId);
    await db.collection("techLessonWork").doc(wid).update({ shareId: scId, shareUrl: url, publishedAt: FV().serverTimestamp() });
    const by = a.publishDecidedByName || "Your coach";
    const fresh = await techNotify(sid, "student", "tech_publish", "Your work is published!", `${by} approved ${what}. Share your link with friends and family.`, Object.assign({ id: `pubok_${wid}_${round}`, section: "projects", link: LINKS.student + "#projects" }, extra));
    if (fresh) await email(s.email, `Your work is published: ${what}`, {
      preheader: "Share your link with friends and family.", heading: "Your work is published!",
      intro: `Hi ${esc(first(s.name))}, ${esc(by)} approved ${esc(what)} (${esc(where)}).`,
      body: workSnapshotHtml(pic, first(s.name)) + `<p style="margin:0 0 8px;">Anyone with this link can see it. It is also in My projects, ready to copy.</p><p style="margin:0;word-break:break-all;"><a href="${esc(url)}" style="color:#245F5A;font-weight:700;">${esc(url)}</a></p>`,
      cta: { label: "Open your published work", url }
    });
    for (const g of await guardiansOf(sid)) {
      const gFresh = await techNotify(g.parentUid, "guardian", "tech_publish", `${kid}'s work is published`, `${what} (${where}) is public now. Share the link with family and friends.`, Object.assign({ id: `pubok_${wid}_${round}_${g.parentUid}`, section: "projects", link: LINKS.guardian + "#projects" }, extra));
      if (gFresh) await email(g.email, `${kid}'s work is published: share it!`, {
        preheader: `See what ${kid} made, and share it with family and friends.`, heading: `${kid}'s work is published!`,
        intro: `Hi ${esc(first(g.name))}, ${esc(by)} approved ${esc(kid)}'s ${esc(what)} (${esc(where)}) for publishing.`,
        body: workSnapshotHtml(pic, kid) + `<p style="margin:0 0 8px;">Share this link with family and friends. Only ${esc(kid)}'s first name is shown:</p><p style="margin:0 0 10px;word-break:break-all;"><a href="${esc(url)}" style="color:#245F5A;font-weight:700;">${esc(url)}</a></p><p style="margin:0;"><b>Keep encouraging them!</b> You can find this link again in Projects in the guardian portal.</p>`,
        cta: { label: `See ${kid}'s work`, url }
      });
    }
    await logActivity(sid, "work_published", `Published ${what}`, { studentName: s.name || "", by: "coach", origin: "class" });
    return;
  }
  /* declined or taken down: the public copy goes */
  await db.collection("techShowcase").doc(scId).delete().catch(() => {});
  if (b && b.shareUrl) await db.collection("techLessonWork").doc(wid).update({ shareUrl: "", shareId: "" }).catch(() => {});
  if (st === "declined") {
    const by = a.publishDecidedByName || "Your coach";
    await techNotify(sid, "student", "tech_publish", "Not published yet", `${by} looked at ${what}.${a.publishNote ? " " + String(a.publishNote).slice(0, 300) : ""} Fix it, then ask again.`, Object.assign({ id: `pubno_${wid}_${round}`, section: "results", link: LINKS.student + "#results" }, extra));
  }
}

/* Builders added to a group hear who they are working with. */
exports.onTechGroupWritten = onDocumentWritten(
  { document: "techGroups/{gid}", region: LOCATION },
  async (event) => {
    const b = event.data.before.exists ? event.data.before.data() : null;
    const a = event.data.after.exists ? event.data.after.data() : null;
    if (!a) return;
    const gid = event.params.gid, was = new Set((b && b.memberIds) || []);
    for (const uid of (a.memberIds || []).filter((x) => !was.has(x))) {
      const others = (a.members || []).filter((m) => m.id !== uid).map((m) => first(m.name));
      await techNotify(uid, "student", "tech_group", `You're in the group ${a.name || ""}`,
        others.length ? `You'll work with ${others.join(", ")}.` : "Your coach will add your teammates.",
        { studentId: uid, id: `group_${gid}_joined`, section: "groups", link: LINKS.student + "#groups" });
    }
  }
);

exports.onTechGroupTaskWritten = onDocumentWritten(
  { document: "techGroups/{gid}/tasks/{tid}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const b = event.data.before.exists ? event.data.before.data() : null;
    const a = event.data.after.exists ? event.data.after.data() : null;
    if (!a) return;
    const { gid, tid } = event.params, db = admin.firestore();
    const gs = await db.collection("techGroups").doc(gid).get();
    if (!gs.exists) return;
    const grp = gs.data(), members = grp.members || [], gname = grp.name || "your group";
    const extra = { section: "groups", link: LINKS.student + "#groups" };
    if (!b) {
      for (const m of members) {
        const s = await techStudent(m.id); if (!s) continue;
        const fresh = await techNotify(m.id, "student", "tech_group_task", `New group task: ${a.title || "task"}`, `For ${gname}. Open it to work on it together.`, Object.assign({ studentId: m.id, id: `gtask_${gid}_${tid}` }, extra));
        if (fresh) await email(s.email, `New group task for ${gname}: ${a.title || ""}`, {
          preheader: `Work on it together with ${gname}.`, heading: "A new group task.",
          intro: `Hi ${esc(first(s.name))}, ${esc(a.createdByName || "your coach")} gave ${esc(gname)} a task: “${esc(a.title || "")}”.`,
          body: `<p style="margin:0;">Open My group in your studio. Everyone in the group works in the same place and sees each other's changes live.</p>`,
          cta: { label: "Open my group", url: APP + LINKS.student + "#groups" }
        });
      }
      return;
    }
    const ev = workEvent(b, a);
    if (!ev) return;
    const round = workRound(a, ev);
    if (ev === "submitted") {
      const coach = grp.coachId || a.createdBy;
      const line = `${gname} handed in “${a.title || "a task"}”${a.submittedByName ? " (sent by " + a.submittedByName + ")" : ""}.`;
      const isCoach = !!coach && (await db.collection("techCoaches").doc(coach).get()).exists;
      if (isCoach) await techNotify(coach, "coach", "tech_work", "Group work handed in", line, { id: `gwork_${gid}_${tid}_s${round}`, section: "groups", link: LINKS.coach + "#groups" });
      else await notifyAdmins("tech_work", "Group work handed in", line, { id: `gwork_${gid}_${tid}_s${round}`, section: "groups" });
      return;
    }
    const graded = ev === "graded", what = a.title || "your group task";
    const title = graded ? `Group work marked: ${what}` : `Corrections asked: ${what}`;
    const line = `${gname}: ${graded ? "marked" : "corrections asked"}. ${markLine(a)}`.trim();
    for (const m of members) {
      const s = await techStudent(m.id); if (!s) continue;
      const fresh = await techNotify(m.id, "student", graded ? "tech_work_marked" : "tech_work_corrections", title, line, Object.assign({ studentId: m.id, id: `gwork_${gid}_${tid}_m${round}` }, extra));
      if (fresh) await email(s.email, title, {
        preheader: line, heading: graded ? "Your group's work is marked." : "Your coach asked for corrections.",
        intro: `Hi ${esc(first(s.name))}, ${esc(a.gradedByName || "your coach")} ${graded ? "marked" : "looked at"} “${esc(what)}” for ${esc(gname)}.`,
        body: workEmailBody(a), cta: { label: "Open my group", url: APP + LINKS.student + "#groups" }
      });
      for (const g of await guardiansOf(m.id)) {
        const gt = graded ? `${first(s.name)}'s group work was marked` : `Corrections asked for ${first(s.name)}'s group`;
        const gFresh = await techNotify(g.parentUid, "guardian", graded ? "tech_work_marked" : "tech_work_corrections", gt, `${gname} · ${what}. ${markLine(a)}`.trim(), { studentId: m.id, id: `gwork_${gid}_${tid}_m${round}_${m.id}`, section: "classes", link: LINKS.guardian + "#classes" });
        if (gFresh) await email(g.email, `${gt}: ${what}`, {
          preheader: line, heading: gt + ".",
          intro: `Hi ${esc(first(g.name))}, ${esc(first(s.name))} worked on “${esc(what)}” with their group ${esc(gname)}, and ${esc(a.gradedByName || "the coach")} ${graded ? "marked it" : "asked for corrections"}.`,
          body: workEmailBody(a), cta: { label: "Open the guardian portal", url: APP + LINKS.guardian + "#classes" }
        });
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
    const line = `${c.topic || "Tech Studio live class"} · ${when}${c.coachName ? ` · with ${c.coachName}` : ""}`;
    const nid = `live_${id}_${key}`;
    const mail = (name, portal) => ({
      preheader: line, heading: verb + ".",
      intro: `Hi ${esc(first(name))}, ${action === "cancelled" ? "this class has been cancelled" : action === "updated" ? "a live class has changed" : "a live class is on the timetable"}:`,
      body: `<p style="margin:0 0 6px;"><strong>${esc(c.topic || "Tech Studio live class")}</strong></p>` +
        `<p style="margin:0 0 6px;">${esc(when)}${c.durationMins ? ` · ${esc(c.durationMins)} min` : ""}${c.coachName ? ` · ${esc(c.coachName)}` : ""}</p>` +
        (c.learn ? `<p style="margin:0 0 6px;">What you will learn: ${esc(c.learn)}</p>` : "") +
        (action !== "cancelled" && c.meetUrl ? `<p style="margin:0;">Google Meet: ${esc(c.meetUrl)}</p>` : ""),
      cta: { label: action === "cancelled" ? "Open Paisley Tech Studio" : "Open the class", url: APP + portal }
    });
    for (const s of students) {
      if (s.status !== "Active") continue;
      const fresh = await techNotify(s.id, "student", "tech_live", verb, line, { studentId: s.id, classId: id, id: nid, link: LINKS.student + "#live" });
      if (fresh && s.email) await email(s.email, `${verb}: ${c.topic || "Tech Studio live class"}`, mail(s.name, LINKS.student + "#live"));
    }
    for (const g of guardians) {
      const fresh = await techNotify(g.parentUid, "guardian", "tech_live", `${verb} for ${first(g.studentName)}`, line, { studentId: g.studentId, classId: id, id: `${nid}_${g.studentId}`, link: LINKS.guardian + "#live" });
      if (fresh && g.email) await email(g.email, `${verb} for ${first(g.studentName)}: ${c.topic || "Tech Studio live class"}`, mail(g.name, LINKS.guardian + "#live"));
    }
    if (c.coachId) {
      const fresh = await techNotify(c.coachId, "coach", "tech_live", verb, line, { classId: id, id: nid, link: LINKS.coach + "#live" });
      if (fresh) await email(await coachEmail(c.coachId), `${verb}: ${c.topic || "Tech Studio live class"}`, mail(c.coachName, LINKS.coach + "#live"));
    }
    for (const ad of await adminList()) await techNotify(ad.id, "admin", "tech_live", verb, line, { classId: id, id: nid });
  }
);

/* Parent ↔ Studio Desk uses parentConversations (shared with the Parent Portal). A Tech Studio
   guardian's message raises the Tech Studio bell for admins; onParentConversationMessage
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
    await notifyAdmins("tech_desk_message", `${m.senderName || "A Tech Studio guardian"} wrote to the Studio Desk`,
      `About ${first(l.studentName, "their child")}: ${String(m.text || "").slice(0, 160)}`, { studentId: l.studentUid || "", id: `desk_${event.params.mid}`, link: "/admin#tech" });
  }
);

/* =========================================================
   Chats
========================================================= */
const CHAT_EMAIL_GAP_MS = 15 * 60 * 1000;
/* One email per burst of messages, however long the conversation runs. */
async function chatEmailDue(chatRef, chat, field) {
  const last = chat[field] && chat[field].toDate ? chat[field].toDate().getTime() : 0;
  if (Date.now() - last < CHAT_EMAIL_GAP_MS) return false;
  await chatRef.set({ [field]: FV().serverTimestamp() }, { merge: true });
  return true;
}
/* Pictures and files sent with a chat message (only https download links are kept). */
function chatAttachments(m) {
  return (Array.isArray(m && m.attachments) ? m.attachments : [])
    .filter((a) => a && /^https:\/\//.test(a.url || "")).slice(0, 10)
    .map((a) => ({ name: String(a.name || "File").slice(0, 160), url: String(a.url), type: String(a.type || "") }));
}
function chatPreview(m) {
  const text = String((m && m.text) || "").trim();
  if (text) return text.slice(0, 200);
  const atts = chatAttachments(m), pics = atts.filter((a) => /^image\//.test(a.type)).length, files = atts.length - pics;
  const parts = [];
  if (pics) parts.push(pics === 1 ? "a picture" : `${pics} pictures`);
  if (files) parts.push(files === 1 ? "a file" : `${files} files`);
  return parts.length ? `Sent ${parts.join(" and ")}` : "";
}
/* Email body for one chat message: the words, then each picture / file as a link. */
function chatMessageBody(m) {
  const text = String((m && m.text) || "").trim();
  const atts = chatAttachments(m);
  let html = text ? `<p style="margin:0;white-space:pre-wrap;">${esc(text.slice(0, 1500))}</p>` : "";
  if (atts.length) {
    html += `<p style="margin:${text ? "12px" : "0"} 0 0;">` + atts.map((a) => /^image\//.test(a.type)
      ? `<a href="${esc(a.url)}" style="display:inline-block;margin:0 6px 6px 0;"><img src="${esc(a.url)}" alt="${esc(a.name)}" width="180" style="display:block;max-width:180px;border:1px solid #e3ebe9;border-radius:8px;"></a>`
      : `<a href="${esc(a.url)}" style="display:inline-block;margin:0 6px 6px 0;color:#245F5A;font-weight:700;">${esc(a.name)}</a>`).join("") + "</p>";
  }
  return html || `<p style="margin:0;">(empty message)</p>`;
}
exports.onTechMessageCreated = onDocumentCreated(
  { document: "techChats/{chatId}/messages/{mid}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const m = event.data.data() || {};
    const chatRef = admin.firestore().collection("techChats").doc(event.params.chatId);
    const c = (await chatRef.get()).data() || {};
    const coachId = c.coachId || c.tutorId, coachName = c.coachName || c.tutorName;
    const extra = { studentId: c.studentId, chatId: event.params.chatId, id: `chat_${event.params.mid}` };
    const preview = chatPreview(m);
    if (m.senderRole === "student") {
      const fresh = await techNotify(coachId, "coach", "tech_message", `Message from ${c.studentName || "a builder"}`, preview, extra);
      if (fresh && await chatEmailDue(chatRef, c, "emailedCoachAt")) {
        await email(await coachEmail(coachId), `Message from ${c.studentName || "a builder"}`, {
          preheader: preview, heading: "New message from a builder", intro: `${esc(c.studentName || "A builder")} wrote:`,
          body: chatMessageBody(m),
          cta: { label: "Reply in the coach portal", url: APP + LINKS.coach + "#messages" }
        });
      }
      return;
    }
    const from = m.senderRole === "admin" ? "the Studio Desk" : (coachName || "your coach");
    const fresh = await techNotify(c.studentId, "student", "tech_message", `Message from ${from}`, preview, extra);
    if (m.senderRole === "admin") await techNotify(coachId, "coach", "tech_message", "Studio Desk joined a builder chat", preview, extra);
    /* "Also email this reply" (coach / Studio Desk): sent now, outside the once-per-burst limit.
       `fresh` still guards it, so a retried trigger never emails twice. */
    const asked = m.emailIt === true && (m.senderRole === "coach" || m.senderRole === "admin");
    if (fresh && (asked || await chatEmailDue(chatRef, c, "emailedStudentAt"))) {
      if (asked) await chatRef.set({ emailedStudentAt: FV().serverTimestamp() }, { merge: true });
      const st = await techStudent(c.studentId);
      if (st && st.email) {
        await email(st.email, `New message from ${from}`, {
          preheader: preview, heading: "You have a new message", intro: `Hi ${esc(first(st.name))}, ${esc(from)} wrote:`,
          body: chatMessageBody(m),
          cta: { label: "Reply in Tech Studio", url: APP + LINKS.student + "#coach" }
        });
      }
    }
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
    const preview = chatPreview(m);
    const child = first(c.studentName, "their child");

    if (m.senderRole === "guardian") {
      if (coachId) {
        await techNotify(coachId, "coach", "tech_guardian_message", `${c.parentName || "A guardian"} (${child}'s family)`, preview, extra);
        await email(await coachEmail(coachId), `Message from ${c.parentName || "a guardian"} about ${child}`, {
          preheader: preview, heading: "Message from a guardian", intro: `${esc(c.parentName || "A guardian")} wrote about ${esc(child)}:`,
          body: chatMessageBody(m),
          cta: { label: "Reply in the coach dashboard", url: APP + LINKS.coach }
        });
      } else {
        await notifyAdmins("tech_guardian_message", `Guardian message (no coach yet)`, `${c.parentName || "A guardian"} about ${child}: ${preview}`, extra);
      }
      return;
    }
    const from = m.senderRole === "admin" ? "Paisley Tech Studio" : (m.senderName || "Your child's coach");
    await techNotify(c.parentUid, "guardian", "tech_guardian_message", `Message from ${from}`, preview, extra);
    const p = await db.collection("parentAccounts").doc(c.parentUid).get();
    if (p.exists) {
      await email(p.data().email, `${from} replied about ${child}`, {
        preheader: preview, heading: "New message", intro: `${esc(from)} wrote about ${esc(child)}:`,
        body: chatMessageBody(m),
        cta: { label: "Open the Tech Studio guardian portal", url: APP + LINKS.guardian }
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

/* Studio Desk nudge: email one side of a chat (and ring their bell) that the conversation
   is waiting, with the last few messages. Admins only; coaches and builders cannot nudge.
   data: { kind: 'builder' | 'guardian', chatId, to: 'student' | 'guardian' | 'coach', note } */
exports.nudgeTechChat = onCall(
  { cors: true, region: LOCATION, secrets: SMTP_SECRETS },
  async (request) => {
    await requireAdmin(request);
    const d = request.data || {};
    const guardian = d.kind === "guardian", to = String(d.to || "");
    const chatId = String(d.chatId || "");
    if (!/^[\w-]+_[\w-]+$/.test(chatId)) throw new HttpsError("invalid-argument", "Which conversation?");
    if (!(guardian ? ["guardian", "coach"] : ["student", "coach"]).includes(to)) throw new HttpsError("invalid-argument", "Who should be nudged?");
    const db = admin.firestore();
    const chatRef = db.collection(guardian ? "techGuardianChats" : "techChats").doc(chatId);
    const snap = await chatRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "That conversation no longer exists.");
    const c = snap.data();
    const coachId = c.coachId || c.tutorId || "";
    const note = String(d.note || "").trim().slice(0, 600);

    let recipientId = "", recipientRole = to, mail = "", name = "", link = "";
    if (to === "coach") {
      if (!coachId) throw new HttpsError("failed-precondition", "This conversation has no coach yet.");
      recipientId = coachId; mail = await coachEmail(coachId);
      const cd = await db.collection("techCoaches").doc(coachId).get();
      name = (cd.exists && cd.data().name) || c.coachName || "";
      link = APP + LINKS.coach + "#messages";
    } else if (to === "student") {
      const st = await techStudent(c.studentId);
      recipientId = c.studentId; mail = (st && st.email) || ""; name = (st && st.name) || c.studentName || "";
      link = APP + LINKS.student + "#coach";
    } else {
      const p = await db.collection("parentAccounts").doc(c.parentUid).get();
      recipientId = c.parentUid; mail = p.exists ? (p.data().email || "") : ""; name = (p.exists && p.data().name) || c.parentName || "";
      link = APP + LINKS.guardian;
    }

    const recent = (await chatRef.collection("messages").orderBy("createdAt", "desc").limit(5).get()).docs.map((x) => x.data()).reverse();
    const who = (m) => (m.senderRole === "admin" ? "Studio Desk" : (m.senderName || ({ student: c.studentName, coach: c.coachName, guardian: c.parentName })[m.senderRole] || "Someone"));
    const about = guardian ? `${first(c.studentName, "your child")}'s Tech Studio` : (to === "coach" ? first(c.studentName, "a builder") : "your coach");
    const title = to === "coach"
      ? (guardian ? `${c.parentName || "A family"} is waiting for your reply` : `${c.studentName || "A builder"} is waiting for your reply`)
      : `You have messages waiting about ${about}`;
    const rows = recent.length
      ? recent.map((m) => `<tr><td style="padding:8px 0;border-top:1px solid #e3ebe9;"><strong style="font-size:13px;">${esc(who(m))}</strong><div style="font-size:14px;white-space:pre-wrap;margin-top:2px;">${esc(chatPreview(m))}</div></td></tr>`).join("")
      : `<tr><td style="padding:8px 0;">No messages yet.</td></tr>`;

    await techNotify(recipientId, recipientRole, guardian ? "tech_guardian_message" : "tech_message", title,
      note || "The Studio Desk asked you to look at this conversation.", { studentId: c.studentId, chatId, id: `nudge_${chatId}_${Date.now()}` });
    const emailed = await email(mail, title, {
      preheader: note || "Please open the conversation and reply.",
      heading: "A conversation is waiting for you",
      intro: `Hi ${esc(first(name))}, the Studio Desk would like you to read and reply to this conversation.`,
      body: (note ? `<p style="margin:0 0 12px;white-space:pre-wrap;"><strong>Note from the Studio Desk:</strong> ${esc(note)}</p>` : "") +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>`,
      cta: { label: "Open the conversation", url: link }
    });
    await chatRef.set({ [`nudged_${to}At`]: FV().serverTimestamp() }, { merge: true });
    return { emailed: !!emailed, to };
  }
);

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
    /* One login can hold several roles. The only bar is a child: an under-18 builder cannot coach. */
    const asBuilder = await db.collection("techStudents").doc(uid).get();
    if (asBuilder.exists && asBuilder.data().ageGroup === "under18") throw new HttpsError("failed-precondition", "That email belongs to an under-18 Tech Studio builder, who cannot be a coach.");
    const ref = db.collection("techCoaches").doc(uid);
    const prev = await ref.get(), existed = prev.exists, wasApplicant = existed && prev.data().status === "Pending";
    const slug = (existed && prev.data().slug) || await claimCoachSlug(db, uid, d.slug || name, { name, email: mail, status: "Active" });
    await ref.set({
      slug,
      name, email: mail, phone: String(d.phone || "").trim().slice(0, 40),
      disciplines: normDisciplines(Array.isArray(d.disciplines) ? d.disciplines : []),
      bio: String(d.bio || "").slice(0, 600), status: "Active", updatedAt: FV().serverTimestamp(),
      ...(existed ? {} : { createdAt: FV().serverTimestamp(), createdBy: request.auth.uid })
    }, { merge: true });

    let emailSent = false;
    if (created) {
      let link = null;
      try { link = await admin.auth().generatePasswordResetLink(mail, notifications.actionSettings("techCoach")); } catch (e) { console.warn("coach reset link failed:", e.message); }
      if (link) emailSent = await email(mail, "Your Paisley Tech Studio coach account", {
        preheader: "Set your password to start coaching.", heading: "Welcome, coach.", intro: `Hi ${esc(first(name))}, you're now a Paisley Tech Studio coach.`,
        body: `<p style="margin:0;">Choose a password, then sign in to review builds, message your builders and their families, and publish missions.</p>`,
        cta: { label: "Set my password", url: link }
      });
    } else if (!existed || wasApplicant) {
      emailSent = await email(mail, "You're now a Paisley Tech Studio coach", {
        preheader: "Use your existing Paisley login.", heading: "Welcome, coach.", intro: `Hi ${esc(first(name))}, you're now a Paisley Tech Studio coach.`,
        body: `<p style="margin:0;">Sign in to the Tech Studio coach portal with your existing Paisley email and password.</p>`,
        cta: { label: "Open your coach link", url: APP + "/tech/coach/" + slug }
      });
    }
    return { uid, created, emailSent, slug };
  }
);

/* Someone applied to coach: tell the Studio Desk. */
exports.onTechCoachApplied = onDocumentCreated(
  { document: "techCoaches/{uid}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const c = (event.data && event.data.data()) || {};
    if (c.status !== "Pending") return;
    const msg = `${c.name || c.email || "Someone"} applied to be a Tech Studio coach.`;
    await notifyAdmins("tech_coach_applied", "New coach application", msg, { id: `coach_applied_${event.params.uid}`, section: "coaches" }, {
      subject: `Coach application: ${c.name || c.email || ""}`,
      opts: {
        preheader: msg, heading: "New coach application.", intro: esc(msg),
        body: `<p style="margin:0;">${esc(c.email || "")}${c.bio ? " · " + esc(c.bio) : ""}</p>`,
        cta: { label: "Review it in Coaches", url: PORTALS.admin + "#tech" }
      }
    });
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
    if (!snap.exists) throw new HttpsError("not-found", "Tech Studio builder not found.");
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

/* Admit Paisley students to Tech Studio (Admin > Tech Studio > Paisley students).
   They keep their login: techStudents/{uid} is added to the same account, Active
   straight away, with the level (and coach) the Studio Desk chose. onTechEnrolmentUpdated
   then welcomes them ("congratulations, sign in with the login you already have") and links
   their Parent Portal parents, who are told about the new Tech Studio button.
   data: { studentIds: [uid], skillLevel, coachId } */
exports.admitToTechStudio = onCall(
  { cors: true, region: LOCATION, timeoutSeconds: 300 },
  async (request) => {
    await requireAdmin(request);
    const d = request.data || {}, db = admin.firestore();
    const ids = Array.from(new Set((Array.isArray(d.studentIds) ? d.studentIds : [d.studentId]).map((x) => String(x || "").trim()).filter(Boolean)));
    if (!ids.length) throw new HttpsError("invalid-argument", "Choose at least one student.");
    if (ids.length > 50) throw new HttpsError("invalid-argument", "Admit at most 50 students at a time.");
    const skillLevel = String(d.skillLevel || "");
    if (!SKILL_LABEL[skillLevel]) throw new HttpsError("invalid-argument", "Choose a level: Beginner, Intermediate or Expert.");
    let coachId = String(d.coachId || ""), coachName = "";
    if (coachId) {
      const c = await db.collection("techCoaches").doc(coachId).get();
      if (!c.exists || c.data().status !== "Active") throw new HttpsError("failed-precondition", "That coach is not active.");
      coachName = c.data().name || "";
    }
    const adminSnap = await db.collection("admins").doc(request.auth.uid).get();
    const byName = (adminSnap.exists && adminSnap.data().name) || "Studio Desk";
    const results = [];
    for (const id of ids) {
      try {
        const st = await db.collection("students").doc(id).get();
        if (!st.exists) { results.push({ id, ok: false, reason: "Not a Paisley student." }); continue; }
        const s = st.data() || {};
        if (s.studentType === "tech") { results.push({ id, name: s.name || "", ok: false, reason: "An old Tech Studio record. Use the migration on the Builders page." }); continue; }
        const ref = db.collection("techStudents").doc(id), cur = await ref.get();
        if (cur.exists && cur.data().status === "Active") { results.push({ id, name: s.name || "", ok: false, reason: "Already in Tech Studio." }); continue; }
        let mail = String(s.email || "").trim();
        if (!mail) { try { mail = (await admin.auth().getUser(id)).email || ""; } catch (e) { /* no auth user */ } }
        if (!mail) { results.push({ id, name: s.name || "", ok: false, reason: "No email or login on this student." }); continue; }
        const from = s.studentType === "tuition" ? "CBC tuition" : s.studentType === "remote" ? "Remote" : "Online";
        const base = {
          name: String(s.name || "").slice(0, 80), email: mail.slice(0, 120), phone: String(s.phone || "").slice(0, 30),
          skillLevel, admittedBy: request.auth.uid, admittedByName: byName, admittedFrom: from, admittedAt: FV().serverTimestamp(),
          updatedAt: FV().serverTimestamp()
        };
        if (cur.exists) await ref.set(base, { merge: true });
        else await ref.set(Object.assign({ status: "Pending", techProfile: { identity: "student", interests: [] }, createdAt: FV().serverTimestamp() }, base));
        /* Pending -> Active is what onTechEnrolmentUpdated welcomes (once, welcomedAt). */
        await ref.update({ status: "Active", coachId: coachId || (cur.exists ? (cur.data().coachId || "") : ""), coachName: coachId ? coachName : (cur.exists ? (cur.data().coachName || "") : ""), activatedAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() });
        results.push({ id, name: s.name || "", ok: true });
      } catch (e) {
        console.error("admitToTechStudio", id, e);
        results.push({ id, ok: false, reason: e.message || "Could not admit." });
      }
    }
    return { results, admitted: results.filter((r) => r.ok).length };
  }
);

/* One-off, idempotent move of legacy Tech Studio data:
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
  const titleBase = build ? `${build.title || "Untitled build"} — built with Paisley Tech Studio` : "Paisley Tech Studio | Digital Creator Studio";
  const descBase = build
    ? `Built by ${build.displayName || "a Paisley student"}. ${String(build.brief || "").slice(0, 160)}`
    : "Learn what you can do with AI.";
  const safeTitle = allowed ? titleBase : "Paisley Tech Studio | Digital Creator Studio";
  const safeDesc = allowed ? descBase : "Learn what you can do with AI.";

  res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  if (!allowed) {
    res.status(404).send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Not available</title>
<meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${esc(APP + "/tech")}"></head>
<body><p>This build is not available publicly. <a href="${esc(APP + "/tech")}">Open Paisley Tech Studio</a>.</p></body></html>`);
    return;
  }
  res.status(200).send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(safeTitle)}</title>
<meta name="description" content="${esc(safeDesc)}"><meta property="og:title" content="${esc(safeTitle)}"><meta property="og:description" content="${esc(safeDesc)}">
<meta property="og:type" content="website"><meta property="og:url" content="${esc(dest)}"><meta property="og:site_name" content="Paisley Studio">
<meta property="og:image" content="https://aws-filez.s3.eu-north-1.amazonaws.com/cropped-Paisely-logo-Resized.png"><meta name="twitter:card" content="summary">
${isPublic ? "" : '<meta name="robots" content="noindex">'}
<meta http-equiv="refresh" content="0;url=${esc(dest)}${token ? (dest.indexOf("?") === -1 ? "?t=" : "&t=") + encodeURIComponent(token) : ""}"></head><body><p><a href="${esc(dest)}">Open this build on Paisley Tech Studio</a></p></body></html>`);
});

/* Helper export used by other modules if they ever need to mint a token. */
exports._mintShareToken = async function mintShareToken(buildId, createdBy) {
  const token = crypto.randomBytes(18).toString("base64url");
  await admin.firestore().collection("shareTokens").doc(buildId).set({
    token, createdBy: createdBy || "system", revoked: false, createdAt: FV().serverTimestamp()
  }, { merge: true });
  return token;
};

exports._internals = { LINKS, TECH_LEVELS, TECH_DISCIPLINES, normDisciplines, disciplineLabel, techNotify, CONTENT_SECTION, gradeTechQuiz, trackOf, tracksFor, workEvent, lessonTitle, lessonGate, gateMet, handedIn, workCleared, workSnapshotHtml, classPassed, byCourse, hasVideo, workShowcase, showcaseIdOf, buildShowcaseContent, liveWork, changedAny, BUILD_CONTENT_KEYS, WORK_CONTENT_KEYS };
