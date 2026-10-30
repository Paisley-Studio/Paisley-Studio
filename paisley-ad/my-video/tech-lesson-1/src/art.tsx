import React from "react";
import { C } from "./lib";

/** Flat vector illustrations drawn for this lesson. All use a 200x200 viewBox. */

export type DogLook = { fur: string; ear: string; snout: string; ears: "flop" | "fold" | "point"; spots?: boolean; patch?: boolean; tongue?: boolean };

export const DOGS: DogLook[] = [
  { fur: "#C98B52", ear: "#8A5A30", snout: "#F1D3B0", ears: "flop", tongue: true },
  { fur: "#E8C27A", ear: "#C99A48", snout: "#FBEBD0", ears: "fold" },
  { fur: "#3A3633", ear: "#22201E", snout: "#F4EFE8", ears: "point", patch: true },
];
// The one it has never seen: spotted, different colours, different ears.
export const NEW_DOG: DogLook = { fur: "#FAFAF7", ear: "#2B2B2B", snout: "#FFFFFF", ears: "flop", spots: true, tongue: true };

export const Dog: React.FC<{ look: DogLook; size: number; blink?: number; style?: React.CSSProperties }> = ({ look, size, blink = 0, style }) => {
  const eye = 9 * (1 - blink * 0.9);
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} style={style}>
      {look.ears === "flop" && (
        <>
          <path d="M44 62 C 18 70, 14 128, 36 138 C 52 144, 58 104, 64 78 Z" fill={look.ear} />
          <path d="M156 62 C 182 70, 186 128, 164 138 C 148 144, 142 104, 136 78 Z" fill={look.ear} />
        </>
      )}
      {look.ears === "point" && (
        <>
          <path d="M48 78 L 54 18 L 92 56 Z" fill={look.ear} />
          <path d="M152 78 L 146 18 L 108 56 Z" fill={look.ear} />
        </>
      )}
      <ellipse cx={100} cy={102} rx={62} ry={58} fill={look.fur} />
      {look.ears === "fold" && (
        <>
          <path d="M46 70 C 40 40, 70 30, 84 50 C 76 60, 62 70, 52 86 Z" fill={look.ear} />
          <path d="M154 70 C 160 40, 130 30, 116 50 C 124 60, 138 70, 148 86 Z" fill={look.ear} />
        </>
      )}
      {look.patch && <ellipse cx={74} cy={92} rx={20} ry={22} fill="#F4EFE8" />}
      {look.spots && (
        <>
          <circle cx={62} cy={78} r={8} fill="#2B2B2B" />
          <circle cx={138} cy={70} r={6} fill="#2B2B2B" />
          <circle cx={148} cy={110} r={7} fill="#2B2B2B" />
          <circle cx={56} cy={118} r={5} fill="#2B2B2B" />
          <circle cx={116} cy={58} r={4} fill="#2B2B2B" />
        </>
      )}
      <ellipse cx={100} cy={128} rx={34} ry={26} fill={look.snout} />
      <ellipse cx={76} cy={94} rx={8} ry={eye} fill="#1B1B1B" />
      <ellipse cx={124} cy={94} rx={8} ry={eye} fill="#1B1B1B" />
      <circle cx={79} cy={91} r={2.5} fill="#fff" opacity={blink > 0.5 ? 0 : 1} />
      <circle cx={127} cy={91} r={2.5} fill="#fff" opacity={blink > 0.5 ? 0 : 1} />
      <path d="M88 116 Q 100 110 112 116 Q 108 128 100 128 Q 92 128 88 116 Z" fill="#1B1B1B" />
      <path d="M100 128 L 100 138 M 100 138 Q 90 146 82 140 M 100 138 Q 110 146 118 140" stroke="#1B1B1B" strokeWidth={3.5} fill="none" strokeLinecap="round" />
      {look.tongue && <path d="M92 142 Q 100 162 108 142 Z" fill="#F07C8A" />}
    </svg>
  );
};

