import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { loadFont as loadQuicksand } from "@remotion/google-fonts/Quicksand";
import { loadFont as loadCaveat } from "@remotion/google-fonts/Caveat";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import TL from "./timeline.json";

export const { fontFamily: QUICKSAND } = loadQuicksand("normal", {
  weights: ["500", "600", "700"],
  subsets: ["latin"],
});
export const { fontFamily: CAVEAT } = loadCaveat("normal", { weights: ["600", "700"], subsets: ["latin"] });
export const { fontFamily: MONO } = loadMono("normal", { weights: ["400", "600"], subsets: ["latin"] });

/** Colour tokens from the TECH portal (js/tech/tech-portal.css). */
export const C = {
  brand: "#55BFB3",
  brandDeep: "#245F5A",
  brandSoft: "#7BCBC2",
  dark: "#0F1A14",
  night: "#07100D",
  gold: "#F5C842",
  goldSoft: "#FFE57A",
  ink: "#1D2A28",
  muted: "#5A6E6A",
  paper: "#F4F8F7",
  sage: "#E5F2EF",
  surface: "#FFFFFF",
  error: "#E74C3C",
  success: "#2EB872",
  warn: "#E8A33D",
  violet: "#8B7CF6",
  coral: "#FF8A65",
  sky: "#5AA9F5",
};

// ------------------------------------------------------------------ timeline
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

/** Absolute timeline seconds inside a scene. */
export const useT = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};

// ------------------------------------------------------------------ motion
export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  soft: Easing.bezier(0.33, 1, 0.68, 1),
  back: Easing.bezier(0.34, 1.56, 0.64, 1),
  linear: (n: number) => n,
};

/** interpolate() on absolute seconds, clamped on both sides. */
export const tw = (t: number, input: number[], output: number[], easing: (n: number) => number = ease.out) =>
  interpolate(t, input, output, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

/** 0 -> 1 -> 0 window for something that enters, holds and leaves. */
export const life = (t: number, inAt: number, outAt: number, fade = 0.35) =>
  Math.min(tw(t, [inAt, inAt + fade], [0, 1]), tw(t, [outAt - fade, outAt], [1, 0], ease.inOut));

/** A spring-like pop: 0 -> overshoot -> 1. */
export const pop = (t: number, at: number, dur = 0.45) => tw(t, [at, at + dur], [0, 1], ease.back);

// ------------------------------------------------------------------ type
/** Mask-wipe reveal: the content slides up out of its own clip. */
export const Reveal: React.FC<{
  t: number;
  at: number;
  out?: number;
  dur?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ t, at, out = 1e9, dur = 0.6, children, style }) => {
  const p = tw(t, [at, at + dur], [0, 1]);
  const o = tw(t, [out - 0.35, out], [1, 0], ease.inOut);
  return (
    <div style={{ overflow: "hidden", padding: "0.06em 0.1em 0.12em", ...style }}>
      <div style={{ translate: `0 ${(1 - p) * 115}%`, opacity: o * tw(t, [at, at + 0.12], [0, 1]), filter: `blur(${(1 - o) * 8}px)` }}>
        {children}
      </div>
    </div>
  );
};

/** One big, short, powerful word. Tracking tightens as it lands. */
export const BigWord: React.FC<{
  t: number;
  at: number;
  out?: number;
  size?: number;
  color?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  glow?: string;
}> = ({ t, at, out, size = 200, color = "#fff", children, style, glow }) => (
  <Reveal t={t} at={at} out={out} dur={0.55} style={style}>
    <div
      style={{
        fontFamily: QUICKSAND,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1,
        color,
        letterSpacing: `${tw(t, [at, at + 1.4], [0.12, 0.02])}em`,
        whiteSpace: "nowrap",
        textShadow: glow ? `0 0 60px ${glow}` : undefined,
      }}
    >
      {children}
    </div>
  </Reveal>
);

/** Small spaced-out label above a section. */
export const Kicker: React.FC<{ t: number; at: number; out?: number; color?: string; size?: number; children: React.ReactNode }> = ({
  t, at, out, color = C.brand, size = 30, children,
}) => (
  <Reveal t={t} at={at} out={out} dur={0.5}>
    <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: size, letterSpacing: "0.3em", color, whiteSpace: "nowrap" }}>
      {children}
    </div>
  </Reveal>
);

export const Icon: React.FC<{ icon: IconDefinition; size: number; color?: string; style?: React.CSSProperties }> = ({
  icon, size, color = "#fff", style,
}) => <FontAwesomeIcon icon={icon} style={{ width: size, height: size, color, ...style }} />;

export const Center: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", ...style }}>{children}</AbsoluteFill>
);

