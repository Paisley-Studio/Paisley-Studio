import React from "react";
import { faBrain, faMicrochip } from "@fortawesome/free-solid-svg-icons";
import { Cat, CATS, Landscape } from "../art";
import { Ambient, At, C, caret, DotGrid, E, ease, Icon, L, life, MONO, pop, QUICKSAND, Scene, SCENES, tw, typed, useT, W } from "../lib";

const Word: React.FC<{ first: string; rest: string; reveal: number; x: number; y: number; size: number }> = ({ first, rest, reveal, x, y, size }) => (
  <div style={{ position: "absolute", left: x, top: y, display: "flex", fontFamily: QUICKSAND, fontWeight: 700, fontSize: size, lineHeight: 1 }}>
    <span style={{ color: C.brand, textShadow: `0 0 50px ${C.brand}88` }}>{first}</span>
    <span style={{ color: "#fff", clipPath: `inset(-20% ${(1 - reveal) * 100}% -20% 0)`, opacity: reveal > 0 ? 1 : 0 }}>{rest}</span>
  </div>
);

const Panel: React.FC<{ t: number; at: number; x: number; label: string; color: string; children: React.ReactNode }> = ({ t, at, x, label, color, children }) => {
  const p = pop(t, at - 0.25, 0.6);
  return (
    <At x={x} y={600} style={{ opacity: tw(t, [at - 0.25, at], [0, 1]), scale: 0.85 + 0.15 * p, translate: `0 ${(1 - p) * 60}px` }}>
      <div style={{ textAlign: "center", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 64, letterSpacing: "0.08em", color, marginBottom: 28 }}>{label}</div>
      <div style={{
        width: 480, height: 360, borderRadius: 32, overflow: "hidden", position: "relative",
        background: "rgba(255,255,255,.06)", border: `2px solid ${color}88`, boxShadow: `0 40px 90px rgba(0,0,0,.45), 0 0 50px ${color}22`,
      }}>{children}</div>
    </At>
  );
};

