import React from "react";
import { AbsoluteFill, Easing, interpolate, random, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { loadFont as loadQuicksand } from "@remotion/google-fonts/Quicksand";
import TL from "./timeline.json";

// Quicksand is the only typeface in this film (brand lock in the brief).
export const { fontFamily: QUICKSAND } = loadQuicksand("normal", { weights: ["500", "600", "700"], subsets: ["latin"] });

/** Colour tokens from the production site (tech.html :root and js/tech/tech-portal.css). */
export const C = {
  brand: "#55BFB3",
  brandDeep: "#245F5A",
  brandSoft: "#7BCBC2",
  dark: "#0F1A14",
  gold: "#F5C842",
  goldSoft: "#FFE57A",
  ink: "#263331",
  muted: "#5A6E6A",
  paper: "#F1F9F7",
  sage: "#E5F2EF",
  surface: "#FFFFFF",
  warn: "#E8A33D",
  berry: "#E74C3C",
  // the deepest shades of brandDeep, for evening interiors
  room: "#143B37",
  roomDark: "#0B2623",
  line: "rgba(38,51,49,.12)",
};

// ------------------------------------------------------------------ timeline
export type SceneId = keyof typeof TL.scenes;
export const SCENES = TL.scenes;
export const EV = TL.events;
export type Word = [number, number, string];
type Line = { id: string; text: string; file: string; at: number; speech: number[]; words: Word[] };
const LINES: Record<string, Line> = Object.fromEntries((TL.vo as unknown as Line[]).map((l) => [l.id, l]));
/** When the narrator starts / finishes speaking line `id` (absolute seconds). */
export const L = (id: string) => LINES[id].speech[0];
export const E = (id: string) => LINES[id].speech[1];
/** Start of a spoken word in line `id`. */
export const W = (id: string, word: string) => {
  const hit = LINES[id].words.find((w) => w[2].toLowerCase().replace(/[^a-z0-9']/g, "") === word);
  if (!hit) throw new Error(`No word "${word}" in ${id}`);
  return hit[0];
};

/** Absolute timeline seconds inside a scene's Sequence. */
export const useSceneT = (id: SceneId) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps + SCENES[id][0];
};

// ------------------------------------------------------------------ motion
export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  back: Easing.bezier(0.34, 1.56, 0.64, 1),
  linear: (n: number) => n,
};

/** interpolate() on absolute seconds, clamped on both sides. */
export const tw = (t: number, input: number[], output: number[], easing: (n: number) => number = ease.out) =>
  interpolate(t, input, output, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

/** 0 -> 1 -> 0 window for something that enters, holds and leaves. */
export const life = (t: number, inAt: number, outAt: number, fade = 0.2) =>
  Math.min(tw(t, [inAt, inAt + fade], [0, 1]), tw(t, [outAt - fade, outAt], [1, 0], ease.inOut));

export const pop = (t: number, at: number, dur = 0.38) => tw(t, [at, at + dur], [0, 1], ease.back);

// ------------------------------------------------------------------ type
export const Type: React.FC<{
  size: number;
  color?: string;
  weight?: number;
  spacing?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ size, color = "#fff", weight = 700, spacing = "-0.01em", style, children }) => (
  <div style={{ fontFamily: QUICKSAND, fontWeight: weight, fontSize: size, color, letterSpacing: spacing, lineHeight: 1.08, ...style }}>{children}</div>
);

/** Mask-wipe reveal: the line rises out of its own clip while its tracking tightens. */
export const Rise: React.FC<{
  t: number;
  at: number;
  out?: number;
  dur?: number;
  size: number;
  color?: string;
  glow?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ t, at, out = 1e9, dur = 0.42, size, color = "#fff", glow, style, children }) => {
  const p = tw(t, [at, at + dur], [0, 1]);
  const o = tw(t, [out - 0.14, out], [1, 0], ease.inOut);
  return (
    <div style={{ overflow: "hidden", padding: "0.1em 0.14em 0.16em", ...style }}>
      <div
        style={{
          translate: `0 ${(1 - p) * 118}%`,
          opacity: o * tw(t, [at, at + 0.08], [0, 1]),
          fontFamily: QUICKSAND,
          fontWeight: 700,
          fontSize: size,
          color,
          lineHeight: 1.04,
          whiteSpace: "nowrap",
          letterSpacing: `${tw(t, [at, at + 1.1], [0.05, -0.01])}em`,
          textShadow: glow ? `0 0 70px ${glow}` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export const Icon: React.FC<{ icon: IconDefinition; size: number; color?: string; style?: React.CSSProperties }> = ({ icon, size, color = "#fff", style }) => (
  <FontAwesomeIcon icon={icon} style={{ width: size, height: size, color, ...style }} />
);

/** Absolutely positioned box centred on (x, y). `style` goes on an inner box, so its own transforms compose with the centring. */
export const At: React.FC<{ x: number; y: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ x, y, children, style }) => (
  <div style={{ position: "absolute", left: x, top: y, translate: "-50% -50%", zIndex: style?.zIndex }}>
    <div style={style}>{children}</div>
  </div>
);

export const Center: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", ...style }}>{children}</AbsoluteFill>
);

/** Soft pool of light: a radial glow, the only gradient this film uses on its backgrounds. */
export const Glow: React.FC<{ x: number; y: number; r: number; color: string; opacity?: number }> = ({ x, y, r, color, opacity = 1 }) => (
  <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", opacity,
    background: `radial-gradient(circle, ${color} 0%, transparent 68%)`, pointerEvents: "none" }} />
);

/** A shared twinkle, different for every bulb. */
export const twinkle = (t: number, i: number, speed = 1) => 0.62 + 0.38 * Math.sin(t * (1.7 + (i % 5) * 0.5) * speed + i * 2.4);

/** A warm bulb: bright core, soft halo. */
export const Bulb: React.FC<{ x: number; y: number; r?: number; on?: number; color?: string }> = ({ x, y, r = 7, on = 1, color = C.gold }) => (
  <>
    <div style={{ position: "absolute", left: x - r * 5, top: y - r * 5, width: r * 10, height: r * 10, borderRadius: "50%", opacity: on * 0.8,
      background: `radial-gradient(circle, ${color}AA 0%, transparent 70%)` }} />
    <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", background: on > 0.3 ? "#FFF6D6" : color, opacity: 0.35 + on * 0.65 }} />
  </>
);

/** A string of lights hanging in shallow swags across the frame. */
export const LightString: React.FC<{ t: number; y?: number; sag?: number; bulbs?: number; x0?: number; x1?: number; opacity?: number; r?: number; wire?: string }> = ({
  t, y = 60, sag = 70, bulbs = 22, x0 = -40, x1 = 1960, opacity = 1, r = 7, wire = "rgba(255,255,255,.22)",
}) => {
  const pts = Array.from({ length: bulbs }, (_, i) => {
    const u = i / (bulbs - 1);
    const s = (u * 4) % 1;
    return { x: x0 + (x1 - x0) * u, y: y + sag * 4 * s * (1 - s) };
  });
  return (
    <AbsoluteFill style={{ opacity }}>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <path d={`M ${pts.map((p) => `${p.x} ${p.y}`).join(" L ")}`} stroke={wire} strokeWidth={2.5} fill="none" />
      </svg>
      {pts.map((p, i) => <Bulb key={i} x={p.x} y={p.y + 8} r={r} on={twinkle(t, i)} />)}
    </AbsoluteFill>
  );
};

/** Film grain over the whole frame. */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.045 }) => {
  const frame = useCurrentFrame();
  const ox = Math.floor(random(`gx${frame}`) * 512);
  const oy = Math.floor(random(`gy${frame}`) * 512);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", backgroundImage: `url(${staticFile("img/grain.png")})`, backgroundPosition: `${ox}px ${oy}px`, opacity, mixBlendMode: "overlay" }} />
  );
};

