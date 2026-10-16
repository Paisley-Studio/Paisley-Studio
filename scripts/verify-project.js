// Static verification of the Remote Students upgrade. Run from the project root:  node scripts/verify-project.js
// These are structural checks only — they do NOT replace testing against Firebase (see REMOTE_UPGRADE.md).
const fs = require("fs"), path = require("path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
let fail = 0;
const ok = (name, cond, extra) => { console.log((cond ? "PASS " : "FAIL ") + name + (extra ? "  (" + extra + ")" : "")); if (!cond) fail++; };

// 1-2, 7-9, 27: admin navigation
const admin = read("admin/index.html");
const nav = [...admin.matchAll(/<button class="nav-item[^"]*" data-view="([a-z]+)"/g)].map((m) => m[1]);
const baseline = ["dashboard", "studentmgmt", "classroom", "hwmgmt", "exmgmt", "content", "liveclasses", "enrolments", "tutors", "messages", "tickets", "newsletter", "keystages", "settings"];
const added = nav.filter((n) => baseline.indexOf(n) === -1);
ok("Admin nav: the ONLY new item is Remote Students", added.length === 1 && added[0] === "remotestudents", "added: " + added.join(","));
ok("Admin nav: every original item still present", baseline.every((n) => nav.indexOf(n) !== -1));
ok("Admin nav: no content/publishing/curriculum nav item", !/data-view="(content-?management|publishing|curriculum|contentprep|publishcentre|remoteclassroom|remotehomework)"/i.test(admin));
ok("Admin nav: no forbidden nav labels", !/nav-item[^>]*>[^<]*<i[^>]*><\/i>\s*(Content Management|Central Publishing|Curriculum Preparation|Content Preparation|Publishing Centre|Remote Classroom|Remote Homework)/i.test(admin));
ok("Publishing lives inside Classroom (Publish tab + per-classroom button)", /data-v="publish"/.test(read("js/classroom/classroom-helpers.js")) && /data-a="publish-class"/.test(read("js/classroom/classroom-helpers.js")));

// 11: four publish options
const pub = read("js/classroom/publish-helpers.js");
["Post to All", "Post to Tutors", "Post to Online Students", "Post to Remote Students"].forEach((l) => ok("Publish option: " + l, pub.indexOf("label: '" + l + "'") !== -1));

// 16: tutors cannot create — UI and rules
const wh = read("js/classroom/work-helpers.js"), ch = read("js/classroom/classroom-helpers.js");
ok("Tutor UI: no assignment creation control for tutors", /isAdmin && !opts\.audience \? '<div class="cr-actions"><button[^']*add-assignment/.test(wh) && !/Post Assignment/.test(ch.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
ok("Tutor UI: canEdit is admin only", /function canEdit\(it\) \{ return isAdmin; \}/.test(wh));
const rules = read("firestore.rules");
ok("Rules: assignments create/update/delete admin-only", /match \/assignments\/\{aid\} \{[\s\S]*?allow create, update, delete: if isAdmin\(\);/.test(rules));
const block = (name) => { const i = rules.indexOf("match /" + name + "/{id} {"); return i < 0 ? "" : rules.slice(i, rules.indexOf("\n    }\n", i)).replace(/\/\/.*$/gm, ""); };
ok("Rules: tutors cannot create/modify top-level homework, exams, notes", ["homework", "exams", "notes"].every((n) => /allow create: if isAdmin\(\);/.test(block(n)) && /allow update, delete: if isAdmin\(\);/.test(block(n)) && !/isTutor\(\) &&\s*resource/.test(block(n)) ));
ok("Rules: studentType cannot be self-assigned", /!\('studentType' in request\.resource\.data\)/.test(rules) && /!\('studentType' in request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\)/.test(rules));
ok("Rules: audiences enforced on lessons/assignments/exams", /studentSeesLesson\(cid\)/.test(rules) && /studentSeesWork\(cid\)/.test(rules) && /studentSeesExam\(cid\)/.test(rules) && /tutorSeesPosted\(cid\)/.test(rules));
ok("Rules: parent access split by student type", /parentSlotOnline/.test(rules) && /parentSlotRemote/.test(rules));
ok("Rules: no unrestricted allow-all", !/allow (read, write|write|read)\s*:\s*if\s+true/.test(rules));
const st = read("storage.rules");
ok("Storage: tutors cannot upload curriculum files", /allow create, update: if isAdmin\(\) && classFileOk\(\);/.test(st));

// remote portal + hosting
["remote/index.html", "remote/dashboard.html", "js/admin/remote-students.js", "js/classroom/publish-helpers.js", "functions/publishing.js", "functions/remote.js"].forEach((f) => ok("File exists: " + f, fs.existsSync(path.join(__dirname, "..", f))));
const fb = JSON.parse(read("firebase.json")), rw = fb.hosting.rewrites.map((r) => r.source);
ok("Hosting: /remote and /remote/dashboard routed", rw.indexOf("/remote") !== -1 && rw.indexOf("/remote/dashboard") !== -1);
const rd = read("remote/dashboard.html");
["My Classroom", "My Homework", "Support Tickets", "My Profile"].forEach((l) => ok("Remote dashboard area: " + l, rd.indexOf(l) !== -1));
ok("Remote dashboard enforces studentType + Active", /studentType !== 'remote'/.test(rd) && /status !== 'Active'/.test(rd));
ok("Remote login has no self-registration", !/createUserWithEmailAndPassword/.test(read("remote/index.html")));
ok("Normal student portal forwards remote students", /studentType === 'remote'\)\{ window\.location\.replace\('\/remote\/dashboard\.html'\)/.test(read("student/dashboard.html")));

// 25: homepage
const idx = read("index.html"), why = read("why-paisley.html");
ok("Student Results on index.html", idx.includes("See what our students achieve.") && idx.includes('id="sliderTrack"'));
ok("Student Results still on why-paisley.html", why.includes("See what our students achieve.") && why.includes('id="sliderTrack"'));
const ids = [...idx.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
ok("index.html: no duplicate IDs", ids.length === new Set(ids).size);

// 24: domain + secrets
const tpl = read("functions/email-templates.js");
ok("Emails: production domain default", tpl.includes("'https://paisleystudio.online'"));
ok("Emails: no localhost in functions", !/localhost|127\.0\.0\.1/.test(["index.js", "notifications.js", "work.js", "work-shared.js", "deadlines.js", "publishing.js", "remote.js", "email-templates.js"].map((f) => read("functions/" + f)).join("\n")));
ok("Auth links: password reset uses continue URL", /generatePasswordResetLink\([^)]*actionSettings/.test(read("functions/notifications.js")) && /generatePasswordResetLink\([^)]*actionSettings/.test(read("functions/remote.js")));
ok("No service-account key in project tree", !fs.existsSync(path.join(__dirname, "..", "vertex-key.json")));
console.log(fail ? "\n" + fail + " check(s) FAILED" : "\nAll static checks passed");
process.exit(fail ? 1 : 0);
