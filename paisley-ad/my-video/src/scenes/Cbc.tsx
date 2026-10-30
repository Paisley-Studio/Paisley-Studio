import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, DemoTag, EV, GlowLine, Headline, Kicker, Person, QUICKSAND, ease, life, tw, useSceneTime } from "../lib";
import { Bell, Header, NAV, PAGE_H, PAGE_W, Sidebar, SubjectCard } from "../ui";

// CBC card bounds inside s5.png (1884 x 853)
const CARD = { x: 121, y: 294, w: 533, h: 486 };
const CS = 1.3; // on-screen scale of the real card

// Stages from tuition.html
const STAGES = [
  ["Lower Primary", "Grades 1–3"],
  ["Upper Primary", "Grades 4–6"],
  ["Junior School", "Grades 7–9"],
  ["Senior School", "Grades 10–12"],
];
// Junior School learning areas (lms-helpers.js, CBC subject catalogue, keyStage 23)
const AREAS = ["English", "Kiswahili", "Mathematics", "Integrated Science", "Pre-Technical Studies", "Social Studies",
  "Creative Arts", "Agriculture"];

/** 00:16-00:27. CBC: its own warmth and rhythm, joined to IGCSE by the same line. */
export const Cbc: React.FC = () => {
  const { t } = useSceneTime("cbc");
  const cardIn = tw(t, [16.0, 16.9], [0, 1], ease.out);
  const trace = tw(t, [16.25, 17.3], [0, 1], ease.inOut);
  const toPortal = tw(t, [20.0, 20.7], [0, 1], ease.inOut);
  const portalIn = tw(t, [20.35, 21.1], [0, 1], ease.out);
  const collapse = tw(t, [25.7, 26.7], [0, 1], ease.in);
  const cw = CARD.w * CS;
  const ch = CARD.h * CS;

  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 75% 55%, #2a3a22 0%, #0c1a15 55%, #060d0b 100%)", overflow: "hidden" }}>
      {/* warm light that marks CBC's own identity */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 40% 50% at 78% 60%, rgba(245,200,66,${0.16 * tw(t, [16, 18], [0, 1])}), transparent 70%)` }} />

      {/* ---- phase A: the real CBC card */}
      {t < 20.8 && (
        <AbsoluteFill style={{ perspective: 2000 }}>
          <div style={{
            position: "absolute", left: 170, top: (1080 - ch) / 2 + 10, width: cw, height: ch,
            rotate: `0 1 0 ${(1 - cardIn) * 70 + 8}deg`, opacity: cardIn * (1 - toPortal),
            translate: `${(1 - cardIn) * -300 + toPortal * 420}px 0px`, scale: 1 + toPortal * 0.5,
          }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: 18, overflow: "hidden", boxShadow: "0 50px 120px rgba(0,0,0,.5)" }}>
              <Img src={staticFile("shots/s5.png")} style={{ position: "absolute", width: 1884 * CS, left: -CARD.x * CS, top: -CARD.y * CS }} />
            </div>
            <GlowLine d={`M 0 ${ch} L 0 20 Q 0 0 20 0 L ${cw - 20} 0 Q ${cw} 0 ${cw} 20 L ${cw} ${ch - 20} Q ${cw} ${ch} ${cw - 20} ${ch} Z`}
              viewBox={`0 0 ${cw} ${ch}`} progress={trace} tail={0.5} width={3} opacity={1 - tw(t, [17.3, 18], [0, 1])} />
          </div>
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ left: 1020, top: 300, opacity: 1 - toPortal }}>
        <Kicker t={t} at={EV.cbcTitle - 0.15} out={20.2} color={C.gold}>CBC TUITION · GRADES 1–12</Kicker>
        <div style={{ height: 14 }} />
        <Headline t={t} at={EV.cbcTitle} out={20.2} size={220}>CBC</Headline>
        <div style={{ height: 30 }} />
        <Kicker t={t} at={18.0} out={20.2} color="#fff" size={34}>LEARNING THAT MOVES</Kicker>
        <Kicker t={t} at={18.2} out={20.2} color="#fff" size={34}>WITH EVERY CHILD.</Kicker>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#fff", opacity: tw(t, [20.25, 20.5], [0, 0.9]) * tw(t, [20.5, 21.0], [1, 0]) }} />

      {/* ---- phase B: the CBC Tuition Portal */}
      {t >= 20.3 && (
        <AbsoluteFill style={{ perspective: 2400, opacity: 1 - collapse }}>
          <div style={{
            position: "absolute", left: 90, top: 150, width: PAGE_W, height: PAGE_H, transformOrigin: "0 0",
            scale: tw(t, [20.3, 21.2, 27], [0.78, 0.64, 0.66], ease.inOut) * (1 - collapse * 0.4),
            rotate: `0 1 0 ${tw(t, [20.3, 21.2], [0, 8], ease.inOut)}deg`, translate: `${collapse * 500}px ${collapse * 180}px`,
            borderRadius: 26, overflow: "hidden", boxShadow: "0 70px 140px rgba(0,0,0,.55)", background: C.paper, opacity: portalIn,
          }}>
            <Sidebar portal="CBC TUITION PORTAL" items={NAV.tuition} active="My Classroom" user="Zawadi Achieng"
              initials="ZA" meta="Junior School · Grade 7" badges={{ "My Homework": 1 }} />
            <Header title="My Classroom" sub="Revision lessons and resources for your subjects">
              <Bell count={1} style={{ right: 40, top: 27 }} />
            </Header>
            <div style={{ position: "absolute", left: 404, top: 160 }}>
              <div style={{ fontFamily: QUICKSAND, fontSize: 27, fontWeight: 700, color: C.brandDeep }}>My Subjects</div>
              <div style={{ fontFamily: QUICKSAND, fontSize: 19, color: C.muted, marginTop: 4 }}>Junior School · Grade 7</div>
              {AREAS.map((s, i) => {
                const a = tw(t, [20.9 + i * 0.08, 21.5 + i * 0.08], [0, 1], ease.out);
                return <SubjectCard key={s} name={s} sub="Grade 7" style={{ left: (i % 4) * 374, top: 82 + Math.floor(i / 4) * 210,
                  opacity: a, translate: `0 ${(1 - a) * 60}px` }} />;
              })}
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* the learner */}
      <Person src="girl.png" light={C.gold} brightness={0.97}
        style={{ right: -170, bottom: -40, width: 1060, height: 866, opacity: tw(t, [20.6, 21.4], [0, 1]) * (1 - collapse),
          translate: `${tw(t, [20.6, 27], [90, -10], ease.soft)}px 0px` }} />

      {/* ---- every stage, one path: the grade bands from tuition.html */}
      <Stages t={t} collapse={collapse} />
      <AbsoluteFill style={{ left: 110, top: 70 }}>
        <Kicker t={t} at={21.2} out={25.9} size={26} color={C.gold}>CBC · LOWER PRIMARY TO SENIOR SCHOOL</Kicker>
      </AbsoluteFill>
      <DemoTag opacity={life(t, 21.0, 25.8)} />
      {/* everything collapses to a single point of light */}
      <AbsoluteFill style={{ display: "grid", placeItems: "center" }}>
        <div style={{ width: 22, height: 22, borderRadius: 11, background: "#fff",
          boxShadow: `0 0 40px 18px ${C.brand}, 0 0 120px 40px ${C.gold}66`,
          opacity: tw(t, [26.2, 26.6], [0, 1]), scale: tw(t, [26.2, 26.8, 27], [0.2, 1.2, 0.8]) }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Stages: React.FC<{ t: number; collapse: number }> = ({ t, collapse }) => {
  const y = 870;
  const xs = [190, 590, 990, 1390];
  const line = tw(t, [EV.cbcGrades - 0.2, EV.cbcGrades + 1.0], [0, 1], ease.inOut);
  return (
    <AbsoluteFill style={{ opacity: life(t, EV.cbcGrades - 0.2, 26.5) }}>
      <GlowLine d={`M 120 ${y + 50} L 1820 ${y + 50}`} progress={line} tail={1} width={3} glow={C.gold} />
      {STAGES.map(([name, grades], i) => {
        const lit = tw(t, [EV.cbcGrades + i * 0.25, EV.cbcGrades + i * 0.25 + 0.3], [0, 1], ease.back);
        // on collapse, every band converges on the centre
        const cx = 960 - (xs[i] + 170);
        return (
          <div key={name} style={{
            position: "absolute", left: xs[i], top: y - 10, width: 340, height: 120, borderRadius: 22,
            background: `rgba(255,255,255,${0.9 + 0.1 * lit})`, fontFamily: QUICKSAND, padding: "20px 26px",
            boxShadow: `0 20px 50px rgba(0,0,0,.35), 0 0 0 ${3 * lit}px ${C.gold}`, opacity: lit,
            translate: `${collapse * cx}px ${(1 - lit) * 40 - collapse * (y - 480)}px`, scale: 1 - collapse * 0.9,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.14em", color: C.brand }}>{grades.toUpperCase()}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: C.brandDeep, marginTop: 6 }}>{name}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
