import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, EV, GlowLine, QUICKSAND, ease, tw, useSceneTime } from "../lib";

const NODES = ["IGCSE", "CBC", "AI & TECH", "STUDENT", "TUTOR", "PARENT"];
const PX = (i: number) => 230 + i * 292;
const PY = (i: number) => 540 + Math.sin(i * 1.15) * 90;
const PATH = NODES.map((_, i) => `${i === 0 ? "M" : "L"} ${PX(i)} ${PY(i)}`).join(" ");

/** 00:55-01:00. The line runs through the whole journey, everything comes together, the brand lands. */
export const Reveal: React.FC = () => {
  const { t } = useSceneTime("reveal");
  const run = tw(t, [55.0, 55.85], [0, 1], ease.inOut);
  const gather = tw(t, [55.8, EV.impact], [0, 1], ease.in);
  const bloom = tw(t, [EV.impact - 0.05, EV.impact + 0.55], [0, 1], ease.out);
  const logo = tw(t, [EV.impact, EV.impact + 0.8], [0, 1], ease.out);

  return (
    <AbsoluteFill style={{ background: "#06100d", overflow: "hidden" }}>
      {/* the journey */}
      <AbsoluteFill style={{ opacity: 1 - tw(t, [EV.impact - 0.1, EV.impact + 0.1], [0, 1]) }}>
        <div style={{ position: "absolute", inset: 0, opacity: 1 - gather }}>
          <GlowLine d={PATH} progress={run} tail={1} width={4} />
        </div>
        {NODES.map((n, i) => {
          const lit = tw(t, [55.0 + i * 0.15, 55.18 + i * 0.15], [0, 1], ease.back);
          const dx = (960 - PX(i)) * gather;
          const dy = (540 - PY(i)) * gather;
          return (
            <div key={n} style={{ position: "absolute", left: PX(i), top: PY(i), translate: `${dx}px ${dy}px`, opacity: lit }}>
              <div style={{ position: "absolute", left: -13, top: -13, width: 26, height: 26, borderRadius: 13, background: "#fff",
                boxShadow: `0 0 30px 10px ${i < 3 ? C.gold : C.brand}`, scale: 0.6 + lit * 0.4 }} />
              <div style={{ position: "absolute", left: -200, width: 400, top: i % 2 ? 34 : -84, textAlign: "center", fontFamily: QUICKSAND,
                fontWeight: 700, fontSize: 38, letterSpacing: "0.16em", color: "#fff", opacity: 1 - gather }}>{n}</div>
            </div>
          );
        })}
      </AbsoluteFill>

      {/* controlled impact: a bloom of light opens into the brand */}
      <AbsoluteFill style={{
        background: `radial-gradient(circle farthest-corner at 50% 50%, ${C.paper} ${bloom * 100}%, rgba(241,249,247,0) ${bloom * 100 + 14}%)`,
        opacity: bloom > 0 ? 1 : 0,
      }} />
      <AbsoluteFill style={{ background: "#fff", opacity: tw(t, [EV.impact - 0.02, EV.impact + 0.04], [0, 0.6]) * tw(t, [EV.impact + 0.04, EV.impact + 0.5], [1, 0]) }} />

      {/* end card */}
      <AbsoluteFill style={{ alignItems: "center", fontFamily: QUICKSAND, opacity: bloom > 0.3 ? 1 : 0 }}>
        <Img src={staticFile("img/logo@3x.png")} style={{ position: "absolute", top: 205, width: 360, opacity: logo,
          scale: 0.9 + logo * 0.1, filter: `blur(${(1 - logo) * 6}px)` }} />
        <div style={{ position: "absolute", top: 455, fontSize: 104, fontWeight: 700, color: C.ink, opacity: logo,
          letterSpacing: `${0.24 - logo * 0.12}em`, whiteSpace: "nowrap" }}>PAISLEY STUDIO</div>
        <div style={{ position: "absolute", top: 600, width: 820 * tw(t, [56.3, 57.2], [0, 1], ease.inOut), height: 4, borderRadius: 2,
          background: `linear-gradient(90deg, ${C.brand}, ${C.gold}, ${C.brand})` }} />
        <div style={{ position: "absolute", top: 640, display: "flex", gap: 30, fontSize: 46, fontWeight: 700, color: C.brandDeep,
          letterSpacing: "0.08em", opacity: tw(t, [56.9, 57.4], [0, 1]), translate: `0 ${tw(t, [56.9, 57.5], [20, 0])}px` }}>
          <span>IGCSE</span><span style={{ color: C.gold }}>|</span><span>CBC</span><span style={{ color: C.gold }}>|</span><span>AI &amp; TECH</span>
        </div>
        <div style={{ position: "absolute", top: 730, fontSize: 32, fontWeight: 700, color: C.muted, letterSpacing: "0.22em",
          opacity: tw(t, [57.45, 57.95], [0, 1]), translate: `0 ${tw(t, [57.45, 58.0], [16, 0])}px`, whiteSpace: "nowrap" }}>
          ONE CONNECTED LEARNING EXPERIENCE.
        </div>
        <div style={{ position: "absolute", top: 860, fontSize: 34, fontWeight: 700, color: C.brand, letterSpacing: "0.06em",
          opacity: tw(t, [58.0, 58.5], [0, 1]) }}>paisleystudio.online</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
