import React from "react";
import { faCode, faImage, faLightbulb, faMagnifyingGlass, faMusic, faPalette, faPenNib, faPuzzlePiece } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { Landscape } from "../art";
import { Ambient, At, C, CAVEAT, caret, DotGrid, ease, Icon, L, MONO, pop, QUICKSAND, Scene, SCENES, tw, useT, W } from "../lib";

type Verb = { word: string; at: number; icon: IconDefinition; color: string };
const TW = 280, TH = 250;

const Motif: React.FC<{ i: number; t: number; at: number; c: string }> = ({ i, t, at, c }) => {
  const p = tw(t, [at, at + 0.8], [0, 1]);
  if (i === 0) return (
    <>{[[30, 40, -6, C.gold], [120, 30, 5, C.coral], [70, 110, 3, C.brand]].map(([x, y, r, col], k) => (
      <div key={k} style={{ position: "absolute", left: x as number, top: y as number, width: 100, height: 80, background: col as string, rotate: `${r}deg`, borderRadius: 6, scale: pop(t, at + k * 0.1), boxShadow: "0 8px 16px rgba(0,0,0,.3)" }} />
    ))}</>
  );
  if (i === 1) return <>{[0.9, 0.75, 0.85, 0.5].map((w, k) => <div key={k} style={{ position: "absolute", left: 30, top: 40 + k * 34, height: 14, borderRadius: 7, background: "rgba(255,255,255,.55)", width: `${w * 75 * Math.min(1, Math.max(0, p * 4 - k))}%` }} />)}</>;
  if (i === 2) return <>{[0, 1, 2].map((k) => <div key={k} style={{ position: "absolute", left: 30 + k * 18, top: 30 + k * 30, width: 160, height: 60, borderRadius: 10, background: "rgba(255,255,255,.12)", border: `1.5px solid ${c}`, opacity: tw(t, [at + k * 0.12, at + k * 0.12 + 0.2], [0, 1]) }} />)}</>;
  if (i === 3) return (
    <div style={{ position: "absolute", left: 24, top: 30, fontFamily: MONO, fontSize: 20, lineHeight: 1.6, color: "#fff", whiteSpace: "pre" }}>
      <span style={{ color: C.violet }}>if</span> (idea) {"{"}{"\n"}  <span style={{ color: C.gold }}>build</span>(it);{"\n"}{"}"}<span style={{ opacity: caret(t) }}>|</span>
    </div>
  );
  if (i === 4) return <>{[C.brand, C.gold, C.coral, C.violet, C.sky].map((col, k) => <div key={k} style={{ position: "absolute", left: 28 + k * 44, top: 50, width: 36, height: 36, borderRadius: 18, background: col, scale: pop(t, at + k * 0.06) }} />)}<div style={{ position: "absolute", left: 28, top: 110, width: 210, height: 60, borderRadius: 10, border: "2px dashed rgba(255,255,255,.4)" }} /></>;
  if (i === 5) return <div style={{ position: "absolute", left: 20, top: 20, borderRadius: 12, overflow: "hidden", clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }}><Landscape w={240} h={160} /></div>;
  if (i === 6) return <div style={{ position: "absolute", left: 24, top: 40, right: 24, height: 120, display: "flex", alignItems: "center", gap: 6 }}>{Array.from({ length: 18 }).map((_, k) => <div key={k} style={{ flex: 1, borderRadius: 4, background: c, height: 10 + Math.abs(Math.sin(t * 5 + k * 0.6)) * 100 * p }} />)}</div>;
  return (
    <div style={{ position: "absolute", left: 60, top: 40, display: "flex" }}>
      <Icon icon={faPuzzlePiece} size={90} color="rgba(255,255,255,.3)" />
      <Icon icon={faPuzzlePiece} size={90} color={c} style={{ translate: `${(1 - p) * 80 - 30}px ${(1 - p) * -40}px`, rotate: `${(1 - p) * 30}deg` }} />
    </div>
  );
};

