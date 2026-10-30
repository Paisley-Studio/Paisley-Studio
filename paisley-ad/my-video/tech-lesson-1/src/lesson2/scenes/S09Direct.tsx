import React from "react";
import { faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { Robot } from "../../Robot";
import { Kid } from "../../art";
import { Creature, LUMORA, LUMORA_V2, Picture } from "../creature";
import { Ambient, At, BigWord, C, CAVEAT, DotGrid, ease, Icon, Kicker, L, life, MONO, pop, QUICKSAND, Scene, tw, useScene, W } from "../lib2";

/** 09: AI doesn't know your idea. It only gets what you tell it, so you have to direct it. You are the creator. */
export const S09Direct: React.FC = () => {
  const t = useScene("s09");
  const cast = tw(t, [L("s09b") + 0.3, L("s09b") + 1.0], [0, 1]);
  const told = W("s09d", "said");
  const blind = life(t, W("s09d", "see") - 0.1, W("s09d", "didn't") + 0.2, 0.3);
  const direct = L("s09e") - 0.1;
  const creator = W("s09g", "creator") - 0.2;
  const words = ["small", "four wings", "blue feathers", "glowing rainforest", "friendly"];
  return (
    <Scene id="s09" push={0.03}>
      <Ambient t={t} opacity={0.3 + 0.25 * tw(t, [creator, creator + 1], [0, 1])} colors={[C.gold, C.brand, C.violet]} />
      <DotGrid />
      <At x={960} y={80} style={{ opacity: tw(t, [L("s09a") - 0.2, L("s09a") + 0.2], [0, 1]) * tw(t, [L("s09b") - 0.3, L("s09b")], [1, 0]) }}>
        <Kicker t={t} at={L("s09a") - 0.2} color={C.gold} size={30}>REALLY IMPORTANT</Kicker>
      </At>
      <At x={960} y={95} style={{ opacity: tw(t, [creator - 0.4, creator - 0.1], [1, 0]) }}>
        <BigWord t={t} at={L("s09b") - 0.1} size={88}>AI DOESN'T KNOW YOUR IDEA.</BigWord>
      </At>
      {/* you, and your imagination */}
      <At x={430} y={810} style={{ opacity: cast }}>
        <Kid size={240} arm={tw(t, [direct, direct + 0.4], [0, 1]) * tw(t, [L("s09f"), L("s09f") + 0.3], [1, 0.3])} look={0.6} />
      </At>
      <At x={430} y={400} style={{ opacity: cast, scale: 0.9 + 0.1 * cast }}>
        <div style={{ position: "relative", width: 540, height: 360 }}>
          {[[150, 340, 30], [200, 296, 44]].map(([x, y, r], i) => <div key={i} style={{ position: "absolute", left: x, top: y, width: r, height: r, borderRadius: "50%", background: "rgba(255,255,255,.92)" }} />)}
          <div style={{ position: "absolute", inset: "0 0 70px 0", borderRadius: "50%", background: "rgba(255,255,255,.95)", boxShadow: `0 0 60px ${C.gold}55`, overflow: "hidden" }}>
            <div style={{ position: "absolute", left: "50%", top: "50%", translate: "-50% -50%" }}>
              <Creature look={LUMORA} size={280} t={t} uid="s09idea" />
            </div>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: -50, textAlign: "center", fontFamily: CAVEAT, fontWeight: 700, fontSize: 44, color: C.goldSoft }}>your imagination</div>
        </div>
      </At>
      {/* the AI, and what it has been told */}
      <div style={{ position: "absolute", left: 1490 - 190, top: 600, width: 380, height: 380, opacity: cast }}>
        <Robot size={380} backdrop={0.5} look={-0.6} blink={Math.max(0, 1 - Math.abs(t - told) * 6)} />
      </div>
      <At x={1490} y={390} style={{ opacity: cast }}>
        <div style={{ position: "relative", width: 440, height: 290, borderRadius: 22, overflow: "hidden", border: "2px solid rgba(255,255,255,.18)", background: "#0B1714" }}>
          {t < W("s09d", "didn't") - 0.2 ? (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 120, color: "rgba(255,255,255,.2)" }}>?</div>
          ) : (
            <Picture look={t < told + 0.3 ? LUMORA_V2 : LUMORA} habitat="glow" w={440} h={290} t={t} uid="s09ai" />
          )}
          <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: Math.max(0, 1 - Math.abs(t - told - 0.3) / 0.25) * 0.8 }} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: -50, textAlign: "center", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 24, letterSpacing: "0.24em", color: "rgba(255,255,255,.6)" }}>
          WHAT AI KNOWS
        </div>
      </At>
      {/* only what you tell it */}
      {words.map((w, k) => {
        const p = tw(t, [W("s09c", "tell") - 0.6 + k * 0.28, W("s09c", "tell") + 0.6 + k * 0.28], [0, 1], ease.inOut);
        return (
          <div key={w} style={{ position: "absolute", left: 700 + 560 * p, top: 520 - 140 * Math.sin(p * Math.PI) + k * 26, opacity: Math.sin(p * Math.PI), fontFamily: MONO, fontSize: 30, color: C.brandSoft, whiteSpace: "nowrap" }}>"{w}"</div>
        );
      })}
      <div style={{ position: "absolute", left: 700 + 560 * tw(t, [told - 0.6, told + 0.3], [0, 1], ease.inOut), top: 470, opacity: life(t, told - 0.6, told + 0.4, 0.15), fontFamily: MONO, fontSize: 34, color: C.gold, whiteSpace: "nowrap" }}>"long golden tail"</div>
      {/* it can't see inside your imagination */}
      <At x={960} y={400} style={{ opacity: blind }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={{ width: 6, height: 300, background: `repeating-linear-gradient(${C.coral} 0 18px, transparent 18px 32px)` }} />
          <Icon icon={faEyeSlash} size={70} color={C.coral} style={{ position: "absolute", top: 110, background: C.night, padding: 10, borderRadius: 50 }} />
        </div>
      </At>
      {/* you direct it */}
      <svg width={700} height={160} style={{ position: "absolute", left: 610, top: 640, overflow: "visible", opacity: life(t, direct, creator - 0.2, 0.3) }}>
        <path d="M10 120 C 220 10, 480 10, 690 100" fill="none" stroke={C.gold} strokeWidth={8} strokeLinecap="round" pathLength={1}
          strokeDasharray={`${tw(t, [direct, direct + 0.7], [0, 1], ease.inOut)} 2`} />
        <text x={350} y={20} textAnchor="middle" fontFamily={QUICKSAND} fontWeight={700} fontSize={40} letterSpacing="0.2em" fill={C.gold}>YOU DIRECT IT</text>
      </svg>
      {[{ x: 430, a: "YOUR IDEA", b: "= THE PLAN", at: W("s09f", "plan") - 0.4, c: C.gold }, { x: 1490, a: "AI", b: "= THE TOOL", at: W("s09f", "tool") - 0.4, c: C.brandSoft }].map((x) => (
        <At key={x.a} x={x.x} y={1030} style={{ opacity: life(t, x.at, creator - 0.1, 0.3), scale: pop(t, x.at, 0.4) }}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 40, color: x.c, whiteSpace: "nowrap", background: "rgba(7,16,13,.8)", padding: "4px 20px", borderRadius: 14 }}>
            {x.a} <span style={{ color: "#fff" }}>{x.b}</span>
          </div>
        </At>
      ))}
      <At x={960} y={110}>
        <BigWord t={t} at={creator} size={110} color={C.gold} glow={`${C.gold}88`}>YOU ARE THE CREATOR.</BigWord>
      </At>
      <At x={960} y={1030} style={{ opacity: tw(t, [creator + 0.4, creator + 0.8], [0, 1]) }}>
        <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 34, letterSpacing: "0.3em", color: "rgba(255,255,255,.75)" }}>AI IS THE TOOL</div>
      </At>
    </Scene>
  );
};