export type CatLook = { fur: string; inner: string; stripes?: boolean };
export const CATS: CatLook[] = [
  { fur: "#9AA3AD", inner: "#F2B8C2", stripes: true },
  { fur: "#F0A55A", inner: "#F8C9C0" },
];

export const Cat: React.FC<{ look: CatLook; size: number; style?: React.CSSProperties }> = ({ look, size, style }) => (
  <svg viewBox="0 0 200 200" width={size} height={size} style={style}>
    <path d="M42 96 L 50 26 L 96 62 Z" fill={look.fur} />
    <path d="M158 96 L 150 26 L 104 62 Z" fill={look.fur} />
    <path d="M54 76 L 57 44 L 82 64 Z" fill={look.inner} />
    <path d="M146 76 L 143 44 L 118 64 Z" fill={look.inner} />
    <ellipse cx={100} cy={110} rx={64} ry={54} fill={look.fur} />
    {look.stripes && (
      <g stroke="#6E7781" strokeWidth={6} strokeLinecap="round">
        <path d="M100 60 L 100 80" /><path d="M84 62 L 88 80" /><path d="M116 62 L 112 80" />
      </g>
    )}
    <path d="M66 104 Q 78 92 90 104 Q 78 112 66 104 Z" fill="#7BC67E" />
    <path d="M110 104 Q 122 92 134 104 Q 122 112 110 104 Z" fill="#7BC67E" />
    <ellipse cx={78} cy={104} rx={2.6} ry={6} fill="#111" />
    <ellipse cx={122} cy={104} rx={2.6} ry={6} fill="#111" />
    <path d="M94 124 L 106 124 L 100 131 Z" fill="#E97E93" />
    <path d="M100 131 Q 92 140 86 135 M 100 131 Q 108 140 114 135" stroke="#3A3A3A" strokeWidth={3} fill="none" strokeLinecap="round" />
    <g stroke="#3A3A3A" strokeWidth={2} opacity={0.6} strokeLinecap="round">
      <path d="M72 126 L 36 120" /><path d="M72 132 L 38 136" /><path d="M128 126 L 164 120" /><path d="M128 132 L 162 136" />
    </g>
  </svg>
);

/** A friendly student, flat and simple. `arm` 0..1 raises the right arm (holding up a card). */
export const Kid: React.FC<{ size: number; arm?: number; look?: number; style?: React.CSSProperties }> = ({ size, arm = 0, look = 0, style }) => {
  const ang = -20 - arm * 110;
  return (
    <svg viewBox="0 0 300 420" width={size} height={size * 1.4} style={{ overflow: "visible", ...style }}>
      {/* body */}
      <path d="M70 420 L 78 300 Q 82 250 150 246 Q 218 250 222 300 L 230 420 Z" fill={C.brand} />
      <path d="M128 250 L 150 286 L 172 250 Z" fill="#fff" opacity={0.9} />
      {/* left arm, resting */}
      <path d="M86 290 Q 60 340 76 390" stroke={C.brand} strokeWidth={30} strokeLinecap="round" fill="none" />
      <circle cx={76} cy={392} r={17} fill="#8D5B3D" />
      {/* right arm: rotates up from the shoulder */}
      <g transform={`rotate(${ang} 210 282)`}>
        <path d="M210 282 L 210 380" stroke={C.brand} strokeWidth={30} strokeLinecap="round" />
        <circle cx={210} cy={386} r={17} fill="#8D5B3D" />
      </g>
      {/* neck and head */}
      <rect x={136} y={210} width={28} height={44} rx={12} fill="#7A4D32" />
      <ellipse cx={150} cy={150} rx={74} ry={80} fill="#8D5B3D" />
      {/* hair */}
      <path d="M76 140 C 70 60, 130 44, 158 52 C 200 50, 236 86, 226 146 C 214 116, 196 100, 170 96 C 140 108, 104 106, 76 140 Z" fill="#1F1714" />
      <circle cx={92} cy={92} r={26} fill="#1F1714" /><circle cx={208} cy={96} r={24} fill="#1F1714" />
      {/* face */}
      <ellipse cx={122 + look * 6} cy={156} rx={7} ry={9} fill="#1A1210" />
      <ellipse cx={178 + look * 6} cy={156} rx={7} ry={9} fill="#1A1210" />
      <path d={`M ${130 + look * 4} 188 Q ${150 + look * 4} 204 ${170 + look * 4} 188`} stroke="#1A1210" strokeWidth={6} fill="none" strokeLinecap="round" />
      <circle cx={104} cy={178} r={9} fill="#E58A7A" opacity={0.35} /><circle cx={196} cy={178} r={9} fill="#E58A7A" opacity={0.35} />
    </svg>
  );
};

