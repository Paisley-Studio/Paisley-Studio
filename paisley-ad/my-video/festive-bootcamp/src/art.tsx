import React from "react";
import { AbsoluteFill, staticFile, Img } from "remotion";
import { Bulb, C, Glow, LightString, QUICKSAND, twinkle } from "./lib";

/** Original flat illustrations: the cast and the festive home. Nothing here is a stock asset. */

export type Hair = "afro" | "puffs" | "braids" | "fade" | "bun" | "grey" | "gele";
export type Look = { skin: string; shade: string; hair: Hair; hairC: string; top: string; topShade: string; glasses?: boolean; beard?: boolean; adult?: boolean };

const SK = { a: ["#8A5433", "#6F4227"], b: ["#6E3F25", "#57301C"], c: ["#A56B43", "#88552F"], d: ["#5A3320", "#472717"] };
export const CAST: Record<string, Look> = {
  amani: { skin: SK.a[0], shade: SK.a[1], hair: "fade", hairC: "#1A1311", top: C.brand, topShade: "#3F9D92" },
  zawadi: { skin: SK.b[0], shade: SK.b[1], hair: "braids", hairC: "#17100E", top: C.gold, topShade: "#D4A92A" },
  kito: { skin: SK.c[0], shade: SK.c[1], hair: "afro", hairC: "#1E1512", top: C.sage, topShade: "#C5DDD8", glasses: true },
  neema: { skin: SK.d[0], shade: SK.d[1], hair: "puffs", hairC: "#14100E", top: C.berry, topShade: "#BF3B2D" },
  baraka: { skin: SK.b[0], shade: SK.b[1], hair: "fade", hairC: "#15100E", top: C.warn, topShade: "#C4842A" },
  wanjiru: { skin: SK.a[0], shade: SK.a[1], hair: "bun", hairC: "#17110E", top: C.brandSoft, topShade: "#5FB1A8", glasses: true },
  mum: { skin: SK.c[0], shade: SK.c[1], hair: "gele", hairC: C.gold, top: C.brandDeep, topShade: "#1A4844", adult: true },
  dad: { skin: SK.b[0], shade: SK.b[1], hair: "fade", hairC: "#15100E", top: "#E9EFEC", topShade: "#C9D5D1", beard: true, adult: true },
  gran: { skin: SK.d[0], shade: SK.d[1], hair: "grey", hairC: "#D9DEDB", top: C.warn, topShade: "#C4842A", glasses: true, adult: true },
};

export type Expr = "smile" | "laugh" | "wow" | "focus" | "bored" | "proud";

