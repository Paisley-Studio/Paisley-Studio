import React from "react";
import { C } from "../lib";

/**
 * Flat vector creatures drawn for Lesson 2. One parametric character, so each "AI version" of Lumora is
 * visibly the same creature with specific, nameable differences (wings, mood, tail, habitat).
 * Creature uses a 400x400 viewBox; Habitat a 400x300 one.
 */

export type Look = {
  body: string;
  belly: string;
  wing?: string;
  wings: 0 | 2 | 4;
  wingType?: "feather" | "fin";
  wingScale?: number;
  eyes?: number; // eye size, 1 = normal
  mood: "friendly" | "scary" | "plain";
  tail: "none" | "short" | "long" | "fin";
  tailColor?: string;
  tailGlow?: number;
  crest?: boolean;
  feathers?: boolean;
  spots?: string;
  legs?: boolean;
  lantern?: number; // belly glow 0..1
  glow?: string; // soft aura colour
};

export const LUMORA: Look = {
  body: "#3E8EF0", belly: "#A9D4FF", wing: "#5FB2FF", wings: 4, wingType: "feather", eyes: 1.25, mood: "friendly",
  tail: "long", tailColor: C.gold, tailGlow: 1, crest: true, feathers: true, legs: true, glow: "#7FE3FF",
};
/** Version 1: two wings, scary, short plain tail. (It was put in a desert.) */
export const LUMORA_V1: Look = { ...LUMORA, wings: 2, mood: "scary", tail: "short", tailColor: "#2F6FC4", tailGlow: 0, glow: undefined };
/** Version 2: wings and mood fixed; the tail is still short and plain. */
export const LUMORA_V2: Look = { ...LUMORA, tail: "short", tailColor: "#2F6FC4", tailGlow: 0 };

/** Prompt ladder in scene 04: a lazy prompt, a better one, a specific one. */
export const GENERIC: Look = { body: "#8E918B", belly: "#A9ABA5", wings: 0, eyes: 0.7, mood: "plain", tail: "short", tailColor: "#7C7F79", legs: true };
export const GLOWY: Look = {
  body: "#2FB8A8", belly: "#7FE0D2", wing: "#5FD6C6", wings: 2, wingType: "fin", wingScale: 0.9, eyes: 0.9, mood: "plain",
  tail: "fin", tailColor: "#2FB8A8", glow: "#7FFFE8",
};
export const LANTERN: Look = {
  body: "#F28A2E", belly: "#FFC27A", wing: "#FFB35C", wings: 2, wingType: "feather", wingScale: 0.55, eyes: 1.15, mood: "friendly",
  tail: "fin", tailColor: "#E2701A", spots: C.violet, lantern: 1,
};

const INK = "#2B2A28";
const PAPER = "#FBF8F1";

const Wing: React.FC<{ type: "feather" | "fin"; color: string; side: 1 | -1; x: number; y: number; scale: number; rot: number; sketch: boolean }> = ({
  type, color, side, x, y, scale, rot, sketch,
}) => {
  const fill = sketch ? PAPER : color;
  const stroke = sketch ? INK : "rgba(0,0,0,.12)";
  return (
    <g transform={`translate(${x} ${y}) scale(${side * scale} ${scale}) rotate(${rot})`}>
      {type === "feather" ? (
        <>
          <path d="M0 0 C 30 -70, 110 -100, 150 -72 C 128 -60, 134 -44, 112 -36 C 118 -22, 96 -14, 82 -14 C 80 0, 50 8, 0 14 Z" fill={fill} stroke={stroke} strokeWidth={sketch ? 3 : 2} />
          <path d="M14 0 C 50 -30, 90 -50, 128 -62 M18 6 C 50 -10, 80 -24, 104 -32" fill="none" stroke={sketch ? INK : "rgba(255,255,255,.45)"} strokeWidth={sketch ? 2 : 3} strokeLinecap="round" />
        </>
      ) : (
        <path d="M0 0 C 40 -50, 110 -40, 120 0 C 100 -6, 96 14, 74 10 C 60 22, 30 20, 0 12 Z" fill={fill} opacity={sketch ? 1 : 0.85} stroke={stroke} strokeWidth={sketch ? 3 : 2} />
      )}
    </g>
  );
};

