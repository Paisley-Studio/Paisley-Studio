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
  gold:     '#F5C842',
  logo:     'https://aws-filez.s3.eu-north-1.amazonaws.com/cropped-Paisely-logo-Resized.png'
};

// Single source of truth for every link that points users back to Paisley Studio.
const APP_URL = String(process.env.APP_URL || 'https://www.paisleystudio.online').replace(/\/+$/, '');

const PORTALS = {
  student: APP_URL + '/student/index.html',
  remote:  APP_URL + '/remote/index.html',
  tuition: APP_URL + '/tuition/index.html',
  tech:    APP_URL + '/tech/index.html',
  techCoach:  APP_URL + '/tech/coach/index.html',
  techParent: APP_URL + '/tech/parent/index.html',
  tutor:   APP_URL + '/tutor/login.html',
  parent:  APP_URL + '/parent/index.html',
  admin:   APP_URL + '/admin'
};

// Remote students sign in at their own portal; everyone else uses the normal one.
function studentPortal(student) {
  if (student && student.studentType === 'tech') return PORTALS.tech;
  if (student && student.studentType === 'tuition') return PORTALS.tuition;
  return student && student.studentType === 'remote' ? PORTALS.remote : PORTALS.student;
}

/* Every email says only what is true for the programme it is about: a Tech Studio
   email never mentions the school curriculum, a CBC email never mentions IGCSE. */
