import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadQuicksand } from "@remotion/google-fonts/Quicksand";
import { loadFont as loadCaveat } from "@remotion/google-fonts/Caveat";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { getLength, getPointAtLength } from "@remotion/paths";
import TL from "./timeline.json";

export const { fontFamily: QUICKSAND } = loadQuicksand("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});
export const { fontFamily: CAVEAT } = loadCaveat("normal", { weights: ["500", "700"], subsets: ["latin"] });
export const { fontFamily: MONO } = loadMono("normal", { weights: ["400", "600"], subsets: ["latin"] });

/** Colour tokens taken from the production site (index.html :root and tech-portal.css). */
export const C = {
  brand: "#55BFB3",
  brandDeep: "#245F5A",
  brandSoft: "#7BCBC2",
  dark: "#0F1A14",
  night: "#08110E",
  gold: "#F5C842",
  goldSoft: "#FFE57A",
  ink: "#263331",
  muted: "#5A6E6A",
  paper: "#F1F9F7",
  sage: "#E5F2EF",
  surface: "#FFFFFF",
  error: "#E74C3C",
  success: "#2EB872",
  warn: "#E8A33D",
};

export const EV = TL.events;
export const SCENES = TL.scenes;

/** Frame for an absolute timeline second, relative to the start of a scene. */
export const useSceneTime = (scene: keyof typeof SCENES) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps + SCENES[scene][0];
  return { frame, fps, t };
};

export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  soft: Easing.bezier(0.33, 1, 0.68, 1),
  back: Easing.bezier(0.34, 1.56, 0.64, 1),
};

/** interpolate() on absolute seconds, clamped on both sides. */
export const tw = (
  t: number,
  input: number[],
  output: number[],
  easing: (n: number) => number = ease.out,
) =>
  interpolate(t, input, output, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });

/** Smooth 0 -> 1 -> 0 window for something that enters, holds and leaves. */
export const life = (t: number, inAt: number, outAt: number, fade = 0.35) =>
  Math.min(tw(t, [inAt, inAt + fade], [0, 1]), tw(t, [outAt - fade, outAt], [1, 0], ease.inOut));