export const Creature: React.FC<{
  look: Look; size: number; t?: number; uid: string; sketch?: boolean; blink?: number; invisible?: number; style?: React.CSSProperties;
}> = ({ look, size, t = 0, uid, sketch = false, blink = 0, invisible = 0, style }) => {
  const f = (c: string) => (sketch ? PAPER : c);
  const s = sketch ? { stroke: INK, strokeWidth: 3.5 } : {};
  const flap = Math.sin(t * 7) * 9;
  const bob = Math.sin(t * 2.2) * 6;
  const e = look.eyes ?? 1;
  const ws = look.wingScale ?? 1;
  const scary = look.mood === "scary";
  const eyeRy = (scary ? 19 : 29) * e * (1 - blink * 0.92);
  const tc = look.tailColor ?? look.body;
  return (
    <svg viewBox="0 0 400 400" width={size} height={size} style={{ overflow: "visible", ...style }}>
      <defs>
        <radialGradient id={`aura-${uid}`}><stop offset="0" stopColor={look.glow ?? "#fff"} stopOpacity={0.55} /><stop offset="1" stopColor={look.glow ?? "#fff"} stopOpacity={0} /></radialGradient>
        <radialGradient id={`lamp-${uid}`}><stop offset="0" stopColor="#FFF6C2" /><stop offset="0.5" stopColor="#FFD54A" /><stop offset="1" stopColor="#FFB020" stopOpacity={0} /></radialGradient>
        <filter id={`rough-${uid}`}><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={3} /><feDisplacementMap in="SourceGraphic" scale={4} /></filter>
        <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={6} result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <g transform={`translate(0 ${sketch ? 0 : bob})`} filter={sketch ? `url(#rough-${uid})` : undefined} opacity={1 - invisible * 0.88}>
        {look.glow && !sketch && <circle cx={200} cy={210} r={190} fill={`url(#aura-${uid})`} />}
        {/* tail */}
        {look.tail === "long" && (
          <g filter={!sketch && look.tailGlow ? `url(#glow-${uid})` : undefined}>
            <path d="M236 282 C 300 340, 372 312, 362 246 C 354 196, 300 200, 308 240" fill="none" stroke={sketch ? INK : tc} strokeWidth={sketch ? 4 : 15} strokeLinecap="round" />
            <path d="M308 240 C 296 222, 318 206, 330 222 C 340 236, 322 252, 308 240 Z" fill={f(tc)} {...s} />
            {!sketch && look.tailGlow ? <circle cx={318} cy={230} r={10 + Math.sin(t * 5) * 2} fill="#FFF3B0" opacity={0.9 * (look.tailGlow ?? 0)} /> : null}
          </g>
        )}
        {look.tail === "short" && <path d="M236 282 C 262 300, 284 296, 290 278" fill="none" stroke={sketch ? INK : tc} strokeWidth={sketch ? 4 : 15} strokeLinecap="round" />}
        {look.tail === "fin" && <path d="M268 250 L 340 206 C 330 240, 330 262, 342 300 Z" fill={f(tc)} {...s} />}
        {/* wings behind the body */}
        {look.wings >= 2 && (
          <>
            <Wing type={look.wingType ?? "feather"} color={look.wing ?? look.body} side={-1} x={142} y={188} scale={ws} rot={-flap} sketch={sketch} />
            <Wing type={look.wingType ?? "feather"} color={look.wing ?? look.body} side={1} x={258} y={188} scale={ws} rot={-flap} sketch={sketch} />
          </>
        )}
        {look.wings === 4 && (
          <>
            <Wing type={look.wingType ?? "feather"} color={look.wing ?? look.body} side={-1} x={148} y={236} scale={ws * 0.72} rot={34 + flap} sketch={sketch} />
            <Wing type={look.wingType ?? "feather"} color={look.wing ?? look.body} side={1} x={252} y={236} scale={ws * 0.72} rot={34 + flap} sketch={sketch} />
          </>
        )}
        {/* legs */}
        {look.legs && (
          <g stroke={sketch ? INK : "#E9A93A"} strokeWidth={sketch ? 4 : 9} strokeLinecap="round" fill="none">
            <path d="M176 292 L 170 322 M 160 326 L 182 326" /><path d="M224 292 L 230 322 M 218 326 L 240 326" />
          </g>
        )}
        {/* crest */}
        {look.crest && (
          <g fill={f(look.wing ?? look.body)} {...s}>
            <path d="M200 128 C 188 96, 196 82, 206 74 C 204 96, 212 110, 212 128 Z" />
            <path d="M188 132 C 168 110, 168 96, 174 86 C 180 106, 194 116, 198 130 Z" />
            <path d="M214 132 C 232 112, 238 100, 236 90 C 226 106, 214 116, 206 130 Z" />
          </g>
        )}
        {/* body */}
        <ellipse cx={200} cy={212} rx={90} ry={92} fill={f(look.body)} {...s} />
        <ellipse cx={200} cy={250} rx={56} ry={48} fill={f(look.belly)} {...(sketch ? { stroke: INK, strokeWidth: 2.5, strokeDasharray: "6 6" } : {})} />
        {look.feathers && (
          <g fill="none" stroke={sketch ? INK : "rgba(255,255,255,.35)"} strokeWidth={sketch ? 2 : 3} strokeLinecap="round">
            {[[176, 240], [200, 248], [224, 240], [188, 266], [212, 266]].map(([x, y], i) => <path key={i} d={`M${x - 10} ${y} Q ${x} ${y + 12} ${x + 10} ${y}`} />)}
          </g>
        )}
        {look.spots && !sketch && [[150, 170, 10], [252, 160, 8], [262, 214, 11], [140, 222, 7], [232, 128, 6], [170, 136, 6]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={look.spots} />)}
        {look.lantern ? <circle cx={200} cy={254} r={44 + Math.sin(t * 3) * 4} fill={`url(#lamp-${uid})`} opacity={look.lantern} /> : null}
        {/* eyes */}
        {[168, 232].map((x, i) => (
          <g key={x}>
            <ellipse cx={x} cy={192} rx={26 * e} ry={Math.max(2, eyeRy)} fill={sketch ? PAPER : "#fff"} {...s} />
            {blink < 0.6 && (scary ? (
              <ellipse cx={x + (i ? -4 : 4)} cy={194} rx={5 * e} ry={12 * e} fill={sketch ? INK : "#D7263D"} />
            ) : (
              <>
                <circle cx={x + 3} cy={196} r={(look.mood === "plain" ? 9 : 16) * e} fill={sketch ? "none" : "#14202B"} {...(sketch ? { stroke: INK, strokeWidth: 3 } : {})} />
                {!sketch && <circle cx={x + 9} cy={188} r={5.5 * e} fill="#fff" />}
              </>
            ))}
          </g>
        ))}
        {scary && (
          <g stroke={sketch ? INK : "#14202B"} strokeWidth={9} strokeLinecap="round">
            <path d="M138 160 L 190 178" /><path d="M262 160 L 210 178" />
          </g>
        )}
        {/* mouth */}
        {scary ? (
          <g>
            <path d="M172 238 Q 200 262 228 238 Z" fill="#3B0F18" />
            <path d="M178 240 L 184 252 L 190 243 M 210 243 L 216 252 L 222 240" fill="#fff" />
          </g>
        ) : (
          <>
            <path d="M190 226 L 210 226 L 200 240 Z" fill={f("#F5B841")} {...(sketch ? { stroke: INK, strokeWidth: 3 } : {})} />
            {look.mood === "friendly" && <path d="M182 246 Q 200 260 218 246" fill="none" stroke={sketch ? INK : "#14202B"} strokeWidth={5} strokeLinecap="round" />}
            {look.mood === "friendly" && !sketch && <><circle cx={140} cy={230} r={12} fill="#FF7FA8" opacity={0.4} /><circle cx={260} cy={230} r={12} fill="#FF7FA8" opacity={0.4} /></>}
          </>
        )}
      </g>
    </svg>
  );
};

