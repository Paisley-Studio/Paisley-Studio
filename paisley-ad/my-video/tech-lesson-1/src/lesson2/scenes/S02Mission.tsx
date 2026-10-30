import React from "react";
import { faDove, faFish, faLightbulb, faPaw, faQuestion, faRobot, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Robot } from "../../Robot";
import { Kid } from "../../art";
import { Ambient, At, BigWord, C, CAVEAT, DotGrid, ease, Icon, Kicker, L, life, pop, QUICKSAND, Scene, tw, useScene, W } from "../lib2";

/** 02: the title, the mission (your dream creature), and the twist: design it before AI makes it. */
export const S02Mission: React.FC = () => {
  const t = useScene("s02");
  const title = life(t, L("s02a") - 0.4, L("s02b") - 0.1, 0.4);
  const mission = life(t, L("s02b") - 0.1, L("s02e") - 0.1, 0.4);
  const twist = tw(t, [L("s02e") - 0.1, L("s02e") + 0.3], [0, 1]);
  const kinds = [
    { w: W("s02d", "fly"), icon: faDove, label: "FLYING", c: C.sky },
    { w: W("s02d", "swim"), icon: faFish, label: "UNDERWATER", c: C.brand },
    { w: W("s02d", "robot"), icon: faRobot, label: "ROBOT", c: C.violet },
    { w: W("s02d", "jungle"), icon: faPaw, label: "JUNGLE", c: C.success },
    { w: W("s02d", "nobody"), icon: faQuestion, label: "TOTALLY NEW", c: C.gold },
  ];
  // the bulb travels to the robot ("AI does all the imagining"), then back to you
  const toAI = tw(t, [W("s02g", "imagining") - 0.5, W("s02g", "imagining") + 0.3], [0, 1], ease.inOut);
  const back = tw(t, [L("s02h") - 0.3, L("s02h") + 0.5], [0, 1], ease.inOut);
  const bulbX = 560 + (1360 - 560) * (toAI - back * toAI);
  const notYou = W("s02g", "not");
  return (
    <Scene id="s02" push={0.03}>
      <Ambient t={t} opacity={0.35} colors={[C.brand, C.gold, C.violet]} />
      <DotGrid />
      {/* title card */}
      <At x={960} y={470} style={{ opacity: title }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <Kicker t={t} at={L("s02a") - 0.4} color={C.brand} size={30}>PAISLEY TECH · LESSON 2</Kicker>
          <BigWord t={t} at={L("s02a") - 0.2} size={120}>MAKE SOMETHING</BigWord>
          <BigWord t={t} at={L("s02a") + 0.1} size={120} color={C.gold}>WITH AI</BigWord>
          <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 60, color: C.brandSoft, opacity: tw(t, [W("s02a", "first") - 0.2, W("s02a", "first") + 0.3], [0, 1]) }}>
            Your first AI-powered creation.
          </div>
        </div>
      </At>
      {/* the mission */}
      <div style={{ opacity: mission }}>
        <At x={960} y={250}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <Kicker t={t} at={L("s02b")} color={C.gold} size={32}>YOUR MISSION</Kicker>
            <BigWord t={t} at={W("s02c", "dream") - 0.2} size={104}>CREATE YOUR DREAM CREATURE</BigWord>
          </div>
        </At>
        <At x={960} y={640}>
          <div style={{ display: "flex", gap: 44 }}>
            {kinds.map((k) => (
              <div key={k.label} style={{ width: 240, height: 260, borderRadius: 28, background: `${k.c}1A`, border: `2px solid ${k.c}88`, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 26, scale: pop(t, k.w - 0.1, 0.45), opacity: t > k.w - 0.1 ? 1 : 0,
                translate: `0 ${Math.sin(t * 1.6 + k.w) * 8}px` }}>
                <Icon icon={k.icon} size={96} color={k.c} />
                <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 22, letterSpacing: "0.16em", color: k.c }}>{k.label}</div>
              </div>
            ))}
          </div>
        </At>
      </div>
      {/* the twist */}
      <div style={{ opacity: twist }}>
        <At x={960} y={140}>
          <BigWord t={t} at={L("s02e")} size={84} color={C.gold}>BUT THERE'S A TWIST</BigWord>
        </At>
        <At x={960} y={290} style={{ opacity: tw(t, [L("s02f") - 0.2, L("s02f") + 0.3], [0, 1]) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 30, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 46 }}>
            <span style={{ color: "#fff", background: `${C.brand}33`, border: `2px solid ${C.brand}`, padding: "10px 28px", borderRadius: 18 }}>1 · YOU DESIGN IT</span>
            <span style={{ color: C.brandSoft, opacity: tw(t, [W("s02f", "before"), W("s02f", "before") + 0.3], [0, 1]) }}>→</span>
            <span style={{ color: "rgba(255,255,255,.8)", border: "2px solid rgba(255,255,255,.25)", padding: "10px 28px", borderRadius: 18,
              opacity: tw(t, [W("s02f", "AI") - 0.1, W("s02f", "AI") + 0.3], [0, 1]) }}>2 · THEN AI MAKES IT</span>
          </div>
        </At>
        {/* you and the AI, and whose idea it is */}
        <At x={560} y={720} style={{ opacity: tw(t, [L("s02g") - 0.4, L("s02g")], [0, 1]) }}>
          <Kid size={230} look={toAI > 0.5 && back < 0.5 ? 0.8 : 0} arm={back} />
        </At>
        <div style={{ position: "absolute", left: 1360 - 170, top: 560, width: 340, height: 340, opacity: tw(t, [L("s02g") - 0.4, L("s02g")], [0, 1]) }}>
          <Robot size={340} backdrop={0.5} blink={Math.max(0, 1 - Math.abs(t - W("s02g", "all")) * 8)} />
        </div>
        <At x={bulbX} y={530 - Math.sin(toAI * Math.PI) * 90 - Math.sin(back * Math.PI) * 90} style={{ opacity: tw(t, [L("s02g") - 0.2, L("s02g") + 0.2], [0, 1]) }}>
          <Icon icon={faLightbulb} size={90} color={C.gold} style={{ filter: `drop-shadow(0 0 24px ${C.gold})` }} />
        </At>
        <At x={960} y={470} style={{ opacity: tw(t, [L("s02g"), L("s02g") + 0.3], [0, 1]) * tw(t, [W("s02g", "imagining") - 0.3, W("s02g", "imagining")], [1, 0]) }}>
          <div style={{ background: "#fff", borderRadius: 30, padding: "16px 30px", fontFamily: CAVEAT, fontWeight: 700, fontSize: 48, color: C.ink, whiteSpace: "nowrap" }}>"make me something cool"</div>
        </At>
        <At x={560} y={470} style={{ opacity: life(t, notYou - 0.05, L("s02h") - 0.1, 0.2), scale: pop(t, notYou - 0.05, 0.35) }}>
          <Icon icon={faXmark} size={120} color={C.error} />
        </At>
        <At x={960} y={960}>
          <BigWord t={t} at={W("s02h", "creator") - 0.3} size={88} color={C.gold} glow={`${C.gold}66`}>YOU'RE THE CREATOR.</BigWord>
        </At>
        <At x={560} y={960} style={{ opacity: life(t, notYou, L("s02h") - 0.1, 0.2) }}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 44, color: C.error, letterSpacing: "0.1em" }}>NOT YOU.</div>
        </At>
      </div>
    </Scene>
  );
};
