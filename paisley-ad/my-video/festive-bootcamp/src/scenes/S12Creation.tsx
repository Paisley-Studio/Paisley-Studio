import React from "react";
import { AbsoluteFill, random } from "remotion";
import { At, C, Center, EV, Glow, L, LightString, Rise, W, ease, tw, useSceneT } from "../lib";
import { Thumb } from "../creations";

const KINDS = ["site", "comic", "blog", "portfolio", "game", "poster", "site", "business", "blog", "aiimage", "game", "story"] as const;

/** 0:50. Music at its peak; the children's work flashes behind the type. */
export const S12Creation: React.FC = () => {
  const t = useSceneT("s12");
  const c = EV.creationTime;
  const hit = tw(t, [c - 0.04, c + 0.5], [0, 1]);
  const tick = Math.floor(t / 0.16);
  return (
    <AbsoluteFill style={{ background: C.roomDark, overflow: "hidden" }}>
      <AbsoluteFill style={{ opacity: 0.2 + hit * 0.2 }}>
        {Array.from({ length: 15 }, (_, i) => {
          const k = KINDS[Math.floor(random(`k${i}-${tick + (i % 3)}`) * KINDS.length)];
          return (
            <At key={i} x={190 + (i % 5) * 385} y={190 + Math.floor(i / 5) * 350} style={{ rotate: `${(i % 2 ? 1 : -1) * 3}deg`, scale: 1 + hit * 0.05 }}>
              <Thumb kind={k} size={350} />
            </At>
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(11,38,35,.78) 28%, rgba(11,38,35,.2) 100%)" }} />
      <Glow x={960} y={560} r={850} color="rgba(245,200,66,.32)" opacity={hit} />
      <LightString t={t} y={20} sag={38} bulbs={25} />
      <Center style={{ opacity: 1 - tw(t, [c - 0.08, c + 0.02], [0, 1]) }}>
        <Rise t={t} at={L("s12a") - 0.02} dur={0.28} size={112}>THIS HOLIDAY...</Rise>
        <Rise t={t} at={W("s12a", "don't")} dur={0.3} size={104}>DON'T JUST GIVE THEM</Rise>
        <Rise t={t} at={EV.screenTime} dur={0.26} size={150} color={C.brandSoft}>SCREEN TIME.</Rise>
      </Center>
      <Center style={{ scale: tw(t, [c, c + 0.9], [0.94, 1.03], ease.out) }}>
        <Rise t={t} at={c} dur={0.26} size={120}>GIVE THEM</Rise>
        <Rise t={t} at={c + 0.14} dur={0.28} size={208} color={C.gold} glow="rgba(245,200,66,.55)">CREATION TIME.</Rise>
      </Center>
    </AbsoluteFill>
  );
};