export const Kid: React.FC<{ look: Look; expr?: Expr; size: number; lookX?: number; glow?: string; glowO?: number; blink?: number; style?: React.CSSProperties }> = ({
  look, expr = "smile", size, lookX = 0, glow, glowO = 0.55, blink = 0, style,
}) => {
  const id = React.useId().replace(/:/g, "");
  const eyeRy = expr === "bored" ? 7 : expr === "wow" ? 15 : expr === "proud" ? 3.5 : 12.5;
  const ry = eyeRy * (1 - blink * 0.9);
  const browY = expr === "wow" ? 126 : expr === "bored" ? 146 : 134;
  const cx = 200;
  const headRx = look.adult ? 84 : 92;
  const headRy = look.adult ? 100 : 98;
  return (
    <svg viewBox="0 0 400 480" width={size} height={size * 1.2} style={{ overflow: "visible", ...style }}>
      <defs>
        {glow && (
          <radialGradient id={`g${id}`} cx="50%" cy="85%" r="75%">
            <stop offset="0%" stopColor={glow} stopOpacity={glowO} />
            <stop offset="100%" stopColor={glow} stopOpacity={0} />
          </radialGradient>
        )}
        <clipPath id={`c${id}`}>
          <ellipse cx={cx} cy={158} rx={headRx} ry={headRy} />
        </clipPath>
      </defs>
      {/* hair behind the head */}
      {look.hair === "afro" && (
        <>
          <circle cx={cx} cy={128} r={128} fill={look.hairC} />
          {Array.from({ length: 16 }, (_, i) => <circle key={i} cx={cx + Math.cos(i * 0.393) * 122} cy={128 + Math.sin(i * 0.393) * 122} r={24} fill={look.hairC} />)}
        </>
      )}
      {look.hair === "puffs" && (
        <>
          <circle cx={92} cy={68} r={62} fill={look.hairC} />
          <circle cx={308} cy={68} r={62} fill={look.hairC} />
        </>
      )}
      {look.hair === "braids" && (
        <>
          {[-112, -92, -72, 72, 92, 112].map((dx, i) => (
            <g key={i}>
              <rect x={cx + dx - 11} y={108} width={22} height={236 - Math.abs(dx) * 0.2} rx={11} fill={look.hairC} />
              <circle cx={cx + dx} cy={344 - Math.abs(dx) * 0.2} r={8} fill={C.gold} />
            </g>
          ))}
        </>
      )}
      {look.hair === "bun" && <circle cx={cx} cy={38} r={46} fill={look.hairC} />}
      {look.hair === "gele" && (
        <>
          <path d="M92 118 C 70 40, 150 -14, 226 6 C 300 -8, 340 58, 306 124 Z" fill={C.gold} />
          <path d="M112 84 C 170 34, 250 34, 300 76 M104 106 C 170 60, 250 60, 306 100" stroke={C.warn} strokeWidth={10} fill="none" strokeLinecap="round" />
          <path d="M214 8 C 250 -22, 296 -6, 286 34" stroke={C.brand} strokeWidth={14} fill="none" strokeLinecap="round" />
        </>
      )}
      {/* neck and body */}
      <rect x={cx - 34} y={232} width={68} height={70} rx={24} fill={look.shade} />
      <path d={`M ${cx - 158} 480 C ${cx - 164} 356, ${cx - 118} 296, ${cx - 52} 286 L ${cx + 52} 286 C ${cx + 118} 296, ${cx + 164} 356, ${cx + 158} 480 Z`} fill={look.top} />
      <path d={`M ${cx - 66} 286 C ${cx - 52} 330, ${cx + 52} 330, ${cx + 66} 286 C ${cx + 40} 272, ${cx - 40} 272, ${cx - 66} 286 Z`} fill={look.topShade} />
      <path d={`M ${cx - 16} 326 L ${cx - 20} 388 M ${cx + 16} 326 L ${cx + 20} 388`} stroke={look.topShade} strokeWidth={6} strokeLinecap="round" />
      {/* ears and head */}
      <ellipse cx={cx - headRx} cy={176} rx={15} ry={20} fill={look.shade} />
      <ellipse cx={cx + headRx} cy={176} rx={15} ry={20} fill={look.shade} />
      <ellipse cx={cx} cy={158} rx={headRx} ry={headRy} fill={look.skin} />
      {/* hair on top */}
      {(look.hair === "fade" || look.hair === "grey") && (
        <path d={`M ${cx - headRx - 3} 150 C ${cx - headRx - 8} 68, ${cx - 40} 46, ${cx} 46 C ${cx + 40} 46, ${cx + headRx + 8} 68, ${cx + headRx + 3} 150 C ${cx + 70} 100, ${cx - 70} 100, ${cx - headRx - 3} 150 Z`} fill={look.hairC} />
      )}
      {(look.hair === "afro" || look.hair === "puffs" || look.hair === "braids" || look.hair === "bun") && (
        <path d={`M ${cx - headRx - 2} 156 C ${cx - headRx - 6} 62, ${cx - 44} 48, ${cx} 48 C ${cx + 44} 48, ${cx + headRx + 6} 62, ${cx + headRx + 2} 156 C ${cx + 52} 92, ${cx - 52} 92, ${cx - headRx - 2} 156 Z`} fill={look.hairC} />
      )}
      {look.hair === "gele" && <path d={`M ${cx - headRx - 2} 128 C ${cx - 40} 92, ${cx + 40} 92, ${cx + headRx + 2} 128 L ${cx + headRx} 86 C ${cx + 40} 54, ${cx - 40} 54, ${cx - headRx} 86 Z`} fill={C.gold} />}
      {look.beard && <path d={`M ${cx - 74} 196 C ${cx - 64} 276, ${cx + 64} 276, ${cx + 74} 196 C ${cx + 44} 226, ${cx - 44} 226, ${cx - 74} 196 Z`} fill={look.hairC} />}
      {/* face */}
      <g style={{ translate: `${lookX}px 0` }}>
        <ellipse cx={cx - 35} cy={172} rx={11.5} ry={ry} fill="#17100D" />
        <ellipse cx={cx + 35} cy={172} rx={11.5} ry={ry} fill="#17100D" />
        {blink < 0.5 && expr !== "proud" && (
          <>
            <circle cx={cx - 31} cy={167} r={3.6} fill="#fff" />
            <circle cx={cx + 39} cy={167} r={3.6} fill="#fff" />
          </>
        )}
      </g>
      <path d={`M ${cx - 52} ${browY} Q ${cx - 36} ${browY - 9} ${cx - 19} ${browY}`} stroke="#120C09" strokeWidth={6} fill="none" strokeLinecap="round" />
      <path d={`M ${cx + 19} ${browY} Q ${cx + 36} ${browY - 9} ${cx + 52} ${browY}`} stroke="#120C09" strokeWidth={6} fill="none" strokeLinecap="round" />
      <path d={`M ${cx - 7} 192 Q ${cx} 202 ${cx + 8} 192`} stroke={look.shade} strokeWidth={5} fill="none" strokeLinecap="round" />
      <ellipse cx={cx - 60} cy={200} rx={15} ry={9} fill="#E0795E" opacity={0.22} />
      <ellipse cx={cx + 60} cy={200} rx={15} ry={9} fill="#E0795E" opacity={0.22} />
      {expr === "smile" && <path d={`M ${cx - 28} 216 Q ${cx} 240 ${cx + 28} 216`} stroke="#3A1712" strokeWidth={6} fill="none" strokeLinecap="round" />}
      {expr === "proud" && <path d={`M ${cx - 36} 212 Q ${cx} 256 ${cx + 36} 212 Z`} fill="#fff" stroke="#3A1712" strokeWidth={5} strokeLinejoin="round" />}
      {expr === "laugh" && (
        <>
          <path d={`M ${cx - 38} 208 Q ${cx} 272 ${cx + 38} 208 Z`} fill="#3A1712" />
          <path d={`M ${cx - 30} 211 Q ${cx} 222 ${cx + 30} 211 L ${cx + 38} 208 L ${cx - 38} 208 Z`} fill="#fff" />
        </>
      )}
      {expr === "wow" && <ellipse cx={cx} cy={228} rx={15} ry={19} fill="#3A1712" />}
      {expr === "focus" && <path d={`M ${cx - 16} 224 Q ${cx + 2} 230 ${cx + 18} 221`} stroke="#3A1712" strokeWidth={6} fill="none" strokeLinecap="round" />}
      {expr === "bored" && <path d={`M ${cx - 18} 226 L ${cx + 18} 226`} stroke="#3A1712" strokeWidth={6} strokeLinecap="round" />}
      {look.glasses && (
        <g fill="none" stroke="#0E0B09" strokeWidth={6}>
          <circle cx={cx - 35} cy={172} r={26} />
          <circle cx={cx + 35} cy={172} r={26} />
          <path d={`M ${cx - 9} 170 Q ${cx} 164 ${cx + 9} 170`} />
        </g>
      )}
      {glow && <rect x={cx - headRx} y={60} width={headRx * 2} height={250} fill={`url(#g${id})`} clipPath={`url(#c${id})`} />}
    </svg>
  );
};

