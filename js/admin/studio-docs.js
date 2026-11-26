/* =========================================================
   Paisley Studio — Admin > Settings > How Paisley Studio works
   -----------------------------------------------------------
   The handbook for the Studio Desk: the parts of the system, who is who,
   and how data flows for every job (accounts, classes, homework, exams,
   attendance, notifications, Tech Studio, the IDEs, parents, live classes,
   security, developer mode, deploying). Plain Paisley look: white cards,
   teal lines, Quicksand; diagrams are drawn in SVG and animate in when they
   scroll into view (still with reduced motion).

   StudioDocs.mount(host) -> { destroy() }
   Keep it true: when a flow changes, change its section here too.
========================================================= */
(function (g) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- Diagrams ----------
     nodes: [id, x, y, w, h, title, sub, kind]   kind: '' | 'hub' | 'warm' | 'dark'
     edges: [from, to, label, opts]               opts: { side: 'h'|'v', dash: true } */
  var DID = 0;
  function diagram(spec) {
    var id = 'sd' + (++DID), W = spec.w, H = spec.h, N = {};
    spec.nodes.forEach(function (n) { N[n[0]] = { x: n[1], y: n[2], w: n[3], h: n[4], t: n[5], s: n[6] || '', k: n[7] || '' }; });
    function port(a, b, side) {
      var ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
      var horiz = side ? side === 'h' : Math.abs(bx - ax) * (H / W) > Math.abs(by - ay) * 0.9;
      if (horiz) {
        var x1 = bx > ax ? a.x + a.w : a.x, x2 = bx > ax ? b.x : b.x + b.w, mx = (x1 + x2) / 2;
        return { d: 'M' + x1 + ' ' + ay + ' C' + mx + ' ' + ay + ' ' + mx + ' ' + by + ' ' + x2 + ' ' + by, lx: mx, ly: (ay + by) / 2 };
      }
      var y1 = by > ay ? a.y + a.h : a.y, y2 = by > ay ? b.y : b.y + b.h, my = (y1 + y2) / 2;
      return { d: 'M' + ax + ' ' + y1 + ' C' + ax + ' ' + my + ' ' + bx + ' ' + my + ' ' + bx + ' ' + y2, lx: (ax + bx) / 2, ly: my };
    }
    var edges = spec.edges.map(function (e, i) {
      var o = e[3] || {}, p = port(N[e[0]], N[e[1]], o.side);
      var lab = e[2] ? '<g class="sd-elab" style="--d:' + (0.35 + i * 0.12).toFixed(2) + 's"><rect x="' + (p.lx - e[2].length * 3.2 - 7) + '" y="' + (p.ly - 10) + '" width="' + (e[2].length * 6.4 + 14) + '" height="20" rx="10"/><text x="' + p.lx + '" y="' + (p.ly + 4) + '">' + esc(e[2]) + '</text></g>' : '';
      return '<path id="' + id + 'e' + i + '" class="sd-edge' + (o.dash ? ' dash' : '') + (o.warm ? ' warm' : '') + '" d="' + p.d + '" marker-end="url(#' + id + 'arr' + (o.warm ? 'w' : '') + ')" style="--d:' + (0.2 + i * 0.12).toFixed(2) + 's"/>' +
        (o.dash ? '' : '<circle class="sd-dot' + (o.warm ? ' warm' : '') + '" r="3.6"><animateMotion dur="' + (2.4 + (i % 3) * 0.5) + 's" repeatCount="indefinite" begin="' + (i * 0.35).toFixed(2) + 's"><mpath href="#' + id + 'e' + i + '"/></animateMotion></circle>') + lab;
    }).join('');
    var nodes = spec.nodes.map(function (n, i) {
      var v = N[n[0]], cx = v.x + v.w / 2;
      return '<g class="sd-node ' + v.k + '" style="--d:' + (i * 0.09).toFixed(2) + 's;transform-origin:' + cx + 'px ' + (v.y + v.h / 2) + 'px"><rect x="' + v.x + '" y="' + v.y + '" width="' + v.w + '" height="' + v.h + '" rx="12"/>' +
        '<text class="t" x="' + cx + '" y="' + (v.y + (v.s ? v.h / 2 - 3 : v.h / 2 + 5)) + '">' + esc(v.t) + '</text>' +
        (v.s ? '<text class="s" x="' + cx + '" y="' + (v.y + v.h / 2 + 13) + '">' + esc(v.s) + '</text>' : '') + '</g>';
    }).join('');
    return '<figure class="sd-fig"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(spec.label) + '"><defs>' +
      '<marker id="' + id + 'arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#55BFB3"/></marker>' +
      '<marker id="' + id + 'arrw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#F39C12"/></marker></defs>' +
      edges + nodes + '</svg>' + (spec.caption ? '<figcaption>' + esc(spec.caption) + '</figcaption>' : '') + '</figure>';
  }
  function table(head, rows) {
    return '<div class="sd-tw"><table class="sd-tb"><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (i === 0 ? ' class="k"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function steps(list) {
    return '<ol class="sd-steps">' + list.map(function (s, i) { return '<li style="--d:' + (i * 0.07).toFixed(2) + 's"><span class="n">' + (i + 1) + '</span><div><b>' + s[0] + '</b>' + (s[1] ? '<p>' + s[1] + '</p>' : '') + '</div></li>'; }).join('') + '</ol>';
  }
  function facts(list) { return '<ul class="sd-facts">' + list.map(function (f) { return '<li><i class="fas fa-check"></i><span>' + f + '</span></li>'; }).join('') + '</ul>'; }
  function note(txt, icon) { return '<div class="sd-note"><i class="fas ' + (icon || 'fa-lightbulb') + '"></i><div>' + txt + '</div></div>'; }
  function code(s) { return '<code>' + esc(s) + '</code>'; }

  /* ---------- The handbook ---------- */
  var SECTIONS = [
    { id: 'overview', icon: 'fa-compass', title: 'The big picture', lead: 'Paisley Studio is a tutoring school website and learning system on Google Firebase. Three parts work together.',
      body: function () {
        return diagram({ label: 'System map', w: 900, h: 340, caption: 'Every page talks straight to the database. The database decides who may read or write; functions do the work no browser may do.',
          nodes: [
            ['web', 20, 135, 170, 64, 'Web pages', 'Hosting · no build step', 'hub'],
            ['auth', 260, 20, 170, 56, 'Sign-in', 'Firebase Auth'],
            ['fs', 260, 135, 170, 64, 'Firestore', 'data + security rules', 'hub'],
            ['st', 260, 260, 170, 56, 'Storage', 'files, pictures, PDFs'],
            ['fn', 500, 135, 170, 64, 'Cloud Functions', 'Node 22 · triggers + calls', 'hub'],
            ['mail', 730, 40, 150, 56, 'Email', 'SMTP, branded'],
            ['bell', 730, 135, 150, 64, 'Bells', 'in-app notifications'],
            ['live', 730, 260, 150, 56, 'Live classes', 'Cloudflare Worker', 'dark']
          ],
          edges: [['web', 'auth', 'signs in'], ['web', 'fs', 'reads / writes'], ['web', 'st', 'uploads'], ['fs', 'fn', 'triggers'], ['fn', 'mail', ''], ['fn', 'bell', ''], ['web', 'live', 'joins', { dash: true }]]
        }) +
        table(['Part', 'What it is', 'Where'], [
          ['Website and portals', 'Plain HTML pages with their own scripts. Firebase is loaded from Google (the compat SDK). Nothing is compiled: a changed file is live once hosting is deployed.', code('/') + ' (repo root), ' + code('js/')],
          ['Cloud Functions', 'Server code. Runs when data changes (triggers), on a timer (sweeps, reminders) or when a page calls it (callables). Sends every email.', code('functions/')],
          ['Realtime worker', 'Creates the video rooms for live classes (Cloudflare RealtimeKit).', code('paisley-realtime-worker/')]
        ]) +
        note('Roles are never a field someone can change. A person is an admin, tutor, student or parent because their account id sits in that collection: ' + code('admins') + ', ' + code('tutorAccounts') + ', ' + code('students') + ', parent links. The security rules check exactly that.', 'fa-key');
      } },
    { id: 'portals', icon: 'fa-door-open', title: 'Portals and people', lead: 'Each kind of person has their own portal: a login page and a dashboard.',
      body: function () {
        return table(['Portal', 'Who', 'Address'], [
          ['Studio Desk', 'Admins. Everything: students, classes, homework, exams, attendance, Tech Studio, settings.', code('/admin')],
          ['Tutor', 'Tutors. Teach the subjects and years in their teaching list, mark work, take registers.', code('/tutor')],
          ['Student (online)', 'Online students. Classes, homework, exams, attendance, results.', code('/student')],
          ['Remote', 'Remote learners: the same curriculum, their own portal.', code('/remote')],
          ['Tuition (CBC)', 'CBC tuition students.', code('/tuition')],
          ['Parent', 'Parents of school students: progress, results, messages, newsletter.', code('/parent')],
          ['Tech Studio', 'Builders (coding, AI, music...). Classes by level, practice, projects.', code('/tech')],
          ['Tech coach', 'Coaches of builders.', code('/tech/coach')],
          ['Tech guardian', 'Families of builders.', code('/tech/parent')]
        ]) +
        facts([
          'A student’s ' + code('studentType') + ' picks their portal: none = online, ' + code('remote') + ', ' + code('tuition') + ', ' + code('tech') + '. Only admins set it.',
          'One login can hold several accounts (for example a student who is also a builder). The page asks which one to open.',
          'Tech Studio is a separate system with its own people: builders, coaches and guardians, not students and tutors.'
        ]);
      } },
    { id: 'accounts', icon: 'fa-user-plus', title: 'Accounts: from sign-up to active', lead: 'Nobody gets in on their own say-so.',
      body: function () {
        return steps([
          ['Someone applies or signs up', 'Enrolment form, tutor application or a portal sign-up. The account starts as <b>Pending</b>, which grants nothing.'],
          ['The Studio Desk checks it', 'In Enrolments, Tutor Applications or Student Management.'],
          ['An admin activates it', 'Status becomes <b>Active</b>. Functions react to that change: welcome emails, parent access, a fresh start (class work posted before ' + code('activatedAt') + ' is not shown or reminded about).'],
          ['Parents are linked', code('parentStudentLinks') + ' joins a parent to a child; parent access is rebuilt automatically from it.']
        ]) +
        note('Only admins or the server may set ' + code('status') + ' or ' + code('studentType') + '. The rules refuse it from anyone else.', 'fa-shield-halved');
      } },
    { id: 'classes', icon: 'fa-chalkboard', title: 'Classes, lessons and who sees them', lead: 'Content is made once and reaches each audience only when it is published to it.',
      body: function () {
        return diagram({ label: 'Publishing flow', w: 900, h: 300, caption: 'Content waits as a draft until it is published to an audience. Students only ever query what is posted to them.',
          nodes: [
            ['make', 20, 40, 170, 60, 'Admin creates', 'lesson, homework, exam'],
            ['pub', 255, 40, 205, 60, 'publishClassroomContent', 'the only way out', 'hub'],
            ['aud', 520, 40, 170, 60, 'audiences', 'online · remote · tutors'],
            ['stu', 740, 20, 140, 50, 'Students', 'see it'],
            ['par', 740, 90, 140, 50, 'Parents', 'see it'],
            ['tut', 260, 190, 190, 60, 'Tutor releases', 'tutorReleaseWork'],
            ['rel', 520, 190, 170, 60, 'releasedTo', 'named students'],
            ['note', 740, 190, 140, 60, 'Bell + email', 'once per person', 'warm']
          ],
          edges: [['make', 'pub', ''], ['pub', 'aud', 'sets'], ['aud', 'stu', ''], ['aud', 'par', ''], ['tut', 'rel', 'adds'], ['rel', 'stu', ''], ['pub', 'note', 'notifies', { warm: true }]]
        }) +
        facts([
          'Curriculum lives under ' + code('classrooms/{class}/topics/{topic}/') + ': lessons, assignments (with submissions) and exams (with attempts).',
          'Each item carries ' + code('audiences') + ' { online, remote, tutors }, ' + code('publication') + ' and ' + code('releasedTo') + '. Tutors cannot create curriculum; they release posted work to their own students.',
          '<b>Rules are not filters.</b> Every list a portal loads asks for its own audience (for example ' + code('audiences.online == true') + '), or the whole query is refused.',
          'Exam boards: a class has a board (none = Cambridge). Students follow their subject’s board; tutors teach the boards in their teaching list.',
          'Work is always listed in the same order: the number in the title, then the title, then the oldest first.'
        ]);
      } },
    { id: 'homework', icon: 'fa-book-open', title: 'Homework, classwork and marking', lead: 'From posted to marked, with reminders on the way.',
      body: function () {
        return diagram({ label: 'Homework lifecycle', w: 900, h: 250, caption: 'Renew sends marked work back for corrections and keeps the earlier round in its history.',
          nodes: [
            ['post', 20, 90, 140, 60, 'Posted', 'bell + email'],
            ['due', 200, 20, 150, 56, 'Reminders', 'due soon, overdue', 'warm'],
            ['sub', 200, 150, 150, 60, 'Handed in', 'online or on paper'],
            ['mark', 400, 150, 150, 60, 'Marked', 'Ink grader, PDF'],
            ['ren', 600, 40, 150, 60, 'Renew', 'Corrections + renewedAt'],
            ['done', 740, 150, 140, 60, 'Graded', 'results to family', 'hub']
          ],
          edges: [['post', 'due', '', { dash: true }], ['post', 'sub', ''], ['sub', 'mark', ''], ['mark', 'done', ''], ['mark', 'ren', 'not yet'], ['ren', 'sub', 'again', { side: 'v' }]]
        }) +
        facts([
          'Students hand in online (files) or on paper, per subject (' + code('handInBySubject') + '). Paper subjects get no upload reminders; staff record the paper hand-in.',
          'Marking writes on the work itself (Ink grader) and saves a PDF.',
          'Renew reopens marked work as <b>Corrections</b> with ' + code('renewedAt') + '; the earlier round goes into ' + code('history') + '.',
          'Timed jobs send due-soon, overdue and grace notices, a digest of overdue work, and exam reminders to parents.',
          'The admin’s work screens are a separate copy (' + code('publish-helpers.js') + ' overrides ' + code('work-helpers.js') + '), so staff-screen changes go in both.'
        ]);
      } },
    { id: 'exams', icon: 'fa-file-pen', title: 'Exams', lead: 'Set, sat under watch, marked.',
      body: function () {
        return steps([
          ['Made', 'By hand or imported from a PDF (the importer reads it with AI and builds questions).'],
          ['Published', 'Through the same publishing as homework, to the right audiences and board.'],
          ['Sat', 'In ' + code('student/exam.html') + '. Leaving the page or switching tabs is recorded as an integrity event (' + code('recordViolation') + ').'],
          ['Marked and returned', 'Results reach the student and the family; reminders go to parents before the exam.']
        ]) + note('AI exams keep a mirrored ' + code('exams/{id}') + ' document so the exam page and violation recording keep working.');
      } },
    { id: 'attendance', icon: 'fa-clipboard-user', title: 'Attendance', lead: 'Registers are built from the timetable; every change goes through functions.',
      body: function () {
        return diagram({ label: 'Attendance flow', w: 900, h: 230, caption: 'No browser writes attendance. A sweep every 5 minutes opens, locks and finalises registers.',
          nodes: [
            ['tt', 20, 85, 150, 60, 'Timetable', 'Nairobi time'],
            ['reg', 210, 85, 150, 60, 'Register', 'per lesson', 'hub'],
            ['in', 400, 20, 150, 56, 'Check-in', 'student'],
            ['conf', 400, 150, 150, 60, 'Tutor confirms', 'in class / not'],
            ['sub', 590, 85, 140, 60, 'Submitted', 'after the lesson'],
            ['out', 760, 85, 120, 60, 'Strikes', 'late, absent', 'warm']
          ],
          edges: [['tt', 'reg', 'builds'], ['reg', 'in', ''], ['reg', 'conf', ''], ['in', 'sub', ''], ['conf', 'sub', ''], ['sub', 'out', 'notices', { warm: true }]]
        }) +
        facts([
          'Later than 15 minutes after the start is late. One strike per lesson, counted per period (default: the academic year from September).',
          'Students who are not registered are "unaccounted", never absent, until a tutor or the desk decides.',
          'A register still open after its lesson locks marking in that subject until it is submitted or auto-submitted.',
          'Tutors may edit rows until 15 minutes after the end; then the register is final and absences are notified.',
          'Facial recognition is optional and off by default. It runs on the device and on Firebase only, never stores a picture, and compares only with the signed-in person.'
        ]);
      } },
    { id: 'notify', icon: 'fa-bell', title: 'Notifications and email', lead: 'Every bell and every email comes from one place, and nobody is told twice.',
      body: function () {
        return table(['Where', 'What', 'Who sees it'], [
          [code('personalNotifications'), 'Bells in the school portals (students, parents, tutors, admins).', 'The person it is for'],
          [code('techNotifications'), 'Bells in Tech Studio; tab bubbles count them.', 'Builders, coaches, guardians, desk'],
          [code('attendanceNotifications'), 'Attendance notices with their email delivery state (pending, sent, failed, held).', 'The person, their family, admins'],
          ['Email', 'Sent by functions through SMTP; each email is branded for its programme (online, remote, tuition, tech, staff).', 'Inboxes']
        ]) +
        facts([
          'Notification ids are worked out from the event, so a retried trigger writes the same document and never sends twice.',
          'SMTP details are secrets in Cloud Functions, never in the code.',
          'Icons, never emoji, everywhere: pages, bells, emails. Emails use small Font Awesome pictures from ' + code('img/email-icons/') + '.'
        ]);
      } },
    { id: 'tech', icon: 'fa-wand-magic-sparkles', title: 'Paisley Tech Studio', lead: 'A studio inside the school with its own people, levels and projects.',
      body: function () {
        return diagram({ label: 'Tech Studio classes', w: 900, h: 220, caption: 'Classes are levels behind padlocks; lessons open one after another.',
          nodes: [
            ['lvl', 20, 80, 150, 60, 'Skill level', 'three levels'],
            ['cls', 210, 80, 140, 60, 'Classes', 'Level 1 open', 'hub'],
            ['les', 390, 80, 140, 60, 'Lessons', 'videos, quiz, practice'],
            ['work', 570, 20, 150, 56, 'Class work', 'IDE or writing pad'],
            ['quiz', 570, 145, 150, 56, 'Quiz', 'marked on the server'],
            ['pass', 760, 80, 120, 60, 'Passed', 'Unlock next', 'warm']
          ],
          edges: [['lvl', 'cls', ''], ['cls', 'les', ''], ['les', 'work', ''], ['les', 'quiz', ''], ['work', 'pass', 'coach allows'], ['quiz', 'pass', '']]
        }) +
        facts([
          'People: builders ' + code('techStudents') + ', coaches ' + code('techCoaches') + ', guardians linked through ' + code('techGuardianLinks') + '. School students can be admitted on the same login.',
          'A class’s next level opens when the builder presses Unlock on the passed class before it; the server alone records passing.',
          'Quiz answers live only in a private key document; ' + code('submitTechQuiz') + ' marks on the server.',
          'Class work is handed in as ' + code('techLessonWork') + ', with a picture of the work for the family. The coach marks it, then presses Allow next lesson.',
          'Coaches and admins prepare lessons as drafts and send them with Publish the class: one bell and one email per builder for the lot.'
        ]);
      } },
    { id: 'ide', icon: 'fa-code', title: 'The IDEs and publishing on review', lead: 'Paisley VS Code for everyone, the Advanced IDE for those who graduated to it.',
      body: function () {
        return diagram({ label: 'Publishing on review', w: 900, h: 210, caption: 'A builder never publishes alone: a coach or the desk looks first.',
          nodes: [
            ['b', 20, 75, 150, 60, 'Builder', 'presses Share'],
            ['req', 210, 75, 160, 60, 'Publish request', 'publishState'],
            ['rev', 410, 75, 160, 60, 'Coach or desk', 'run it, decide', 'hub'],
            ['fn', 610, 20, 150, 56, 'Function', 'makes the copy'],
            ['no', 610, 140, 150, 56, 'Not yet', 'note to builder', 'warm'],
            ['link', 790, 20, 100, 56, 'Link', '/tech/p/…']
          ],
          edges: [['b', 'req', ''], ['req', 'rev', ''], ['rev', 'fn', 'approve'], ['rev', 'no', 'decline', { warm: true }], ['fn', 'link', '']]
        }) +
        facts([
          '<b>Paisley VS Code</b> (' + code('js/tech/code-lab.js') + ') builds web pages and runs Python, Java, C, C++ and PHP. Programs run in a sealed sandbox, never on the Paisley site itself; Java goes to a separate runner service.',
          'Unsaved work is kept in the browser until the save lands, and offered back if it never did.',
          'Uploads are checked by their real contents: a script named like a picture is refused in the browser and deleted on the server.',
          'Class work can be shared once a coach or admin switches publishing on for the lesson or its class. Practice projects can be shared once the desk switches it on in Tech Studio > Controls.',
          'The <b>Advanced IDE</b> is behind the switch in Tech Studio > Controls. Intermediate and expert builders can get it by level; beginners never do: when one graduates, their coach gives it in the Coach portal (Builders, then the builder) or the desk picks them by name. The Practice lab shows only Paisley VS Code; builders who have the Advanced IDE open it from Home or from its button inside Paisley VS Code.',
          'The public page (' + code('/tech/p/…') + ') shows what was made, never the code: a website appears live in a browser frame whose address is the share link, and a program gets one Run button and its output. The Paisley banner with the maker’s first name and the “Learn this at Paisley” line stay on every page.',
          'Published work stays live: saves refresh the public copy. Take it down and the link stops.'
        ]);
      } },
    { id: 'parents', icon: 'fa-people-roof', title: 'Parents and families', lead: 'Families see their own children only.',
      body: function () {
        return facts([
          'School parents use ' + code('/parent') + ': results, homework, attendance, messages with the desk, and the newsletter.',
          'Tech guardians use ' + code('/tech/parent') + ', designed like the parent portal.',
          'Ads (on the parent Overview) and newsletters are admin-only, in Ads & Newsletter. Newsletters send once per parent and respect opt-outs.'
        ]) + note('A parent can read a child’s record only through a link the desk made. The rules check the link on every read.', 'fa-shield-halved');
      } },
    { id: 'live', icon: 'fa-video', title: 'Live classes', lead: 'Video rooms made on demand.',
      body: function () {
        return steps([
          ['Scheduled', 'On the timetable or in Live Classes; students and families are told.'],
          ['Room made', 'The page asks the Cloudflare worker, which creates a RealtimeKit meeting with a secret token kept on Cloudflare.'],
          ['Joined', 'Students join from their portal; attendance check-in runs beside it.']
        ]);
      } },
    { id: 'security', icon: 'fa-shield-halved', title: 'Security', lead: 'The database rules are the lock on every door.',
      body: function () {
        return facts([
          code('firestore.rules') + ' is the source of truth for who may read and write what; ' + code('FIRESTORE_RULES.md') + ' describes it.',
          'Storage rules guard files the same way. Uploads into the IDEs are checked again by ' + code('checkTechUpload') + '.',
          'Student code never runs on the Paisley origin: it runs in an opaque sandbox with no access to cookies or the database.',
          'Secrets (SMTP, service keys, runner keys) live in Cloud Functions secrets or server-only documents no client can read.',
          'Marks and answers never travel to the browser before they should: quiz keys are private, marking happens on the server.'
        ]);
      } },
    { id: 'devmode', icon: 'fa-screwdriver-wrench', title: 'Developer mode', lead: 'Two switches for working on the live system safely.',
      body: function () {
        return diagram({ label: 'How the freeze decides', w: 900, h: 240, caption: 'Admins and your test accounts always receive. Held items are listed, never sent later.',
          nodes: [
            ['ev', 20, 90, 140, 60, 'Something happens', 'class posted, mark...'],
            ['fn', 200, 90, 150, 60, 'Function', 'about to tell people'],
            ['chk', 390, 90, 150, 60, 'Freeze check', 'area · person', 'hub'],
            ['send', 590, 20, 150, 56, 'Sent', 'bell + email'],
            ['hold', 590, 160, 150, 56, 'Held', 'listed in Settings', 'warm'],
            ['ok', 770, 20, 110, 56, 'Test accounts', 'and admins']
          ],
          edges: [['ev', 'fn', ''], ['fn', 'chk', ''], ['chk', 'send', 'not frozen'], ['chk', 'hold', 'frozen', { warm: true }], ['ok', 'send', '', { dash: true }]]
        }) +
        table(['Tool', 'What it does'], [
          ['Maintenance banner', 'A small floating pill on every page that opens into the full card when pressed: planned maintenance with a countdown, then under maintenance with time left. People can drag it anywhere, shrink it back or close it. It never blocks anyone. Stored in ' + code('siteStatus/maintenance') + '.'],
          ['Freeze', 'Holds bells and emails for the areas you tick (Tech Studio, classes, homework, exams, live classes, attendance, tuition, messages, accounts, newsletter) and the people you freeze (students, parents, tutors, coaches), except your test accounts. Ends by itself if you set an end. Stored in ' + code('devMode/freeze') + '; held items in ' + code('devHeld') + '.']
        ]) +
        note('The freeze stops messages, not content: a class you post is still visible in portals to everyone it is posted to. To test content privately, post it to a test account or keep it as a draft.', 'fa-circle-info');
      } },
    { id: 'deploy', icon: 'fa-rocket', title: 'Changing and deploying', lead: 'How a change reaches people.',
      body: function () {
        return steps([
          ['Change the files', 'Pages load scripts with ' + code('?v=') + ' numbers. A changed shared script needs its number raised on every page that loads it, or browsers keep the old one.'],
          ['Test', code('cd functions && npm test') + ' for functions, ' + code('node scripts/verify-project.js') + ' for the site, the rules tests on the emulator.'],
          ['Deploy functions and indexes first', code('firebase deploy --only functions,firestore:indexes') + ', then wait until new indexes are Enabled.'],
          ['Then rules, storage and hosting', code('firebase deploy --only firestore:rules,storage,hosting') + '. Rules before data migrations would hide content.'],
          ['Offline copy', 'The service worker (' + code('sw.js') + ') caches the site shell; raise its cache name when cached behaviour must change.']
        ]);
      } },
    { id: 'glossary', icon: 'fa-database', title: 'Where data lives', lead: 'The main collections at a glance.',
      body: function () {
        return table(['Collection', 'Holds'], [
          [code('admins') + ' · ' + code('tutorAccounts') + ' · ' + code('students'), 'Who is who (the id is the login)'],
          [code('parentAccounts') + ' · ' + code('parentStudentLinks'), 'Parents and which child they may see'],
          [code('classrooms/…/topics/…'), 'Lessons, assignments (+ submissions), exams (+ attempts)'],
          [code('timetableEntries'), 'The school timetable; registers are built from it'],
          [code('attendanceRecords') + ' · ' + code('attendanceStrikes'), 'Registers, check-ins and strikes'],
          [code('personalNotifications'), 'School bells'],
          [code('techStudents') + ' · ' + code('techCoaches') + ' · ' + code('techGuardianLinks'), 'Tech Studio people'],
          [code('techCourses') + ' · ' + code('techTopics') + ' · ' + code('techLessons'), 'Tech classes, topics, lessons'],
          [code('techLessonWork') + ' · ' + code('techPractice') + ' · ' + code('techBuilds'), 'Class work, practice projects, projects'],
          [code('techShowcase'), 'Published Tech Studio work (public links)'],
          [code('techNotifications') + ' · ' + code('techActivity'), 'Tech bells and each builder’s timeline'],
          [code('parentAds') + ' · ' + code('parentNewsletters'), 'Parent ads and newsletters'],
          [code('siteStatus') + ' · ' + code('devMode') + ' · ' + code('devHeld'), 'Developer mode: banner, freeze, held items']
        ]);
      } }
  ];

  var styled = false;
  function style() {
    if (styled) return; styled = true;
    var s = document.createElement('style'); s.id = 'sd-style';
    s.textContent = [
      '.sd{max-width:1180px}',
      '.sd-hero{background:var(--surface,#fff);border:1px solid var(--line-soft,rgba(38,51,49,.06));border-radius:18px;padding:1.6rem 1.7rem;margin-bottom:1.1rem;display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:center;position:relative;overflow:hidden;animation:sdUp .55s ease both}',
      '.sd-hero::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--brand,#55BFB3)}',
      '.sd-eyebrow{font-size:.7rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--brand-deep,#245F5A)}',
      '.sd-hero h2{font-size:1.55rem;font-weight:800;letter-spacing:-.02em;margin:.25rem 0 .35rem;color:var(--ink,#263331)}',
      '.sd-hero p{color:var(--muted,#5A6E6A);font-weight:600;font-size:.9rem;line-height:1.55;max-width:640px;margin:0}',
      '.sd-stats{display:flex;gap:.55rem;flex-wrap:wrap;margin-top:.9rem}',
      '.sd-stat{background:var(--sage,#E5F2EF);border-radius:12px;padding:.45rem .8rem;font-size:.75rem;font-weight:700;color:var(--brand-deep,#245F5A)}',
      '.sd-stat b{font-size:1rem;margin-right:.25rem}',
      '.sd-orbit{width:118px;height:118px;position:relative}',
      '.sd-orbit .c{position:absolute;inset:0;border:2px dashed var(--brand-soft,#7BCBC2);border-radius:50%;animation:sdSpin 22s linear infinite}',
      '.sd-orbit .c2{inset:20px;border-style:solid;border-color:var(--sage,#E5F2EF);animation-duration:14s;animation-direction:reverse}',
      '.sd-orbit .m{position:absolute;inset:36px;border-radius:50%;background:var(--brand,#55BFB3);color:#fff;display:grid;place-items:center;font-size:1.2rem;box-shadow:0 8px 20px rgba(85,191,179,.35)}',
      '.sd-orbit .p{position:absolute;width:12px;height:12px;border-radius:50%;background:var(--brand-deep,#245F5A);top:-6px;left:calc(50% - 6px)}',
      '.sd-body{display:grid;grid-template-columns:230px 1fr;gap:1.1rem;align-items:start}',
      '.sd-toc{position:sticky;top:90px;background:var(--surface,#fff);border:1px solid var(--line-soft,rgba(38,51,49,.06));border-radius:16px;padding:.8rem;max-height:calc(100vh - 110px);overflow:auto}',
      '.sd-find{width:100%;font:inherit;font-weight:600;font-size:.82rem;border:1.5px solid var(--line,rgba(38,51,49,.1));border-radius:10px;padding:.5rem .7rem;margin-bottom:.5rem}',
      '.sd-find:focus{outline:none;border-color:var(--brand,#55BFB3);box-shadow:0 0 0 4px rgba(85,191,179,.15)}',
      '.sd-toc a{display:flex;align-items:center;gap:.55rem;padding:.48rem .6rem;border-radius:9px;color:var(--ink,#263331);text-decoration:none;font-size:.82rem;font-weight:700;position:relative;transition:background .2s,color .2s}',
      '.sd-toc a i{width:16px;text-align:center;color:var(--brand,#55BFB3);font-size:.8rem}',
      '.sd-toc a:hover{background:var(--paper,#F1F9F7)}',
      '.sd-toc a.on{background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A)}',
      '.sd-toc a.on::before{content:"";position:absolute;left:-.8rem;top:22%;bottom:22%;width:3px;border-radius:0 3px 3px 0;background:var(--brand,#55BFB3)}',
      '.sd-toc a[hidden]{display:none}',
      '.sd-arts{display:grid;gap:1rem;min-width:0}',
      '.sd-art{background:var(--surface,#fff);border:1px solid var(--line-soft,rgba(38,51,49,.06));border-radius:18px;padding:1.5rem 1.6rem;scroll-margin-top:90px;opacity:0;transform:translateY(22px);transition:opacity .6s ease,transform .6s cubic-bezier(.2,.8,.2,1)}',
      '.sd-art.in{opacity:1;transform:none}',
      '.sd-art[hidden]{display:none}',
      '.sd-ah{display:flex;gap:.85rem;align-items:flex-start;margin-bottom:1rem}',
      '.sd-ai{flex:0 0 auto;width:46px;height:46px;border-radius:14px;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);display:grid;place-items:center;font-size:1.1rem;transform:scale(.6) rotate(-12deg);opacity:0;transition:transform .55s cubic-bezier(.3,1.5,.5,1) .1s,opacity .4s .1s}',
      '.sd-art.in .sd-ai{transform:none;opacity:1}',
      '.sd-num{font-size:.68rem;font-weight:800;letter-spacing:.1em;color:var(--brand,#55BFB3)}',
      '.sd-ah h3{font-size:1.18rem;font-weight:800;margin:.1rem 0 .2rem;letter-spacing:-.01em}',
      '.sd-ah p{margin:0;color:var(--muted,#5A6E6A);font-weight:600;font-size:.88rem;line-height:1.5}',
      '.sd-art code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.78em;background:var(--paper,#F1F9F7);border:1px solid var(--line-soft,rgba(38,51,49,.06));color:var(--brand-deep,#245F5A);padding:.05rem .35rem;border-radius:6px;white-space:nowrap}',
      '.sd-fig{margin:.4rem 0 1.1rem;background:var(--paper,#F1F9F7);border:1px solid var(--line-soft,rgba(38,51,49,.06));border-radius:14px;padding:.9rem}',
      '.sd-fig svg{display:block;width:100%;height:auto;overflow:visible;font-family:"Quicksand",sans-serif}',
      '.sd-fig figcaption{font-size:.76rem;font-weight:600;color:var(--muted,#5A6E6A);margin-top:.55rem;text-align:center}',
      '.sd-node rect{fill:#fff;stroke:#55BFB3;stroke-width:1.6}',
      '.sd-node.hub rect{fill:#E5F2EF;stroke:#245F5A;stroke-width:2}',
      '.sd-node.warm rect{fill:#FFF8EC;stroke:#F39C12}',
      '.sd-node.dark rect{fill:#0F1A14;stroke:#0F1A14}.sd-node.dark .t{fill:#fff}.sd-node.dark .s{fill:#8FA8A2}',
      '.sd-node .t{font-size:13.5px;font-weight:800;fill:#263331;text-anchor:middle}',
      '.sd-node .s{font-size:10.5px;font-weight:600;fill:#5A6E6A;text-anchor:middle}',
      '.sd-edge{fill:none;stroke:#55BFB3;stroke-width:1.8;stroke-dasharray:600;stroke-dashoffset:600}',
      '.sd-edge.dash{stroke-dasharray:5 6;stroke-dashoffset:0;opacity:0}',
      '.sd-edge.warm{stroke:#F39C12}',
      '.sd-dot{fill:#245F5A;opacity:0}.sd-dot.warm{fill:#F39C12}',
      '.sd-elab rect{fill:#fff;stroke:rgba(38,51,49,.12)}.sd-elab text{font-size:10.5px;font-weight:700;fill:#245F5A;text-anchor:middle}.sd-elab{opacity:0}',
      '.sd-node{opacity:0}',
      '.sd-art.in .sd-node{animation:sdNode .5s cubic-bezier(.3,1.4,.5,1) both;animation-delay:var(--d)}',
      '.sd-art.in .sd-edge{animation:sdDraw 1s ease forwards;animation-delay:calc(var(--d) + .3s)}',
      '.sd-art.in .sd-edge.dash{animation:sdFade .6s ease forwards,sdMarch 1.2s linear infinite;animation-delay:calc(var(--d) + .3s),0s}',
      '.sd-art.in .sd-dot{animation:sdFade .4s ease 1.4s forwards}',
      '.sd-art.in .sd-elab{animation:sdFade .5s ease forwards;animation-delay:calc(var(--d) + .7s)}',
      '.sd-tw{overflow:auto;margin:.3rem 0 1rem;border:1px solid var(--line-soft,rgba(38,51,49,.06));border-radius:12px}',
      '.sd-tb{width:100%;border-collapse:collapse;font-size:.83rem}',
      '.sd-tb th{text-align:left;font-size:.68rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--muted,#5A6E6A);background:var(--paper,#F1F9F7);padding:.6rem .8rem}',
      '.sd-tb td{padding:.65rem .8rem;border-top:1px solid var(--line-soft,rgba(38,51,49,.06));vertical-align:top;line-height:1.5;font-weight:600;color:var(--ink,#263331)}',
      '.sd-tb td.k{font-weight:800;color:var(--brand-deep,#245F5A);white-space:nowrap}',
      '.sd-tb tr{transition:background .2s}.sd-tb tbody tr:hover{background:var(--paper,#F1F9F7)}',
      '.sd-facts{list-style:none;margin:.3rem 0 1rem;padding:0;display:grid;gap:.5rem}',
      '.sd-facts li{display:flex;gap:.6rem;font-size:.86rem;font-weight:600;line-height:1.55;color:var(--ink,#263331)}',
      '.sd-facts li i{flex:0 0 auto;width:20px;height:20px;border-radius:50%;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);display:grid;place-items:center;font-size:.6rem;margin-top:.15rem}',
      '.sd-steps{list-style:none;margin:.3rem 0 1rem;padding:0;display:grid;gap:.15rem;position:relative}',
      '.sd-steps li{display:flex;gap:.85rem;position:relative;padding-bottom:.8rem;opacity:0;transform:translateX(-10px)}',
      '.sd-art.in .sd-steps li{animation:sdIn .5s ease forwards;animation-delay:calc(var(--d) + .2s)}',
      '.sd-steps li:not(:last-child)::after{content:"";position:absolute;left:15px;top:34px;bottom:0;width:2px;background:var(--sage,#E5F2EF)}',
      '.sd-steps .n{flex:0 0 auto;width:32px;height:32px;border-radius:50%;background:var(--brand,#55BFB3);color:#fff;display:grid;place-items:center;font-weight:800;font-size:.85rem}',
      '.sd-steps b{display:block;font-size:.9rem;margin-top:.3rem}',
      '.sd-steps p{margin:.15rem 0 0;font-size:.84rem;font-weight:600;color:var(--muted,#5A6E6A);line-height:1.55}',
      '.sd-note{display:flex;gap:.7rem;align-items:flex-start;background:var(--paper,#F1F9F7);border:1px solid var(--line-soft,rgba(38,51,49,.06));border-left:4px solid var(--brand,#55BFB3);border-radius:12px;padding:.8rem .9rem;font-size:.84rem;font-weight:600;line-height:1.55;color:var(--ink,#263331)}',
      '.sd-note i{color:var(--brand-deep,#245F5A);margin-top:.2rem}',
      '.sd-none{padding:2rem;text-align:center;color:var(--muted,#5A6E6A);font-weight:700}',
      '.sd-top{position:fixed;right:22px;bottom:22px;width:42px;height:42px;border-radius:12px;border:1px solid var(--line,rgba(38,51,49,.1));background:#fff;color:var(--brand-deep,#245F5A);cursor:pointer;box-shadow:0 8px 22px rgba(15,26,20,.12);opacity:0;pointer-events:none;transform:translateY(10px);transition:all .3s;z-index:150}',
      '.sd-top.on{opacity:1;pointer-events:auto;transform:none}',
      '.sd-top:hover{background:var(--brand,#55BFB3);color:#fff}',
      '@keyframes sdUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}',
      '@keyframes sdIn{to{opacity:1;transform:none}}',
      '@keyframes sdNode{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:none}}',
      '@keyframes sdDraw{to{stroke-dashoffset:0}}',
      '@keyframes sdFade{to{opacity:1}}',
      '@keyframes sdMarch{to{stroke-dashoffset:-22}}',
      '@keyframes sdSpin{to{transform:rotate(360deg)}}',
      '@media (max-width:900px){.sd-body{grid-template-columns:1fr}.sd-toc{position:static;max-height:none;display:flex;flex-wrap:wrap;gap:.25rem}.sd-toc .sd-find{flex:1 1 100%}.sd-toc a.on::before{display:none}.sd-hero{grid-template-columns:1fr}.sd-orbit{display:none}}',
      '@media (prefers-reduced-motion:reduce){.sd *,.sd{animation:none!important;transition:none!important}.sd-art,.sd-node,.sd-elab,.sd-steps li,.sd-ai{opacity:1!important;transform:none!important}.sd-edge{stroke-dashoffset:0!important}.sd-edge.dash{opacity:1}.sd-dot{display:none}}'
    ].join('');
    document.head.appendChild(s);
  }

  function mount(host) {
    style();
    var built = SECTIONS.map(function (s, i) {
      var body = s.body();
      return { s: s, html: '<article class="sd-art" id="sd-' + s.id + '" data-sd="' + s.id + '"><div class="sd-ah"><span class="sd-ai"><i class="fas ' + s.icon + '"></i></span><div><div class="sd-num">' + (i < 9 ? '0' : '') + (i + 1) + '</div><h3>' + esc(s.title) + '</h3><p>' + esc(s.lead) + '</p></div></div>' + body + '</article>',
        text: (s.title + ' ' + s.lead + ' ' + body.replace(/<[^>]+>/g, ' ')).toLowerCase() };
    });
    host.innerHTML = '<div class="sd">' +
      '<div class="sd-hero"><div><div class="sd-eyebrow">Studio handbook</div><h2>How Paisley Studio works</h2>' +
        '<p>The parts of the system, who is who, and how information moves for every job: accounts, classes, homework, exams, attendance, Tech Studio, families and the tools you run it with.</p>' +
        '<div class="sd-stats"><span class="sd-stat"><b>9</b>portals</span><span class="sd-stat"><b>3</b>moving parts</span><span class="sd-stat"><b>' + SECTIONS.length + '</b>chapters</span><span class="sd-stat"><b>1</b>set of rules guarding it all</span></div></div>' +
        '<div class="sd-orbit" aria-hidden="true"><span class="c"><span class="p"></span></span><span class="c c2"></span><span class="m"><i class="fas fa-diagram-project"></i></span></div></div>' +
      '<div class="sd-body"><nav class="sd-toc" aria-label="Chapters"><input type="search" class="sd-find" placeholder="Search the handbook" aria-label="Search the handbook">' +
        SECTIONS.map(function (s) { return '<a href="#sd-' + s.id + '" data-to="' + s.id + '"><i class="fas ' + s.icon + '"></i>' + esc(s.title) + '</a>'; }).join('') + '</nav>' +
        '<div class="sd-arts">' + built.map(function (b) { return b.html; }).join('') + '<div class="sd-none" hidden>Nothing in the handbook matches that.</div></div></div>' +
      '<button type="button" class="sd-top" aria-label="Back to the top"><i class="fas fa-arrow-up"></i></button>' +
    '</div>';

    var arts = [].slice.call(host.querySelectorAll('.sd-art')), links = [].slice.call(host.querySelectorAll('.sd-toc a')), topBtn = host.querySelector('.sd-top');
    var io = null, spy = null;
    if ('IntersectionObserver' in g) {
      io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold: 0.12 });
      arts.forEach(function (a) { io.observe(a); });
      spy = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) links.forEach(function (l) { l.classList.toggle('on', l.dataset.to === e.target.dataset.sd); }); });
      }, { rootMargin: '-30% 0px -60% 0px' });
      arts.forEach(function (a) { spy.observe(a); });
    } else arts.forEach(function (a) { a.classList.add('in'); });

    host.querySelector('.sd-toc').addEventListener('click', function (e) {
      var a = e.target.closest('a[data-to]'); if (!a) return;
      e.preventDefault();
      var t = host.querySelector('#sd-' + a.dataset.to); if (!t) return;
      t.classList.add('in');
      t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
    host.querySelector('.sd-find').addEventListener('input', function (e) {
      var q = e.target.value.trim().toLowerCase(), any = false;
      built.forEach(function (b, i) {
        var hit = !q || b.text.indexOf(q) > -1;
        arts[i].hidden = !hit; links[i].hidden = !hit;
        if (hit) { any = true; arts[i].classList.add('in'); }
      });
      host.querySelector('.sd-none').hidden = any;
    });
    function onScroll() { topBtn.classList.toggle('on', (g.scrollY || document.documentElement.scrollTop) > 700 && host.offsetParent !== null); }
    g.addEventListener('scroll', onScroll, { passive: true });
    topBtn.addEventListener('click', function () { g.scrollTo({ top: 0, behavior: 'smooth' }); });

    return { destroy: function () { if (io) io.disconnect(); if (spy) spy.disconnect(); g.removeEventListener('scroll', onScroll); } };
  }

  g.StudioDocs = { mount: mount, SECTIONS: SECTIONS };
})(window);