const PROGRAMMES = {
  tech:    { name: 'Paisley Tech Studio', tagline: 'Digital creator studio', portalLabel: 'Open Tech Studio' },
  tuition: { name: 'Paisley Studio', tagline: 'CBC tuition', portalLabel: 'Open the CBC Tuition Portal' },
  remote:  { name: 'Paisley Studio', tagline: 'Remote learning', portalLabel: 'Open the Remote Student Portal' },
  online:  { name: 'Paisley Studio', tagline: 'Online classes', portalLabel: 'Open the Student Portal' },
  staff:   { name: 'Paisley Studio', tagline: '', portalLabel: 'Open Paisley Studio' }
};
function programmeOf(student) {
  const t = student && student.studentType;
  return PROGRAMMES[t] ? t : 'online';
}
function portalCta(student) { return PROGRAMMES[programmeOf(student)].portalLabel; }
/* One line for documents such as the work-report PDF. */
function programmeLine(student) {
  const p = PROGRAMMES[programmeOf(student)];
  return p.tagline ? p.name + ' - ' + p.tagline : p.name;
}
/* What the student is enrolled in, in that programme's own words. */
function enrolmentLabel(student) {
  const s = student || {};
  if (programmeOf(s) === 'tuition') return s.year ? 'Grade ' + s.year : (s.keyStage || 'your grade');
  return s.keyStage || 'your classes';
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
function render({ preheader, heading, intro, body, cta, footer, programme, flat }) {
  /* One light, plain look for every email, like the site: a white card on the
     pale page colour, thin lines, no gradients or colour bands. (flat is
     still accepted from older callers; it no longer changes the look.) */
  void flat;
  const prog = PROGRAMMES[programme] || PROGRAMMES.staff;
  const FONT = 'Quicksand,Arial,Helvetica,sans-serif';
  const LINE = '#E3ECEA';
  const ctaHtml = cta && cta.url
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px;">
         <tr><td align="center" bgcolor="${BRAND.deep}" style="border-radius:10px;background:${BRAND.deep};">
           <a href="${esc(cta.url)}" target="_blank"
              style="display:inline-block;padding:11px 20px;font-family:${FONT};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
             ${esc(cta.label || 'Open ' + prog.name)}
           </a>
         </td></tr>
       </table>
       <p style="font-family:${FONT};font-size:11px;color:${BRAND.muted};margin:8px 0 0;word-break:break-all;">
         Or paste this into your browser: ${esc(cta.url)}
       </p>`
    : '';

  const footerHtml = footer
    ? `<div style="padding-top:8px;font-family:${FONT};font-size:12px;color:${BRAND.muted};line-height:1.6;">${footer}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>${esc(heading || prog.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
  @media (max-width:600px) {
    .wrap { width:100% !important; }
    .px   { padding-left:20px !important; padding-right:20px !important; }
    .h1   { font-size:19px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#F4F8F7;color:${BRAND.ink};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${esc(preheader || '')}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F8F7" style="background:#F4F8F7;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" class="wrap" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

          <tr>
            <td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${LINE};border-radius:14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="px" style="padding:18px 32px;border-bottom:1px solid ${LINE};">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" style="width:30px;">
                          <img src="${BRAND.logo}" width="30" height="30" alt="" style="display:block;border-radius:8px;border:0;outline:none;text-decoration:none;" />
                        </td>
                        <td valign="middle" style="padding-left:10px;font-family:${FONT};">
                          <div style="font-size:14px;font-weight:700;color:${BRAND.deep};line-height:1.2;">${esc(prog.name)}</div>
                          ${prog.tagline ? `<div style="font-size:11px;font-weight:600;color:${BRAND.muted};margin-top:2px;">${esc(prog.tagline)}</div>` : ''}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="px" style="padding:26px 32px 28px;font-family:${FONT};font-size:14px;line-height:1.65;color:${BRAND.ink};">
                    ${heading ? `<div class="h1" style="font-family:${FONT};font-size:21px;font-weight:700;line-height:1.3;color:${BRAND.deep};margin:0 0 12px;">${esc(heading)}</div>` : ''}
                    ${intro ? `<p style="margin:0 0 14px;font-size:15px;font-weight:600;color:${BRAND.ink};">${intro}</p>` : ''}
                    ${body || ''}
                    ${ctaHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:16px 32px 0;font-family:${FONT};font-size:11px;color:${BRAND.muted};line-height:1.6;" align="center">
              <div style="font-weight:700;color:${BRAND.deep};">${esc(prog.name)}</div>
              <div>You're receiving this because you have a ${esc(prog.name)} account.</div>
              ${footerHtml}
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
/* Emails use icons, never emoji. Email apps cannot load Font Awesome, so each icon is a
   small PNG rendered from it, hosted at img/email-icons/<icon>-<colour>.png. Only the
   pairs listed here exist; anything else falls back to the muted grey version, or nothing. */
const ICON_BASE = `${APP_URL}/img/email-icons/`;
const ICON_GREY = '5a6e6a';
const ICONS = {
  'book': [], 'book-open': ['55bfb3'], 'layer-group': [], 'file-lines': [], 'file-pen': ['55bfb3'], 'star': [],
  'user-check': [], 'circle-check': ['2eb872'], 'calendar-day': [], 'calendar-xmark': [], 'clock': ['f39c12'],
  'hourglass-half': [], 'rotate-left': ['f39c12'], 'triangle-exclamation': ['e74c3c'], 'clipboard-list': ['e74c3c'],
  'tag': [], 'align-left': [], 'chalkboard-user': [], 'trophy': ['f5c842'], 'play': ['245f5a'],
  'user-clock': ['f39c12'], 'user-xmark': ['e74c3c'], 'scale-balanced': ['e74c3c']
};
function iconUrl(name, color) {
  const key = String(name || '').replace(/^fa-/, '');
  if (!ICONS[key]) return '';
  const want = String(color || '').replace('#', '').toLowerCase();
  return `${ICON_BASE}${key}-${ICONS[key].includes(want) ? want : ICON_GREY}.png`;
}
function fa(name, color) {
  const src = iconUrl(name, color);
  return src ? `<img src="${src}" width="15" height="15" alt="" style="display:inline-block;width:15px;height:15px;border:0;outline:none;vertical-align:-2px;margin-right:7px;" />` : '';
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
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 16px;border:1px solid #E3ECEA;border-radius:10px;">` +
    rows.filter(Boolean).map((r, i) =>
      `<tr><td style="padding:8px 12px;font-size:12px;color:${BRAND.muted};width:34%;vertical-align:top;${i ? 'border-top:1px solid #EEF3F2;' : ''}">${fa(r[0])}${esc(r[1])}</td>` +
      `<td style="padding:8px 12px;font-size:13px;font-weight:600;color:${BRAND.ink};${i ? 'border-top:1px solid #EEF3F2;' : ''}">${esc(r[2])}</td></tr>`).join('') +
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
    `<li>Programme: ${esc(PROGRAMMES[programmeOf(student)].tagline)}</li>`,
    programmeOf(student) === 'tuition'
      ? `<li>Level: ${esc(enrolmentLabel(student))}</li>`
      : `<li>Key Stage: ${esc(student.keyStage || '—')}</li>`,
    programmeOf(student) !== 'tuition' && student.year ? `<li>Year: Year ${esc(student.year)}</li>` : '',
    `<li>Registered: ${esc(new Date().toLocaleString('en-GB'))}</li>`
  ].filter(Boolean).join('');

  return {
    subject: `New student registration — ${student.name || 'Unnamed'}`,
    html: render({
      programme: programmeOf(student),
      preheader: `${student.name || 'A new student'} just registered. Review and approve.`,
      heading: 'New student registration',
      intro: `A new student has registered and is waiting for your approval.`,
      body: `
        <ul style="margin:0 0 14px 18px;padding:0;">${lines}</ul>
        <p style="margin:14px 0 0;color:${BRAND.muted};font-size:13px;">Open Student Management → Student Accounts, change the status from Pending to Active, and the student will be emailed their congratulations automatically.</p>
      `,
      cta: { label: 'Open Studio Desk', url: PORTALS.admin + '#studentmgmt' }
    })
  };
}

/* A card holding someone's sign-in details. Passwords are never stored in readable
   form, so a self-registered student is reminded which password to use. */
function credentialsCard(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E3ECEA;border-radius:10px;margin:0 0 16px;">
    <tr><td style="padding:14px 16px;">
      <div style="font-size:12px;font-weight:700;color:${BRAND.deep};margin-bottom:8px;">Your sign-in details</div>
      ${rows.map((r) => `<div style="font-size:13px;line-height:1.5;margin-bottom:6px;"><span style="color:${BRAND.muted};">${esc(r[0])}</span><br /><strong style="font-weight:600;word-break:break-word;">${r[1]}</strong></div>`).join('')}
    </td></tr>
  </table>`;
}
function stepsList(steps) {
  return `<div style="font-weight:700;color:${BRAND.deep};margin:18px 0 8px;">Your first steps</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;">${steps.map((t, i) =>
      `<tr><td valign="top" style="padding:0 10px 8px 0;"><div style="width:20px;height:20px;line-height:20px;border-radius:10px;background:${BRAND.sage};color:${BRAND.deep};font-size:11px;font-weight:700;text-align:center;">${i + 1}</div></td><td valign="top" style="padding:1px 0 8px;font-size:14px;">${t}</td></tr>`).join('')}</table>`;
}

/* 2. Student — account approved (online and CBC; Tech Studio has its own below) */
function studentApproved({ student }) {
  const programme = programmeOf(student);
  const tuition = programme === 'tuition';
  const where = tuition ? 'CBC tuition at Paisley Studio' : 'Paisley Studio';
  return {
    subject: `Congratulations ${firstName(student.name)}! You've been accepted into ${where}`,
    html: render({
      programme,
      preheader: 'Your enrolment is confirmed and your portal is live. Your sign-in details are inside.',
      heading: `Congratulations, ${firstName(student.name)}!`,
      intro: `You've been accepted into ${esc(where)}.`,
      body: `
        <p style="margin:0 0 16px;">Your enrolment for <strong>${esc(enrolmentLabel(student))}</strong> is confirmed and your learning portal is live. We're really glad you're here.</p>
        ${credentialsCard([
          ['Sign-in page', esc(studentPortal(student))],
          ['Email', esc(student.email || '')],
          ['Password', 'The one you chose when you registered']
        ])}
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">Forgotten your password? Use \u201cForgot your password?\u201d on the sign-in page and we'll email you a reset link.</p>
      `,
      cta: { label: 'Sign in to your portal', url: studentPortal(student) }
    })
  };
}

/* 2b. Tech Studio builder — application approved by the Studio Desk */
function techStudentApproved({ student, coachName }) {
  const first = firstName(student.name);
  return {
    subject: `Congratulations ${first}! You're in Paisley Tech Studio`,
    html: render({
      programme: 'tech',
      preheader: 'Your application is approved and your studio is open. Your sign-in details are inside.',
      heading: `Congratulations, ${first}!`,
      intro: "You've been accepted into Paisley Tech Studio.",
      body: `
        <p style="margin:0 0 16px;">The Studio Desk has approved your application, so your studio is open and ready for your first idea${coachName ? `. <strong>${esc(coachName)}</strong> is your coach and will review your work` : ''}.</p>
        ${credentialsCard([
          ['Sign-in page', esc(PORTALS.tech)],
          ['Email', esc(student.email || '')],
          ['Password', 'The one you created when you applied. If you joined with an existing Paisley login, it is that same password.']
        ])}
        ${stepsList([
          'Sign in and watch the navigation video on your home page.',
          'Open <strong>Classes</strong> and start Level 1: watch the videos, try the practice and hand in your work.',
          'Your coach marks it, and the marks and feedback appear in <strong>Results</strong>.'
        ])}
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">Forgotten your password? Use \u201cForgot your password?\u201d on the sign-in page and we'll email you a reset link.</p>
      `,
      cta: { label: 'Sign in to Tech Studio', url: PORTALS.tech }
    })
  };
}

/* 3. Remote student — admitted by the Studio Desk (custom domain handler) */
function remoteStudentInvite({ student, resetLink }) {
  const finalLink = buildAuthLink(resetLink, PORTALS.remote);

  return {
    subject: `Activate your Paisley Studio remote learning account`,
    html: render({
      programme: 'remote',
      preheader: 'You have been admitted — set your password to open your remote learning portal.',
      heading: `Welcome, ${firstName(student.name)}!`,
      intro: 'Your remote learning place is ready.',
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
      programme: 'remote',
      preheader: `${student.name || 'A remote student'} needs help.`,
      heading: 'New support ticket',
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
      programme: 'staff',
      preheader: 'Your tutor account is live. Here are your sign-in details.',
      heading: 'Welcome to the team',
      intro: `Hi ${esc(firstName(tutor.name))}, your tutor account is live.`,
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
      programme: programmeOf(student),
      preheader: `An account has been created so you can follow ${student.name || 'your child'}'s progress.`,
      heading: 'Set up your Parent Portal',
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

/* 6b. Parent — brand-new account, password is the guardian phone number */
function parentWelcomePhone({ parentName, student, phone }) {
  return {
    subject: `Your Paisley Studio Parent Portal login \u2014 password: ${phone}`,
    html: render({
      programme: programmeOf(student),
      preheader: `Sign in with this email and the phone number ${phone} as your password.`,
      heading: 'Your Parent Portal login',
      intro: `Hi ${esc(firstName(parentName))},`,
      body: `
        <p style="margin:0 0 14px;">An account has been set up so you can follow <strong>${esc(student.name || 'your child')}</strong>'s progress at Paisley Studio \u2014 results, homework, exams, attendance and messages from the Studio Desk.</p>
        <p style="margin:0 0 14px;">Sign in with this email address and your <strong>phone number</strong> as the password: <strong>${esc(phone)}</strong></p>
        <p style="margin:0 0 14px;">This is the guardian phone number ${esc(student.name || 'your child')} gave when signing up. You can change your password any time using \u201cForgot your password?\u201d on the sign-in page.</p>
        <p style="margin:18px 0 0;font-size:13px;color:${BRAND.muted};">If you weren't expecting this, please contact the Studio Desk.</p>
      `,
      cta: { label: 'Open the Parent Portal', url: PORTALS.parent }
    })
  };
}

/* 6c. Parent — existing account: phone number now works as a sign-in */
function parentPhoneLoginUpdate({ parentName, student, phone }) {
  return {
    subject: `You can now sign in to the Paisley Studio Parent Portal with your phone number`,
    html: render({
      programme: programmeOf(student),
      preheader: `Your sign-in details have been updated.`,
      heading: 'Your sign-in has changed',
      intro: `Hi ${esc(firstName(parentName))},`,
      body: `
        <p style="margin:0 0 14px;">We have updated how you sign in to the Parent Portal for <strong>${esc(student.name || 'your child')}</strong>.</p>
        <p style="margin:0 0 14px;">You can now sign in with either your <strong>email address</strong> or your <strong>phone number</strong>. Your password is now your phone number: <strong>${esc(phone)}</strong></p>
        <p style="margin:0 0 14px;">You can change your password any time using \u201cForgot your password?\u201d on the sign-in page.</p>
        <p style="margin:18px 0 0;font-size:13px;color:${BRAND.muted};">If you weren't expecting this, please contact the Studio Desk.</p>
      `,
      cta: { label: 'Open the Parent Portal', url: PORTALS.parent }
    })
  };
}

/* 7. Parent — existing parent, new child linked */
function parentNewChild({ parentName, student }) {
  return {
    subject: `A new child, ${student.name || 'your child'}, has been added to your Parent Portal`,
    html: render({
      programme: programmeOf(student),
      preheader: `${student.name || 'Your child'} has been linked to your existing account. Log in as usual.`,
      heading: 'A new child on your account',
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
      programme: programmeOf(student),
      preheader: `${liveClass.title || 'A class'} on ${liveClass.subject || 'your subject'} has been scheduled.`,
      heading: 'New live class',
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
      programme: programmeOf(student),
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
      cta: { label: portalCta(student), url: studentPortal(student) }
    })
  };
}

/* 10. Parent — new message from admin */
function parentNewMessage({ parentName, student }) {
  return {
    subject: `New message from the Studio Desk about ${student.name || 'your child'}`,
    html: render({
      programme: programmeOf(student),
      preheader: `You have a new reply in your private conversation about ${student.name || 'your child'}.`,
      heading: 'New message from the Studio Desk',
      intro: `Hi ${esc(firstName(parentName))},`,
      body: `
        <p style="margin:0 0 14px;">The Studio Desk has replied in your private conversation about <strong>${esc(student.name || 'your child')}</strong>.</p>
        <p style="margin:0 0 14px;">For privacy, the message content is not shown here — log in to read the full reply and reply back.</p>
      `,
      cta: { label: 'Open Messages', url: programmeOf(student) === 'tech' ? PORTALS.techParent : PORTALS.parent }
    })
  };
}

/* 11. Student — tutor replied to a ticket */
function ticketReplyStudent({ student, ticket }) {
  return {
    subject: `${ticket.targetAdmin ? 'Paisley Studio replied' : 'Your tutor replied'} — ${ticket.subject || 'Support ticket'}`,
    html: render({
      programme: programmeOf(student),
      preheader: `You've got a reply to "${ticket.subject || 'your ticket'}".`,
      heading: 'You have a reply',
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
      programme: programmeOf(student),
      preheader: `${student.name || 'A student'} replied on "${ticket.subject || 'a ticket'}".`,
      heading: 'New ticket reply',
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
  if (submission.status === 'Corrections') {
    const forParent = audience === 'parent';
    return {
      subject: `Corrections requested: ${item.title || label} (${item.subjectName || item.subject || 'Paisley Studio'})`,
      html: render({
      programme: programmeOf(student),
        preheader: `${item.title || 'Work'} has been sent back for corrections.`,
        heading: 'Corrections requested',
        intro: audienceIntro(audience, student, parentName),
        body: `
        <p style="margin:0 0 14px;">${fa('fa-rotate-left', '#F39C12')}The tutor has looked at the ${label} below and asked for ${forParent ? `<strong>${esc((student && student.name) || 'your child')}</strong> to make` : 'you to make'} some corrections before it can be graded.</p>
        ${detailList([
          ['fa-book', 'Subject', item.subjectName || item.subject || '\u2014'],
          ['fa-file-lines', 'Title', item.title || '\u2014'],
          submission.gradedByName ? ['fa-user-check', 'Reviewed by', submission.gradedByName] : null
        ])}
        ${submission.feedback ? `<p style="margin:0 0 6px;font-weight:800;color:${BRAND.deep};">What needs fixing</p><p style="margin:0 0 14px;white-space:pre-wrap;">${esc(submission.feedback)}</p>` : ''}
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">${forParent ? 'Please encourage them to open the work in the portal and upload the corrected version.' : 'Open the work in the portal, read the notes and upload your corrected version.'}</p>
      `,
        cta: { label: forParent ? 'Open the Parent Portal' : portalCta(student), url: portal }
      })
    };
  }
  return {
    subject: `Graded: ${item.title || label} (${item.subjectName || item.subject || 'Paisley Studio'})`,
    html: render({
      programme: programmeOf(student),
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
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">${submission.gradedFileUrl ? 'The marked copy with the tutor\u2019s ink is ready: open the work in the portal and use the green \u201cDownload marked copy\u201d button.' : 'Open the portal to see the full result.'}</p>
      `,
      cta: { label: audience === 'parent' ? 'Open the Parent Portal' : portalCta(student), url: portal }
    })
  };
}

/* 14. Student + parent — one day left */
function homeworkDeadlineReminder({ audience, student, parentName, assignment, dueAt }) {
  return {
    subject: `Reminder: ${assignment.title || 'Homework'} is due within 24 hours`,
    html: render({
      programme: programmeOf(student),
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
      cta: { label: audience === 'parent' ? 'Open the Parent Portal' : portalCta(student), url: audience === 'parent' ? PORTALS.parent : studentPortal(student) }
    })
  };
}

/* 15. Student + parent — deadline missed, 48-hour extension */
function homeworkOverdueGraceNotice({ audience, student, parentName, assignment, dueAt, graceUntil }) {
  return {
    subject: `Overdue: ${assignment.title || 'Homework'} - 48-hour extension`,
    html: render({
      programme: programmeOf(student),
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
      cta: { label: audience === 'parent' ? 'Open the Parent Portal' : portalCta(student), url: audience === 'parent' ? PORTALS.parent : studentPortal(student) }
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
      programme: programmeOf(student),
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
      cta: { label: audience === 'parent' ? 'Open the Parent Portal' : portalCta(student), url: audience === 'parent' ? PORTALS.parent : studentPortal(student) }
    })
  };
}

/* 16b. Student + parents — every piece of work still pending, once it is 24h+ overdue. Repeats until handed in. */
function pendingWorkReport({ audience, student, parentName, items, reportUrl }) {
  const rows = items.map(i =>
    `<tr>
       <td style="padding:8px 10px;border-top:1px solid ${BRAND.line};font-size:13px;">${esc(i.subjectName || '—')}</td>
       <td style="padding:8px 10px;border-top:1px solid ${BRAND.line};font-size:13px;font-weight:700;">${esc(i.title || '—')}<div style="font-weight:400;color:${BRAND.muted};font-size:12px;">${esc(i.kindLabel || '')}</div></td>
       <td style="padding:8px 10px;border-top:1px solid ${BRAND.line};font-size:13px;">${esc(i.dueText || fmtWhen(i.dueAt))}</td>
     </tr>`).join('');
  const who = audience === 'parent' ? `<strong>${esc((student && student.name) || 'your child')}</strong> has` : 'you have';
  return {
    subject: `Pending work report: ${items.length} overdue${audience === 'parent' && student && student.name ? ' - ' + student.name : ''}`,
    html: render({
      programme: programmeOf(student),
      preheader: `${items.length} piece${items.length === 1 ? '' : 's'} of work overdue by more than 24 hours.`,
      heading: 'Pending work report',
      intro: audienceIntro(audience, student, parentName),
      body: `
        <p style="margin:0 0 14px;">${fa('fa-clipboard-list', '#E74C3C')}Here is the work ${who} not handed in yet. Each piece is more than 24 hours past its deadline.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 16px;border:1px solid ${BRAND.line};border-radius:12px;border-collapse:separate;">
          <tr style="background:${BRAND.sage};">
            <th align="left" style="padding:8px 10px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:${BRAND.deep};">Subject</th>
            <th align="left" style="padding:8px 10px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:${BRAND.deep};">Work</th>
            <th align="left" style="padding:8px 10px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:${BRAND.deep};">Deadline</th>
          </tr>
          ${rows}
        </table>
        <p style="margin:0;font-size:13px;color:${BRAND.muted};">A PDF copy is attached and is also in the portal. Late work is still welcome and will be marked. We will send this again every 2 days while work is outstanding.</p>
      `,
      cta: { label: audience === 'parent' ? 'Open the Parent Portal' : portalCta(student), url: audience === 'parent' ? PORTALS.parent : studentPortal(student) }
    })
  };
}

/* 17. Parent — exam paper two days ahead (legacy nested model) */
function examParentReminder({ parentName, student, exam, examDate }) {
  return {
    subject: `Exam paper for ${student && student.name ? student.name : 'your child'}: ${exam.title || 'Exam'}`,
    html: render({
      programme: programmeOf(student),
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
      programme: programmeOf(student),
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
      cta: { label: portalCta(student), url: studentPortal(student) }
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
      programme: programmeOf(student),
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
      programme: programmeOf(student),
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
      cta: { label: portalCta(student), url: studentPortal(student) }
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
      programme: programmeOf(student),
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
        label: forParent ? 'Open the Parent Portal' : portalCta(student),
        url: portal
      }
    })
  };
}

/* ---------------------------------------------------------
   Newsletter to parents, in the Paisley colours. Email cannot play
   video, so a video becomes a "Watch the video" button.
--------------------------------------------------------- */
const NEWSLETTER_LOOK = { bg: BRAND.deep, ink: '#ffffff', ctaBg: BRAND.teal, ctaInk: '#04231f' };
function httpsOnly(u) { u = String(u || '').trim(); return /^https:\/\//i.test(u) ? u : ''; }
function emailLink(u) {
  u = String(u || '').trim();
  if (/^https:\/\//i.test(u)) return u;
  return /^\/(?!\/)/.test(u) ? APP_URL + u : '';
}
function parentNewsletter({ newsletter, parentName, unsubUrl }) {
  const n = newsletter || {};
  const FONT = 'Quicksand,Arial,Helvetica,sans-serif';
  const subject = String(n.subject || '').trim() || 'News from Paisley Studio';
  const image = httpsOnly(n.imageUrl), video = httpsOnly(n.videoUrl);
  const cta = emailLink(n.ctaUrl);
  const paragraphs = String(n.body || '').trim().split(/\n{2,}/).filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const pic = image ? `<img src="${esc(image)}" width="528" alt="${esc(subject)}" style="display:block;width:100%;max-width:528px;height:auto;border:0;border-radius:12px;" />` : '';
  const picLink = video || cta;
  const pictureBlock = pic ? `<div style="margin:0 0 16px;">${picLink ? `<a href="${esc(picLink)}" target="_blank">${pic}</a>` : pic}</div>` : '';
  const videoBlock = video ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr><td bgcolor="${BRAND.sage}" style="background:${BRAND.sage};border-radius:12px;"><a href="${esc(video)}" target="_blank" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:15px;font-weight:800;color:${BRAND.deep};text-decoration:none;">${fa('fa-play', BRAND.deep)}Watch the video</a></td></tr></table>` : '';
  const hello = parentName ? `<p style="margin:0 0 14px;">Hi ${esc(firstName(parentName))},</p>` : '';
  return {
    subject,
    html: render({
      programme: 'staff',
      flat: NEWSLETTER_LOOK,
      preheader: String(n.body || subject).slice(0, 120),
      heading: subject,
      body: pictureBlock + hello + paragraphs + videoBlock,
      cta: cta ? { label: n.ctaLabel || 'Find out more', url: cta } : null,
      footer: `You can <a href="${esc(unsubUrl)}" style="color:${BRAND.deep};font-weight:700;">unsubscribe from newsletters</a> at any time. Messages about your child still reach you.`
    })
  };
}

/* Attendance and punctuality (functions/attendance.js). One template, one plain style.
   kind: late | absent | no_show | strike4_student | strike4_parent | referral_parent | referral_admin | auto_submit_admin */
function attendanceNotice({ kind, audience, recipientName, student, subjectName, tutorName, startAt, arrivedAt, confirmedAt, minutesLate, strikes, academicYear, periodPhrase, unresolved }) {
  const per = esc(periodPhrase || "this academic year");
  const who = esc((student && student.name) || 'your child');
  const hi = recipientName ? `Hi ${esc(firstName(recipientName))},` : 'Hello,';
  const when = startAt ? fmtWhen(startAt) : '—';
  const timeOf = (d) => d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' }) : '—';
  const lessonRows = [
    ['fa-book', 'Subject', subjectName || '—'],
    ['fa-calendar-day', 'Lesson', when],
    tutorName ? ['fa-chalkboard-user', 'Tutor', tutorName] : null
  ];
  const lateRows = lessonRows.concat([
    ['fa-clock', 'Scheduled start', timeOf(startAt)],
    ['fa-user-clock', 'Arrived', timeOf(arrivedAt)],
    ['fa-hourglass-half', 'Minutes late', String(minutesLate == null ? '—' : minutesLate)],
    strikes ? ['fa-triangle-exclamation', 'Late-arrival strikes', `${strikes}${academicYear ? ` (${academicYear})` : ''}`] : null
  ]);
  const muted = (t) => `<p style="margin:0;font-size:13px;color:${BRAND.muted};">${t}</p>`;
  const parentCta = { label: 'Open the Parent Portal', url: PORTALS.parent };
  const K = {
    late: {
      subject: `Late arrival: ${subjectName || 'lesson'}`,
      heading: 'Late arrival',
      lead: `${fa('fa-user-clock', '#F39C12')}<strong>${who}</strong> registered late for today's lesson.`,
      rows: lateRows,
      tail: muted(`Lessons start on time and the first minutes often set up everything that follows, so arriving punctually matters. Every arrival 15 minutes or more after the start counts as one late-arrival strike. Four strikes bring a formal warning and a fifth is referred to the Studio Desk.`),
      cta: parentCta
    },
    absent: {
      subject: `Absent: ${subjectName || 'lesson'}`,
      heading: 'Absence recorded',
      lead: `${fa('fa-user-xmark', '#E74C3C')}<strong>${who}</strong> was recorded absent from this lesson by the tutor.`,
      rows: lessonRows,
      tail: muted('If this is not right, or there was a reason for the absence, reply through Messages in the Parent Portal and the Studio Desk will look into it.'),
      cta: parentCta
    },
    no_show: {
      subject: `Registered but not in class: ${subjectName || 'lesson'}`,
      heading: 'Not found in the live class',
      lead: `${fa('fa-user-xmark', '#E74C3C')}<strong>${who}</strong> registered for this lesson, but was not in the live class when the tutor called the register.`,
      rows: lessonRows.concat([
        ['fa-user-clock', 'Registered at', timeOf(arrivedAt)],
        confirmedAt ? ['fa-chalkboard-user', 'Tutor checked the class at', timeOf(confirmedAt)] : null
      ]),
      tail: muted('Registering is only the first step: the tutor also confirms each student is really in the class. This lesson is recorded as an absence. If this is not right, reply through Messages in the Parent Portal and the Studio Desk will look into it.'),
      cta: parentCta
    },
    strike4_student: {
      subject: 'Formal warning: four late arrivals',
      heading: 'Formal punctuality warning',
      lead: `${fa('fa-triangle-exclamation', '#E74C3C')}You now have <strong>four late-arrival strikes</strong> ${per}.`,
      rows: lateRows,
      tail: muted('This is a formal warning. The next time you arrive 15 minutes or more after a lesson starts, it will be referred to the Studio Desk for disciplinary review. Join your lessons a few minutes early.'),
      cta: { label: portalCta(student), url: studentPortal(student) }
    },
    strike4_parent: {
      subject: `Formal warning: ${(student && student.name) || 'your child'} has four late arrivals`,
      heading: 'Formal punctuality warning',
      lead: `${fa('fa-triangle-exclamation', '#E74C3C')}<strong>${who}</strong> now has <strong>four late-arrival strikes</strong> ${per}.`,
      rows: lateRows,
      tail: muted('The next late arrival will be referred to the Studio Desk for disciplinary review. Please help them join lessons on time.'),
      cta: parentCta
    },
    referral_parent: {
      subject: `Disciplinary referral: ${(student && student.name) || 'your child'}`,
      heading: 'Referred to the Studio Desk',
      lead: `${fa('fa-scale-balanced', '#E74C3C')}<strong>${who}</strong> has reached <strong>${esc(strikes || 5)} late-arrival strikes</strong> ${per}, the disciplinary referral threshold.`,
      rows: lateRows,
      tail: muted('The case has been referred to the Studio Desk for review. No action has been taken yet; the Studio Desk will decide what happens next and will be in touch.'),
      cta: parentCta
    },
    referral_admin: {
      subject: `Disciplinary referral: ${(student && student.name) || 'a student'} (${strikes || 5} strikes)`,
      heading: 'New disciplinary referral',
      lead: `${fa('fa-scale-balanced', '#E74C3C')}<strong>${who}</strong> reached <strong>${esc(strikes || 5)} late-arrival strikes</strong> ${per}.`,
      rows: lateRows,
      tail: muted('Review the referral and record your decision in Attendance on the Studio Desk.'),
      cta: { label: 'Open Attendance', url: PORTALS.admin + '#attendance' }
    },
    auto_submit_admin: {
      subject: `Register auto-submitted: ${subjectName || 'lesson'}`,
      heading: 'Register auto-submitted',
      lead: `${fa('fa-clipboard-list', '#E74C3C')}The tutor did not submit this register, so the system submitted it automatically.`,
      rows: lessonRows.concat([['fa-user-xmark', 'Students unaccounted for', String(unresolved || 0)]]),
      tail: muted('Registrations already made were kept as they were. Students nobody accounted for are left unresolved, not marked absent. The tutor has been asked for an explanation.'),
      cta: { label: 'Open Attendance', url: PORTALS.admin + '#attendance' }
    }
  };
  const k = K[kind] || K.late;
  return {
    subject: k.subject,
    html: render({
      programme: audience === 'admin' ? 'staff' : programmeOf(student),
      preheader: k.subject,
      heading: k.heading,
      intro: hi,
      body: `<p style="margin:0 0 14px;">${k.lead}</p>${detailList(k.rows)}${k.tail}`,
      cta: k.cta
    })
  };
}

module.exports = {
  render,
  programmeOf,
  programmeLine,
  PORTALS,
  APP_URL,
  studentPortal,
  buildAuthLink,
  templates: {
    parentNewsletter,
    adminNewStudentSignup,
    studentApproved,
    techStudentApproved,
    tutorWelcome,
    parentWelcomeNew,
    parentWelcomePhone,
    parentPhoneLoginUpdate,
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
    pendingWorkReport,
    examParentReminder,
    workPosted,
    examPostedParent,
    examPostedStudent,
    examResultsReleased,
    attendanceNotice
  }
};