/** Laptop from behind (the viewer sees the lid and the child behind it). No third-party logos. */
export const LaptopBack: React.FC<{ w: number; style?: React.CSSProperties }> = ({ w, style }) => (
  <div style={{ position: "relative", width: w, height: w * 0.66, ...style }}>
    <div style={{ position: "absolute", inset: 0, borderRadius: w * 0.035, background: "#C9D5D1", boxShadow: "inset 0 0 0 3px rgba(255,255,255,.5), 0 30px 60px rgba(0,0,0,.4)" }} />
    <Img src={staticFile("img/logo@3x.png")} style={{ position: "absolute", left: "50%", top: "50%", translate: "-50% -50%", width: w * 0.24, opacity: 0.9 }} />
    <div style={{ position: "absolute", left: "-3%", right: "-3%", bottom: -w * 0.02, height: w * 0.025, background: "#9FB0AB", borderRadius: `0 0 ${w * 0.02}px ${w * 0.02}px` }} />
  </div>
);

/** A laptop facing the viewer, with whatever is on its screen. */
export const LaptopFront: React.FC<{ w: number; children?: React.ReactNode; style?: React.CSSProperties }> = ({ w, children, style }) => {
  const h = w * 0.62;
  return (
    <div style={{ position: "relative", width: w, height: h + w * 0.035, ...style }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: h, borderRadius: w * 0.022, background: "#111B19", padding: w * 0.012, boxShadow: "0 30px 70px rgba(0,0,0,.45)" }}>
        <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", borderRadius: w * 0.01, background: "#fff" }}>{children}</div>
      </div>
      <div style={{ position: "absolute", left: "-4%", right: "-4%", top: h, height: w * 0.035, background: "#C9D5D1", borderRadius: `0 0 ${w * 0.03}px ${w * 0.03}px` }} />
    </div>
  );
};