export type HabitatKind = "plain" | "desert" | "ocean" | "cave" | "glow";

/** The background a creature is generated into. */
export const Habitat: React.FC<{ kind: HabitatKind; w: number; h: number; t?: number; uid: string }> = ({ kind, w, h, t = 0, uid }) => (
  <svg viewBox="0 0 400 300" width={w} height={h} preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }}>
    <defs>
      <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
        {kind === "plain" && <><stop offset="0" stopColor="#C9CCC6" /><stop offset="1" stopColor="#9EA19B" /></>}
        {kind === "desert" && <><stop offset="0" stopColor="#F6B66B" /><stop offset="0.6" stopColor="#F9D79A" /><stop offset="1" stopColor="#F3C27C" /></>}
        {kind === "ocean" && <><stop offset="0" stopColor="#1C6E9C" /><stop offset="1" stopColor="#0B2E4A" /></>}
        {kind === "cave" && <><stop offset="0" stopColor="#1A1440" /><stop offset="1" stopColor="#070A1E" /></>}
        {kind === "glow" && <><stop offset="0" stopColor="#0C2340" /><stop offset="0.6" stopColor="#0F3B3A" /><stop offset="1" stopColor="#062019" /></>}
      </linearGradient>
    </defs>
    <rect width={400} height={300} fill={`url(#sky-${uid})`} />
    {kind === "plain" && <ellipse cx={200} cy={268} rx={120} ry={14} fill="rgba(0,0,0,.12)" />}
    {kind === "desert" && (
      <>
        <circle cx={318} cy={70} r={34} fill="#FFF0C2" />
        <path d="M0 210 Q 100 170 210 205 T 400 196 L 400 300 L 0 300 Z" fill="#E7A65A" />
        <path d="M0 248 Q 140 214 260 246 T 400 240 L 400 300 L 0 300 Z" fill="#D58E45" />
        <g fill="#5E8F4E"><rect x={52} y={170} width={12} height={58} rx={6} /><path d="M52 196 Q 38 196 38 180" stroke="#5E8F4E" strokeWidth={9} fill="none" strokeLinecap="round" />
          <path d="M64 188 Q 78 188 78 172" stroke="#5E8F4E" strokeWidth={9} fill="none" strokeLinecap="round" /></g>
        <g fill="#5E8F4E"><rect x={344} y={184} width={9} height={42} rx={5} /></g>
      </>
    )}
    {kind === "ocean" && (
      <>
        {[60, 150, 250, 330].map((x, i) => <path key={i} d={`M${x} 0 L ${x + 40} 0 L ${x - 20 + i * 8} 300 L ${x - 50 + i * 8} 300 Z`} fill="#fff" opacity={0.05} />)}
        {Array.from({ length: 10 }).map((_, i) => <circle key={i} cx={(i * 47 + 20) % 400} cy={300 - ((t * 30 + i * 41) % 320)} r={2 + (i % 3)} fill="none" stroke="rgba(255,255,255,.4)" strokeWidth={1.5} />)}
        <path d="M0 270 Q 100 252 200 268 T 400 262 L 400 300 L 0 300 Z" fill="#0A2236" />
      </>
    )}
    {kind === "cave" && (
      <>
        <path d="M0 0 L 400 0 L 400 40 Q 330 70 300 30 Q 260 80 210 40 Q 160 90 120 36 Q 70 76 0 44 Z" fill="#0A0820" />
        <path d="M0 300 L 0 236 Q 60 210 110 244 Q 170 222 230 250 Q 300 214 400 240 L 400 300 Z" fill="#0A0820" />
        {[[60, 236, C.violet], [98, 244, C.sky], [312, 228, C.violet], [350, 236, "#7FFFE8"]].map(([x, y, c], i) => (
          <path key={i} d={`M${x} ${y} L ${(x as number) + 7} ${(y as number) - 26} L ${(x as number) + 14} ${y} Z`} fill={c as string} opacity={0.6 + 0.3 * Math.sin(t * 2 + i)} />
        ))}
        {Array.from({ length: 14 }).map((_, i) => <circle key={i} cx={(i * 61 + 13) % 400} cy={(i * 37 + 60) % 200 + 40} r={1.5} fill="#B9A8FF" opacity={0.5} />)}
      </>
    )}
    {kind === "glow" && (
      <>
        {[[40, 300, 180, "#0B4A3E"], [360, 300, 200, "#0B4A3E"], [10, 300, 120, "#0E5C4C"], [390, 300, 130, "#0E5C4C"]].map(([x, y, r, c], i) => (
          <ellipse key={i} cx={x as number} cy={y as number} rx={(r as number) * 0.55} ry={r as number} fill={c as string} />
        ))}
        {[[30, 150, -30], [372, 140, 30], [70, 230, -10], [330, 236, 12]].map(([x, y, r], i) => (
          <path key={i} d="M0 0 C 30 -40, 80 -40, 110 0 C 80 20, 30 20, 0 0 Z" fill="#127A5F" transform={`translate(${x} ${y}) rotate(${r}) scale(${i % 2 ? -1 : 1} 1)`} />
        ))}
        {[[90, 262], [118, 270], [290, 266], [318, 258]].map(([x, y], i) => (
          <g key={i}><rect x={x - 2} y={y - 14} width={4} height={16} fill="#BFF7E8" /><ellipse cx={x} cy={y - 16} rx={11} ry={7} fill="#7FFFE8" opacity={0.85} /></g>
        ))}
        {Array.from({ length: 18 }).map((_, i) => (
          <circle key={i} cx={(i * 53 + 17 + Math.sin(t * 0.8 + i) * 10) % 400} cy={(i * 29 + 40) % 220 + 20 + Math.cos(t + i) * 6} r={2.2} fill="#FFF3A0"
            opacity={0.4 + 0.6 * Math.abs(Math.sin(t * 1.6 + i * 1.3))} />
        ))}
        <path d="M0 280 Q 200 262 400 280 L 400 300 L 0 300 Z" fill="#06261E" />
      </>
    )}
  </svg>
);

/** A finished "AI image": habitat plus creature. */
export const Picture: React.FC<{ look: Look; habitat: HabitatKind; w: number; h: number; t?: number; uid: string; scale?: number; invisible?: number }> = ({
  look, habitat, w, h, t = 0, uid, scale = 0.86, invisible = 0,
}) => (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
    <Habitat kind={habitat} w={w} h={h} t={t} uid={uid} />
    <div style={{ position: "absolute", left: "50%", top: "53%", translate: "-50% -50%" }}>
      <Creature look={look} size={h * scale} t={t} uid={uid} invisible={invisible} />
    </div>
  </div>
);
