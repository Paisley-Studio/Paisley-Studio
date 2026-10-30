import React from "react";
import { AbsoluteFill } from "remotion";
import { At, C, Cursor, EV, Glow, LightString, Motes, QUICKSAND, Rise, Type, ease, life, pop, tw, useSceneT } from "../lib";
import { Lockup } from "../art";

/** 0:54. End card: the brand, the price, the invitation. Then the last line. */
export const S13Reserve: React.FC = () => {
  const t = useSceneT("s13");
  const a = EV.endCard;
  const end = EV.letThem;
  const settle = tw(t, [end - 0.18, end + 0.18], [0, 1], ease.inOut);
  const press = life(t, EV.reserve + 0.55, EV.reserve + 0.8, 0.06);
  const kesFlare = life(t, EV.kes, EV.kes + 1.2, 0.2);
  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      <Glow x={960} y={520} r={980} color="rgba(245,200,66,.2)" />
      <Motes t={t} n={10} seed="end" opacity={0.5} />
      <LightString t={t} y={20} sag={38} bulbs={25} wire="rgba(36,95,90,.35)" />

      <At x={960} y={196} style={{ scale: pop(t, a, 0.4) }}><Lockup size={84} /></At>
      <At x={960} y={332}><Rise t={t} at={a + 0.12} dur={0.3} size={58} color={C.brandDeep}>FESTIVE CREATOR BOOTCAMP</Rise></At>

      {/* the last line lands in the space the price makes for it */}
      <At x={960} y={520}>
        <Rise t={t} at={end} dur={0.34} size={178} color={C.brandDeep}>LET THEM <span style={{ color: C.brand }}>CREATE.</span></Rise>
      </At>

      {/* the price: centre stage, then it moves down beside the button */}
      <At x={960 + settle * 385} y={570 + settle * 230} style={{ scale: pop(t, a + 0.3, 0.42) * (1 - settle * 0.5) }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontFamily: QUICKSAND, fontWeight: 700 }}>
          <div style={{ fontSize: 250, lineHeight: 1, color: C.brandDeep }}>$50</div>
          <div style={{ fontSize: 78, lineHeight: 1.1, color: C.muted, scale: 1 + kesFlare * 0.1 }}>≈ KES 6,500</div>
        </div>
      </At>

      <At x={960 - settle * 280} y={880 - settle * 80} style={{ scale: pop(t, EV.reserve + 0.12, 0.34) * (1 - press * 0.05) }}>
        <div style={{ padding: "26px 66px", borderRadius: 60, background: C.gold, color: "#3b2d00", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 66, whiteSpace: "nowrap", letterSpacing: "0.02em", boxShadow: "0 18px 40px rgba(245,200,66,.42)" }}>RESERVE THEIR PLACE</div>
        <div style={{ position: "absolute", right: 110, top: 74, opacity: 1 - settle }}><Cursor x={tw(t, [EV.reserve + 0.1, EV.reserve + 0.55], [150, 0], ease.inOut)} y={tw(t, [EV.reserve + 0.1, EV.reserve + 0.55], [130, 0], ease.inOut)} press={press} scale={1.5} /></div>
      </At>

      <At x={960} y={980} style={{ opacity: tw(t, [end + 0.1, end + 0.4], [0, 1]) }}><Type size={46} color={C.brandDeep} weight={700}>paisleystudio.online/tech</Type></At>
    </AbsoluteFill>
  );
};