export const Present: React.FC<{ w: number; h: number; box: string; ribbon: string; lid?: number; style?: React.CSSProperties }> = ({ w, h, box, ribbon, lid = 0, style }) => (
  <div style={{ position: "absolute", width: w, height: h, ...style }}>
    <div style={{ position: "absolute", inset: 0, top: h * 0.16, background: box, borderRadius: 10 }} />
    <div style={{ position: "absolute", left: "44%", width: "12%", top: h * 0.16, bottom: 0, background: ribbon }} />
    <div style={{ position: "absolute", left: "-4%", right: "-4%", top: 0, height: h * 0.2, background: box, filter: "brightness(1.12)", borderRadius: 8,
      translate: `${lid * w * 0.34}px ${-lid * h * 0.75}px`, rotate: `${lid * 24}deg` }}>
      <div style={{ position: "absolute", left: "44%", width: "12%", top: 0, bottom: 0, background: ribbon }} />
      <svg width={w * 0.5} height={h * 0.3} viewBox="0 0 100 50" style={{ position: "absolute", left: "25%", top: -h * 0.24 }}>
        <path d="M50 46 C 24 44, 6 22, 22 10 C 36 2, 48 28, 50 46 C 52 28, 64 2, 78 10 C 94 22, 76 44, 50 46 Z" fill={ribbon} />
      </svg>
    </div>
  </div>
);

