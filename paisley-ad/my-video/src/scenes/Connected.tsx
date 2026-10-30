import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { faCheck, faFilePdf, faCloudArrowUp, faLightbulb, faUsers } from "@fortawesome/free-solid-svg-icons";
import { C, Cursor, DemoTag, EV, GlowLine, QUICKSAND, ease, life, tw, useSceneTime } from "../lib";
import { Bell, Button, DEMO, Header, Icon, NAV, NotifyPanel, PAGE_H, PAGE_W, Panel, Pill, Sidebar } from "../ui";

const S = 0.66; // screen scale in the world
const SW = PAGE_W * S;
const SH = PAGE_H * S;
const TUTOR = { x: 0, y: 0 };
const STUDENT = { x: 1480, y: 0 };
const PROJECT = { x: 2960, y: 90 };
const PARENT = { x: 4440, y: 290 };
const centre = (p: { x: number; y: number }) => ({ x: p.x + SW / 2, y: p.y + SH / 2 });

/**
 * 00:38-00:47. The system behind the learning, as one chain of real events:
 * tutor releases work -> "New homework posted" -> student submits -> tutor grades and releases
 * -> "Homework graded" -> the project is approved -> everything connected, flowing on to the parent.
 * Labels are the portal's own: "Release to my students", "Submitted — awaiting grading",
 * "Grade & Release", "Graded — see My Results"; notification text is from functions/work.js.
 */
export const Connected: React.FC = () => {
  const { t } = useSceneTime("connected");

  // camera: focus point (world) and zoom
  const keys = [
    { at: 38.0, f: centre(TUTOR), z: 1.12 },
    { at: 38.6, f: centre(TUTOR), z: 1.0 },
    { at: 39.15, f: centre(TUTOR), z: 1.0 },
    { at: 39.45, f: centre(STUDENT), z: 1.0 },
    { at: 40.55, f: centre(STUDENT), z: 1.0 },
    { at: 40.75, f: centre(TUTOR), z: 1.0 },
    { at: 41.6, f: centre(TUTOR), z: 1.0 },
    { at: 41.85, f: centre(STUDENT), z: 1.0 },
    { at: 42.15, f: centre(STUDENT), z: 1.0 },
    { at: 42.4, f: centre(PROJECT), z: 1.0 },
    { at: EV.toWide, f: centre(PROJECT), z: 1.0 },
    { at: EV.toWide + 0.75, f: { x: 2300, y: 360 }, z: 0.39 },
    { at: 46.3, f: { x: 2380, y: 360 }, z: 0.41 },
    { at: 47.0, f: { x: PARENT.x + 90, y: PARENT.y + 90 }, z: 2.4 },
  ];
  const cam = (sel: (k: (typeof keys)[number]) => number) =>
    interpolate(t, keys.map((k) => k.at), keys.map(sel), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease.inOut });
  const fx = cam((k) => k.f.x);
  const fy = cam((k) => k.f.y);
  const z = cam((k) => k.z);
  const wide = tw(t, [EV.toWide, EV.toWide + 0.75], [0, 1], ease.inOut);

  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #16403b 0%, #0a1e1b 60%, #050d0b 100%)", overflow: "hidden" }}>
      <AbsoluteFill style={{ opacity: tw(t, [38.0, 38.3], [0, 1]) * tw(t, [46.75, 47.0], [1, 0]) }}>
        <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0",
          translate: `${960 - fx * z}px ${470 - fy * z}px`, scale: z }}>
          {/* the connecting line between every part of the system */}
          <svg style={{ position: "absolute", left: 0, top: 0, width: 4700, height: 900, overflow: "visible", opacity: wide }}>
            <path d={`M ${SW} ${SH / 2} L ${STUDENT.x} ${SH / 2} M ${STUDENT.x + SW} ${SH / 2} L ${PROJECT.x} ${SH / 2}`} stroke="rgba(123,203,194,.25)" strokeWidth={6} />
          </svg>
          <div style={{ position: "absolute", left: 0, top: 0, width: 4700, height: 900 }}>
            <GlowLine viewBox="0 0 4700 900" width={6}
              d={`M ${SW / 2} ${SH + 60} C ${SW} ${SH + 220}, ${STUDENT.x} ${SH + 220}, ${STUDENT.x + SW / 2} ${SH + 60} S ${PROJECT.x} ${SH + 240}, ${PROJECT.x + 300} ${PROJECT.y + 470} S ${PARENT.x - 120} ${PARENT.y + 260}, ${PARENT.x + 90} ${PARENT.y + 90}`}
              progress={tw(t, [EV.toWide + 0.2, EV.connectedWord, EV.flowToParent, 46.6], [0, 0.62, 0.62, 1], ease.inOut)} tail={1} />
          </div>
          <Labeled at={TUTOR} label="TUTOR" show={wide}><TutorScreen t={t} /></Labeled>
          <Labeled at={STUDENT} label="STUDENT" show={wide}><StudentScreen t={t} /></Labeled>
          <ProjectCard t={t} wide={wide} />
          <ParentNode t={t} />
        </div>
      </AbsoluteFill>

      {/* typography bursts, one word per event, on the spoken word */}
      {Object.entries(EV.words).map(([w, at], i, arr) => {
        const next = i < arr.length - 1 ? arr[i + 1][1] : 46.5;
        const p = tw(t, [at, at + 0.35], [0, 1], ease.out);
        const o = Math.min(p, tw(t, [next - 0.08, next], [1, 0], ease.in));
        return (
          <div key={w} style={{ position: "absolute", left: 0, right: 0, top: 905, textAlign: "center", fontFamily: QUICKSAND, fontWeight: 700,
            fontSize: w === "CONNECTED." ? 104 : 84, letterSpacing: `${0.3 - p * 0.18}em`, color: w === "CONNECTED." ? C.gold : "#fff",
            opacity: o, scale: 0.92 + p * 0.08, filter: `blur(${(1 - p) * 10}px)` }}>{w}</div>
        );
      })}
      <DemoTag opacity={life(t, 38.3, 43.5)} />
    </AbsoluteFill>
  );
};

