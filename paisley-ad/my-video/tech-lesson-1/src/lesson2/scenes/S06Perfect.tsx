import React from "react";
import { Robot } from "../../Robot";
import { LUMORA_V1, Picture } from "../creature";
import { Ambient, At, BigWord, C, CAVEAT, DotGrid, E, ease, Kicker, L, life, MONO, pop, QUICKSAND, Scene, Tag, ThinkTimer, tw, useScene, W } from "../lib2";

/** The Lumora prompt with the parts the AI missed marked up. `mark` 0..1 sweeps the highlights in. */
export const MarkedPrompt: React.FC<{ t: number; mark: number[]; size?: number; color?: string }> = ({ t, mark, size = 30, color = "#fff" }) => {
  const parts: (string | [string, number])[] = [
    "Create a small flying creature that lives in a ", ["glowing rainforest", 1], ". It has ", ["four wings", 0],
    ", enormous curious eyes, blue feathers and a ", ["long golden tail", 3], ". It is ", ["friendly", 2], " but extremely fast.",
  ];
  return (
    <div style={{ fontFamily: MONO, fontSize: size, lineHeight: 1.6, color }}>
      {parts.map((p, i) => {
        if (typeof p === "string") return <span key={i}>{p}</span>;
        const m = tw(t, [mark[p[1]], mark[p[1]] + 0.4], [0, 1]);
        return (
          <span key={i} style={{ backgroundImage: `linear-gradient(${C.gold}88, ${C.gold}88)`, backgroundRepeat: "no-repeat", backgroundSize: `${m * 100}% 100%`,
            borderRadius: 6, padding: "0 4px", color: m > 0.5 ? "#fff" : color }}>{p[0]}</span>
        );
      })}
    </div>
  );
};

/** 06: Is it perfect? Probably not. Compare it with the description; AI can miss things. */
export const S06Perfect: React.FC = () => {
  const t = useScene("s06");
  const cmp = L("s06d") - 0.3;
  const split = tw(t, [cmp, cmp + 0.8], [0, 1], ease.inOut);
  const miss = L("s06e") - 0.15;
  const rem = L("s06f") - 0.2;
  const w = 1120 - 260 * split, h = 640 - 150 * split;
  const marks = [0, 1, 2, 3].map((k) => E("s06d") + 0.6 + k * 0.9);
  return (
    <Scene id="s06" push={0.03}>
      <Ambient t={t} opacity={0.25} colors={[C.brand, C.coral, C.violet]} />
      <DotGrid />
      <At x={960} y={110} style={{ opacity: tw(t, [cmp - 0.3, cmp], [1, 0]) }}>
        <BigWord t={t} at={W("s06b", "perfect") - 0.25} size={96}>IS IT PERFECT?</BigWord>
      </At>
      <At x={960} y={110} style={{ opacity: tw(t, [L("s06a") - 0.2, L("s06a") + 0.2], [0, 1]) * tw(t, [W("s06b", "perfect") - 0.5, W("s06b", "perfect") - 0.25], [1, 0]) }}>
        <Kicker t={t} at={L("s06a") - 0.2} color={C.gold} size={30}>DON'T STOP THERE</Kicker>
      </At>
      {/* version 1 */}
      <At x={960 + 400 * split} y={560 + 20 * split} style={{ opacity: tw(t, [rem - 0.3, rem + 0.2], [1, 0]) }}>
        <div style={{ position: "relative", width: w, height: h, borderRadius: 28, overflow: "hidden", border: "2px solid rgba(255,255,255,.14)", boxShadow: "0 50px 120px rgba(0,0,0,.55)",
          scale: 1 + 0.015 * Math.sin(t * 0.9) }}>
          <Picture look={LUMORA_V1} habitat="desert" w={w} h={h} t={t} uid="s06v1" />
          <div style={{ position: "absolute", left: 20, top: 18 }}><Tag color="#fff" size={18}>VERSION 1</Tag></div>
        </div>
      </At>
      <At x={960} y={960} style={{ opacity: life(t, L("s06b") + 0.6, cmp, 0.3) }}>
        <ThinkTimer t={t} from={E("s06b") + 0.1} to={L("s06c") - 0.25} label="LOOK CLOSELY" />
      </At>
      <At x={1500} y={190} style={{ opacity: life(t, L("s06c") - 0.1, cmp + 0.2, 0.25), scale: pop(t, L("s06c") - 0.1, 0.4), rotate: "4deg" }}>
        <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 72, color: C.goldSoft }}>probably not…</div>
      </At>
      {/* the description, to compare */}
      <At x={430} y={540} style={{ opacity: split * tw(t, [rem - 0.3, rem + 0.2], [1, 0]), translate: `${(1 - split) * -80}px 0` }}>
        <div style={{ width: 660, borderRadius: 26, background: "rgba(10,20,17,.9)", border: "2px solid rgba(255,255,255,.14)", padding: "30px 36px" }}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 22, letterSpacing: "0.24em", color: C.brand, marginBottom: 14 }}>WHAT I ASKED FOR</div>
          <MarkedPrompt t={t} mark={marks} size={30} />
        </div>
      </At>
      <At x={960} y={130} style={{ opacity: life(t, cmp + 0.3, miss, 0.3) }}>
        <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 62, color: "#fff" }}>Can you spot what's different?</div>
      </At>
      <At x={960} y={980} style={{ opacity: life(t, E("s06d"), miss, 0.3) }}>
        <ThinkTimer t={t} from={E("s06d") + 0.1} to={miss - 0.1} label="SPOT THE DIFFERENCE" />
      </At>
      {/* AI can miss things */}
      <At x={960} y={160} style={{ opacity: tw(t, [miss, miss + 0.2], [0, 1]) }}>
        <BigWord t={t} at={miss} size={110} color={C.coral} glow={`${C.error}66`}>AI CAN MISS THINGS.</BigWord>
      </At>
      <At x={960} y={640} style={{ opacity: tw(t, [rem, rem + 0.5], [0, 1]) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 70 }}>
          <div style={{ position: "relative", width: 360, height: 360 }}><Robot size={360} backdrop={0.6} look={Math.sin(t * 1.3) * 0.5} /></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <Kicker t={t} at={rem} color="rgba(255,255,255,.6)" size={24}>REMEMBER LESSON 1?</Kicker>
            {[{ w: "POWERFUL", at: W("s06f", "powerful"), c: C.brand }, { w: "AND STILL WRONG SOMETIMES", at: W("s06f", "wrong") - 0.2, c: C.coral }].map((x) => (
              <div key={x.w} style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 54, color: x.c, scale: pop(t, x.at, 0.4), opacity: t > x.at ? 1 : 0, transformOrigin: "left" }}>{x.w}</div>
            ))}
          </div>
        </div>
      </At>
    </Scene>
  );
};