/** The Paisley tree: brand-coloured tiers, warm lights, a gold star. */
export const Tree: React.FC<{ t: number; x: number; y: number; h: number; lights?: number }> = ({ t, x, y, h, lights = 44 }) => {
  const w = h * 0.68;
  const tiers = [[0.08, 0.46, 0.5], [0.28, 0.72, 0.74], [0.5, 1, 1]];
  const pts = Array.from({ length: lights }, (_, i) => {
    const v = 0.1 + (i / lights) * 0.86;
    const wid = w * 0.5 * v * ((i * 7) % 11 > 5 ? 0.86 : 0.55);
    return { x: x + (i % 2 ? 1 : -1) * wid * (0.3 + ((i * 13) % 9) / 12), y: y + h * v };
  });
  return (
    <>
      <Glow x={x} y={y + h * 0.55} r={h * 0.85} color="rgba(245,200,66,.2)" />
      <div style={{ position: "absolute", left: x - h * 0.03, top: y + h * 0.95, width: h * 0.06, height: h * 0.1, background: "#3A2A1E" }} />
      <svg width={w * 1.2} height={h} viewBox={`0 0 ${w * 1.2} ${h}`} style={{ position: "absolute", left: x - w * 0.6, top: y, overflow: "visible" }}>
        {tiers.map(([a, b, wd], i) => {
          const c = w * 0.6;
          const half = (w / 2) * wd;
          return (
            <path key={i} d={`M ${c} ${h * a - h * 0.06} C ${c + half * 0.3} ${h * (a + (b - a) * 0.5)}, ${c + half * 0.7} ${h * (a + (b - a) * 0.8)}, ${c + half} ${h * b - 12} Q ${c + half} ${h * b + 4} ${c + half - 20} ${h * b + 2} Q ${c} ${h * b + 26} ${c - half + 20} ${h * b + 2} Q ${c - half} ${h * b + 4} ${c - half} ${h * b - 12} C ${c - half * 0.7} ${h * (a + (b - a) * 0.8)}, ${c - half * 0.3} ${h * (a + (b - a) * 0.5)}, ${c} ${h * a - h * 0.06} Z`}
              fill={["#3A9288", "#2F7F77", "#245F5A"][i]} />
          );
        })}
      </svg>
      {[[-0.16, 0.42, C.berry], [0.14, 0.58, C.gold], [-0.22, 0.75, C.gold], [0.24, 0.86, C.berry], [0, 0.7, C.sage], [-0.05, 0.92, C.gold]].map(([dx, dy, col], i) => (
        <div key={i} style={{ position: "absolute", left: x + (dx as number) * w - h * 0.018, top: y + h * (dy as number), width: h * 0.036, height: h * 0.036, borderRadius: "50%", background: col as string, boxShadow: "inset -3px -3px 6px rgba(0,0,0,.2)" }} />
      ))}
      {pts.map((p, i) => <Bulb key={i} x={p.x} y={p.y} r={Math.max(3, h * 0.0075)} on={twinkle(t, i, 1.3)} />)}
      <svg width={h * 0.11} height={h * 0.11} viewBox="0 0 24 24" style={{ position: "absolute", left: x - h * 0.055, top: y - h * 0.075, filter: `drop-shadow(0 0 14px ${C.gold})` }}>
        <path d="M12 1.6l3.2 6.6 7.2 1-5.2 5 1.2 7.2L12 18.2l-6.4 3.2 1.2-7.2-5.2-5 7.2-1z" fill={C.goldSoft} />
      </svg>
    </>
  );
};

