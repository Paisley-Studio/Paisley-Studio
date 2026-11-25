/* Developer mode: the freeze holds notifications and emails while the desk tests
   (functions/dev-freeze.js, dev-mode.js). Run: cd functions && npm test */
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "paisley-test";
const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: "paisley-test" });
const F = require("../dev-freeze");

const HOUR = 3600 * 1000;
const base = () => ({
  on: true, until: null,
  areas: { classes: true, homework: true, exams: true, tech: true },
  audiences: { students: true, parents: true, tutors: false, coaches: true },
  allow: [{ uid: "testKid", email: "kid@test.example", name: "Test Kid", role: "student" }, { uid: "testMum", email: "Mum@Test.example", role: "parent" }]
});

test("nothing is held while the freeze is off or past its end", () => {
  const c = base();
  assert.equal(F.decide(Object.assign(c, { on: false }), { uid: "a", role: "student" }, "classes"), false);
  const ended = Object.assign(base(), { until: new Date(Date.now() - HOUR) });
  assert.equal(F.decide(ended, { uid: "a", role: "student" }, "classes"), false);
  const later = Object.assign(base(), { until: new Date(Date.now() + HOUR) });
  assert.equal(F.decide(later, { uid: "a", role: "student" }, "classes"), true);
});

test("held: frozen people in frozen areas; never admins or picked test accounts", () => {
  const c = base();
  assert.equal(F.decide(c, { uid: "a", role: "student" }, "homework"), true);
  assert.equal(F.decide(c, { uid: "p", role: "parent" }, "exams"), true);
  assert.equal(F.decide(c, { uid: "g", role: "guardian" }, "tech"), true, "tech guardians are parents");
  assert.equal(F.decide(c, { uid: "t", role: "tutor" }, "homework"), false, "tutors not frozen here");
  assert.equal(F.decide(c, { uid: "a", role: "student" }, "attendance"), false, "attendance not frozen here");
  assert.equal(F.decide(c, { uid: "x", role: "admin" }, "classes"), false);
  assert.equal(F.decide(c, { uid: "testKid", role: "student" }, "classes"), false);
  assert.equal(F.decide(c, { email: "mum@test.example", role: "parent" }, "classes"), false, "emails match without case");
  assert.equal(F.decide(c, { email: "who@else.example", role: "" }, "classes"), true, "someone unknown is held when anyone is");
});

test("areas come from the running function, or the notification type", () => {
  assert.equal(F.areaOfFunction("onTechPracticeWritten"), "tech");
  assert.equal(F.areaOfFunction("ontechpracticewritten"), "tech", "K_SERVICE is lower case");
  assert.equal(F.areaOfFunction("homeworkDeadlineReminder"), "homework");
  assert.equal(F.areaOfFunction("onLessonSubmissionWritten"), "homework");
  assert.equal(F.areaOfFunction("examReminderToParents"), "exams");
  assert.equal(F.areaOfFunction("onLiveClassScheduled"), "live");
  assert.equal(F.areaOfFunction("onTutorChatMessageCreated"), "messages");
  assert.equal(F.areaOfFunction("onAttendanceNotificationCreated"), "attendance");
  assert.equal(F.areaOfFunction("onTuitionRequestCreated"), "tuition");
  assert.equal(F.areaOfFunction("sendParentNewsletter"), "newsletter");
  assert.equal(F.areaOfFunction("onStudentActivated"), "accounts");
  assert.equal(F.areaOfFunction("publishClassroomContent"), "classes");
  assert.equal(F.areaOfType("exam_posted", "personalNotifications"), "exams");
  assert.equal(F.areaOfType("homework_assigned", "personalNotifications"), "homework");
  assert.equal(F.areaOfType("lesson_posted", "personalNotifications"), "classes");
  assert.equal(F.areaOfType("class_scheduled", "personalNotifications"), "live");
  assert.equal(F.areaOfType("anything", "techNotifications"), "tech");
});

