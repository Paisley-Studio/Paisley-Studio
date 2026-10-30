import React from "react";
import { AbsoluteFill } from "remotion";
import { C, Center, EV, Glow, LightString, Motes, QUICKSAND, Rise, ease, pop, tw, useSceneT } from "../lib";

const FACTS = ["AGES 9–17", "100% ONLINE", "NO PRIOR CODING EXPERIENCE", "REAL PROJECTS", "REAL COACH FEEDBACK", "BUILD A REAL PORTFOLIO"];

/** 0:46. The offer. $50 is the loudest thing on the screen. */
export const S11Offer: React.FC = () => {
  const t = useSceneT("s11");
  const a = EV.offer;
  const price = a + 0.62;
  const facts = a + 1.3;
  return (
    <AbsoluteFill style={{ background: C.brandDeep, overflow: "hidden" }}>
      <Glow x={960} y={480} r={760} color="rgba(123,203,194,.3)" />
      <Motes t={t} n={10} seed="offer" opacity={0.7} />
      <LightString t={t} y={20} sag={38} bulbs={25} />
      <Center style={{ justifyContent: "flex-start", paddingTop: 92 }}>
        <Rise t={t} at={a - 0.08} dur={0.34} size={92}>FESTIVE CREATOR BOOTCAMP</Rise>
        <Rise t={t} at={a + 0.14} dur={0.34} size={50} color={C.brandSoft}>AI + TECH FOR YOUNG CREATORS</Rise>
        <div style={{ marginTop: 2, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 290, lineHeight: 1, color: C.gold, scale: pop(t, price, 0.42), textShadow: "0 0 80px rgba(245,200,66,.42)" }}>$50</div>
        <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 66, color: "#fff", marginTop: 2, opacity: tw(t, [price + 0.22, price + 0.4], [0, 1]), translate: `0 ${tw(t, [price + 0.22, price + 0.45], [20, 0])}px` }}>≈ KES 6,500</div>
      </Center>
      <div style={{ position: "absolute", left: 90, right: 90, bottom: 66, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "18px 22px" }}>
        {FACTS.map((f, i) => {
          const p = tw(t, [facts + i * 0.2, facts + i * 0.2 + 0.28], [0, 1], ease.back);
          return (
            <div key={f} style={{ padding: "12px 34px", borderRadius: 50, background: i % 2 ? C.brand : C.sage, color: i % 2 ? "#04231f" : C.brandDeep, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 40, whiteSpace: "nowrap", scale: p, opacity: Math.min(1, p * 3) }}>{f}</div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