/** The evening living room in Paisley colours. Warm lamp, tree, presents, a Nairobi dusk through the window. */
export const Room: React.FC<{ t: number; dim?: number; tree?: boolean; sofa?: boolean; px?: number }> = ({ t, dim = 0, tree = true, sofa = true, px = 0 }) => (
  <AbsoluteFill style={{ background: C.room, overflow: "hidden" }}>
    <AbsoluteFill style={{ translate: `${px * 0.3}px 0` }}>
      <Glow x={120} y={300} r={820} color="rgba(255,229,122,.24)" />
      {/* window */}
      <div style={{ position: "absolute", left: 1000, top: 130, width: 340, height: 460, borderRadius: 26, border: "14px solid #0B2623", overflow: "hidden", background: "linear-gradient(180deg,#0F2C3C 0%,#245F5A 62%,#E8A33D 118%)" }}>
        {Array.from({ length: 18 }, (_, i) => <Bulb key={i} x={18 + ((i * 97) % 300)} y={280 + ((i * 53) % 110)} r={2.4} on={twinkle(t, i, 0.5)} />)}
        <svg width={340} height={460} style={{ position: "absolute" }}>
          <path d="M0 410 Q 90 380 180 400 T 340 390 V 460 H 0 Z" fill="#071B19" />
          <path d="M240 400 L 246 290 M246 330 C 214 310 190 306 160 306 M246 312 C 280 292 300 288 330 292" stroke="#071B19" strokeWidth={8} fill="none" strokeLinecap="round" />
          <ellipse cx={246} cy={276} rx={92} ry={18} fill="#071B19" />
          <ellipse cx={170} cy={302} rx={40} ry={11} fill="#071B19" />
        </svg>
        <div style={{ position: "absolute", left: 156, top: 0, width: 12, height: "100%", background: "#0B2623" }} />
      </div>
      {/* floor */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 860, bottom: 0, background: C.roomDark }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 850, height: 14, background: "#0E302C" }} />
      {/* lamp */}
      <div style={{ position: "absolute", left: 118, top: 300, width: 6, height: 560, background: "#071B19" }} />
      <div style={{ position: "absolute", left: 46, top: 226, width: 150, height: 104, background: "#F7DD8A", clipPath: "polygon(20% 0,80% 0,100% 100%,0 100%)" }} />
    </AbsoluteFill>
    <AbsoluteFill style={{ translate: `${px * 0.6}px 0` }}>
      {tree && (
        <>
          <Tree t={t} x={1590} y={190} h={680} />
          <Present w={150} h={118} box={C.gold} ribbon={C.berry} style={{ left: 1340, top: 790 }} />
          <Present w={118} h={88} box={C.sage} ribbon={C.brand} style={{ left: 1470, top: 830 }} />
          <Present w={170} h={136} box={C.berry} ribbon={C.goldSoft} style={{ left: 1620, top: 780 }} />
          <Present w={104} h={82} box={C.brandSoft} ribbon={C.gold} style={{ left: 1780, top: 836 }} />
        </>
      )}
    </AbsoluteFill>
    <LightString t={t} y={36} sag={46} bulbs={25} />
    {sofa && (
      <AbsoluteFill style={{ translate: `${px}px 0` }}>
        <div style={{ position: "absolute", left: 180, top: 580, width: 900, height: 340, borderRadius: 54, background: "#1D4F4A" }} />
      </AbsoluteFill>
    )}
    {dim > 0 && <AbsoluteFill style={{ background: "#061513", opacity: dim }} />}
  </AbsoluteFill>
);

export const Bubble: React.FC<{ w?: number; size?: number; color?: string; bg?: string; tail?: "l" | "r" | "none"; style?: React.CSSProperties; children: React.ReactNode }> = ({
  w, size = 44, color = C.brandDeep, bg = "#fff", tail = "l", style, children,
}) => (
  <div style={{ position: "relative", width: w, background: bg, borderRadius: 34, padding: "22px 34px", fontFamily: QUICKSAND, fontWeight: 700, fontSize: size, lineHeight: 1.12, color, boxShadow: "0 18px 44px rgba(0,0,0,.28)", ...style }}>
    {children}
    {tail !== "none" && (
      <svg width={46} height={36} viewBox="0 0 46 36" style={{ position: "absolute", bottom: -30, [tail === "l" ? "left" : "right"]: 54, scale: tail === "r" ? "-1 1" : undefined }}>
        <path d="M2 0 H 44 L 8 34 Z" fill={bg} />
      </svg>
    )}
  </div>
);

/** The site's own lockup: leaf logo + "Paisley" + TECH badge (tech.html .logo). */
export const Lockup: React.FC<{ size?: number; color?: string; logo?: boolean }> = ({ size = 120, color = C.brandDeep, logo = true }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.28, fontFamily: QUICKSAND, fontWeight: 700, fontSize: size, color, lineHeight: 1, whiteSpace: "nowrap" }}>
    {logo && <Img src={staticFile("img/logo@3x.png")} style={{ height: size * 1.6 }} />}
    <span>Paisley</span>
    <span style={{ background: C.brand, color: "#04231f", borderRadius: size * 0.2, padding: `${size * 0.08}px ${size * 0.26}px`, marginLeft: -size * 0.08 }}>TECH</span>
  </div>
);