/** Sparse rising gold motes; used very sparingly. */
export const Motes: React.FC<{ t: number; n?: number; seed?: string; opacity?: number }> = ({ t, n = 14, seed = "m", opacity = 1 }) => (
  <AbsoluteFill style={{ opacity }}>
    {Array.from({ length: n }, (_, i) => {
      const sx = random(`${seed}x${i}`) * 1920;
      const sp = 24 + random(`${seed}s${i}`) * 40;
      const y = 1100 - ((t * sp + random(`${seed}y${i}`) * 1100) % 1160);
      const r = 2 + random(`${seed}r${i}`) * 3.5;
      return <div key={i} style={{ position: "absolute", left: sx + Math.sin(t + i) * 18, top: y, width: r * 2, height: r * 2, borderRadius: "50%", background: C.goldSoft, opacity: 0.25 + 0.5 * twinkle(t, i, 1.4), boxShadow: `0 0 ${r * 5}px ${C.gold}` }} />;
    })}
  </AbsoluteFill>
);

/** How many characters of `text` are showing at time t. */
export const typed = (t: number, at: number, text: string, cps = 30) => text.slice(0, Math.max(0, Math.floor((t - at) * cps)));

/** Pointer used for on-screen interaction. */
export const Cursor: React.FC<{ x: number; y: number; press?: number; scale?: number }> = ({ x, y, press = 0, scale = 1 }) => (
  <svg width={46 * scale} height={46 * scale} viewBox="0 0 24 24" style={{ position: "absolute", left: x, top: y, scale: 1 - press * 0.2, transformOrigin: "0 0", filter: "drop-shadow(0 5px 8px rgba(0,0,0,.4))", zIndex: 40 }}>
    <path d="M3 2l7.5 19 2.6-7.4L20.5 11z" fill="#fff" stroke={C.ink} strokeWidth={1.4} strokeLinejoin="round" />
  </svg>
);
