import React from "react";
import { Img, staticFile } from "remotion";
import { At, BG, C, CAVEAT, DotGrid, ease, L, pop, QUICKSAND, Scene, SCENES, tw, useT, W } from "../lib";

export const S11Welcome: React.FC = () => {
  const t = useT() + SCENES.s11[0];
  const a = L("s11a");
  const logo = tw(t, [a - 0.6, a + 0.3], [0, 1], ease.out);
  const tech = W("s11a", "TECH");
  const words = [
    { w: "LEARN.", at: W("s11b", "Learn"), c: C.brandDeep },
    { w: "CREATE.", at: W("s11b", "Create"), c: C.brand },
    { w: "BUILD.", at: W("s11b", "Build"), c: C.gold },
  ];
  const make = L("s11c") - 0.1;
  const underline = tw(t, [make + 0.6, make + 1.3], [0, 1], ease.inOut);

  return (
    <Scene id="s11" bg={BG.paper} push={0.015} outro={false}>
      <DotGrid color={C.brandDeep} opacity={0.07} />
      {/* a flash of light carries us in from the dark */}
      <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: tw(t, [SCENES.s11[0], SCENES.s11[0] + 0.7], [1, 0]) }} />
      <At x={960} y={250} style={{ opacity: logo, scale: 0.92 + 0.08 * logo }}>
        <Img src={staticFile("img/logo@3x.png")} style={{ width: 380 }} />
      </At>
      <At x={960} y={505}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 40, letterSpacing: "0.34em", color: C.muted, opacity: tw(t, [a - 0.1, a + 0.3], [0, 1]) }}>WELCOME TO</div>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 230, lineHeight: 1, color: C.ink, letterSpacing: `${tw(t, [tech - 0.1, tech + 1.4], [0.35, 0.08])}em`,
            opacity: tw(t, [tech - 0.15, tech + 0.15], [0, 1]), scale: pop(t, tech - 0.15, 0.6) }}>
            TECH
          </div>
        </div>
      </At>
      <At x={960} y={760}>
        <div style={{ display: "flex", gap: 56 }}>
          {words.map((w) => (
            <div key={w.w} style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 96, color: w.c, scale: pop(t, w.at - 0.06, 0.4), opacity: t > w.at - 0.06 ? 1 : 0 }}>{w.w}</div>
          ))}
        </div>
      </At>
      <At x={960} y={920}>
        <div style={{ position: "relative", fontFamily: CAVEAT, fontWeight: 700, fontSize: 84, color: C.brandDeep, opacity: tw(t, [make, make + 0.4], [0, 1]),
          translate: `0 ${(1 - tw(t, [make, make + 0.6], [0, 1])) * 20}px`, whiteSpace: "nowrap" }}>
          Let's make something.
          <svg width={560} height={30} style={{ position: "absolute", left: 20, bottom: -18 }}>
            <path d="M5 20 C 140 6, 380 6, 555 16" fill="none" stroke={C.gold} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray={`${underline} 2`} />
          </svg>
        </div>
      </At>
    </Scene>
  );
};