const Labeled: React.FC<{ at: { x: number; y: number }; label: string; show: number; children: React.ReactNode }> = ({ at, label, show, children }) => (
  <div style={{ position: "absolute", left: at.x, top: at.y, width: SW, height: SH }}>
    <div style={{ width: PAGE_W, height: PAGE_H, scale: S, transformOrigin: "0 0", borderRadius: 30, overflow: "hidden",
      background: C.paper, boxShadow: "0 60px 120px rgba(0,0,0,.5)", position: "relative" }}>{children}</div>
    <div style={{ position: "absolute", left: 0, right: 0, top: -120, textAlign: "center", fontFamily: QUICKSAND, fontWeight: 700,
      fontSize: 72, letterSpacing: "0.2em", color: C.brandSoft, opacity: show }}>{label}</div>
  </div>
);

const press = (t: number, at: number) => tw(t, [at - 0.06, at], [0, 1]) * tw(t, [at, at + 0.15], [1, 0]);

const TutorScreen: React.FC<{ t: number }> = ({ t }) => {
  const released = t >= EV.release;
  const modal = tw(t, [40.6, 40.8], [0, 1], ease.out);
  const score = t >= EV.gradeTypeStart + 0.1 ? (t >= EV.gradeTypeStart + 0.2 ? "18" : "1") : "";
  const fb = "Clear working. Well done.";
  const fbN = Math.floor(tw(t, [EV.gradeTypeStart + 0.25, EV.gradeTypeEnd], [0, fb.length], (x) => x));
  const graded = t >= EV.gradeRelease;
  return (
    <>
      <Sidebar portal="TUTOR PORTAL" items={NAV.tutor} active="Homework Management" user={DEMO.tutor}
        initials={DEMO.tutorInitials} meta="Mathematics · Key Stage 4" />
      <Header title="Homework Management" sub="Homework for the subjects you teach">
        <Bell count={3} style={{ right: 40, top: 27 }} />
      </Header>
      <Panel style={{ left: 404, right: 44, top: 160, height: 300, padding: "30px 36px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.14em", color: C.brand }}>ASSIGNMENT · MATHEMATICS · KEY STAGE 4</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: C.brandDeep, marginTop: 8 }}>{DEMO.work}</div>
        <div style={{ fontSize: 20, color: C.muted, marginTop: 6 }}>Topic: Algebra · Submission deadline Friday · Year 11</div>
        <div style={{ display: "flex", gap: 12, marginTop: 26 }}>
          <Pill kind="neutral">Posted to: Key Stage 4 Mathematics</Pill>
          {released && <Pill kind="ok"><Icon i={faCheck} size={14} /> Released — 3 students</Pill>}
        </div>
        <Button press={press(t, EV.release)} variant={released ? "ghost" : "deep"} style={{ right: 36, top: 36 }}>
          {released ? "— already released" : "Release to my students"}
        </Button>
      </Panel>
      <Panel style={{ left: 404, right: 44, top: 490, height: 300, padding: "26px 36px" }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: C.brandDeep }}>Submissions</div>
        {[[DEMO.student, t >= EV.submit ? (graded ? "Graded" : "Handed in") : "Not yet handed in"], ["Baraka Otieno", "Not yet handed in"], ["Nia Mutua", "Not yet handed in"]].map(([n, s], i) => (
          <div key={n} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0",
            borderBottom: i < 2 ? "1px solid #eef3f2" : "none", fontSize: 21, color: C.ink, fontWeight: 600 }}>
            {n}<Pill kind={s === "Graded" ? "graded" : s === "Handed in" ? "pending" : "neutral"}>{s}</Pill>
          </div>
        ))}
      </Panel>
      {/* grading modal (admin/tutor "Grade" form: Score, Max score, Feedback for the student) */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(15,26,20,.45)", opacity: modal }} />
      <div style={{ position: "absolute", left: 640, top: 90, width: 880, borderRadius: 26, background: "#fff", padding: "32px 40px",
        opacity: modal, scale: 0.94 + modal * 0.06, boxShadow: "0 40px 100px rgba(0,0,0,.35)", fontFamily: QUICKSAND }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: C.brandDeep }}>Grade — {DEMO.work}</div>
        {[["Student", DEMO.student], ["Subject", "Mathematics"], ["Status", graded ? "Graded" : "Submitted"]].map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 20, marginTop: 12, fontSize: 20 }}>
            <span style={{ width: 120, color: C.muted, fontWeight: 600 }}>{k}</span><span style={{ color: C.ink, fontWeight: 700 }}>{v}</span>
          </div>
        ))}
        <div style={{ display: "flex", gap: 20, marginTop: 24 }}>
          <Field label="Score" value={score} w={180} active={t > EV.gradeTypeStart && t < EV.gradeTypeStart + 0.25} />
          <Field label="Max score" value="20" w={180} />
        </div>
        <Field label="Feedback for the student" value={fb.slice(0, fbN)} w={800} h={96} active={fbN > 0 && fbN < fb.length} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginTop: 26, position: "relative", height: 52 }}>
          <Button variant="ghost" style={{ position: "relative" }}>Cancel</Button>
          <Button press={press(t, EV.gradeRelease)} variant="deep" style={{ position: "relative", background: graded ? C.success : C.brandDeep }}>
            {graded ? <><Icon i={faCheck} size={16} /> Graded &amp; released</> : "Grade & Release"}
          </Button>
        </div>
      </div>
      <Cursor t={t} scale={1.5} show={[38.0, 39.2]} clicks={[EV.release]}
        path={[{ at: 38.0, x: 1300, y: 420 }, { at: 38.4, x: 1660, y: 225 }]} />
      <Cursor t={t} scale={1.5} show={[41.0, 41.7]} clicks={[EV.gradeRelease]}
        path={[{ at: 41.0, x: 1100, y: 520 }, { at: 41.42, x: 1400, y: 640 }]} />
    </>
  );
};