export const S02Define: React.FC = () => {
  const t = useT() + SCENES.s02[0];
  const expand = tw(t, [W("s02b", "Artificial") - 0.35, W("s02b", "Artificial")], [0, 1], ease.inOut);
  const art = tw(t, [W("s02b", "Artificial"), W("s02b", "Artificial") + 0.5], [0, 1], ease.soft);
  const intel = tw(t, [W("s02b", "Intelligence"), W("s02b", "Intelligence") + 0.6], [0, 1], ease.soft);
  const up = tw(t, [L("s02c") - 0.2, L("s02c") + 0.7], [0, 1], ease.inOut);
  // "AI" (two letters side by side) -> two stacked words, then the pair moves up as a title
  const ax = 795 - 375 * expand, ay = 390 - 80 * expand;
  const ix = 985 - 565 * expand, iy = 390 + 90 * expand;
  const bridge = life(t, L("s02c") + 0.3, L("s02d") - 0.1, 0.4);
  const human = tw(t, [W("s02c", "human") - 0.1, W("s02c", "human") + 0.4], [0, 1]);

  // RECOGNIZE: brackets close in on the cat, then the label lands
  const scan = tw(t, [W("s02d", "recognizing"), W("s02d", "recognizing") + 0.9], [0, 1], ease.inOut);
  const label = pop(t, W("s02d", "picture"));
  // PREDICT: autocomplete
  const prompt = "Happy birth";
  const tp = W("s02e", "Predicting") - 0.2;
  const ghost = tw(t, [W("s02e", "next") - 0.3, W("s02e", "next")], [0, 1]);
  const accept = tw(t, [E("s02e") + 0.2, E("s02e") + 0.4], [0, 1]);
  // CREATE: a picture resolves from coarse blocks
  const make = tw(t, [W("s02f", "creating") - 0.1, E("s02f") + 0.6], [0, 1], ease.inOut);

  return (
    <Scene id="s02" push={0.03}>
      <Ambient t={t} opacity={0.3} />
      <DotGrid />
      <div style={{ position: "absolute", inset: 0, scale: 1 - up * 0.55, translate: `0 ${-up * 330}px`, transformOrigin: "50% 50%",
        opacity: tw(t, [L("s02a") - 0.4, L("s02a")], [0, 1]) }}>
        <Word first="A" rest="RTIFICIAL" reveal={art} x={ax} y={ay} size={300 - 160 * expand} />
        <Word first="I" rest="NTELLIGENCE" reveal={intel} x={ix} y={iy} size={300 - 160 * expand} />
      </div>

      {/* "things that normally need human intelligence" */}
      <div style={{ position: "absolute", inset: 0, opacity: bridge }}>
        <At x={660} y={620}>
          <div style={{ filter: `drop-shadow(0 0 ${human * 40}px ${C.coral})` }}>
            <Icon icon={faBrain} size={220} color={human > 0.5 ? C.coral : "rgba(255,255,255,.5)"} />
          </div>
        </At>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          <line x1={820} y1={620} x2={1100} y2={620} stroke={C.brand} strokeWidth={6} strokeDasharray="4 18" strokeLinecap="round"
            strokeDashoffset={-t * 60} opacity={tw(t, [W("s02c", "designed"), W("s02c", "designed") + 0.4], [0, 1])} />
        </svg>
        <At x={1260} y={620} style={{ opacity: tw(t, [W("s02c", "technology") - 0.2, W("s02c", "technology") + 0.2], [0, 1]) }}>
          <Icon icon={faMicrochip} size={220} color={C.brand} style={{ filter: `drop-shadow(0 0 30px ${C.brand})` }} />
        </At>
      </div>

      <Panel t={t} at={W("s02d", "recognizing")} x={420} label="RECOGNIZE" color={C.sky}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#2B4C63,#1A2D3B)" }} />
        <At x={240} y={190}><Cat look={CATS[1]} size={250} /></At>
        {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y], i) => {
          const inset = 30 + (1 - scan) * -30;
          return (
            <div key={i} style={{
              position: "absolute", width: 46, height: 46, borderColor: C.sky, borderStyle: "solid", borderWidth: 0,
              left: x ? undefined : 90 + inset, right: x ? 90 + inset : undefined, top: y ? undefined : 40 + inset, bottom: y ? 50 + inset : undefined,
              borderLeftWidth: x ? 0 : 6, borderRightWidth: x ? 6 : 0, borderTopWidth: y ? 0 : 6, borderBottomWidth: y ? 6 : 0,
            }} />
          );
        })}
        <At x={240} y={318} style={{ scale: label }}>
          <div style={{ background: C.sky, color: "#06202E", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 30, padding: "6px 22px", borderRadius: 999 }}>CAT</div>
        </At>
      </Panel>

      <Panel t={t} at={W("s02e", "Predicting")} x={960} label="PREDICT" color={C.gold}>
        <div style={{ position: "absolute", left: 40, right: 40, top: 130, height: 100, borderRadius: 20, background: "rgba(255,255,255,.08)",
          border: "2px solid rgba(255,255,255,.15)", display: "flex", alignItems: "center", paddingLeft: 26, fontFamily: MONO, fontSize: 36, color: "#fff", whiteSpace: "pre" }}>
          <span>{typed(t, tp, prompt, 16)}</span>
          <span style={{ color: accept > 0.5 ? "#fff" : C.gold, opacity: ghost * (accept > 0.5 ? 1 : 0.55) }}>day!</span>
          <span style={{ opacity: caret(t), color: C.gold }}>|</span>
        </div>
        <div style={{ position: "absolute", left: 40, top: 262, fontFamily: QUICKSAND, fontWeight: 600, fontSize: 26, color: C.gold, opacity: ghost * (1 - accept) }}>
          suggested next word
        </div>
      </Panel>

      <Panel t={t} at={W("s02f", "creating")} x={1500} label="CREATE" color={C.violet}>
        <div style={{ position: "absolute", inset: 0, filter: `blur(${(1 - make) * 26}px) saturate(${0.3 + make * 0.7})`, clipPath: `inset(${(1 - Math.min(1, make * 1.6)) * 100}% 0 0 0)` }}>
          <Landscape w={480} h={360} sun={make} />
        </div>
        <svg width={480} height={360} style={{ position: "absolute", inset: 0, opacity: 1 - make }}>
          {Array.from({ length: 48 }).map((_, i) => (
            <rect key={i} x={(i % 8) * 60} y={Math.floor(i / 8) * 60} width={60} height={60} fill="none" stroke={C.violet} strokeOpacity={0.35} />
          ))}
        </svg>
      </Panel>
    </Scene>
  );
};
