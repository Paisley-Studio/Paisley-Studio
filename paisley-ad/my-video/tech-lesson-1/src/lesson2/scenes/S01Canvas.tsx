import React from "react";
import { faLightbulb } from "@fortawesome/free-solid-svg-icons";
import { Ambient, At, BigWord, C, CAVEAT, DotGrid, E, ease, Icon, Kicker, L, pop, QUICKSAND, Scene, tw, useScene, W } from "../lib2";

/** 01: a completely blank canvas. "Now let's actually use it." The canvas waits for an idea, then blooms. */
export const S01Canvas: React.FC = () => {
  const t = useScene("s01");
  const recap = ["PATTERNS", "A TOOL", "CAN BE WRONG", "YOU + AI"];
  const everything = W("s01d", "everything");
  const idea = W("s01e", "idea");
  const bloom = tw(t, [idea - 0.2, idea + 1.6], [0, 1], ease.out);
  const yours = W("s01f", "idea");
  const lift = tw(t, [L("s01b") - 0.3, L("s01b") + 0.6], [0, 1]);
  return (
    <Scene id="s01" push={0.05}>
      <Ambient t={t} opacity={0.25 + 0.3 * bloom} colors={[C.brand, C.gold, C.violet]} />
      <DotGrid opacity={0.05} />
      {/* last lesson, in one breath */}
      <At x={960} y={150} style={{ opacity: tw(t, [L("s01a") - 0.2, L("s01a") + 0.3], [0, 1]) * tw(t, [L("s01c") - 0.3, L("s01c")], [1, 0]) }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <Kicker t={t} at={L("s01a") - 0.1} color="rgba(255,255,255,.6)" size={24}>LESSON 1 · WHAT IS AI?</Kicker>
          <div style={{ display: "flex", gap: 14 }}>
            {recap.map((r, i) => (
              <div key={r} style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 22, letterSpacing: "0.12em", color: i === 3 ? C.gold : C.brandSoft,
                border: `1.5px solid ${i === 3 ? C.gold : C.brand}66`, borderRadius: 999, padding: "8px 18px", scale: pop(t, L("s01a") + 0.5 + i * 0.25), opacity: t > L("s01a") + 0.5 + i * 0.25 ? 1 : 0 }}>
                {r}
              </div>
            ))}
          </div>
        </div>
      </At>
      {/* the blank canvas */}
      <At x={960} y={560} style={{ scale: 0.94 + 0.06 * tw(t, [0.2, 3], [0, 1], ease.inOut) }}>
        <div style={{ position: "relative", width: 1040, height: 620, borderRadius: 18, background: "#FBFCFB", boxShadow: "0 60px 140px rgba(0,0,0,.6)", overflow: "hidden" }}>
          {/* the idea blooms from the centre */}
          <div style={{ position: "absolute", left: 520 - 900 * bloom, top: 310 - 900 * bloom, width: 1800 * bloom, height: 1800 * bloom, borderRadius: "50%",
            background: `radial-gradient(circle, ${C.goldSoft} 0%, ${C.brandSoft} 40%, ${C.brand} 70%, ${C.brandDeep} 100%)`, opacity: 0.9 }} />
          {/* "AI, do everything for me." gets struck through */}
          <div style={{ position: "absolute", left: 0, right: 0, top: 270, textAlign: "center", opacity: tw(t, [L("s01d") - 0.2, L("s01d") + 0.3], [0, 1]) * tw(t, [idea - 0.6, idea - 0.2], [1, 0]) }}>
            <span style={{ position: "relative", fontFamily: CAVEAT, fontWeight: 700, fontSize: 72, color: C.muted }}>
              "AI, do everything for me."
              <span style={{ position: "absolute", left: -10, right: -10, top: "52%", height: 7, borderRadius: 4, background: C.error,
                transformOrigin: "left", scale: `${tw(t, [everything, everything + 0.45], [0, 1], ease.inOut)} 1` }} />
            </span>
          </div>
          <div style={{ position: "absolute", left: 520, top: 310, translate: "-50% -50%", scale: pop(t, idea - 0.15, 0.6), opacity: t > idea - 0.15 ? 1 : 0 }}>
            <Icon icon={faLightbulb} size={150} color="#fff" style={{ filter: `drop-shadow(0 0 40px ${C.gold})` }} />
          </div>
          {/* empty-canvas cursor */}
          <div style={{ position: "absolute", left: 60, top: 50, width: 4, height: 50, background: C.brand, opacity: (Math.floor(t * 2) % 2) * tw(t, [L("s01d"), L("s01d") + 0.3], [1, 0]) }} />
        </div>
      </At>
      {/* "Now let's actually use it." */}
      <At x={960} y={150} style={{ opacity: lift * tw(t, [L("s01c") - 0.3, L("s01c")], [1, 0]) }}>
        <BigWord t={t} at={L("s01b") + 0.1} size={92} color="#fff">NOW LET'S USE IT.</BigWord>
      </At>
      <At x={960} y={150} style={{ opacity: tw(t, [idea - 0.4, idea - 0.1], [1, 0]) }}>
        <Kicker t={t} at={L("s01c")} color={C.gold} size={34}>THE CHALLENGE</Kicker>
      </At>
      <At x={960} y={950}>
        <BigWord t={t} at={yours - 0.1} size={120} color={C.gold} glow={`${C.gold}88`}>YOUR IDEA.</BigWord>
      </At>
      <At x={960} y={150} style={{ opacity: tw(t, [idea - 0.1, idea + 0.3], [0, 1]) * tw(t, [E("s01f") + 0.6, E("s01f") + 1.2], [1, 0.5]) }}>
        <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 30, letterSpacing: "0.3em", color: "rgba(255,255,255,.7)" }}>WE GIVE AI AN IDEA</div>
      </At>
    </Scene>
  );
};
