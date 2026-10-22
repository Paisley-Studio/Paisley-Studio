/* =========================================================
   Paisley Studio — Email Templates
   -----------------------------------------------------------
   One branded HTML shell (`render`) plus one named helper per
   email we send. Every template returns { subject, html }.

   Brand rules:
     • Teal #55BFB3  • Deep green #245F5A  • Sage #E5F2EF
     • Paper #F1F9F7 • Ink #263331          • Muted #5A6E6A
     • Quicksand from Google Fonts (loaded via <link>)
     • Max width 600px, single column, mobile-first
     • Dark-mode safe (color-scheme: light only)
========================================================= */

const BRAND = {
  teal:     '#55BFB3',
  deep:     '#245F5A',
  sage:     '#E5F2EF',
  paper:    '#F1F9F7',
  ink:      '#263331',
  muted:    '#5A6E6A',
  line:     'rgba(38,51,49,.10)',
  logo:     'https://aws-filez.s3.eu-north-1.amazonaws.com/cropped-Paisely-logo-Resized.png'
};

// Single source of truth for every link that points users back to Paisley Studio.
const APP_URL = String(process.env.APP_URL || 'https://www.paisleystudio.online').replace(/\/+$/, '');

const PORTALS = {
  student: APP_URL + '/student/index.html',
  remote:  APP_URL + '/remote/index.html',
  tuition: APP_URL + '/tuition/index.html',
  tutor:   APP_URL + '/tutor/login.html',
  parent:  APP_URL + '/parent/index.html',
  admin:   APP_URL + '/admin'
};

// Remote students sign in at their own portal; everyone else uses the normal one.
function studentPortal(student) {
  if (student && student.studentType === 'tuition') return PORTALS.tuition;
  return student && student.studentType === 'remote' ? PORTALS.remote : PORTALS.student;
}

