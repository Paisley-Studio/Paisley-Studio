import React from "react";
import { faListCheck, faLightbulb, faStar } from "@fortawesome/free-solid-svg-icons";
import { GENERIC, GLOWY, LANTERN, Picture, type HabitatKind, type Look } from "../creature";
import { Ambient, At, BigWord, C, CAVEAT, DotGrid, E, ease, Generated, Icon, Kicker, L, life, pop, PromptBox, QUICKSAND, Scene, tw, useScene, W } from "../lib2";

const IW = 560, IH = 400;

/** 04: the first big secret. A lazy prompt, a better one, a specific one: same AI, three results. */
export const S04Specific: React.FC = () => {
  const t = useScene("s04");
  const p3 = "A round, friendly creature from a deep sea cave. Orange, with purple spots, tiny wings instead of fins, and a belly that glows like a lantern.";
  const p3at = W("s04j", "round") - 0.1;
  const cols: { x: number; text: string; at: number; cps: number; send: number; look: Look; hab: HabitatKind; words: number; label: string }[] = [
    { x: 340, text: "Make me a cool creature.", at: L("s04c") - 0.05, cps: 26, send: E("s04c") + 0.15, look: GENERIC, hab: "plain", words: 5, label: "PROMPT 1" },
    { x: 960, text: "Make an underwater creature that glows.", at: L("s04g") - 0.05, cps: 22, send: E("s04g") + 0.15, look: GLOWY, hab: "ocean", words: 6, label: "PROMPT 2" },
    { x: 1580, text: p3, at: p3at, cps: p3.length / (E("s04j") - p3at - 0.4), send: E("s04j") + 0.15, look: LANTERN, hab: "cave", words: 27, label: "PROMPT 3" },
  ];
  const cmp = L("s04l") - 0.2;
  const shrink = tw(t, [cmp, cmp + 0.7], [0, 1], ease.inOut);
  const eq = L("s04n") - 0.3;
  const colsOut = tw(t, [eq, eq + 0.5], [1, 0], ease.inOut);
  const see = L("s04k") - 0.1;
  const guesses = [
    { w: "shape?", x: 130, y: 470 }, { w: "colour?", x: 560, y: 520 }, { w: "home?", x: 170, y: 780 }, { w: "mood?", x: 540, y: 800 },
  ];
  return (
    <Scene id="s04" push={0.02}>
      <Ambient t={t} opacity={0.3} colors={[C.brand, C.violet, C.coral]} />
      <DotGrid />
      <At x={960} y={70} style={{ opacity: tw(t, [L("s04a") - 0.2, L("s04a") + 0.3], [0, 1]) * colsOut }}>
        <Kicker t={t} at={L("s04a") - 0.2} color={C.gold} size={30}>THE FIRST BIG SECRET</Kicker>
      </At>
      <div style={{ position: "absolute", inset: 0, opacity: colsOut, scale: 1 - 0.16 * shrink, translate: `0 ${-70 * shrink}px` }}>
        {cols.map((c, i) => {
          const started = t >= c.at - 0.3;
          const glow = i === 2 ? tw(t, [see, see + 0.6], [0, 1]) : 0;
          return (
            <React.Fragment key={i}>
              <At x={c.x} y={160} style={{ opacity: started ? tw(t, [c.at - 0.3, c.at], [0, 1]) : 0 }}>
                <div style={{ position: "absolute", left: -IW / 2, top: 0 }}>
                  <PromptBox t={t} at={c.at} text={c.text} cps={c.cps} width={IW} size={22} send={c.send} label={c.label} />
                </div>
              </At>
              <At x={c.x} y={690} style={{ opacity: started ? 1 : 0.35, scale: 1 + 0.04 * glow }}>
                <div style={{ borderRadius: 28, boxShadow: glow ? `0 0 ${60 * glow}px ${C.gold}88` : undefined }}>
                  <Generated t={t} at={c.send + 0.1} dur={1.9} w={IW} h={IH} seed={`p${i}`}>
                    <Picture look={c.look} habitat={c.hab} w={IW} h={IH} t={t} uid={`p${i}`} />
                  </Generated>
                </div>
              </At>
              {/* how much the AI was told */}
              <At x={c.x} y={935} style={{ opacity: tw(t, [see, see + 0.4], [0, 1]) }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 22, letterSpacing: "0.16em", color: "rgba(255,255,255,.7)" }}>DETAIL</div>
                  <div style={{ width: 260, height: 14, borderRadius: 7, background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 7, width: `${tw(t, [see + 0.1 + i * 0.15, see + 0.9 + i * 0.15], [0, [0.12, 0.3, 1][i]]) * 100}%`,
                      background: [C.muted, C.brand, C.gold][i] }} />
                  </div>
                  <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 22, color: [C.muted, C.brandSoft, C.gold][i] }}>{c.words} words</div>
                </div>
              </At>
            </React.Fragment>
          );
        })}
        {/* reactions */}
        <At x={340} y={935} style={{ opacity: life(t, L("s04d"), see - 0.2, 0.3) }}>
          <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 50, color: "rgba(255,255,255,.85)", rotate: "-2deg" }}>…technically a creature</div>
        </At>
        {guesses.map((g, k) => (
          <At key={g.w} x={g.x} y={g.y} style={{ opacity: life(t, W("s04e", "guess") + k * 0.15, L("s04f") + 0.5, 0.25), scale: pop(t, W("s04e", "guess") + k * 0.15, 0.35) }}>
            <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 44, color: C.night, background: C.goldSoft, borderRadius: 16, padding: "0 16px", rotate: `${(k % 2 ? 4 : -4)}deg` }}>{g.w}</div>
          </At>
        ))}
        <At x={960} y={935} style={{ opacity: life(t, L("s04h") - 0.1, see - 0.2, 0.3), scale: pop(t, L("s04h") - 0.1, 0.4) }}>
          <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 54, color: C.brandSoft }}>better!</div>
        </At>
      </div>
      {/* same AI, different instructions */}
      <At x={960} y={900} style={{ opacity: tw(t, [cmp, cmp + 0.4], [0, 1]) * colsOut }}>
        <div style={{ display: "flex", gap: 40, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 52 }}>
          <span style={{ color: "#fff", opacity: tw(t, [W("s04l", "same"), W("s04l", "same") + 0.3], [0, 1]) }}>SAME AI.</span>
          <span style={{ color: C.brandSoft, opacity: tw(t, [W("s04l", "different"), W("s04l", "different") + 0.3], [0, 1]) }}>DIFFERENT INSTRUCTIONS.</span>
        </div>
      </At>
      <At x={960} y={1000} style={{ opacity: colsOut }}>
        <BigWord t={t} at={W("s04l", "explain") - 0.2} size={74} color={C.gold} glow={`${C.gold}55`}>BE SPECIFIC.</BigWord>
      </At>
      {/* the equation */}
      <At x={960} y={520} style={{ opacity: tw(t, [eq + 0.2, eq + 0.6], [0, 1]) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
          {[
            { w: "YOUR IDEA", icon: faLightbulb, c: C.gold, at: W("s04n", "idea") - 0.2 },
            { w: "+", at: W("s04n", "plus") - 0.1 },
            { w: "CLEAR INSTRUCTIONS", icon: faListCheck, c: C.brand, at: W("s04n", "clear") - 0.2 },
            { w: "=", at: W("s04n", "equals") - 0.1 },
            { w: "BETTER RESULTS", icon: faStar, c: C.coral, at: W("s04n", "better") - 0.2 },
          ].map((b) =>
            b.icon ? (
              <div key={b.w} style={{ width: 430, height: 330, borderRadius: 34, background: `${b.c}1F`, border: `3px solid ${b.c}`, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 30, scale: pop(t, b.at, 0.5), opacity: t > b.at ? 1 : 0, boxShadow: `0 0 60px ${b.c}33` }}>
                <Icon icon={b.icon} size={110} color={b.c} />
                <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 42, color: "#fff", textAlign: "center", lineHeight: 1.1, padding: "0 20px" }}>{b.w}</div>
              </div>
            ) : (
              <div key={b.w} style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 110, color: "rgba(255,255,255,.8)", scale: pop(t, b.at, 0.4), opacity: t > b.at ? 1 : 0 }}>{b.w}</div>
            ),
          )}
        </div>
      </At>
      <At x={960} y={860} style={{ opacity: tw(t, [E("s04n") - 0.2, E("s04n") + 0.3], [0, 1]) }}>
        <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 34, letterSpacing: "0.3em", color: C.gold }}>THE BETTER YOU EXPLAIN, THE BETTER YOU GUIDE</div>
      </At>
    </Scene>
  );
};