/** A spider with eight legs; `lit` lights legs 0..8 one by one (for counting). */
export const Spider: React.FC<{ size: number; lit?: number; style?: React.CSSProperties }> = ({ size, lit = 0, style }) => {
  const legs = [-62, -38, -14, 10];
  return (
    <svg viewBox="-150 -120 300 240" width={size} height={size * 0.8} style={{ overflow: "visible", ...style }}>
      {[-1, 1].flatMap((side, si) =>
        legs.map((a, i) => {
          const idx = si * 4 + i;
          const on = lit > idx;
          const r = (a * Math.PI) / 180;
          const kx = side * (60 + 30 * Math.cos(r)), ky = -10 + 70 * Math.sin(r) - 36;
          const fx = side * (110 + 22 * Math.cos(r)), fy = 30 + 80 * Math.sin(r);
          return (
            <path key={idx} d={`M ${side * 22} ${a / 4} Q ${kx} ${ky} ${fx} ${fy}`} fill="none"
              stroke={on ? C.gold : "#E6ECEA"} strokeWidth={on ? 9 : 7} strokeLinecap="round"
              style={{ filter: on ? `drop-shadow(0 0 10px ${C.gold})` : undefined }} />
          );
        }),
      )}
      <ellipse cx={0} cy={36} rx={40} ry={48} fill="#2A3533" stroke="#E6ECEA" strokeWidth={4} />
      <circle cx={0} cy={-18} r={28} fill="#2A3533" stroke="#E6ECEA" strokeWidth={4} />
      <circle cx={-10} cy={-22} r={6} fill="#fff" /><circle cx={10} cy={-22} r={6} fill="#fff" />
      <circle cx={-9} cy={-21} r={3} fill="#111" /><circle cx={11} cy={-21} r={3} fill="#111" />
    </svg>
  );
};

/** A generated landscape picture, used wherever AI "makes an image". */
export const Landscape: React.FC<{ w: number; h: number; sun?: number }> = ({ w, h, sun = 1 }) => (
  <svg viewBox="0 0 400 300" width={w} height={h} preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3B2C6B" /><stop offset="0.55" stopColor="#E9716A" /><stop offset="1" stopColor="#F9C46B" />
      </linearGradient>
    </defs>
    <rect width={400} height={300} fill="url(#sky)" />
    <circle cx={260} cy={170 + (1 - sun) * 60} r={44} fill="#FFE7A0" opacity={0.95} />
    <path d="M0 200 L 70 130 L 130 180 L 200 110 L 290 190 L 340 150 L 400 190 L 400 300 L 0 300 Z" fill="#5B3F77" />
    <path d="M0 230 L 90 180 L 170 220 L 260 170 L 340 215 L 400 200 L 400 300 L 0 300 Z" fill="#33294F" />
    <path d="M0 262 Q 200 236 400 262 L 400 300 L 0 300 Z" fill="#1E1A33" />
    {[40, 72, 330, 360].map((x, i) => (
      <path key={i} d={`M ${x} 262 L ${x + 10} 222 L ${x + 20} 262 Z`} fill="#141127" />
    ))}
  </svg>
);