test("a held notification is logged with what it would have said", async () => {
  const log = [];
  F._setRecorder((kind, info) => { log.push(Object.assign({ kind }, info)); });
  F._setConfig(base());
  try {
    assert.equal(await F.holdNotification("personalNotifications", "a", "student", { type: "exam_posted", title: "New exam available" }), true);
    assert.equal(await F.holdNotification("personalNotifications", "testKid", "student", { type: "exam_posted", title: "x" }), false);
    assert.equal(await F.holdNotification("personalNotifications", "t1", "tutor", { type: "exam_posted", title: "x" }), false);
    assert.equal(log.length, 1);
    assert.equal(log[0].area, "exams"); assert.equal(log[0].title, "New exam available"); assert.equal(log[0].recipientId, "a");
  } finally { F._setRecorder(null); F._setConfig(); }
});

test("emails: held for frozen people, sent to test accounts and admins", async () => {
  const log = [];
  F._setRecorder((kind, info) => { log.push(Object.assign({ kind }, info)); });
  F._setConfig(base());
  const now = Date.now();
  F._whoCache.set("someone@family.example", { at: now, who: { email: "someone@family.example", role: "parent", uid: "p9" } });
  F._whoCache.set("boss@paisley.example", { at: now, who: { email: "boss@paisley.example", role: "admin", uid: "ad", admin: true } });
  F._whoCache.set("teacher@paisley.example", { at: now, who: { email: "teacher@paisley.example", role: "tutor", uid: "t1" } });
  try {
    assert.equal(await F.holdEmail("someone@family.example", "New homework", "homework"), true);
    assert.equal(await F.holdEmail("kid@test.example", "New homework", "homework"), false, "test account");
    assert.equal(await F.holdEmail("boss@paisley.example", "New homework", "homework"), false, "admin");
    assert.equal(await F.holdEmail("teacher@paisley.example", "New homework", "homework"), false, "tutors not frozen");
    assert.equal(await F.holdEmail("someone@family.example", "Strike", "attendance"), false, "area not frozen");
    assert.equal(await F.holdEmail("someone@family.example, boss@paisley.example", "x", "homework"), false, "one real recipient: it goes");
    assert.equal(log.length, 1); assert.equal(log[0].kind, "email"); assert.equal(log[0].subject, "New homework");
  } finally { F._setRecorder(null); F._setConfig(); F._whoCache.clear(); }
});

test("the safety net removes a held notification written elsewhere and keeps the rest", async () => {
  const { safetyNet } = require("../dev-mode")._test;
  const log = [];
  F._setRecorder((kind, info) => { log.push(info); });
  F._setConfig(base());
  const snap = (d) => { const s = { deleted: false, data: () => d }; s.ref = { delete: async () => { s.deleted = true; } }; return s; };
  try {
    const held = snap({ recipientId: "a", recipientType: "student", type: "material_posted", title: "New lesson" });
    assert.deepEqual(await safetyNet("personalNotifications", held), { held: true }); assert.equal(held.deleted, true);
    const checked = snap({ recipientId: "a", recipientType: "student", type: "material_posted", freezeChecked: true });
    await safetyNet("personalNotifications", checked); assert.equal(checked.deleted, false);
    const kid = snap({ recipientId: "testKid", recipientType: "student", type: "material_posted" });
    await safetyNet("personalNotifications", kid); assert.equal(kid.deleted, false);
    const guardian = snap({ recipientId: "g", recipientRole: "guardian", type: "lesson_posted" });
    await safetyNet("techNotifications", guardian); assert.equal(guardian.deleted, true);
    assert.equal(log.length, 2); assert.equal(log[0].caught, true);
    F._setConfig(Object.assign(base(), { on: false }));
    const off = snap({ recipientId: "a", recipientType: "student", type: "material_posted" });
    await safetyNet("personalNotifications", off); assert.equal(off.deleted, false);
  } finally { F._setRecorder(null); F._setConfig(); }
});
