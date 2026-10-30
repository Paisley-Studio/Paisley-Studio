import React from "react";
import { AbsoluteFill, random } from "remotion";
import { At, Bulb, C, EV, Glow, LightString, QUICKSAND, SCENES, ease, pop, tw, useSceneT } from "../lib";
import { CAST, Kid, LaptopFront, Room, type Look } from "../art";
import { Blueprint, DesignBoard, Dino, GameScreen, Thumb } from "../creations";

type Beat = {
  at: number;
  bg: string;
  kid: Look;
  text: string;
  hot: string; // the word the eye should catch
  ink: string;
  hotInk: string;
  from: [number, number]; // where the new world opens from: the idea that started it
  card: React.FC<{ t: number; at: number; hideDino?: boolean }>;
};

const BEATS: Beat[] = [
  { at: EV.game, bg: C.room, kid: CAST.baraka, text: "WHAT IF I MADE A", hot: "GAME?", ink: "#fff", hotInk: C.gold, from: [960, 540], card: GameScreen },
  { at: EV.design, bg: C.gold, kid: CAST.neema, text: "WHAT IF I", hot: "DESIGNED SOMETHING?", ink: C.brandDeep, hotInk: "#04231f", from: [930, 500], card: DesignBoard },
  { at: EV.invent, bg: C.brandSoft, kid: CAST.amani, text: "WHAT IF I", hot: "INVENTED SOMETHING?", ink: "#04231f", hotInk: "#fff", from: [930, 400], card: Blueprint },
];

const THUMBS = [
  { k: "comic", a: -2.6, r: 620 }, { k: "site", a: -1.9, r: 540 }, { k: "poster", a: -1.2, r: 620 },
  { k: "business", a: -0.3, r: 700 }, { k: "game", a: 0.12, r: 760 }, { k: "blog", a: 3.04, r: 730 },
] as const;

/** One world opening out of the last, through a circle of light. */
const World: React.FC<{ b: Beat; next: number; t: number }> = ({ b, next, t }) => {
  const open = tw(t, [b.at - 0.14, b.at + 0.14], [0, 1], ease.inOut);
  if (t < b.at - 0.14 || t > next + 0.2) return null;
  const Card = b.card;
  const r = open * 2300;
  const fs = (b.text.length + b.hot.length) > 40 ? 50 : 66;
  return (
    <AbsoluteFill style={{ background: b.bg, clipPath: `circle(${r}px at ${b.from[0]}px ${b.from[1]}px)` }}>
      <div style={{ position: "absolute", left: 70, right: 60, top: 54, fontFamily: QUICKSAND, fontWeight: 700, fontSize: fs, color: b.ink, whiteSpace: "nowrap", translate: `${(1 - tw(t, [b.at - 0.04, b.at + 0.2], [0, 1])) * -60}px 0` }}>
        {b.text} <span style={{ color: b.hotInk }}>{b.hot}</span>
      </div>
      <At x={270} y={800} style={{ scale: pop(t, b.at, 0.28) }}><Kid look={b.kid} expr={b.kid === CAST.baraka ? "laugh" : "smile"} lookX={7} size={460} /></At>
      <At x={1190} y={590} style={{ scale: tw(t, [b.at - 0.1, b.at + 0.26], [0.92, 1.08], ease.out) }}>
        <Card t={t} at={b.at} hideDino={b.at === EV.game && t > EV.design - 0.42} />
      </At>
    </AbsoluteFill>
  );
};

/** 0:15. One idea transforms into another, then they all escape from the screen. */
export const S05Ideas: React.FC = () => {
  const t = useSceneT("s05");
  const end = SCENES.s05[1];
  const burst = EV.burst;
  const heroLeap = tw(t, [EV.design - 0.42, EV.design + 0.02], [0, 1], ease.inOut);
  const burstOn = tw(t, [burst - 0.12, burst + 0.14], [0, 1], ease.inOut);
  const gather = tw(t, [EV.collapse, end - 0.1], [0, 1], ease.in);
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {BEATS.map((b, i) => <World key={b.hot} b={b} t={t} next={i + 1 < BEATS.length ? BEATS[i + 1].at : burst} />)}

      {/* the game's hero jumps out of the screen */}
      {t > EV.design - 0.42 && t < EV.design + 0.14 && (
        <At x={tw(t, [EV.design - 0.42, EV.design], [760, 930], ease.inOut)} y={tw(t, [EV.design - 0.42, EV.design], [640, 400], ease.inOut)} style={{ scale: 1 + heroLeap * 1.3, zIndex: 8 }}>
          <Dino s={0.8} />
        </At>
      )}

      {/* the creations escape into the real world */}
      {t >= burst - 0.12 && (
        <AbsoluteFill style={{ clipPath: `circle(${burstOn * 2300}px at 1190px 590px)` }}>
          <AbsoluteFill style={{ opacity: 1 - gather, scale: 1 - gather * 0.96 }}>
            <Room t={t} sofa={false} />
            <Glow x={960} y={560} r={700} color="rgba(255,235,170,.45)" />
            <At x={960} y={690}><LaptopFront w={700}><Blueprint t={t} at={EV.invent} w={1180} h={680} /></LaptopFront></At>
            {THUMBS.map((th, i) => {
              const p = tw(t, [burst + 0.02 + i * 0.05, burst + 0.5 + i * 0.05], [0, 1], ease.out);
              const dr = (t - burst) * 16;
              return (
                <At key={th.k} x={960 + Math.cos(th.a) * th.r * p} y={620 + Math.sin(th.a) * th.r * 0.72 * p - dr} style={{ scale: 0.2 + p * (1 + (random(th.k) - 0.5) * 0.25), rotate: `${(i % 2 ? 1 : -1) * (4 + i)}deg`, opacity: Math.min(1, p * 4) }}>
                  <Thumb kind={th.k} size={340} />
                </At>
              );
            })}
            <At x={170} y={960} style={{ scale: pop(t, burst + 0.2, 0.3) }}><Kid look={CAST.neema} expr="laugh" lookX={6} size={300} /></At>
            <At x={1750} y={960} style={{ scale: pop(t, burst + 0.28, 0.3) }}><Kid look={CAST.kito} expr="wow" lookX={-6} size={300} /></At>
            <LightString t={t} y={36} sag={46} bulbs={25} />
          </AbsoluteFill>
        </AbsoluteFill>
      )}
      {gather > 0 && <AbsoluteFill style={{ background: "#000", opacity: gather ** 3 }} />}
      {gather > 0.4 && <Bulb x={960} y={540} r={8 + 16 * (1 - gather)} on={1} />}
    </AbsoluteFill>
  );
};