/** A mask-wipe typographic reveal: each line slides up out of its own clip. */
export const Reveal: React.FC<{
  t: number;
  at: number;
  out?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
  dur?: number;
}> = ({ t, at, out = 999, children, style, dur = 0.7 }) => {
  const p = tw(t, [at, at + dur], [0, 1]);
  const o = tw(t, [out - 0.4, out], [1, 0], ease.inOut);
  return (
    <div style={{ overflow: "hidden", paddingBottom: "0.08em", ...style }}>
      <div
        style={{
          translate: `0 ${(1 - p) * 110}%`,
          opacity: o * tw(t, [at, at + 0.15], [0, 1]),
          filter: `blur(${(1 - o) * 8}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** Big cinematic headline; tracking tightens as it lands. */
export const Headline: React.FC<{
  t: number;
  at: number;
  out?: number;
  size?: number;
  color?: string;
  children: React.ReactNode;
  weight?: number;
}> = ({ t, at, out, size = 150, color = "#fff", children, weight = 700 }) => (
  <Reveal t={t} at={at} out={out} dur={0.8}>
    <div
      style={{
        fontFamily: QUICKSAND,
        fontWeight: weight,
        fontSize: size,
        lineHeight: 1,
        color,
        letterSpacing: `${tw(t, [at, at + 1.6], [0.16, 0.04]) * 1}em`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  </Reveal>
);

export const Kicker: React.FC<{
  t: number;
  at: number;
  out?: number;
  color?: string;
  size?: number;
  children: React.ReactNode;
}> = ({ t, at, out, color = C.brand, size = 34, children }) => (
  <Reveal t={t} at={at} out={out} dur={0.6}>
    <div
      style={{
        fontFamily: QUICKSAND,
        fontWeight: 700,
        fontSize: size,
        letterSpacing: "0.22em",
        color,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  </Reveal>
);

/** The film's motif: a fine luminous line. `d` is an SVG path in 1920x1080 space. */
export const GlowLine: React.FC<{
  d: string;
  progress: number;
  width?: number;
  color?: string;
  glow?: string;
  tail?: number;
  opacity?: number;
  head?: boolean;
  viewBox?: string;
}> = ({
  d,
  progress,
  width = 4,
  color = "#FFF6D6",
  glow = C.gold,
  tail = 1,
  opacity = 1,
  head = true,
  viewBox = "0 0 1920 1080",
}) => {
  const p = Math.max(0, Math.min(1, progress));
  const start = Math.max(0, p - tail);
  // pathLength=1 lets dash maths work in 0..1 regardless of geometry
  const dash = { strokeDasharray: `${p - start} 2`, strokeDashoffset: -start };
  const id = React.useId().replace(/:/g, "");
  return (
    <svg
      viewBox={viewBox}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", opacity }}
    >
      <defs>
        <filter id={`g${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={width * 3} />
        </filter>
      </defs>
      {p > 0 && (
        <>
          <path d={d} pathLength={1} fill="none" stroke={glow} strokeWidth={width * 5} strokeLinecap="round"
            style={{ ...dash, filter: `url(#g${id})`, opacity: 0.75 }} />
          <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" style={dash} />
          {head && p < 1 && <LineHead d={d} p={p} width={width} glow={glow} />}
        </>
      )}
    </svg>
  );
};

/** A bright point riding the front of the line. */
const LineHead: React.FC<{ d: string; p: number; width: number; glow: string }> = ({ d, p, width, glow }) => {
  const pt = getPointAtLength(d, getLength(d) * p);
  if (!pt) return null;
  return (
    <>
      <circle cx={pt.x} cy={pt.y} r={width * 6} fill={glow} opacity={0.35} />
      <circle cx={pt.x} cy={pt.y} r={width * 1.6} fill="#fff" />
    </>
  );
};

/** Pointer used for every on-screen interaction. Shrinks briefly on click. */
export const Cursor: React.FC<{
  t: number;
  path: { at: number; x: number; y: number }[];
  clicks?: number[];
  show?: [number, number];
  scale?: number;
}> = ({ t, path, clicks = [], show = [-1, 999], scale = 1 }) => {
  const times = path.map((p) => p.at);
  const x = interpolate(t, times, path.map((p) => p.x), {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease.inOut,
  });
  const y = interpolate(t, times, path.map((p) => p.y), {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease.inOut,
  });
  let press = 0;
  let ring = 0;
  for (const c of clicks) {
    press = Math.max(press, tw(t, [c - 0.06, c], [0, 1]) * tw(t, [c, c + 0.14], [1, 0]));
    ring = Math.max(ring, t >= c && t < c + 0.5 ? (t - c) / 0.5 : 0);
  }
  const o = life(t, show[0], show[1], 0.2);
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: o, pointerEvents: "none", zIndex: 50 }}>
      {ring > 0 && (
        <div style={{
          position: "absolute", left: -30 * scale, top: -30 * scale, width: 60 * scale, height: 60 * scale,
          borderRadius: "50%", border: `${3 * scale}px solid ${C.brand}`,
          scale: 0.4 + ring * 1.2, opacity: 1 - ring,
        }} />
      )}
      <svg width={34 * scale} height={34 * scale} viewBox="0 0 24 24" style={{ scale: 1 - press * 0.18, transformOrigin: "0 0",
        filter: "drop-shadow(0 4px 8px rgba(0,0,0,.35))" }}>
        <path d="M3 2l7.5 19 2.6-7.4L20.5 11z" fill="#fff" stroke={C.ink} strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

/** Animated film grain + vignette, laid over the whole frame. */
export const Grain: React.FC<{ opacity?: number; vignette?: number }> = ({ opacity = 0.06, vignette: base = 0.55 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // the light end card keeps only a whisper of vignette
  const vignette = interpolate(frame / fps, [EV.impact, EV.impact + 0.6], [base, 0.1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ox = Math.floor(random(`gx${frame}`) * 512);
  const oy = Math.floor(random(`gy${frame}`) * 512);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill
        style={{
          backgroundImage: `url(${staticFile("img/grain.png")})`,
          backgroundPosition: `${ox}px ${oy}px`,
          opacity,
          mixBlendMode: "overlay",
        }}
      />
      <AbsoluteFill
        style={{ background: `radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,${vignette}) 100%)` }}
      />
    </AbsoluteFill>
  );
};

/** A cast member: a transparent cut-out from the project's img/ folder with cinematic light. */
export const Person: React.FC<{
  src: string;
  style?: React.CSSProperties;
  light?: string;
  brightness?: number;
}> = ({ src, style, light = C.brand, brightness = 1 }) => (
  <div style={{ position: "absolute", ...style }}>
    <Img
      src={staticFile(`img/${src}`)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        objectPosition: "bottom",
        filter: `brightness(${brightness}) drop-shadow(0 0 40px ${light}55) drop-shadow(-12px 0 30px ${light}33)`,
      }}
    />
  </div>
);

/** A "screen" that floats in 3D space with a soft shadow and reflection highlight. */
export const Screen: React.FC<{
  style?: React.CSSProperties;
  children: React.ReactNode;
  radius?: number;
  shine?: number;
}> = ({ style, children, radius = 22, shine = 0 }) => (
  <div
    style={{
      position: "absolute",
      borderRadius: radius,
      overflow: "hidden",
      background: "#fff",
      boxShadow: "0 60px 120px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.08)",
      ...style,
    }}
  >
    {children}
    {shine !== 0 && (
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `linear-gradient(105deg, transparent ${30 + shine * 40}%, rgba(255,255,255,.22) ${38 + shine * 40}%, transparent ${46 + shine * 40}%)`,
      }} />
    )}
  </div>
);

/** Small honest label on every recreated interface. */
export const DemoTag: React.FC<{ opacity?: number; dark?: boolean }> = ({ opacity = 1, dark = true }) => (
  <div style={{
    position: "absolute", right: 40, bottom: 30, fontFamily: QUICKSAND, fontWeight: 600, fontSize: 17,
    letterSpacing: "0.12em", color: dark ? "rgba(255,255,255,.55)" : "rgba(38,51,49,.55)", opacity, zIndex: 80,
  }}>
    INTERFACE SHOWN WITH DEMO DATA
  </div>
);
