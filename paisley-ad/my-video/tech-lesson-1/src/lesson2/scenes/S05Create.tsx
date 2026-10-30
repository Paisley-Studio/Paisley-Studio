import React from "react";
import { faArrowRight, faImage, faKeyboard, faLightbulb, faMicrochip } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { LUMORA_V1, Picture } from "../creature";
import { Ambient, At, BigWord, C, CAVEAT, DotGrid, E, ease, Generated, Icon, L, MONO, pop, PromptBox, QUICKSAND, Scene, Tag, tw, useScene, W } from "../lib2";

export const LUMORA_PROMPT =
  "Create a small flying creature that lives in a glowing rainforest. It has four wings, enormous curious eyes, blue feathers and a long golden tail. It is friendly but extremely fast.";

/** The recurring TECH visual: IDEA > WORDS > AI > CREATION. `lit` holds the time each node lights up. */
export const Pipeline: React.FC<{ t: number; lit: number[]; scale?: number }> = ({ t, lit, scale = 1 }) => {
  const nodes: { w: string; icon: IconDefinition; c: string }[] = [
    { w: "IDEA", icon: faLightbulb, c: C.gold },
    { w: "WORDS", icon: faKeyboard, c: C.brandSoft },
    { w: "AI", icon: faMicrochip, c: C.violet },
    { w: "CREATION", icon: faImage, c: C.coral },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 26, scale }}>
      {nodes.map((n, i) => {
        const on = tw(t, [lit[i], lit[i] + 0.3], [0, 1]);
        const flow = i < 3 ? tw(t, [lit[i] + 0.1, lit[i + 1]], [0, 1], ease.inOut) : 0;
        return (
          <React.Fragment key={n.w}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 26px", borderRadius: 999, border: `2px solid ${on > 0 ? n.c : "rgba(255,255,255,.18)"}`,
              background: on > 0 ? `${n.c}26` : "rgba(255,255,255,.04)", boxShadow: on > 0 ? `0 0 ${30 * on}px ${n.c}66` : undefined, scale: 1 + 0.12 * Math.max(0, 1 - Math.abs(t - lit[i]) / 0.3) }}>
              <Icon icon={n.icon} size={30} color={on > 0 ? n.c : "rgba(255,255,255,.35)"} />
              <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 28, letterSpacing: "0.16em", color: on > 0 ? "#fff" : "rgba(255,255,255,.35)" }}>{n.w}</div>
            </div>
            {i < 3 && (
              <div style={{ position: "relative", width: 90, height: 4, borderRadius: 2, background: "rgba(255,255,255,.12)" }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${flow * 100}%`, borderRadius: 2, background: `linear-gradient(90deg, ${n.c}, ${nodes[i + 1].c})` }} />
                {flow > 0 && flow < 1 && <div style={{ position: "absolute", left: `${flow * 100}%`, top: -6, width: 16, height: 16, borderRadius: 8, translate: "-50% 0", background: "#fff", boxShadow: `0 0 16px ${n.c}` }} />}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/** The student's studio window: design notes on the left, the canvas and the prompt on the right. */
export const Studio: React.FC<{ t: number; title?: string; children: React.ReactNode; notes?: [string, string][] }> = ({ t, title = "my-creature", children, notes }) => (
  <div style={{ width: 1680, height: 820, borderRadius: 30, background: "rgba(12,22,19,.92)", border: "2px solid rgba(255,255,255,.12)", position: "relative", overflow: "hidden",
    boxShadow: "0 60px 140px rgba(0,0,0,.6)" }}>
    <div style={{ height: 56, display: "flex", alignItems: "center", gap: 10, paddingLeft: 24, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
      {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />)}
      <div style={{ marginLeft: 20, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 22, color: "rgba(255,255,255,.6)" }}>TECH Studio · {title}</div>
      <div style={{ marginLeft: "auto", marginRight: 24, fontFamily: MONO, fontSize: 18, color: C.brandSoft }}>● approved AI tool</div>
    </div>
    {notes && (
      <div style={{ position: "absolute", left: 30, top: 86, width: 420, height: 704, borderRadius: 20, background: "#FBF8F1", padding: "24px 28px" }}>
        <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 22, letterSpacing: "0.2em", color: C.brandDeep, marginBottom: 14 }}>MY DESIGN</div>
        {notes.map(([k, v]) => (
          <div key={k} style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 18, letterSpacing: "0.14em", color: C.muted }}>{k}</div>
            <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 36, lineHeight: 1.05, color: "#2E5BB0" }}>{v}</div>
          </div>
        ))}
      </div>
    )}
    {children}
    <div style={{ position: "absolute", left: 0, right: 0, top: 56, height: 2, background: `linear-gradient(90deg, transparent, ${C.brand}, transparent)`, opacity: 0.4 + 0.3 * Math.sin(t * 2) }} />
  </div>
);

export const LUMORA_NOTES: [string, string][] = [
  ["NAME", "Lumora"], ["HABITAT", "the Glow Forest"], ["ABILITY", "can turn invisible"],
  ["LOOKS", "small, 4 wings, huge curious eyes, blue feathers, long golden tail"], ["PERSONALITY", "curious & playful"],
];

/** 05: "Your turn." The studio opens, the idea becomes words, the words go to the AI, and version 1 appears. */
export const S05Create: React.FC = () => {
  const t = useScene("s05");
  const open = tw(t, [L("s05c") - 0.4, L("s05c") + 0.5], [0, 1], ease.out);
  const typeAt = E("s05d") + 0.3;
  const cps = LUMORA_PROMPT.length / (L("s05e") - 0.5 - typeAt);
  const send = W("s05f", "go") - 0.05;
  const gen = W("s05g", "turns");
  const genDur = L("s05h") - 0.15 - gen;
  const lit = [W("s05e", "idea") - 0.1, W("s05e", "words") - 0.1, W("s05f", "AI") - 0.1, L("s05h") - 0.1];
  const zoom = tw(t, [L("s05h") - 0.2, L("s05h") + 1.6], [0, 1], ease.inOut);
  // canvas centre on screen is (1185, 511); bring it to the middle as the camera pushes in
  const s = 1 + 0.42 * zoom;
  const first = L("s05i") - 0.1;
  return (
    <Scene id="s05" push={0.02} cam={{ scale: s, x: -(s * 225) * zoom, y: s * 29 * zoom }}>
      <Ambient t={t} opacity={0.3 + 0.2 * zoom} colors={[C.brand, C.gold, C.coral]} />
      <DotGrid />
      {/* your turn */}
      <At x={960} y={460} style={{ opacity: tw(t, [L("s05c") - 0.5, L("s05c") - 0.1], [1, 0]) }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 50 }}>
          <BigWord t={t} at={W("s05a", "your") - 0.15} size={170} color={C.gold} glow={`${C.gold}55`}>YOUR TURN.</BigWord>
          <div style={{ display: "flex", alignItems: "center", gap: 40, opacity: tw(t, [L("s05b"), L("s05b") + 0.4], [0, 1]) }}>
            <Icon icon={faLightbulb} size={80} color={C.gold} />
            <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 58, color: "#fff" }}>the creature you imagined</div>
            <Icon icon={faArrowRight} size={50} color={C.brandSoft} style={{ opacity: tw(t, [W("s05b", "describe") - 0.2, W("s05b", "describe")], [0, 1]) }} />
            <div style={{ fontFamily: MONO, fontSize: 40, color: C.brandSoft, opacity: tw(t, [W("s05b", "describe"), W("s05b", "describe") + 0.3], [0, 1]) }}>describe it ▍</div>
          </div>
        </div>
      </At>
      {/* the pipeline */}
      <At x={960} y={98} style={{ opacity: tw(t, [lit[0] - 0.4, lit[0]], [0, 1]) }}>
        <Pipeline t={t} lit={lit} />
      </At>
      {/* the studio */}
      <At x={960} y={600} style={{ opacity: open, scale: 0.9 + 0.1 * open, translate: `0 ${(1 - open) * 60}px` }}>
        <Studio t={t} notes={LUMORA_NOTES}>
          <div style={{ position: "absolute", left: 635, top: 86 }}>
            <Generated t={t} at={gen} dur={genDur} w={860} h={470} seed="v1">
              <Picture look={LUMORA_V1} habitat="desert" w={860} h={470} t={t} uid="s05v1" />
            </Generated>
          </div>
          <div style={{ position: "absolute", left: 490, top: 580 }}>
            <PromptBox t={t} at={typeAt} text={LUMORA_PROMPT} cps={cps} width={1150} size={26} send={send} />
          </div>
          {/* the words fly up into the canvas */}
          {Array.from({ length: 14 }).map((_, k) => {
            const p = tw(t, [send + 0.1 + k * 0.08, send + 1.2 + k * 0.08], [0, 1], ease.inOut);
            const words = ["small", "flying", "glowing", "rainforest", "four", "wings", "curious", "eyes", "blue", "feathers", "golden", "tail", "friendly", "fast"];
            return p > 0 && p < 1 ? (
              <div key={k} style={{ position: "absolute", left: 560 + (k % 7) * 150 + (1065 - 560 - (k % 7) * 150) * p, top: 640 - (640 - 320) * p, opacity: Math.sin(p * Math.PI),
                fontFamily: MONO, fontSize: 24, color: C.brandSoft, scale: 1 - 0.6 * p }}>{words[k]}</div>
            ) : null;
          })}
        </Studio>
      </At>
      {/* your first AI creation */}
      <At x={1185} y={712} style={{ opacity: tw(t, [first, first + 0.4], [0, 1]), scale: pop(t, first, 0.5) }}>
        <Tag color={C.gold} dark size={20}>✦ MY FIRST AI CREATION ✦</Tag>
      </At>
      {Array.from({ length: 16 }).map((_, k) => {
        const a = (k / 16) * Math.PI * 2;
        const p = tw(t, [L("s05h") + 0.05, L("s05h") + 1.4], [0, 1], ease.out);
        return (
          <div key={k} style={{ position: "absolute", left: 1185 + Math.cos(a) * (240 + 220 * p), top: 511 + Math.sin(a) * (150 + 160 * p), width: 10, height: 10, borderRadius: 5,
            background: [C.gold, C.brand, C.coral, C.violet][k % 4], opacity: p > 0 ? 1 - p : 0 }} />
        );
      })}
    </Scene>
  );
};
