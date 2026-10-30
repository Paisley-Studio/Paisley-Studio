import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { faBookOpen, faChalkboard, faFilePen, faFolderOpen, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { C, Cursor, DemoTag, EV, GlowLine, Headline, Kicker, Person, QUICKSAND, ease, life, tw, useSceneTime } from "../lib";
import { Bell, DEMO, Header, Icon, NAV, PAGE_H, PAGE_W, Pill, Sidebar, SubjectCard } from "../ui";

/** Shared browser frame around the real website screenshots. */
export const Browser: React.FC<{ w: number; children: React.ReactNode; url?: string }> = ({ w, children, url = "paisleystudio.online" }) => (
  <div style={{ width: w, borderRadius: 18, overflow: "hidden", background: "#fff", boxShadow: "0 60px 140px rgba(0,0,0,.55)" }}>
    <div style={{ height: 46, background: "#eef3f2", display: "flex", alignItems: "center", gap: 9, padding: "0 18px" }}>
      {["#ec6a5e", "#f4bf4f", "#61c554"].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
      <div style={{ marginLeft: 18, flex: 1, height: 28, borderRadius: 14, background: "#fff", fontFamily: QUICKSAND, fontSize: 15,
        fontWeight: 600, color: C.muted, display: "flex", alignItems: "center", paddingLeft: 16 }}>🔒 {url}</div>
    </div>
    <div style={{ position: "relative", overflow: "hidden" }}>{children}</div>
  </div>
);

// IGCSE card bounds inside s5.png (1884 x 853)
const S5 = { w: 1884, h: 853, card: { x: 682, y: 294, w: 533, h: 486 } };
const BW = 1180;
const k = BW / S5.w;
const VIEW_H = Math.round(853 * k);

export const Igcse: React.FC = () => {
  const { t } = useSceneTime("igcse");

  // ---- phase A: website, then the IGCSE card
  const outline = tw(t, [5.0, 5.9], [0, 1], ease.inOut);
  const content = tw(t, [5.55, 6.2], [0, 1]);
  const rotY = tw(t, [5.0, 9.6], [-30, -12], ease.inOut);
  const scroll = tw(t, [7.2, 8.5], [0, 1], ease.inOut);
  const lift = tw(t, [EV.igcseCardPick - 0.3, EV.igcseCardPick + 0.4], [0, 1], ease.back);
  const dive = tw(t, [10.1, 10.75], [0, 1], ease.in);
  const phaseA = t < 10.9;

  // ---- phase B: the classroom
  const wipe = tw(t, [10.8, 11.35], [0, 100], ease.inOut);
  const topic = tw(t, [12.65, 13.05], [0, 1], ease.inOut);
  const out = tw(t, [15.45, 16.0], [0, 1], ease.in);

  const cx = (S5.card.x + S5.card.w / 2) * k;
  const cy = (S5.card.y + S5.card.h / 2) * k + 46;

  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 70% 40%, #12332f 0%, #07110f 70%)", overflow: "hidden" }}>
      {phaseA && (
        <AbsoluteFill style={{ perspective: 2200 }}>
          <div style={{
            position: "absolute", left: 790, top: 220, width: BW, transformStyle: "preserve-3d",
            rotate: `0 1 0 ${rotY * (1 - dive)}deg`, scale: 1 + dive * 2.6,
            transformOrigin: `${cx}px ${cy}px`, translate: `${-dive * 260}px ${dive * 20}px`,
          }}>
            <div style={{ opacity: content }}>
              <Browser w={BW}>
                <div style={{ height: VIEW_H, position: "relative" }}>
                  <div style={{ translate: `0 ${-scroll * VIEW_H}px` }}>
                    <Img src={staticFile("shots/s4.png")} style={{ width: BW, display: "block" }} />
                    <Img src={staticFile("shots/s5.png")} style={{ width: BW, display: "block" }} />
                  </div>
                  {/* dim the other programme cards while IGCSE is chosen */}
                  <div style={{ position: "absolute", inset: 0, background: "rgba(5,12,10,.55)", opacity: lift * 0.9 }} />
                  {/* the real IGCSE card, lifted forward */}
                  <div style={{
                    position: "absolute", left: S5.card.x * k, top: S5.card.y * k, width: S5.card.w * k, height: S5.card.h * k,
                    borderRadius: 14, overflow: "hidden", opacity: scroll > 0.99 ? 1 : 0,
                    scale: 1 + lift * 0.08, translate: `0 ${-lift * 10}px`,
                    boxShadow: `0 ${lift * 40}px ${lift * 80}px rgba(0,0,0,.5), 0 0 0 ${lift * 3}px ${C.gold}`,
                  }}>
                    <Img src={staticFile("shots/s5.png")} style={{ width: BW, position: "absolute", left: -S5.card.x * k, top: -S5.card.y * k }} />
                  </div>
                  <Cursor t={t} show={[8.3, 10.3]} clicks={[EV.igcseCardPick]}
                    path={[{ at: 8.3, x: 980, y: 520 }, { at: 8.85, x: 545, y: 440 }]} />
                </div>
              </Browser>
            </div>
            {/* the line draws the window before the site fills it */}
            <div style={{ position: "absolute", inset: 0, opacity: 1 - content * 0.85 }}>
              <GlowLine d={`M 0 ${VIEW_H + 46} L 0 18 Q 0 0 18 0 L ${BW - 18} 0 Q ${BW} 0 ${BW} 18 L ${BW} ${VIEW_H + 28} Q ${BW} ${VIEW_H + 46} ${BW - 18} ${VIEW_H + 46} L 18 ${VIEW_H + 46}`}
                viewBox={`0 0 ${BW} ${VIEW_H + 46}`} progress={outline} tail={1} width={3} />
            </div>
          </div>
          <AbsoluteFill style={{ background: C.brandDeep, opacity: tw(t, [10.55, 10.85], [0, 1], ease.in) }} />
        </AbsoluteFill>
      )}

      {/* Titles for phase A */}
      <AbsoluteFill style={{ left: 120, top: 330, opacity: 1 - dive }}>
        <Kicker t={t} at={EV.igcseTitle - 0.15} out={10.2}>FULLY ONLINE</Kicker>
        <div style={{ height: 18 }} />
        <Headline t={t} at={EV.igcseTitle} out={10.2} size={200}>IGCSE</Headline>
        <div style={{ height: 34 }} />
        <Kicker t={t} at={7.0} out={10.2} color="#fff" size={30}>ACADEMIC LEARNING.</Kicker>
        <Kicker t={t} at={7.25} out={10.2} color={C.gold} size={30}>REAL PROGRESS.</Kicker>
      </AbsoluteFill>

      {/* ---- phase B: student classroom (rebuilt from the supplied Classroom screenshot) */}
      {t >= 10.7 && (
        <AbsoluteFill style={{ perspective: 2400, opacity: 1 - out }}>
          <div style={{
            position: "absolute", left: 470, top: 170, width: PAGE_W, height: PAGE_H, transformOrigin: "0 0",
            scale: tw(t, [10.7, 11.6, 16], [0.8, 0.68, 0.71], ease.inOut),
            rotate: `0 1 0 ${tw(t, [10.7, 11.6, 15.4, 16], [0, -7, -9, -60], ease.inOut)}deg`,
            translate: `${tw(t, [10.7, 11.6], [-470, 0], ease.inOut)}px ${tw(t, [10.7, 11.6], [-150, 0], ease.inOut)}px`,
            borderRadius: 26, overflow: "hidden", boxShadow: "0 70px 140px rgba(0,0,0,.55)", background: C.paper,
          }}>
            <Sidebar portal="STUDENT PORTAL" items={NAV.student} active="Classroom" user={DEMO.student}
              initials={DEMO.initials} meta="Key Stage 4 · Year 11" badges={{ Notices: 4, "Contact Tutor": 1 }} />
            <div style={{ position: "absolute", left: 360, top: 0, right: 0, bottom: 0, clipPath: `inset(0 ${100 - wipe}% 0 0)` }}>
              <Header title={topic < 0.5 ? "Classroom" : "Mathematics"} sub={topic < 0.5 ? "Lessons and resources for your subjects" : "Year 11 · Key Stage 4 · IGCSE"} left={0}>
                <Bell count={2} style={{ right: 210, top: 27 }} />
                <div style={{ position: "absolute", right: 40, top: 32, height: 52, padding: "0 22px", borderRadius: 14, border: "1px solid #dfe9e6",
                  display: "flex", alignItems: "center", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 18, color: C.brandDeep }}>Sign out</div>
              </Header>
              <div style={{ position: "absolute", left: 44, top: 160, right: 0, bottom: 0, opacity: 1 - topic }}>
                <div style={{ fontFamily: QUICKSAND, fontSize: 27, fontWeight: 700, color: C.brandDeep }}>My Classes</div>
                <div style={{ fontFamily: QUICKSAND, fontSize: 19, color: C.muted, marginTop: 4 }}>Lessons, notes and resources for the subjects you take.</div>
                {["English", "Mathematics", "Biology", "Geography", "Business Studies", "Accounting", "Physics", "Computer Science"].map((s, i) => {
                  const a = tw(t, [11.05 + i * 0.07, 11.6 + i * 0.07], [0, 1], ease.out);
                  const isMaths = s === "Mathematics";
                  const hl = isMaths ? tw(t, [12.1, 12.45], [0, 1]) : 0;
                  return (
                    <SubjectCard key={s} name={s} sub="Year 11" badge={isMaths || s === "Computer Science" ? 1 : undefined}
                      highlight={hl}
                      style={{ left: (i % 4) * 374, top: 82 + Math.floor(i / 4) * 210, opacity: a,
                        translate: `0 ${(1 - a) * 60}px`, scale: 1 + hl * 0.03 }} />
                  );
                })}
              </div>
              <TopicView t={t} reveal={topic} />
            </div>
            <Cursor t={t} show={[11.7, 13.0]} clicks={[EV.openMaths]}
              path={[{ at: 11.7, x: 1400, y: 700 }, { at: 12.35, x: 1170, y: 360 }]} scale={1.3} />
          </div>
        </AbsoluteFill>
      )}

      {/* the learner in front of their classroom */}
      <Person src="guy.png" light={C.brand} brightness={0.95}
        style={{ left: -260, bottom: -60, width: 1000, height: 740, opacity: tw(t, [11.2, 12.0], [0, 1]) * (1 - out),
          translate: `${tw(t, [11.2, 16], [-80, 40], ease.soft)}px 0px` }} />
      <AbsoluteFill style={{ left: 110, top: 90, opacity: life(t, 11.6, 15.7) }}>
        <Kicker t={t} at={11.6} out={15.7} size={26}>IGCSE · KEY STAGE 4</Kicker>
      </AbsoluteFill>
      <DemoTag opacity={life(t, 11.2, 15.8)} />
    </AbsoluteFill>
  );
};

/** Inside a class: topics hold lessons, assignments and exams (classrooms/{cid}/topics/{tid}). */
const TopicView: React.FC<{ t: number; reveal: number }> = ({ t, reveal }) => {
  const rows = [
    { icon: faBookOpen, kind: "LESSON", title: "Solving simultaneous equations", meta: "Lesson notes · Resources", pill: null },
    { icon: faFolderOpen, kind: "RESOURCE", title: "Worked examples (PDF)", meta: "Resources", pill: null },
    { icon: faChalkboard, kind: "ASSIGNMENT", title: DEMO.work, meta: "Submission deadline · Friday", pill: "Open" },
    { icon: faFilePen, kind: "EXAM", title: "Algebra check-in", meta: "Exam date · next week", pill: "Exam" },
  ];
  return (
    <div style={{ position: "absolute", left: 44, top: 150, right: 44, opacity: reveal, translate: `${(1 - reveal) * 80}px 0` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: QUICKSAND, fontSize: 19, color: C.muted, fontWeight: 600 }}>
        My Classes <Icon i={faChevronRight} size={13} /> <span style={{ color: C.brandDeep }}>Mathematics</span>
      </div>
      <div style={{ marginTop: 22, borderRadius: 24, background: "#fff", border: "1px solid #e2ece9", padding: "26px 30px" }}>
        <div style={{ fontFamily: QUICKSAND, fontSize: 14, fontWeight: 700, letterSpacing: "0.14em", color: C.brand }}>TOPIC</div>
        <div style={{ fontFamily: QUICKSAND, fontSize: 28, fontWeight: 700, color: C.brandDeep, marginTop: 2 }}>Algebra</div>
        {rows.map((r, i) => {
          const a = tw(t, [12.9 + i * 0.16, 13.4 + i * 0.16], [0, 1]);
          const focus = r.kind === "ASSIGNMENT" ? tw(t, [14.2, 14.6], [0, 1]) : 0;
          return (
            <div key={r.title} style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 16, padding: "18px 22px", borderRadius: 18,
              background: focus ? `rgba(85,191,179,${0.12 * focus})` : "#f7fbfa", border: `1px solid ${focus ? C.brand : "#e6efed"}`,
              opacity: a, translate: `0 ${(1 - a) * 30}px`, fontFamily: QUICKSAND }}>
              <div style={{ width: 54, height: 54, borderRadius: 14, background: "#e7f6f4", display: "grid", placeItems: "center" }}>
                <Icon i={r.icon} size={22} color={C.brandDeep} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: C.muted }}>{r.kind}</div>
                <div style={{ fontSize: 23, fontWeight: 700, color: C.ink }}>{r.title}</div>
                <div style={{ fontSize: 17, color: C.muted }}>{r.meta}</div>
              </div>
              {r.pill && <Pill kind="neutral" size={18}>{r.pill}</Pill>}
            </div>
          );
        })}
      </div>
    </div>
  );
};