/* ---------------------------------------------------------
   Crucial: Convert the default ugly Firebaseapp.com link 
   into a beautiful link on our own domain.
--------------------------------------------------------- */
function buildAuthLink(originalLink, portalBaseUrl) {
  try {
    const urlObj = new URL(originalLink);
    const code = urlObj.searchParams.get('oobCode');
    const mode = urlObj.searchParams.get('mode');
    if (code && mode) {
      return `${portalBaseUrl}?mode=${mode}&oobCode=${code}`;
    }
  } catch (e) {
    console.warn("Could not parse Firebase auth link, using fallback", e);
  }
  return originalLink; // fallback if parsing fails
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(full) {
  const s = String(full || '').trim();
  if (!s) return 'there';
  return s.split(/\s+/)[0];
}

/* ---------------------------------------------------------
   The one shell every email is wrapped in.
   --------------------------------------------------------- */
function render({ preheader, heading, intro, body, cta, footer }) {
  const ctaHtml = cta && cta.url
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;">
         <tr><td align="center" style="border-radius:10px;background:${BRAND.teal};">
           <a href="${esc(cta.url)}" target="_blank"
              style="display:inline-block;padding:14px 28px;font-family:Quicksand,Arial,sans-serif;font-size:14px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#04231f;text-decoration:none;border-radius:10px;">
             ${esc(cta.label || 'Open Paisley Studio')}
           </a>
         </td></tr>
       </table>
       <p style="font-family:Quicksand,Arial,sans-serif;font-size:12px;color:${BRAND.muted};margin:4px 0 0;word-break:break-all;">
         Or paste this into your browser: ${esc(cta.url)}
       </p>`
    : '';

  const footerHtml = footer
    ? `<div style="padding:16px 8px 0;font-family:Quicksand,Arial,sans-serif;font-size:12px;color:${BRAND.muted};line-height:1.6;">${footer}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>${esc(heading || 'Paisley Studio')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
<style>
  @media (max-width:600px) {
    .wrap { width:100% !important; }
    .px   { padding-left:20px !important; padding-right:20px !important; }
    .brandName { display:none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.paper};color:${BRAND.ink};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${esc(preheader || '')}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.paper};">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <tr>
            <td style="padding:0 4px 14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="width:46px;">
                    <img src="${BRAND.logo}" width="46" height="46" alt="Paisley Studio" style="display:block;border-radius:10px;border:0;outline:none;text-decoration:none;" />
                  </td>
                  <td valign="middle" class="brandName" style="padding-left:12px;font-family:Quicksand,Arial,sans-serif;">
                    <div style="font-size:18px;font-weight:800;color:${BRAND.deep};line-height:1.1;">Paisley Studio</div>
                    <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.muted};margin-top:3px;">British Curriculum · Online</div>
                  </td>
                  <td valign="middle" align="right" style="font-family:Quicksand,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${BRAND.muted};">
                    ${esc(heading || '')}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="px" style="background:#ffffff;border:1px solid ${BRAND.line};border-radius:16px;padding:32px 36px;font-family:Quicksand,Arial,sans-serif;font-size:15px;line-height:1.65;color:${BRAND.ink};">
              ${intro ? `<p style="margin:0 0 14px;">${intro}</p>` : ''}
              ${body || ''}
              ${ctaHtml}
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:18px 8px 0;">
              <div style="border-top:1px solid ${BRAND.line};padding-top:14px;font-family:Quicksand,Arial,sans-serif;font-size:12px;color:${BRAND.muted};line-height:1.6;">
                <div style="font-weight:700;color:${BRAND.deep};">Paisley Studio</div>
                <div>British Curriculum Online Homeschooling</div>
                <div style="margin-top:6px;">You're receiving this because you have a Paisley Studio account.</div>
                ${footerHtml}
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ---------------------------------------------------------
   Small helpers used by templates
--------------------------------------------------------- */
function fa(name, color) {
  return `<i class="fas ${name}" style="color:${color || BRAND.deep};margin-right:6px;"></i>`;
}
function fmtWhen(d) {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Nairobi' });
}
function fmtDateShort(d) {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}
function detailList(rows) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 16px;background:${BRAND.sage};border-radius:12px;">` +
    rows.filter(Boolean).map(r =>
      `<tr><td style="padding:9px 14px;font-size:13px;color:${BRAND.muted};width:34%;vertical-align:top;">${fa(r[0], BRAND.teal)}${esc(r[1])}</td>` +
      `<td style="padding:9px 14px;font-size:14px;font-weight:700;color:${BRAND.ink};">${esc(r[2])}</td></tr>`).join('') +
    `</table>`;
}
function audienceIntro(audience, student, parentName) {
  return audience === 'parent'
    ? `Hi ${esc(firstName(parentName))},`
    : `Hi ${esc(firstName(student && student.name))},`;
}
function whoLine(audience, student) {
  return audience === 'parent'
    ? `<strong>${esc((student && student.name) || 'your child')}</strong>`
    : 'you';
}

/* =========================================================
   TEMPLATES
========================================================= */

/* 1. Admin — new student registration */
function adminNewStudentSignup({ student }) {
  const lines = [
    `<li>Name: <strong>${esc(student.name || '—')}</strong></li>`,
    `<li>Email: ${esc(student.email || '—')}</li>`,
    `<li>Key Stage: ${esc(student.keyStage || '—')}</li>`,
    student.year ? `<li>Year: Year ${esc(student.year)}</li>` : '',
    `<li>Registered: ${esc(new Date().toLocaleString('en-GB'))}</li>`
  ].filter(Boolean).join('');

  return {
    subject: `New student registration — ${student.name || 'Unnamed'}`,
    html: render({
      preheader: `${student.name || 'A new student'} just registered. Review and approve.`,
      heading: 'Admin alert',
      intro: `A new student has registered and is waiting for your approval.`,
      body: `
        <ul style="margin:0 0 14px 18px;padding:0;">${lines}</ul>
        <p style="margin:14px 0 0;color:${BRAND.muted};font-size:13px;">Open Student Management → Student Accounts, change the status from Pending to Active, and the student will be emailed their congratulations automatically.</p>
      `,
      cta: { label: 'Open Studio Desk', url: PORTALS.admin + '#studentmgmt' }
    })
  };
}

/* 2. Student — account approved (Login uses normal portal, no code needed) */
function studentApproved({ student }) {
  return {
    subject: `Welcome to Paisley Studio — you've been accepted`,
    html: render({
      preheader: 'Congratulations — your enrolment is confirmed and your portal is live.',
      heading: 'Student portal',
      intro: `Congratulations, ${esc(firstName(student.name))}!`,
      body: `
        <p style="margin:0 0 14px;">You've been accepted into <strong>Paisley Studio</strong>. Your enrolment for <strong>${esc(student.keyStage || 'your Key Stage')}</strong> is now confirmed and your learning portal is live.</p>
        <p style="margin:0 0 18px;">We're glad you chose us. Here's to a great term ahead.</p>
        <div style="background:${BRAND.sage};border-radius:12px;padding:16px 18px;margin:0 0 8px;">
          <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.deep};margin-bottom:8px;">Your login details</div>
          <div style="font-size:14px;line-height:1.7;">
            Email: <strong>${esc(student.email || '')}</strong><br />
            Password: the one you chose when you registered
          </div>
        </div>
      `,
      cta: { label: 'Open the Student Portal', url: studentPortal(student) }
    })
  };
}

/* 3. Remote student — admitted by the Studio Desk (custom domain handler) */
function remoteStudentInvite({ student, resetLink }) {
  const finalLink = buildAuthLink(resetLink, PORTALS.remote);

  return {
    subject: `Activate your Paisley Studio remote learning account`,
    html: render({
      preheader: 'You have been admitted — set your password to open your remote learning portal.',
      heading: 'Remote student portal',
      intro: `Welcome, ${esc(firstName(student.name))}!`,
      body: `
        <p style="margin:0 0 14px;">You have been admitted to <strong>Paisley Studio</strong> for remote learning${student.keyStage ? ` in <strong>${esc(student.keyStage)}</strong>` : ''}.</p>
        <p style="margin:0 0 14px;">Click the button below to choose your password. You will be taken directly to your Remote Student portal.</p>
        <p style="margin:18px 0 0;font-size:13px;color:${BRAND.muted};">If you were not expecting this, you can ignore this email — your account is not usable until a password is set.</p>
      `,
      cta: { label: 'Set your password & open portal', url: finalLink },
      footer: `<div style="margin-top:8px;">This link can only be used once and expires for your safety.</div>`
    })
  };
}

/* 4. Admin — a remote student raised a support ticket */
function adminNewRemoteTicket({ student, ticket }) {
  return {
    subject: `New remote student ticket — ${ticket.subject || 'Support ticket'}`,
    html: render({
      preheader: `${student.name || 'A remote student'} needs help.`,
      heading: 'Admin alert',
      intro: `${esc(student.name || 'A remote student')} raised a support ticket.`,
      body: `
        <p style="margin:0 0 8px;"><strong>${esc(ticket.subject || '—')}</strong></p>
        <p style="margin:0 0 14px;white-space:pre-wrap;">${esc(String(ticket.message || '').slice(0, 600))}</p>
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">Reply from Student Tickets in the admin dashboard.</p>
      `,
      cta: { label: 'Open admin dashboard', url: PORTALS.admin }
    })
  };
}

/* 5. Tutor — account created */
function tutorWelcome({ tutor, password }) {
  const passwordLine = password
    ? `Password: <strong>${esc(password)}</strong>`
    : `Password: the one you already use for Paisley Studio`;

  return {
    subject: `Welcome aboard — your Paisley Studio tutor account is ready`,
    html: render({
      preheader: 'Your tutor account is live. Here are your sign-in details.',
      heading: 'Tutor portal',
      intro: `Welcome to the team, ${esc(firstName(tutor.name))}!`,
      body: `
        <p style="margin:0 0 14px;">Your tutor account at <strong>Paisley Studio</strong> is now live. We're glad to have you with us.</p>
        <div style="background:${BRAND.sage};border-radius:12px;padding:16px 18px;margin:0 0 8px;">
          <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.deep};margin-bottom:8px;">Your login details</div>
          <div style="font-size:14px;line-height:1.7;">
            Email: <strong>${esc(tutor.email || '')}</strong><br />
            ${passwordLine}
          </div>
        </div>
      `,
      cta: { label: 'Open the Tutor Portal', url: PORTALS.tutor }
    })
  };
}

/* 6. Parent — brand-new account (custom domain handler) */
function parentWelcomeNew({ parentName, student, resetLink }) {
  const finalLink = buildAuthLink(resetLink, PORTALS.parent);

  return {
    subject: `Set up your Paisley Studio Parent Portal`,
    html: render({
      preheader: `An account has been created so you can follow ${student.name || 'your child'}'s progress.`,
      heading: 'Parent portal',
      intro: `Hi ${esc(firstName(parentName))},`,
      body: `
        <p style="margin:0 0 14px;">An account has been set up so you can follow <strong>${esc(student.name || 'your child')}</strong>'s progress at Paisley Studio — results, homework, exams, attendance and messages from the Studio Desk.</p>
        <p style="margin:0 0 14px;">Click below to set a password. You'll be taken back to the Parent Portal sign-in page, where you can use your email and new password to log in.</p>
        <p style="margin:18px 0 0;font-size:13px;color:${BRAND.muted};">If you weren't expecting this, you can ignore this email — no account is activated until you set a password.</p>
      `,
      cta: { label: 'Set your password & open portal', url: finalLink },
      footer: `<div style="margin-top:8px;">This link can only be used once and expires for your safety.</div>`
    })
  };
}

/* 7. Parent — existing parent, new child linked */
function parentNewChild({ parentName, student }) {
  return {
    subject: `A new child, ${student.name || 'your child'}, has been added to your Parent Portal`,
    html: render({
      preheader: `${student.name || 'Your child'} has been linked to your existing account. Log in as usual.`,
      heading: 'Parent portal',
      intro: `Hello ${esc(firstName(parentName))},`,
      body: `
        <p style="margin:0 0 14px;"><strong>${esc(student.name || 'Your child')}</strong> has just been enrolled at Paisley Studio, and we've linked them to your existing Parent Portal account.</p>
        <p style="margin:0 0 14px;">No password change is needed — just sign in as usual to see their progress. Use the child selector at the top of the dashboard to switch between children.</p>
        <p style="margin:18px 0 0;font-size:13px;color:${BRAND.muted};">If you weren't expecting this, please contact the Studio Desk.</p>
      `,
      cta: { label: 'Open the Parent Portal', url: PORTALS.parent }
    })
  };
}

/* 8. Student + guardian — live class scheduled */
function liveClassScheduled({ recipientName, student, liveClass }) {
  return {
    subject: `New live class: ${liveClass.title || 'Scheduled'}`,
    html: render({
      preheader: `${liveClass.title || 'A class'} on ${liveClass.subject || 'your subject'} has been scheduled.`,
      heading: 'Live class',
      intro: `Hi ${esc(firstName(recipientName))},`,
      body: `
        <p style="margin:0 0 14px;">A new live class has been scheduled for <strong>${esc(student.name || 'your child')}</strong>:</p>
        <ul style="margin:0 0 14px 18px;padding:0;">
          <li>Title: <strong>${esc(liveClass.title || '—')}</strong></li>
          <li>Subject: ${esc(liveClass.subject || '—')}</li>
          <li>Key Stage: ${esc(liveClass.keyStage || '—')}</li>
          ${liveClass.startAt ? `<li>Starts: ${esc(new Date(liveClass.startAt).toLocaleString('en-GB'))}</li>` : ''}
        </ul>
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">The Join button appears on the portal once the class goes live.</p>
      `,
      cta: { label: 'Open Paisley Studio', url: studentPortal(student) }
    })
  };
}

/* 9. Student — homework posted (legacy collection) */
function homeworkAssigned({ student, homework }) {
  return {
    subject: `New homework: ${homework.title || 'Posted'}`,
    html: render({
      preheader: `${homework.title || 'New homework'} has been posted.`,
      heading: 'Homework',
      intro: `Hi ${esc(firstName(student.name))},`,
      body: `
        <p style="margin:0 0 14px;">A new homework has been posted for you:</p>
        <ul style="margin:0 0 14px 18px;padding:0;">
          <li>Title: <strong>${esc(homework.title || '—')}</strong></li>
          <li>Subject: ${esc(homework.subject || '—')}</li>
          ${homework.dueDate ? `<li>Due: ${esc(new Date(homework.dueDate).toLocaleDateString('en-GB'))}</li>` : ''}
        </ul>
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">You can submit from the Homework section of your portal.</p>
      `,
      cta: { label: 'Open the Student Portal', url: studentPortal(student) }
    })
  };
}

/* 10. Parent — new message from admin */
function parentNewMessage({ parentName, student }) {
  return {
    subject: `New message from the Studio Desk about ${student.name || 'your child'}`,
    html: render({
      preheader: `You have a new reply in your private conversation about ${student.name || 'your child'}.`,
      heading: 'Parent portal',
      intro: `Hi ${esc(firstName(parentName))},`,
      body: `
        <p style="margin:0 0 14px;">The Studio Desk has replied in your private conversation about <strong>${esc(student.name || 'your child')}</strong>.</p>
        <p style="margin:0 0 14px;">For privacy, the message content is not shown here — log in to read the full reply and reply back.</p>
      `,
      cta: { label: 'Open Messages', url: PORTALS.parent }
    })
  };
}

/* 11. Student — tutor replied to a ticket */
function ticketReplyStudent({ student, ticket }) {
  return {
    subject: `${ticket.targetAdmin ? 'Paisley Studio replied' : 'Your tutor replied'} — ${ticket.subject || 'Support ticket'}`,
    html: render({
      preheader: `You've got a reply to "${ticket.subject || 'your ticket'}".`,
      heading: 'Student portal',
      intro: `Hi ${esc(firstName(student.name))},`,
      body: `
        <p style="margin:0 0 14px;">${ticket.targetAdmin ? 'The Paisley Studio team has' : 'Your tutor has'} replied to your ticket <strong>"${esc(ticket.subject || '—')}"</strong>.</p>
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">Log in to read the reply and continue the conversation.</p>
      `,
      cta: { label: ticket.targetAdmin ? 'Open Support Tickets' : 'Open Contact Tutor', url: studentPortal(student) }
    })
  };
}

/* 12. Tutor — student replied to a ticket */
function ticketReplyTutor({ student, ticket }) {
  return {
    subject: `New ticket reply from ${student.name || 'a student'}`,
    html: render({
      preheader: `${student.name || 'A student'} replied on "${ticket.subject || 'a ticket'}".`,
      heading: 'Tutor portal',
      intro: `Hi there,`,
      body: `
        <p style="margin:0 0 14px;"><strong>${esc(student.name || 'A student')}</strong> has replied on ticket <strong>"${esc(ticket.subject || '—')}"</strong>.</p>
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">Log in to reply from the Student Tickets section.</p>
      `,
      cta: { label: 'Open the Tutor Portal', url: PORTALS.tutor }
    })
  };
}

/* 13. Student + parent — work graded and released (homework path) */
function homeworkGraded({ audience, student, parentName, kind, item, submission }) {
  const isExam = kind === 'exam';
  const label = isExam ? 'exam' : 'homework';
  const score = submission.grade != null && submission.maxScore != null
    ? `${submission.grade} / ${submission.maxScore}`
    : (submission.grade != null ? String(submission.grade) : 'See feedback');
  const portal = audience === 'parent' ? PORTALS.parent : studentPortal(student);
  return {
    subject: `Graded: ${item.title || label} (${item.subjectName || item.subject || 'Paisley Studio'})`,
    html: render({
      preheader: `${item.title || 'Your work'} has been marked. Score: ${score}.`,
      heading: isExam ? 'Exam graded' : 'Homework graded',
      intro: audienceIntro(audience, student, parentName),
      body: `
        <p style="margin:0 0 14px;">${fa('fa-circle-check', '#2EB872')}The ${label} below has been marked for ${whoLine(audience, student)}.</p>
        ${detailList([
          ['fa-book', 'Subject', item.subjectName || item.subject || '—'],
          ['fa-layer-group', 'Topic', item.topicTitle || '—'],
          ['fa-file-lines', 'Title', item.title || '—'],
          ['fa-star', 'Score', score],
          submission.gradedByName ? ['fa-user-check', 'Marked by', submission.gradedByName] : null
        ])}
        ${submission.feedback ? `<p style="margin:0 0 6px;font-weight:800;color:${BRAND.deep};">Tutor feedback</p><p style="margin:0 0 14px;white-space:pre-wrap;">${esc(submission.feedback)}</p>` : ''}
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">${submission.gradedFileUrl ? 'The marked copy with the tutor\u2019s ink is ready to download from the portal.' : 'Open the portal to see the full result.'}</p>
      `,
      cta: { label: audience === 'parent' ? 'Open the Parent Portal' : 'Open the Student Portal', url: portal }
    })
  };
}

/* 14. Student + parent — one day left */
function homeworkDeadlineReminder({ audience, student, parentName, assignment, dueAt }) {
  return {
    subject: `Reminder: ${assignment.title || 'Homework'} is due within 24 hours`,
    html: render({
      preheader: `${assignment.title || 'Homework'} (${assignment.subjectName || ''}) is due ${fmtWhen(dueAt)}.`,
      heading: 'Homework reminder',
      intro: audienceIntro(audience, student, parentName),
      body: `
        <p style="margin:0 0 14px;">${fa('fa-clock', '#F39C12')}${audience === 'parent'
          ? `This is a friendly reminder that <strong>${esc((student && student.name) || 'your child')}</strong> has homework that is still waiting to be handed in. It is due in less than a day.`
          : 'You have homework that is due in less than a day and has not been handed in yet.'}</p>
        ${detailList([
          ['fa-book', 'Subject', assignment.subjectName || '—'],
          ['fa-layer-group', 'Topic', assignment.topicTitle || '—'],
          ['fa-file-lines', 'Homework', assignment.title || '—'],
          assignment.description ? ['fa-align-left', 'Instructions', assignment.description] : null,
          ['fa-calendar-day', 'Due', fmtWhen(dueAt)],
          assignment.tutorName ? ['fa-chalkboard-user', 'Set by', assignment.tutorName] : null
        ])}
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">${audience === 'parent'
          ? 'Please encourage and help them finish and upload the completed work from their student portal before the deadline. A little support tonight makes a big difference.'
          : 'Open the Homework section of your portal, finish the work and upload it before the deadline.'}</p>
      `,
      cta: { label: audience === 'parent' ? 'Open the Parent Portal' : 'Open the Student Portal', url: audience === 'parent' ? PORTALS.parent : studentPortal(student) }
    })
  };
}

/* 15. Student + parent — deadline missed, 48-hour extension */
function homeworkOverdueGraceNotice({ audience, student, parentName, assignment, dueAt, graceUntil }) {
  return {
    subject: `Overdue: ${assignment.title || 'Homework'} - 48-hour extension`,
    html: render({
      preheader: `Homework ${assignment.title || ''} is overdue. You have until ${fmtWhen(graceUntil)}.`,
      heading: 'Homework overdue',
      intro: audienceIntro(audience, student, parentName),
      body: `
        <p style="margin:0 0 14px;">${fa('fa-triangle-exclamation', '#E74C3C')}Homework <strong>${esc(assignment.title || '')}</strong> for <strong>${esc(assignment.subjectName || '')}</strong> is overdue${audience === 'parent' ? ` for ${whoLine(audience, student)}` : ''}.
        ${audience === 'parent' ? 'They have' : 'You have'} a <strong>48-hour extension</strong> until <strong>${esc(fmtWhen(graceUntil))}</strong>.</p>
        ${detailList([
          ['fa-book', 'Subject', assignment.subjectName || '—'],
          ['fa-layer-group', 'Topic', assignment.topicTitle || '—'],
          ['fa-file-lines', 'Homework', assignment.title || '—'],
          ['fa-calendar-xmark', 'Original deadline', fmtWhen(dueAt)],
          ['fa-hourglass-half', 'Extension ends', fmtWhen(graceUntil)]
        ])}
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">Work still outstanding after the extension is added to an Unattended Work Report, which is sent to the student and the parent.</p>
      `,
      cta: { label: audience === 'parent' ? 'Open the Parent Portal' : 'Open the Student Portal', url: audience === 'parent' ? PORTALS.parent : studentPortal(student) }
    })
  };
}

/* 16. Student + parent — unattended work report */
function unattendedWorkReport({ audience, student, parentName, items, reportUrl }) {
  const rows = items.map(i =>
    `<tr>
       <td style="padding:8px 10px;border-top:1px solid ${BRAND.line};font-size:13px;">${esc(i.subjectName || '—')}</td>
       <td style="padding:8px 10px;border-top:1px solid ${BRAND.line};font-size:13px;">${esc(i.topicTitle || '—')}</td>
       <td style="padding:8px 10px;border-top:1px solid ${BRAND.line};font-size:13px;font-weight:700;">${esc(i.title || '—')}</td>
       <td style="padding:8px 10px;border-top:1px solid ${BRAND.line};font-size:13px;white-space:nowrap;">${esc(fmtWhen(i.dueAt))}</td>
     </tr>`).join('');
  return {
    subject: `Unattended Work Report${audience === 'parent' && student && student.name ? ' - ' + student.name : ''}`,
    html: render({
      preheader: `${items.length} piece${items.length === 1 ? '' : 's'} of work remain unattended after the extension.`,
      heading: 'Unattended work report',
      intro: audienceIntro(audience, student, parentName),
      body: `
        <p style="margin:0 0 14px;">${fa('fa-clipboard-list', '#E74C3C')}The following work was not handed in by ${audience === 'parent' ? `<strong>${esc((student && student.name) || 'your child')}</strong>` : 'you'}, even after the 48-hour extension.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 16px;border:1px solid ${BRAND.line};border-radius:12px;border-collapse:separate;">
          <tr style="background:${BRAND.sage};">
            <th align="left" style="padding:8px 10px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:${BRAND.deep};">Subject</th>
            <th align="left" style="padding:8px 10px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:${BRAND.deep};">Topic</th>
            <th align="left" style="padding:8px 10px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:${BRAND.deep};">Work</th>
            <th align="left" style="padding:8px 10px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:${BRAND.deep};">Deadline</th>
          </tr>
          ${rows}
        </table>
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">A PDF copy of this report is attached and is also available in the portal. Please speak to the tutor if there is a reason the work could not be done.</p>
      `,
      cta: { label: audience === 'parent' ? 'Open the Parent Portal' : 'Open the Student Portal', url: audience === 'parent' ? PORTALS.parent : studentPortal(student) }
    })
  };
}

/* 17. Parent — exam paper two days ahead (legacy nested model) */
function examParentReminder({ parentName, student, exam, examDate }) {
  return {
    subject: `Exam paper for ${student && student.name ? student.name : 'your child'}: ${exam.title || 'Exam'}`,
    html: render({
      preheader: `${exam.title || 'Exam'} takes place on ${fmtWhen(examDate)}. The paper is attached.`,
      heading: 'Exam reminder',
      intro: audienceIntro('parent', student, parentName),
      body: `
        <p style="margin:0 0 14px;">${fa('fa-file-pen', BRAND.teal)}<strong>${esc((student && student.name) || 'Your child')}</strong> has an exam in two days. The paper is attached to this email so you can print it and hand it over on the day.</p>
        ${detailList([
          ['fa-book', 'Subject', exam.subjectName || exam.subject || '—'],
          ['fa-layer-group', 'Topic', exam.topicTitle || '—'],
          ['fa-file-lines', 'Exam', exam.title || '—'],
          ['fa-calendar-day', 'Exam date', fmtWhen(examDate)]
        ])}
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">After the exam, your child uploads the completed paper from their student portal. The same paper is also available for download in the Exams section of the Parent Portal.</p>
      `,
      cta: { label: 'Open the Parent Portal', url: PORTALS.parent }
    })
  };
}

/* 18. Student — new assignment or PDF exam posted (nested model) */
function workPosted({ student, kind, item, dueAt }) {
  const isExam = kind === 'exam';
  return {
    subject: `${isExam ? 'New exam' : 'New homework'}: ${item.title || 'Posted'}`,
    html: render({
      preheader: `${item.title || 'New work'} has been posted for ${item.subjectName || item.subject || 'you'}.`,
      heading: isExam ? 'New exam' : 'New homework',
      intro: `Hi ${esc(firstName(student && student.name))},`,
      body: `
        <p style="margin:0 0 14px;">${fa(isExam ? 'fa-file-pen' : 'fa-book-open', BRAND.teal)}${isExam ? 'An exam has been posted for you.' : 'New homework has been posted for you.'}</p>
        ${detailList([
          ['fa-book', 'Subject', item.subjectName || item.subject || '—'],
          ['fa-layer-group', 'Topic', item.topicTitle || '—'],
          ['fa-file-lines', 'Title', item.title || '—'],
          dueAt ? ['fa-calendar-day', isExam ? 'Exam date' : 'Due', fmtWhen(dueAt)] : null
        ])}
      `,
      cta: { label: 'Open the Student Portal', url: studentPortal(student) }
    })
  };
}

/* =========================================================
   Flat subject-scoped exam templates
========================================================= */

/* 19. Parent — an exam has just been posted (paper attached) */
function examPostedParent({ parentName, student, exam, examDate }) {
  const examType = exam.examType || 'Exam';
  return {
    subject: `New ${examType} for ${student && student.name ? student.name : 'your child'}: ${exam.title || 'Exam'}`,
    html: render({
      preheader: `${examType} — ${exam.title || 'Exam'} on ${fmtDateShort(examDate)}. The paper is attached.`,
      heading: 'Exam posted',
      intro: audienceIntro('parent', student, parentName),
      body: `
        <p style="margin:0 0 14px;">${fa('fa-file-pen', BRAND.teal)}A new <strong>${esc(examType)}</strong> has just been posted for <strong>${esc((student && student.name) || 'your child')}</strong>. The exam paper is attached to this email so you can print it and hand it to them on the day.</p>
        ${detailList([
          ['fa-book', 'Subject', exam.subjectName || exam.subjectId || '—'],
          ['fa-file-lines', 'Exam', exam.title || '—'],
          ['fa-tag', 'Type', examType],
          ['fa-calendar-day', 'Exam date', fmtDateShort(examDate)],
          exam.submissionDeadline
            ? ['fa-hourglass-half', 'Submissions by', fmtDateShort(exam.submissionDeadline.toDate ? exam.submissionDeadline.toDate() : exam.submissionDeadline)]
            : null
        ])}
        ${exam.requirements ? `<p style="margin:0 0 6px;font-weight:800;color:${BRAND.deep};">Requirements</p><p style="margin:0 0 14px;white-space:pre-wrap;">${esc(exam.requirements)}</p>` : ''}
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">When the submission window opens, your child uploads the completed paper from their student portal. You can re-download the paper any time from the Exams section of the Parent Portal.</p>
      `,
      cta: { label: 'Open the Parent Portal', url: PORTALS.parent }
    })
  };
}

/* 20. Student — heads-up that an exam has been posted (no paper attached) */
function examPostedStudent({ student, exam, examDate }) {
  const examType = exam.examType || 'Exam';
  return {
    subject: `Heads-up: ${examType} coming up — ${exam.title || 'Exam'}`,
    html: render({
      preheader: `A ${examType.toLowerCase()} has been posted for ${exam.subjectName || exam.subjectId || 'you'}. Ask your parent to print the paper.`,
      heading: 'Exam posted',
      intro: `Hi ${esc(firstName(student && student.name))},`,
      body: `
        <p style="margin:0 0 14px;">${fa('fa-file-pen', BRAND.teal)}A new <strong>${esc(examType)}</strong> has just been posted for you. Your parent has been emailed the exam paper so they can print it and give it to you on the day.</p>
        ${detailList([
          ['fa-book', 'Subject', exam.subjectName || exam.subjectId || '—'],
          ['fa-file-lines', 'Exam', exam.title || '—'],
          ['fa-tag', 'Type', examType],
          ['fa-calendar-day', 'Exam date', fmtDateShort(examDate)]
        ])}
        ${exam.requirements ? `<p style="margin:0 0 6px;font-weight:800;color:${BRAND.deep};">Requirements</p><p style="margin:0 0 14px;white-space:pre-wrap;">${esc(exam.requirements)}</p>` : ''}
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">On the exam day, work through the printed paper. When the submission window opens in your portal you'll be able to upload a photo or PDF of your completed paper. Look out for a follow-up email from us.</p>
      `,
      cta: { label: 'Open the Student Portal', url: studentPortal(student) }
    })
  };
}

/* 21. Student + parent — results released (flat exam, ink-graded) */
function examResultsReleased({ audience, student, parentName, exam, submission }) {
  const examType = exam.examType || 'Exam';
  const score = submission.grade != null && submission.maxScore != null
    ? `${submission.grade} / ${submission.maxScore}`
    : (submission.grade != null ? String(submission.grade) : 'See feedback');
  const forParent = audience === 'parent';
  const portal = forParent ? PORTALS.parent : studentPortal(student);

  return {
    subject: `Results released: ${exam.title || 'Exam'} (${exam.subjectName || exam.subjectId || 'Paisley Studio'})`,
    html: render({
      preheader: `${forParent ? (student && student.name ? student.name + '\u2019s' : 'Your child\u2019s') : 'Your'} ${examType.toLowerCase()} result is ready. Score: ${score}.`,
      heading: 'Results released',
      intro: forParent
        ? `Hi ${esc(firstName(parentName))},`
        : `Hi ${esc(firstName(student && student.name))},`,
      body: `
        <p style="margin:0 0 14px;">${fa('fa-circle-check', '#2EB872')}The ${examType.toLowerCase()} below has been marked and the results are now available for ${forParent ? `<strong>${esc((student && student.name) || 'your child')}</strong>` : 'you'}.</p>
        ${detailList([
          ['fa-book', 'Subject', exam.subjectName || exam.subjectId || '—'],
          ['fa-file-lines', 'Exam', exam.title || '—'],
          ['fa-tag', 'Type', examType],
          ['fa-star', 'Score', score],
          submission.gradedByName ? ['fa-user-check', 'Marked by', submission.gradedByName] : null
        ])}
        ${submission.feedback ? `<p style="margin:0 0 6px;font-weight:800;color:${BRAND.deep};">Tutor feedback</p><p style="margin:0 0 14px;white-space:pre-wrap;">${esc(submission.feedback)}</p>` : ''}
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">${submission.gradedFileUrl
          ? 'The marked copy with the tutor\u2019s ink is ready to download from the portal.'
          : 'Open the portal to see the full result.'}</p>
      `,
      cta: {
        label: forParent ? 'Open the Parent Portal' : 'Open the Student Portal',
        url: portal
      }
    })
  };
}

module.exports = {
  render,
  PORTALS,
  APP_URL,
  studentPortal,
  buildAuthLink,
  templates: {
    adminNewStudentSignup,
    studentApproved,
    tutorWelcome,
    parentWelcomeNew,
    remoteStudentInvite,
    adminNewRemoteTicket,
    parentNewChild,
    liveClassScheduled,
    homeworkAssigned,
    parentNewMessage,
    ticketReplyStudent,
    ticketReplyTutor,
    homeworkGraded,
    homeworkDeadlineReminder,
    homeworkOverdueGraceNotice,
    unattendedWorkReport,
    examParentReminder,
    workPosted,
    examPostedParent,
    examPostedStudent,
    examResultsReleased
  }
};