/** Absolutely positioned box centred on (x, y). `style` goes on an inner box, so its own translate/scale compose with the centring. */
export const At: React.FC<{ x: number; y: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ x, y, children, style }) => (
  <div style={{ position: "absolute", left: x, top: y, translate: "-50% -50%", zIndex: style?.zIndex }}>
    <div style={style}>{children}</div>
  </div>
);

// ------------------------------------------------------------------ scene shell
export const BG = {
  night: `radial-gradient(ellipse 80% 70% at 50% 45%, #10241F 0%, ${C.night} 70%)`,
  paper: `radial-gradient(ellipse 90% 80% at 50% 40%, #FFFFFF 0%, ${C.paper} 60%, #E3EFEC 100%)`,
};

/**
 * Wraps a scene: background, a slow camera push, and a soft zoom-blur in and out at the cuts.
 * `cam` lets a scene add its own camera moves (scale and pan in px).
 */
export const Scene: React.FC<{
  id: SceneId;
  bg?: string;
  push?: number;
  cam?: { scale?: number; x?: number; y?: number };
  outro?: boolean; // false: hold the last frame instead of zoom-blurring out (the final scene)
  children: React.ReactNode;
}> = ({ id, bg = BG.night, push = 0.04, cam = {}, outro = true, children }) => {
  const t = useT() + SCENES[id][0];
  const [a, b] = SCENES[id];
  const inP = tw(t, [a, a + 0.6], [0, 1]);
  const outP = outro ? tw(t, [b - 0.45, b], [0, 1], ease.in) : 0;
  const s = (1 + push * ((t - a) / (b - a))) * (cam.scale ?? 1) * (1.06 - 0.06 * inP) * (1 + 0.08 * outP);
  return (
    <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          scale: s,
          translate: `${cam.x ?? 0}px ${cam.y ?? 0}px`,
          opacity: inP * (1 - outP),
          filter: `blur(${(1 - inP) * 14 + outP * 18}px)`,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Soft drifting light blobs: depth without noise. */
export const Ambient: React.FC<{ t: number; colors?: string[]; opacity?: number }> = ({ t, colors = [C.brand, C.brandDeep, C.gold], opacity = 0.35 }) => (
  <AbsoluteFill style={{ opacity }}>
    {colors.map((c, i) => {
      const x = 960 + Math.sin(t * 0.13 + i * 2.1) * 520;
      const y = 540 + Math.cos(t * 0.11 + i * 1.7) * 260;
      return (
        <div key={i} style={{
          position: "absolute", left: x - 450, top: y - 450, width: 900, height: 900, borderRadius: "50%",
          background: `radial-gradient(circle, ${c}55 0%, transparent 65%)`,
        }} />
      );
    })}
  </AbsoluteFill>
);

/** Fine dot grid, the "studio surface". */
export const DotGrid: React.FC<{ color?: string; opacity?: number; gap?: number }> = ({ color = "#ffffff", opacity = 0.07, gap = 48 }) => (
  <AbsoluteFill style={{
    backgroundImage: `radial-gradient(${color} 1.6px, transparent 1.8px)`,
    backgroundSize: `${gap}px ${gap}px`, backgroundPosition: "center", opacity,
  }} />
);

/** Rounded glass card used for every on-screen object. */
export const Card: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode; dark?: boolean }> = ({ style, children, dark = true }) => (
  <div style={{
    position: "absolute", borderRadius: 28, overflow: "hidden",
    background: dark ? "linear-gradient(160deg, rgba(255,255,255,.10), rgba(255,255,255,.03))" : "#fff",
    border: dark ? "1.5px solid rgba(255,255,255,.14)" : "1.5px solid rgba(29,42,40,.08)",
    boxShadow: dark ? "0 40px 90px rgba(0,0,0,.45)" : "0 30px 70px rgba(36,95,90,.16)",
    ...style,
  }}>{children}</div>
);

/** Film grain and vignette over the whole frame. */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.05 }) => {
  const frame = useCurrentFrame();
  const ox = Math.floor(random(`gx${frame}`) * 512);
  const oy = Math.floor(random(`gy${frame}`) * 512);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ backgroundImage: `url(${staticFile("img/grain.png")})`, backgroundPosition: `${ox}px ${oy}px`, opacity, mixBlendMode: "overlay" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,.35) 100%)" }} />
    </AbsoluteFill>
  );
};

/** Typewriter: how many characters of `text` are showing at time t. */
export const typed = (t: number, at: number, text: string, cps = 28) => text.slice(0, Math.max(0, Math.floor((t - at) * cps)));

export const caret = (t: number) => (Math.floor(t * 2.2) % 2 === 0 ? 1 : 0);