const Field: React.FC<{ label: string; value: string; w: number; h?: number; active?: boolean }> = ({ label, value, w, h = 56, active }) => (
  <div style={{ marginTop: 14 }}>
    <div style={{ fontSize: 17, fontWeight: 700, color: C.muted, marginBottom: 6 }}>{label}</div>
    <div style={{ width: w, height: h, borderRadius: 12, border: `2px solid ${active ? C.brand : "#dbe7e4"}`, padding: "12px 16px",
      fontSize: 22, fontWeight: 600, color: C.ink, boxShadow: active ? `0 0 0 4px rgba(85,191,179,.18)` : "none" }}>
      {value}{active && <span style={{ display: "inline-block", width: 2, height: 24, background: C.brandDeep, marginLeft: 2, verticalAlign: "middle" }} />}
    </div>
  </div>
);

const StudentScreen: React.FC<{ t: number }> = ({ t }) => {
  const arrived = t >= EV.notify;
  const panel = life(t, EV.notify + 0.08, EV.openWork + 0.15, 0.15);
  const detail = tw(t, [EV.openWork, EV.openWork + 0.25], [0, 1], ease.out);
  const attached = t >= EV.attach;
  const submitted = t >= EV.submit;
  const graded = t >= EV.studentGraded;
  const toast = life(t, EV.studentGraded, 42.9, 0.2);
  return (
    <>
      <Sidebar portal="STUDENT PORTAL" items={NAV.student} active="Homework" user={DEMO.student}
        initials={DEMO.initials} meta="Key Stage 4 · Year 11" badges={{ Notices: arrived ? 5 : 4 }} />
      <Header title="Homework" sub="Work set in your classes">
        <Bell count={graded ? 4 : arrived ? 3 : 2} pop={tw(t, [EV.notify, EV.notify + 0.3], [0, 1]) + tw(t, [EV.studentGraded, EV.studentGraded + 0.3], [0, 1])}
          ring={Math.max(tw(t, [EV.notify, EV.notify + 0.6], [0, 1]) % 1, 0)} style={{ right: 40, top: 27 }} />
      </Header>
      <div style={{ position: "absolute", left: 404, top: 160, right: 44, opacity: 1 - detail }}>
        <Panel style={{ position: "relative", padding: "26px 36px", height: 200 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.brandDeep }}>Due this week</div>
          <div style={{ fontSize: 20, color: C.muted, marginTop: 14 }}>Nothing due yet. New homework from your tutors appears here.</div>
        </Panel>
      </div>
      {/* the assignment, opened from the notification */}
      <div style={{ position: "absolute", left: 404, top: 160, right: 44, opacity: detail, translate: `${(1 - detail) * 60}px 0` }}>
        <Panel style={{ position: "relative", padding: "30px 36px", height: 620 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.14em", color: C.brand }}>ASSIGNMENT · MATHEMATICS</div>
          <div style={{ fontSize: 34, fontWeight: 700, color: C.brandDeep, marginTop: 8 }}>{DEMO.work}</div>
          <div style={{ fontSize: 20, color: C.muted, marginTop: 6 }}>Set by {DEMO.tutor} · Submission deadline Friday</div>
          <div style={{ marginTop: 28, height: 190, borderRadius: 20, border: `2px dashed ${attached ? C.brand : "#cfe0dc"}`,
            background: attached ? "#f1f9f7" : "#fafcfc", display: "grid", placeItems: "center" }}>
            {attached ? (
              <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 22, fontWeight: 700, color: C.ink,
                scale: tw(t, [EV.attach, EV.attach + 0.2], [0.8, 1], ease.back) }}>
                <Icon i={faFilePdf} size={34} color={C.error} /> my-working.pdf
                <span style={{ fontSize: 17, color: C.muted, fontWeight: 600 }}>1 file</span>
              </div>
            ) : (
              <div style={{ textAlign: "center", color: C.muted, fontSize: 20, fontWeight: 600 }}>
                <Icon i={faCloudArrowUp} size={34} color={C.brand} /><div style={{ marginTop: 10 }}>Upload your work</div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 30, display: "flex", alignItems: "center", gap: 16, position: "relative", height: 52 }}>
            {!submitted && <Button press={press(t, EV.submit)} style={{ position: "relative" }}>Submit</Button>}
            {submitted && !graded && <Pill kind="pending" size={21} style={{ scale: tw(t, [EV.submit, EV.submit + 0.25], [0.8, 1], ease.back) }}>Submitted — awaiting grading</Pill>}
            {graded && <Pill kind="graded" size={21} style={{ scale: tw(t, [EV.studentGraded, EV.studentGraded + 0.25], [0.8, 1], ease.back) }}>Graded — see My Results</Pill>}
            {graded && <span style={{ fontSize: 30, fontWeight: 700, color: C.brandDeep }}>18/20</span>}
          </div>
        </Panel>
      </div>
      <NotifyPanel reveal={panel} style={{ right: 40, top: 104 }} items={[
        { title: "New homework posted", message: `${DEMO.work} (Mathematics)`, when: "Just now", fresh: true },
        { title: "New live class scheduled", message: "Mathematics · Key Stage 4", when: "Yesterday" },
      ]} />
      {/* "Homework graded" (functions/work.js student message) */}
      <div style={{ position: "absolute", right: 40, top: 104, width: 560, borderRadius: 18, background: "#fff", padding: "20px 24px",
        boxShadow: "0 30px 70px rgba(15,26,20,.25), 0 0 0 1px #e2ece9", opacity: toast, translate: `0 ${(1 - toast) * -14}px`, fontFamily: QUICKSAND }}>
        <div style={{ fontWeight: 700, fontSize: 20, color: C.ink }}>Homework graded</div>
        <div style={{ fontSize: 17, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>
          {DEMO.work} (Mathematics) has been graded: 18/20. Open it to see your feedback and download your marked copy.
        </div>
      </div>
      <Cursor t={t} scale={1.5} show={[39.55, 40.7]} clicks={[EV.openWork, EV.attach, EV.submit]}
        path={[{ at: 39.55, x: 1300, y: 400 }, { at: 39.9, x: 1560, y: 190 }, { at: 40.1, x: 1100, y: 470 }, { at: 40.38, x: 530, y: 680 }]} />
    </>
  );
};

const ProjectCard: React.FC<{ t: number; wide: number }> = ({ t, wide }) => {
  const a = tw(t, [42.1, 42.4], [0, 1], ease.out);
  const approved = t >= EV.projectApproved;
  return (
    <div style={{ position: "absolute", left: PROJECT.x, top: PROJECT.y, width: SW, height: SH - 180, borderRadius: 28, background: "#fff",
      boxShadow: "0 60px 120px rgba(0,0,0,.5)", padding: "40px 48px", fontFamily: QUICKSAND, opacity: a, scale: 0.9 + a * 0.1 }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: -120, textAlign: "center", fontWeight: 700, fontSize: 72,
        letterSpacing: "0.2em", color: C.brandSoft, opacity: wide }}>PROJECT</div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 700, letterSpacing: "0.12em",
        color: "#9A6A12", background: "#FFF4DE", padding: "7px 14px", borderRadius: 8 }}>
        <Icon i={faLightbulb} size={16} color="#9A6A12" /> SELF-LED • STUDENT PROJECT</span>
      <div style={{ fontSize: 46, fontWeight: 700, color: C.brandDeep, marginTop: 18 }}>My Portfolio Website</div>
      <div style={{ fontSize: 24, color: C.muted, marginTop: 6 }}>Paisley TECH · Code</div>
      <div style={{ marginTop: 30, display: "flex", gap: 14 }}>
        {approved ? <Pill kind="ok" size={26} style={{ scale: tw(t, [EV.projectApproved, EV.projectApproved + 0.25], [0.8, 1], ease.back) }}>Approved ✓</Pill>
          : <Pill kind="warn" size={26}>Under review</Pill>}
      </div>
    </div>
  );
};

const ParentNode: React.FC<{ t: number }> = ({ t }) => {
  const a = tw(t, [EV.toWide + 0.4, EV.toWide + 0.9], [0, 1], ease.back);
  const lit = tw(t, [46.3, 46.6], [0, 1]);
  return (
    <div style={{ position: "absolute", left: PARENT.x, top: PARENT.y, width: 180, height: 180, borderRadius: 90,
      background: lit ? C.gold : "#fff", display: "grid", placeItems: "center", opacity: a, scale: a,
      boxShadow: `0 0 ${60 + lit * 80}px ${C.gold}88` }}>
      <Icon i={faUsers} size={74} color={C.brandDeep} />
      <div style={{ position: "absolute", top: -120, left: -200, right: -200, textAlign: "center", fontFamily: QUICKSAND, fontWeight: 700,
        fontSize: 72, letterSpacing: "0.2em", color: C.brandSoft }}>PARENT</div>
    </div>
  );
};