export const S07Create: React.FC = () => {
  const t = useT() + SCENES.s07[0];
  const verbs: Verb[] = [
    { word: "BRAINSTORM", at: W("s07b", "brainstorm"), icon: faLightbulb, color: C.gold },
    { word: "WRITE", at: W("s07c", "Write"), icon: faPenNib, color: C.coral },
    { word: "RESEARCH", at: W("s07c", "Research"), icon: faMagnifyingGlass, color: C.sky },
    { word: "CODE", at: W("s07d", "Code"), icon: faCode, color: C.success },
    { word: "DESIGN", at: W("s07d", "Design"), icon: faPalette, color: C.brand },
    { word: "IMAGES", at: W("s07e", "images"), icon: faImage, color: C.coral },
    { word: "MUSIC", at: W("s07e", "music"), icon: faMusic, color: C.violet },
    { word: "PROBLEMS", at: W("s07f", "problems") - 0.15, icon: faPuzzlePiece, color: C.gold },
  ];
  const cur = verbs.reduce((k, v, i) => (t >= v.at - 0.1 ? i : k), -1);
  const winIn = tw(t, [L("s07a") - 0.2, L("s07a") + 0.7], [0, 1], ease.out);
  const reach = tw(t, [L("s07g") - 0.2, W("s07g", "reach") + 0.3], [0, 1], ease.inOut);
  const within = tw(t, [W("s07g", "within") - 0.3, W("s07g", "within") + 0.9], [0, 1], ease.inOut);
  const sweep = tw(t, [L("s07a"), L("s07a") + 1.2], [0, 1], ease.inOut);
  const thought = W("s07g", "within") + 0.4;

  return (
    <Scene id="s07" push={0.03}>
      <Ambient t={t} opacity={0.45} colors={[C.gold, C.brand, C.violet, C.coral]} />
      <DotGrid />
      {/* current verb */}
      <At x={960} y={150} style={{ opacity: 1 - reach }}>
        {cur >= 0 && (
          <div key={cur} style={{ display: "flex", alignItems: "center", gap: 28, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 130, color: verbs[cur].color,
            scale: 1.25 - 0.25 * pop(t, verbs[cur].at - 0.1, 0.35), filter: `blur(${(1 - tw(t, [verbs[cur].at - 0.1, verbs[cur].at + 0.08], [0, 1])) * 10}px)`,
            textShadow: `0 0 50px ${verbs[cur].color}66`, whiteSpace: "nowrap" }}>
            {verbs[cur].word}
          </div>
        )}
        {cur < 0 && (
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 40, letterSpacing: "0.3em", color: "rgba(255,255,255,.7)", opacity: winIn }}>AI CAN HELP YOU</div>
        )}
      </At>

      {/* the workspace fills up */}
      <At x={960} y={620 - reach * 120} style={{ opacity: winIn, scale: (0.92 + 0.08 * winIn) * (1 - reach * 0.08 + within * 0.1) }}>
        <div style={{ width: 1260, height: 640, borderRadius: 30, background: "rgba(12,22,19,.85)", border: "2px solid rgba(255,255,255,.12)", position: "relative", overflow: "hidden",
          boxShadow: "0 60px 140px rgba(0,0,0,.6)" }}>
          <div style={{ height: 56, display: "flex", alignItems: "center", gap: 10, paddingLeft: 24, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
            {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />)}
            <div style={{ marginLeft: 20, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 22, color: "rgba(255,255,255,.6)" }}>my-project</div>
          </div>
          <div style={{ position: "absolute", left: `${sweep * 140 - 20}%`, top: 0, bottom: 0, width: 200, background: "linear-gradient(90deg, transparent, rgba(255,255,255,.08), transparent)" }} />
          {cur < 0 && <div style={{ position: "absolute", left: 60, top: 110, fontFamily: MONO, fontSize: 40, color: C.brand, opacity: caret(t) }}>|</div>}
          {verbs.map((v, i) => {
            const x = 30 + (i % 4) * (TW + 20), y = 80 + Math.floor(i / 4) * (TH + 20);
            const lift = within < 1 ? reach * (1 - within) : 0;
            return (
              <div key={i} style={{ position: "absolute", left: x, top: y, width: TW, height: TH, borderRadius: 20, background: `${v.color}1F`, border: `2px solid ${v.color}88`,
                overflow: "hidden", scale: pop(t, v.at - 0.05, 0.45) * (1 - lift * 0.25), opacity: t > v.at - 0.05 ? 1 - lift * 0.55 : 0,
                filter: `blur(${lift * 6}px)`, translate: `0 ${lift * -40}px` }}>
                <Motif i={i} t={t} at={v.at} c={v.color} />
                <div style={{ position: "absolute", left: 20, bottom: 16, display: "flex", alignItems: "center", gap: 10, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 22, letterSpacing: "0.14em", color: v.color }}>
                  <Icon icon={v.icon} size={24} color={v.color} /> {v.word}
                </div>
              </div>
            );
          })}
        </div>
      </At>

      {/* out of reach... within reach */}
      <At x={960} y={980} style={{ opacity: reach }}>
        <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 64, color: within > 0.5 ? C.gold : "rgba(255,255,255,.55)", whiteSpace: "nowrap",
          textShadow: within > 0.5 ? `0 0 40px ${C.gold}88` : undefined, scale: 1 + within * 0.1 }}>
          {within > 0.5 ? "within reach" : "out of reach..."}
        </div>
      </At>
      <At x={1640} y={210} style={{ opacity: tw(t, [thought, thought + 0.4], [0, 1]), scale: pop(t, thought, 0.6), rotate: "-4deg" }}>
        <div style={{ background: "#fff", borderRadius: 40, padding: "18px 34px", fontFamily: CAVEAT, fontWeight: 700, fontSize: 58, color: C.ink, boxShadow: "0 20px 50px rgba(0,0,0,.35)", whiteSpace: "nowrap" }}>
          wait... I could make that?
        </div>
      </At>
    </Scene>
  );
};
