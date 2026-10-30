import React from "react";
import { Img, staticFile } from "remotion";
import { faArrowRight, faPlus } from "@fortawesome/free-solid-svg-icons";
import { Creature, LUMORA, LUMORA_V1 } from "../creature";
import { Ambient, At, BG, BigWord, C, CAVEAT, DotGrid, E, ease, Icon, L, life, pop, QUICKSAND, Scene, tw, useScene, W } from "../lib2";
import { Thumb } from "./S08Iterate";

/** 14: idea, first try, your creation. That's creating with AI. You + AI. What will you create next? */
export const S14Finale: React.FC = () => {
  const t = useScene("s14");
  const stages = [
    { w: "IDEA", at: L("s14b") - 0.15 },
    { w: "FIRST TRY", at: L("s14c") - 0.15 },
    { w: "YOUR CREATION", at: L("s14d") - 0.15 },
  ];
  const lines = [
    { id: "s14e", w: "You didn't just ask AI to make something.", hi: -1 },
    { id: "s14f", w: "You had an idea.", hi: 0 },
    { id: "s14g", w: "You gave it direction.", hi: 3 },
    { id: "s14h", w: "You checked the result.", hi: 1 },
    { id: "s14i", w: "And you made it better.", hi: 2 },
  ];
  const cur = lines.reduce((k, l, i) => (t >= L(l.id) - 0.15 ? i : k), -1);
  const hi = cur >= 0 ? lines[cur].hi : -1;
  const creating = L("s14j") - 0.4;
  const aOut = tw(t, [creating - 0.2, creating + 0.3], [1, 0], ease.inOut);
  const plus = L("s14k") - 0.2;
  const msg = L("s14l") - 0.3;
  const next = L("s14m") - 0.6;
  const paper = tw(t, [next, next + 0.9], [0, 1], ease.inOut);
  const panel = (i: number) => (
    <div style={{ borderRadius: 24, boxShadow: hi === i ? `0 0 70px ${C.gold}99` : undefined, scale: hi === i ? 1.05 : 1 }}>
      {i === 0 && (
        <div style={{ width: 480, height: 340, borderRadius: 24, background: "#FBF8F1", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <Creature look={LUMORA} size={320} t={t} uid="s14idea" sketch />
        </div>
      )}
      {i === 1 && <Thumb look={LUMORA_V1} hab="desert" w={480} h={340} t={t} uid="s14v1" />}
      {i === 2 && <Thumb look={LUMORA} hab="glow" w={480} h={340} t={t} uid="s14v3" glow={tw(t, [L("s14d"), L("s14d") + 0.6], [0, 1])} />}
    </div>
  );
  return (
    <Scene id="s14" push={0.02} outro={false}>
      <Ambient t={t} opacity={0.3 + 0.2 * tw(t, [plus, plus + 1], [0, 1])} colors={[C.gold, C.brand, C.coral]} />
      <DotGrid />
      {/* idea > first try > your creation */}
      <div style={{ position: "absolute", inset: 0, opacity: aOut }}>
        <At x={960} y={110} style={{ opacity: tw(t, [L("s14a") - 0.3, L("s14a") + 0.2], [0, 1]) }}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 30, letterSpacing: "0.3em", color: "rgba(255,255,255,.65)" }}>BACK TO LUMORA</div>
        </At>
        <At x={960} y={470}>
          <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
            {stages.map((s, i) => (
              <React.Fragment key={s.w}>
                {i > 0 && <Icon icon={faArrowRight} size={48} color={hi === 3 && i === 1 ? C.gold : "rgba(255,255,255,.5)"} style={{ opacity: t > s.at ? 1 : 0, scale: hi === 3 && i === 1 ? 1.4 : 1 }} />}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, scale: pop(t, s.at, 0.5), opacity: t > s.at ? 1 : 0 }}>
                  <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 40, letterSpacing: "0.14em", color: i === 2 ? C.gold : "#fff" }}>{s.w}</div>
                  {panel(i)}
                </div>
              </React.Fragment>
            ))}
          </div>
        </At>
        {lines.map((l, i) => (
          <At key={l.id} x={960} y={900} style={{ opacity: cur === i ? tw(t, [L(l.id) - 0.15, L(l.id) + 0.1], [0, 1]) : 0 }}>
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 70, color: i === 4 ? C.gold : "#fff", whiteSpace: "nowrap" }}>{l.w}</div>
          </At>
        ))}
      </div>
      {/* that's creating with AI. you + AI */}
      <At x={960} y={430} style={{ opacity: life(t, creating, msg, 0.35) }}>
        <BigWord t={t} at={creating + 0.2} size={110} color="#fff">THAT'S CREATING WITH AI.</BigWord>
      </At>
      <At x={960} y={640} style={{ opacity: life(t, plus - 0.1, msg, 0.35) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 40, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 150 }}>
          <span style={{ color: C.gold, scale: pop(t, W("s14k", "you") - 0.1, 0.4), opacity: t > W("s14k", "you") - 0.1 ? 1 : 0, textShadow: `0 0 50px ${C.gold}88` }}>YOU</span>
          <span style={{ color: "rgba(255,255,255,.75)", scale: pop(t, W("s14k", "plus") - 0.1, 0.4), opacity: t > W("s14k", "plus") - 0.1 ? 1 : 0 }}>+</span>
          <span style={{ color: C.brand, scale: pop(t, W("s14k", "AI") - 0.1, 0.4), opacity: t > W("s14k", "AI") - 0.1 ? 1 : 0 }}>AI</span>
        </div>
      </At>
      <At x={960} y={820} style={{ opacity: life(t, E("s14k") + 0.2, msg, 0.35) }}>
        <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 34, letterSpacing: "0.3em", color: "rgba(255,255,255,.8)" }}>YOUR NEXT CREATION IS UP TO YOU.</div>
      </At>
      {/* the final message */}
      <At x={960} y={540} style={{ opacity: life(t, msg, next + 0.3, 0.35) }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <BigWord t={t} at={W("s14l", "had") - 0.3} size={96} color={C.gold}>YOU HAD THE IDEA.</BigWord>
          <BigWord t={t} at={W("s14l", "helped") - 0.3} size={96} color={C.brand}>AI HELPED YOU BUILD IT.</BigWord>
          <BigWord t={t} at={W("s14l", "made") - 0.3} size={96} color="#fff">YOU MADE IT YOURS.</BigWord>
        </div>
      </At>
      {/* into the TECH environment */}
      <div style={{ position: "absolute", inset: 0, background: BG.paper, opacity: paper }}>
        <DotGrid color={C.brandDeep} opacity={0.07} />
        <At x={960} y={170} style={{ opacity: tw(t, [next + 0.4, next + 1.2], [0, 1]) }}>
          <Img src={staticFile("img/logo@3x.png")} style={{ width: 300 }} />
        </At>
        <At x={960} y={420}>
          <BigWord t={t} at={L("s14m") + 0.2} size={110} color={C.ink}>WHAT WILL YOU</BigWord>
        </At>
        <At x={960} y={545}>
          <BigWord t={t} at={W("s14m", "create") - 0.1} size={130} color={C.brandDeep}>CREATE NEXT?</BigWord>
        </At>
        {/* your projects: one made, the next one waiting */}
        <At x={960} y={830} style={{ opacity: tw(t, [E("s14m") + 0.3, E("s14m") + 1.0], [0, 1]), translate: `0 ${(1 - tw(t, [E("s14m") + 0.3, E("s14m") + 1.2], [0, 1])) * 40}px` }}>
          <div style={{ display: "flex", gap: 34, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <Thumb look={LUMORA} hab="glow" w={320} h={210} t={t} uid="s14tile" />
            </div>
            <div style={{ width: 320, height: 210, borderRadius: 20, border: `3px dashed ${C.brand}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
              background: `${C.brand}14`, boxShadow: `0 0 ${30 + 20 * Math.sin(t * 3)}px ${C.brand}55` }}>
              <Icon icon={faPlus} size={56} color={C.brandDeep} />
              <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 24, letterSpacing: "0.16em", color: C.brandDeep }}>NEW PROJECT</div>
            </div>
          </div>
        </At>
        <At x={1500} y={760} style={{ opacity: tw(t, [E("s14m") + 1.2, E("s14m") + 1.8], [0, 1]), translate: `${Math.sin(t * 0.9) * 30}px ${Math.cos(t * 1.3) * 16}px` }}>
          <Creature look={LUMORA} size={220} t={t} uid="s14fly" />
        </At>
        <At x={960} y={1010} style={{ opacity: tw(t, [E("s14m") + 1.5, E("s14m") + 2.2], [0, 1]) }}>
          <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 48, color: C.brandDeep }}>Learn. Create. Build.</div>
        </At>
      </div>
    </Scene>
  );
};
