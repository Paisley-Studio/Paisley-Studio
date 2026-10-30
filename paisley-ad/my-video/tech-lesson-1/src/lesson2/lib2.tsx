import React from "react";
import { AbsoluteFill, random } from "remotion";
import { BG, C, ease, MONO, QUICKSAND, tw, useT } from "../lib";
import TL from "./timeline.json";

/**
 * Lesson 2's timeline helpers. The look (colours, type, motion, Card, Grain...) is imported from
 * ../lib so both lessons stay one visual system; only the timing is Lesson 2's own.
 */
export * from "../lib";

export type SceneId = keyof typeof TL.scenes;
export const SCENES = TL.scenes;
export type Word = [number, number, string];
type Line = { id: string; text: string; file: string; at: number; speech: number[]; words: Word[] };
export const VO = TL.vo as unknown as Line[];
const LINES: Record<string, Line> = Object.fromEntries(VO.map((l) => [l.id, l]));

const line = (id: string) => {
  const l = LINES[id];
  if (!l) throw new Error(`No narration line ${id}`);
  return l;
};
/** When the narrator starts speaking line `id` (absolute seconds). */
export const L = (id: string) => line(id).speech[0];
/** When the narrator finishes line `id`. */
export const E = (id: string) => line(id).speech[1];
/** Start of a word in line `id`: by index (negative counts from the end) or by its text (nth match). */
export const W = (id: string, word: number | string, nth = 0) => {
  const ws = line(id).words;
  if (typeof word === "number") return ws[word < 0 ? ws.length + word : word][0];
  const hits = ws.filter((w) => w[2].toLowerCase().replace(/[^a-z0-9']/g, "") === word.toLowerCase());
  if (!hits[nth]) throw new Error(`No word "${word}" (#${nth}) in ${id}`);
  return hits[nth][0];
};

/**
 * Absolutely positioned box centred on (x, y), like ../lib's At, but sized to its content: a box at `left: x`
 * otherwise shrinks to the width left of the frame's edge, and text right of centre wraps.
 */
export const At: React.FC<{ x: number; y: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ x, y, children, style }) => (
  <div style={{ position: "absolute", left: x, top: y, width: "max-content", translate: "-50% -50%", zIndex: style?.zIndex }}>
    <div style={style}>{children}</div>
  </div>
);

/** Scene time in absolute lesson seconds. */
export const useScene = (id: SceneId) => useT() + SCENES[id][0];

/** Lesson 1's scene shell, on Lesson 2's timeline. */
export const Scene: React.FC<{
  id: SceneId;
  bg?: string;
  push?: number;
  cam?: { scale?: number; x?: number; y?: number };
  outro?: boolean;
  children: React.ReactNode;
}> = ({ id, bg = BG.night, push = 0.04, cam = {}, outro = true, children }) => {
  const t = useScene(id);
  const [a, b] = SCENES[id];
  const inP = tw(t, [a, a + 0.6], [0, 1]);
  const outP = outro ? tw(t, [b - 0.45, b], [0, 1], ease.in) : 0;
  const s = (1 + push * ((t - a) / (b - a))) * (cam.scale ?? 1) * (1.06 - 0.06 * inP) * (1 + 0.08 * outP);
  return (
    <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
      <AbsoluteFill style={{
        scale: s, translate: `${cam.x ?? 0}px ${cam.y ?? 0}px`, opacity: inP * (1 - outP),
        filter: `blur(${(1 - inP) * 14 + outP * 18}px)`,
      }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ Lesson 2 pieces

/** A think-time ring: counts the student's own time down, so a silence reads as theirs, not a gap. */
export const ThinkTimer: React.FC<{ t: number; from: number; to: number; label?: string; color?: string; dark?: boolean }> = ({
  t, from, to, label = "THINK", color = C.gold, dark = true,
}) => {
  const p = tw(t, [from, to], [0, 1], ease.linear);
  const o = Math.min(tw(t, [from - 0.3, from + 0.3], [0, 1]), tw(t, [to, to + 0.5], [1, 0]));
  const left = Math.max(0, Math.ceil(to - t));
  const r = 46, cf = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, opacity: o }}>
      <svg width={112} height={112} viewBox="0 0 112 112">
        <circle cx={56} cy={56} r={r} fill="none" stroke={dark ? "rgba(255,255,255,.12)" : "rgba(29,42,40,.1)"} strokeWidth={8} />
        <circle cx={56} cy={56} r={r} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${cf * (1 - p)} ${cf}`}
          transform="rotate(-90 56 56)" />
        <text x={56} y={68} textAnchor="middle" fontFamily={QUICKSAND} fontWeight={700} fontSize={36} fill={dark ? "#fff" : C.ink}>{left}</text>
      </svg>
      <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 30, letterSpacing: "0.3em", color }}>{label}</div>
    </div>
  );
};

/** A prompt box: the student's words typed into the AI. */
export const PromptBox: React.FC<{
  t: number; at: number; text: string; cps?: number; width?: number; size?: number; send?: number; label?: string; dim?: boolean;
}> = ({ t, at, text, cps = 26, width = 1100, size = 34, send, label = "YOUR INSTRUCTION", dim }) => {
  const shown = text.slice(0, Math.max(0, Math.floor((t - at) * cps)));
  const done = shown.length >= text.length;
  const sent = send !== undefined && t >= send;
  return (
    <div style={{
      width, borderRadius: 24, background: "rgba(10,20,17,.9)", border: `2px solid ${sent ? C.brand : "rgba(255,255,255,.14)"}`,
      boxShadow: sent ? `0 0 50px ${C.brand}44, 0 40px 90px rgba(0,0,0,.45)` : "0 40px 90px rgba(0,0,0,.45)", padding: "22px 30px 26px", opacity: dim ? 0.55 : 1,
    }}>
      <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 20, letterSpacing: "0.26em", color: C.brand, marginBottom: 10 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 20 }}>
        <div style={{ flex: 1, fontFamily: MONO, fontSize: size, lineHeight: 1.45, color: "#fff", minHeight: size * 1.45 }}>
          {shown}
          {!sent && <span style={{ color: C.brand, opacity: done ? Math.floor(t * 2.2) % 2 : 1 }}>▍</span>}
        </div>
        <div style={{
          flexShrink: 0, padding: "12px 26px", borderRadius: 14, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 24, letterSpacing: "0.12em",
          background: sent ? C.brand : done ? "rgba(85,191,179,.25)" : "rgba(255,255,255,.08)", color: sent ? C.night : "rgba(255,255,255,.7)",
          scale: send !== undefined ? 1 + 0.12 * Math.max(0, 1 - Math.abs(t - send) / 0.15) : 1,
        }}>
          {sent ? "SENT" : "CREATE ✦"}
        </div>
      </div>
    </div>
  );
};

/**
 * The AI "generating" an image: noise blocks resolve into the picture, coarse to fine, under a scan line.
 * Children are the finished picture. Before `at` the frame shows an empty canvas.
 */
export const Generated: React.FC<{
  t: number; at: number; dur?: number; w: number; h: number; seed: string; children: React.ReactNode; radius?: number; frame?: boolean;
}> = ({ t, at, dur = 2.2, w, h, seed, children, radius = 26, frame = true }) => {
  const p = tw(t, [at, at + dur], [0, 1], ease.inOut);
  const cols = 16, rows = Math.round((16 * h) / w);
  const scan = tw(t, [at, at + dur], [0, 1], ease.linear);
  const started = t >= at;
  return (
    <div style={{
      position: "relative", width: w, height: h, borderRadius: radius, overflow: "hidden", background: "#0B1714",
      border: frame ? "2px solid rgba(255,255,255,.14)" : undefined, boxShadow: frame ? "0 40px 100px rgba(0,0,0,.5)" : undefined,
    }}>
      <div style={{ position: "absolute", inset: 0, opacity: started ? tw(t, [at, at + dur * 0.5], [0, 1]) : 0, filter: `blur(${(1 - p) * 28}px) saturate(${0.4 + 0.6 * p})`, scale: 1.08 - 0.08 * p }}>
        {children}
      </div>
      {started && p < 1 && (
        <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
          {Array.from({ length: cols * rows }).map((_, i) => {
            const r = random(`${seed}-${i}`);
            const hue = 160 + random(`${seed}-h${i}`) * 80;
            return <div key={i} style={{ background: `hsl(${hue} 40% ${18 + r * 30}%)`, opacity: Math.max(0, 1 - p * 1.6 - r * 0.5 + 0.2) }} />;
          })}
        </div>
      )}
      {started && p < 1 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: `${scan * 100}%`, height: 4, background: C.brandSoft, boxShadow: `0 0 30px 8px ${C.brand}` }} />
      )}
      {!started && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 22,
          letterSpacing: "0.3em", color: "rgba(255,255,255,.22)" }}>
          WAITING FOR AN IDEA
        </div>
      )}
      {started && p < 1 && (
        <div style={{ position: "absolute", left: 20, bottom: 16, fontFamily: MONO, fontSize: 18, color: C.brandSoft, background: "rgba(7,16,13,.7)", padding: "6px 12px", borderRadius: 8 }}>
          generating… {Math.round(p * 100)}%
        </div>
      )}
    </div>
  );
};

/** A small tag pinned to a picture: a version label, or a check note. */
export const Tag: React.FC<{ children: React.ReactNode; color?: string; dark?: boolean; size?: number; style?: React.CSSProperties }> = ({
  children, color = C.brand, dark, size = 22, style,
}) => (
  <div style={{
    display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, fontFamily: QUICKSAND, fontWeight: 700, fontSize: size,
    letterSpacing: "0.14em", background: dark ? color : `${color}22`, color: dark ? C.night : color, border: `2px solid ${color}`, whiteSpace: "nowrap", ...style,
  }}>{children}</div>
);
