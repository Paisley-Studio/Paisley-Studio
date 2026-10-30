import React from "react";
import { faPenToSquare, faRobot, faShieldHeart, faUser } from "@fortawesome/free-solid-svg-icons";
import { Ambient, At, C, CAVEAT, DotGrid, ease, Icon, Kicker, L, pop, QUICKSAND, Scene, tw, useScene, W } from "../lib2";

/** 11: the first, small AI reflection. What did you do, what did AI do, what did you change. */
export const S11Reflect: React.FC = () => {
  const t = useScene("s11");
  const cards = [
    { q: "WHAT DID YOU DO?", a: "I came up with the creature idea.", icon: faUser, c: C.gold, at: L("s11b") - 0.15, write: W("s11e", "came") - 0.2, wEnd: W("s11e", "AI") - 0.1 },
    { q: "WHAT DID AI DO?", a: "AI helped generate the image.", icon: faRobot, c: C.violet, at: L("s11c") - 0.15, write: W("s11e", "AI") - 0.1, wEnd: W("s11e", "changed") - 0.4 },
    { q: "WHAT DID YOU CHANGE?", a: "I changed my description, because the first result was wrong.", icon: faPenToSquare, c: C.success, at: L("s11d") - 0.15, write: W("s11e", "changed") - 0.3, wEnd: W("s11e", "wrong") + 0.2 },
  ];
  const honest = W("s11f", "honest") - 0.15;
  return (
    <Scene id="s11" push={0.025}>
      <Ambient t={t} opacity={0.3} colors={[C.violet, C.gold, C.success]} />
      <DotGrid />
      <At x={960} y={140} style={{ opacity: tw(t, [L("s11a") - 0.3, L("s11a") + 0.2], [0, 1]) }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <Kicker t={t} at={L("s11a") - 0.3} color={C.brand} size={28}>AI REFLECTION</Kicker>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 60, color: "#fff" }}>Three short questions</div>
        </div>
      </At>
      <At x={960} y={560}>
        <div style={{ display: "flex", gap: 40 }}>
          {cards.map((c) => {
            const write = tw(t, [c.write, c.wEnd], [0, 1], ease.linear);
            return (
              <div key={c.q} style={{ width: 540, height: 470, borderRadius: 30, background: "#FBF8F1", boxShadow: "0 40px 100px rgba(0,0,0,.5)", padding: "36px 38px",
                scale: pop(t, c.at, 0.5), opacity: t > c.at ? 1 : 0, position: "relative" }}>
                <div style={{ width: 80, height: 80, borderRadius: 40, background: c.c, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon icon={c.icon} size={40} color="#fff" />
                </div>
                <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 36, letterSpacing: "0.06em", color: C.ink, marginTop: 24 }}>{c.q}</div>
                <div style={{ marginTop: 22, borderTop: "2px dashed rgba(29,42,40,.18)", paddingTop: 20, fontFamily: CAVEAT, fontWeight: 700, fontSize: 52, lineHeight: 1.1, color: "#2E5BB0",
                  clipPath: `inset(0 0 ${(1 - write) * 100}% 0)` }}>
                  {c.a}
                </div>
              </div>
            );
          })}
        </div>
      </At>
      <At x={960} y={960} style={{ opacity: tw(t, [L("s11f") - 0.2, L("s11f") + 0.2], [0, 1]) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 34px", borderRadius: 999, background: C.brand, scale: pop(t, honest, 0.45), opacity: t > honest ? 1 : 0 }}>
            <Icon icon={faShieldHeart} size={36} color={C.night} />
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 32, letterSpacing: "0.18em", color: C.night }}>HONEST AI USE</div>
          </div>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 36, color: "rgba(255,255,255,.85)", opacity: tw(t, [W("s11f", "good") - 0.1, W("s11f", "good") + 0.3], [0, 1]) }}>
            Good creators say how they used AI.
          </div>
        </div>
      </At>
    </Scene>
  );
};
