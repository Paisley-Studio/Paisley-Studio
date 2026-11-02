// Run: cd functions && npm test
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "paisley-test";
const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { templates, render, programmeLine, PORTALS } = require("../email-templates");

const TECH = { name: "Amina Otieno", email: "amina@x.com", studentType: "tech" };
const CBC = { name: "Brian Mwangi", email: "brian@x.com", studentType: "tuition", year: 7, keyStage: "Junior School" };
const IGCSE = { name: "Chloe Njeri", email: "chloe@x.com", keyStage: "Key Stage 4 (Years 10-11) — IGCSE", year: 10 };

test("no email anywhere still says British Curriculum or Homeschooling", () => {
  const item = { title: "T", subjectName: "Maths" }, due = new Date();
  const all = [
    templates.studentApproved({ student: CBC }),
    templates.techStudentApproved({ student: TECH }),
    templates.workPosted({ student: CBC, kind: "assignment", item, dueAt: due }),
    templates.homeworkGraded({ audience: "student", student: IGCSE, kind: "homework", item, submission: { grade: 1 } }),
    templates.tutorWelcome({ tutor: { name: "T", email: "t@x.com" } }),
    templates.parentNewMessage({ parentName: "P", student: TECH })
  ];
  all.forEach((m) => assert.doesNotMatch(m.html, /British Curriculum|Homeschool/i));
});

test("a Tech Studio email never mentions a school programme", () => {
  const m = templates.techStudentApproved({ student: TECH, coachName: "Sam" });
  assert.doesNotMatch(m.html + m.subject, /IGCSE|CBC|Key Stage|A-Level/i);
  assert.match(m.subject, /Congratulations Amina/);
  assert.match(m.html, /Paisley Tech Studio/);
});

test("the Tech Studio approval email carries the sign-in details", () => {
  const { html } = templates.techStudentApproved({ student: TECH });
  assert.ok(html.includes("amina@x.com"));
  assert.ok(html.includes(PORTALS.tech));
  assert.match(html, /Password/);
});

test("a CBC approval speaks CBC, not IGCSE or Key Stage", () => {
  const m = templates.studentApproved({ student: CBC });
  assert.match(m.html, /CBC/);
  assert.match(m.html, /Grade 7/);
  assert.doesNotMatch(m.html + m.subject, /IGCSE|Key Stage|Tech Studio/);
  assert.ok(m.html.includes(PORTALS.tuition));
});

test("an IGCSE approval does not say CBC or Tech Studio", () => {
  const m = templates.studentApproved({ student: IGCSE });
  assert.match(m.html, /IGCSE/);
  assert.doesNotMatch(m.html, /CBC|Tech Studio/);
});

test("a Tech Studio family's Studio Desk reply points at the guardian portal", () => {
  const { html } = templates.parentNewMessage({ parentName: "P", student: TECH });
  assert.ok(html.includes(PORTALS.techParent));
  assert.doesNotMatch(html, new RegExp(PORTALS.parent.replace(/[.\/]/g, "\\$&") + '"'));
});

test("the report PDF line follows the programme", () => {
  assert.equal(programmeLine(CBC), "Paisley Studio - CBC tuition");
  assert.doesNotMatch(programmeLine(IGCSE), /British/);
});

test("emails use no icon font (mail clients strip it)", () => {
  const { html } = templates.workPosted({ student: CBC, kind: "exam", item: { title: "T" }, dueAt: new Date() });
  assert.doesNotMatch(html, /font-awesome|class="fas/);
  assert.doesNotMatch(render({ heading: "x" }), /British/);
});

/* ---------- notification ids ---------- */
function fakeNotifications() {
  const docs = new Map();
  const col = {
    doc: (id) => ({
      create: async (d) => {
        if (docs.has(id)) { const e = new Error("already exists"); e.code = 6; throw e; }
        docs.set(id, d);
      }
    }),
    add: async (d) => { docs.set("auto" + docs.size, d); }
  };
  return { docs, firestore: () => ({ collection: () => col }) };
}
const withFake = async (fake, fn) => {
  Object.defineProperty(admin, "firestore", { configurable: true, value: Object.assign(fake.firestore, { FieldValue: { serverTimestamp: () => 1 } }) });
  try { return await fn(); } finally { delete admin.firestore; }
};

test("two different events for one person are two notifications, not a collision", async () => {
  const { techNotify } = require("../tech")._internals;
  const fake = fakeNotifications();
  await withFake(fake, async () => {
    // Same length, no letter w: the old pattern turned both of these into the same id.
    assert.equal(await techNotify("kid1", "student", "tech_mission", "A", "m", { id: "mission_abcde12345" }), true);
    assert.equal(await techNotify("kid1", "student", "tech_mission", "B", "m", { id: "mission_fghij67890" }), true);
  });
  assert.equal(fake.docs.size, 2);
});

test("the same event retried is still one notification", async () => {
  const { techNotify } = require("../tech")._internals;
  const fake = fakeNotifications();
  await withFake(fake, async () => {
    assert.equal(await techNotify("kid1", "student", "tech_feedback", "A", "m", { id: "fb_abc" }), true);
    assert.equal(await techNotify("kid1", "student", "tech_feedback", "A", "m", { id: "fb_abc" }), false);
  });
  assert.equal(fake.docs.size, 1);
});

test("every kind of posted item has a tab to count on", () => {
  const { CONTENT_SECTION } = require("../tech")._internals;
  ["mission", "challenge", "path", "topic", "resource", "template", "tool", "aiTool"].forEach((k) => assert.ok(CONTENT_SECTION[k], k));
});
