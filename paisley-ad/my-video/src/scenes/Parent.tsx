import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { C, DemoTag, EV, Headline, Person, QUICKSAND, ease, life, tw, useSceneTime } from "../lib";
import { DEMO, Icon, PAGE_H, PAGE_W, Panel, ParentChrome } from "../ui";

// Parent overview tiles, as in the supplied Parent Portal screenshot (values are demo data)
const TILES = [
  ["78%", "OVERALL AVERAGE"],
  ["12/12", "HOMEWORK SUBMITTED"],
  ["6", "ACTIVITIES COMPLETED"],
  ["9", "GRADED ASSESSMENTS"],
];

/** 00:47-00:55. The parent's view: progress, feedback and activity in one place. */
export const Parent: React.FC = () => {
  const { t } = useSceneTime("parent");
  const S = 0.6;
  // camera across the dashboard: notification -> tiles (progress) -> recent activity
  const keys = [
    { at: 47.0, x: 0, y: 0, z: 1.0 },
    { at: EV.parentOpen, x: 0, y: 0, z: 1.0 },
    { at: EV.parentProgress, x: -20, y: -60, z: 1.06 },
    { at: EV.parentActivity - 0.3, x: -20, y: -60, z: 1.06 },
    { at: EV.parentActivity + 0.4, x: -20, y: -230, z: 1.08 },
    { at: 54.2, x: -20, y: -240, z: 1.1 },
    { at: 55.0, x: 0, y: -100, z: 0.5 },
  ];
  const cam = (k: "x" | "y" | "z") => interpolate(t, keys.map((q) => q.at), keys.map((q) => q[k]),
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease.inOut });
  const notify = life(t, EV.parentNotify, EV.parentOpen + 0.5, 0.25);
  const out = tw(t, [54.4, 55.0], [0, 1], ease.in);

  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 30% 60%, #3a2e1c 0%, #15120c 55%, #080706 100%)", overflow: "hidden" }}>
      {/* soft warm home light */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 35% 50% at 22% 55%, rgba(255,214,150,${0.2 * tw(t, [47, 48.5], [0, 1])}), transparent 70%)` }} />
      <Person src="African.png" light={C.gold} brightness={0.96}
        style={{ left: -150, bottom: -30, width: 980, height: 838, opacity: tw(t, [47.0, 47.8], [0, 1]) * (1 - out),
          translate: `${tw(t, [47, 55], [-30, 30], ease.soft)}px 0px`, scale: tw(t, [47, 55], [1.04, 1], ease.soft) }} />

      {/* the dashboard on the parent's screen */}
      <AbsoluteFill style={{ perspective: 2600, opacity: 1 - out * 0.6 }}>
        <div style={{
          position: "absolute", left: 740, top: 236, width: PAGE_W * S, height: PAGE_H * S + 260 * S, borderRadius: 26, overflow: "hidden",
          boxShadow: "0 60px 140px rgba(0,0,0,.6)", rotate: `0 1 0 ${tw(t, [47, 48.6], [24, 7], ease.out)}deg`,
          translate: `${tw(t, [47, 48.4], [110, 0], ease.out)}px 0px`, opacity: tw(t, [47.1, 47.7], [0, 1]),
          scale: 1 - out * 0.5, transformOrigin: "50% 50%",
        }}>
          <div style={{ width: PAGE_W, height: PAGE_H + 260, scale: S, transformOrigin: "0 0", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, transformOrigin: "1150px 300px",
              translate: `${cam("x")}px ${cam("y")}px`, scale: cam("z") }}>
              <ParentChrome bell={t >= EV.parentNotify ? 3 : 2} bellPop={tw(t, [EV.parentNotify, EV.parentNotify + 0.3], [0, 1])}
                bellRing={tw(t, [EV.parentNotify, EV.parentNotify + 0.7], [0, 1]) % 1}>
                <Overview t={t} />
              </ParentChrome>
              {/* the parent's "Homework graded" message (functions/work.js parentMsg) */}
              <div style={{ position: "absolute", right: 50, top: 150, width: 640, borderRadius: 20, background: "#fff", padding: "22px 26px",
                boxShadow: "0 30px 70px rgba(15,26,20,.28), 0 0 0 1px #e2ece9", opacity: notify, translate: `0 ${(1 - notify) * -18}px`,
                fontFamily: QUICKSAND, zIndex: 5 }}>
                <div style={{ fontWeight: 700, fontSize: 22, color: C.ink }}>Homework graded</div>
                <div style={{ fontSize: 18, color: C.muted, marginTop: 6, lineHeight: 1.45 }}>
                  {DEMO.student}'s homework "{DEMO.work}" (Mathematics) has been graded: 18/20. The marked copy is in the Parent Portal.
                </div>
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ left: 110, top: 66 }}>
        <Headline t={t} at={EV.parentTitle} out={54.6} size={58} weight={700}>YOUR CHILD'S JOURNEY.</Headline>
        <div style={{ height: 8 }} />
        <Headline t={t} at={EV.parentTitle + 0.35} out={54.6} size={58} color={C.gold}>MORE CONNECTED.</Headline>
      </AbsoluteFill>
      <DemoTag opacity={life(t, 47.6, 54.4)} />
    </AbsoluteFill>
  );
};

const Overview: React.FC<{ t: number }> = ({ t }) => {
  const reveal = (i: number) => tw(t, [47.6 + i * 0.12, 48.2 + i * 0.12], [0, 1], ease.out);
  const progress = tw(t, [EV.parentProgress - 0.1, EV.parentProgress + 0.3], [0, 1]) * tw(t, [EV.parentActivity - 0.4, EV.parentActivity], [1, 0.25]);
  const fresh = tw(t, [EV.parentActivity, EV.parentActivity + 0.45], [0, 1], ease.out);
  const feedback = tw(t, [EV.parentFeedback - 0.1, EV.parentFeedback + 0.3], [0, 1]) * tw(t, [EV.parentActivity - 0.4, EV.parentActivity], [1, 0.25]);
  const rows = [
    { title: DEMO.work, meta: "Homework result · 10/29/2026", score: "90%", isNew: true },
    { title: "Algebra check-in", meta: "Exam result · 10/22/2026", score: "74%" },
    { title: "Reading comprehension", meta: "Homework result · 10/20/2026", score: "81%" },
  ];
  return (
    <div style={{ position: "absolute", left: 386, right: 50, top: 190, fontFamily: QUICKSAND }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, opacity: reveal(0) }}>
        <span style={{ fontSize: 34, fontWeight: 700, color: C.brandDeep }}>Overview</span>
        <span style={{ fontSize: 19, color: C.ink }}>· {DEMO.student} (Key Stage 4)</span>
      </div>
      <Panel style={{ position: "relative", marginTop: 26, height: 118, padding: "26px 30px", opacity: reveal(1) }}>
        <div style={{ fontSize: 23, fontWeight: 700, color: C.ink }}><Icon i={faWandMagicSparkles} size={20} color={C.ink} /> Paisley TECH</div>
        <div style={{ fontSize: 19, color: C.muted, marginTop: 6 }}>Amani is also building with Paisley TECH. See their projects, progress and coach.</div>
        <div style={{ position: "absolute", right: 30, top: 32, height: 52, padding: "0 26px", borderRadius: 14, background: C.brandDeep, color: "#fff",
          display: "flex", alignItems: "center", fontWeight: 700, fontSize: 19 }}>Open TECH dashboard</div>
      </Panel>
      <div style={{ display: "flex", gap: 22, marginTop: 30 }}>
        {TILES.map(([v, l], i) => {
          const hl = i === 0 ? progress : i === 3 ? feedback : 0;
          return (
            <div key={l} style={{ flex: 1, height: 122, borderRadius: 22, background: hl ? `rgba(85,191,179,${0.14 + hl * 0.16})` : C.sage,
              border: `${hl ? 3 : 1}px solid ${hl ? C.brand : "#d9ebe7"}`, display: "grid", placeItems: "center", opacity: reveal(2 + i),
              scale: 1 + hl * 0.04, boxShadow: hl ? `0 18px 40px rgba(36,95,90,${hl * 0.25})` : "none" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 34, fontWeight: 700, color: C.brandDeep }}>{v}</div>
                <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "0.1em", color: C.ink, marginTop: 6 }}>{l}</div>
              </div>
            </div>
          );
        })}
      </div>
      <Panel style={{ position: "relative", marginTop: 30, padding: "26px 30px 10px", opacity: reveal(6) }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: C.ink }}>Recent activity</div>
        {rows.map((r) => {
          const a = r.isNew ? fresh : 1;
          return (
            <div key={r.title} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 12px",
              borderBottom: "1px solid #eef3f2", opacity: a, height: r.isNew ? 82 * a : 82, overflow: "hidden",
              background: r.isNew ? `rgba(245,200,66,${0.16 * a * (1 - tw(t, [53.8, 54.4], [0, 1]))})` : "transparent", borderRadius: 12,
              translate: `${(1 - a) * 40}px 0` }}>
              <div>
                <div style={{ fontSize: 21, fontWeight: 700, color: C.ink }}>{r.title}</div>
                <div style={{ fontSize: 17, color: C.muted }}>{r.meta}</div>
              </div>
              <span style={{ padding: "6px 16px", borderRadius: 999, background: C.sage, fontWeight: 700, fontSize: 17, color: C.brandDeep,
                boxShadow: r.isNew ? `0 0 0 ${3 * fresh}px ${C.gold}` : "none" }}>{r.score}</span>
            </div>
          );
        })}
      </Panel>
    </div>
  );
};
