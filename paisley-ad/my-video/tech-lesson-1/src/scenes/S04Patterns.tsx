import React from "react";
import { random } from "remotion";
import { faFont, faHashtag, faImage, faWaveSquare } from "@fortawesome/free-solid-svg-icons";
import { Ambient, At, BigWord, C, DotGrid, E, ease, Icon, L, life, pop, QUICKSAND, Scene, SCENES, tw, useT, W } from "../lib";

const XS = [360, 660, 960, 1260, 1560];
const KINDS = [
  { label: "PHOTOS", icon: faImage, color: C.sky, corner: [300, 200] },
  { label: "WORDS", icon: faFont, color: C.gold, corner: [1620, 200] },
  { label: "SOUNDS", icon: faWaveSquare, color: C.violet, corner: [300, 880] },
  { label: "NUMBERS", icon: faHashtag, color: C.coral, corner: [1620, 880] },
];
const SNIPPETS = [["", "", ""], ["cat", "blue", "hello", "sky", "run"], ["", "", ""], ["42", "7", "3.14", "100", "8"]];

export const S04Patterns: React.FC = () => {
  const t = useT() + SCENES.s04[0];
  const nums = ["2", "4", "6", "8"];
  const cues = [W("s04b", "Two"), W("s04b", "Four"), W("s04b", "Six"), W("s04b", "Eight")];
  const qIn = W("s04c", "What") - 0.2;
  const answer = W("s04d", "Ten");
  const think = tw(t, [E("s04c"), answer - 0.1], [0, 1], ease.linear);
  const brain = W("s04e", "pattern");
  const zoom = tw(t, [L("s04f") - 0.3, L("s04f") + 1.2], [0, 1], ease.inOut);
  const sortP = tw(t, [W("s04g", "find") - 0.4, W("s04g", "find") + 1.6], [0, 1], ease.inOut);
  const count = Math.floor(tw(t, [W("s04f", "millions") - 0.1, E("s04f")], [0, 1], ease.soft) ** 2 * 1_000_000);

  return (
    <Scene id="s04" push={0.03}>
      <Ambient t={t} opacity={0.3} colors={[C.brand, C.violet, C.gold]} />
      <DotGrid />

      {/* 2 -> 4 -> 6 -> 8 -> ? */}
      <div style={{ position: "absolute", inset: 0, scale: 1 - zoom * 0.88, opacity: 1 - tw(zoom, [0.6, 1], [0, 1]) }}>
        <At x={960} y={250}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 32, letterSpacing: "0.3em", color: C.brand, opacity: tw(t, [L("s04a") - 0.2, L("s04a") + 0.3], [0, 1]) }}>
            SPOT THE PATTERN
          </div>
        </At>
        {nums.map((n, i) => (
          <At key={n} x={XS[i]} y={520} style={{ scale: pop(t, cues[i] - 0.08, 0.5), opacity: t > cues[i] - 0.08 ? 1 : 0 }}>
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 210, color: "#fff", lineHeight: 1,
              textShadow: t > brain ? `0 0 40px ${C.brand}` : undefined }}>{n}</div>
          </At>
        ))}
        {/* +2 hops */}
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          {[0, 1, 2, 3].map((i) => {
            const at = i < 3 ? cues[i + 1] : answer;
            const p = tw(t, [at - 0.15, at + 0.3], [0, 1]);
            const glow = t > brain ? 0.6 + 0.4 * Math.sin((t - brain) * 6 - i) : 0;
            const x0 = XS[i] + 40, x1 = XS[i + 1] - 40;
            return (
              <path key={i} d={`M ${x0} 400 Q ${(x0 + x1) / 2} 300 ${x1} 400`} fill="none" stroke={glow ? C.gold : C.brand}
                strokeWidth={5 + glow * 3} strokeLinecap="round" pathLength={1} strokeDasharray={`${p} 2`} />
            );
          })}
        </svg>
        {[0, 1, 2, 3].map((i) => {
          const at = i < 3 ? cues[i + 1] : answer;
          return (
            <At key={i} x={(XS[i] + XS[i + 1]) / 2} y={318} style={{ opacity: tw(t, [at, at + 0.25], [0, 1]), scale: pop(t, at) }}>
              <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 44, color: t > brain ? C.gold : C.brand }}>+2</div>
            </At>
          );
        })}
        {/* the question box: counts down while you think, then flips to 10 */}
        <At x={XS[4]} y={520} style={{ scale: pop(t, qIn, 0.5) * (1 + (t < answer ? Math.sin(t * 5) * 0.03 : 0)), opacity: t > qIn ? 1 : 0 }}>
          <div style={{ width: 260, height: 260, borderRadius: 40, position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
            border: t > answer ? `4px solid ${C.gold}` : `4px dashed ${C.brand}`, background: t > answer ? `${C.gold}22` : "rgba(255,255,255,.04)",
            boxShadow: t > answer ? `0 0 70px ${C.gold}88` : undefined, rotate: `${tw(t, [answer - 0.2, answer + 0.2], [0, 360], ease.inOut) % 360}deg` }}>
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 190, color: t > answer ? C.gold : C.brand, lineHeight: 1 }}>{t > answer ? "10" : "?"}</div>
            <svg width={300} height={300} style={{ position: "absolute", left: -20, top: -20, opacity: t < answer ? life(t, E("s04c"), answer, 0.2) : 0 }}>
              <circle cx={150} cy={150} r={142} fill="none" stroke={C.gold} strokeWidth={6} pathLength={1} strokeDasharray={`${think} 2`}
                strokeLinecap="round" transform="rotate(-90 150 150)" />
            </svg>
          </div>
        </At>
        <At x={960} y={800}>
          <BigWord t={t} at={brain - 0.15} size={120} color={C.gold} glow={`${C.gold}66`}>PATTERN</BigWord>
        </At>
      </div>

      {/* millions of examples stream in, then get organised into groups */}
      <div style={{ position: "absolute", inset: 0, opacity: tw(zoom, [0.3, 0.8], [0, 1]) }}>
        {Array.from({ length: 220 }).map((_, i) => {
          const k = i % 4;
          const ang = random(`a${i}`) * Math.PI * 2;
          const speed = 0.18 + random(`s${i}`) * 0.2;
          const ph = ((t * speed + random(`p${i}`)) % 1);
          const r = 1150 * (1 - ph) + 40;
          const fx = 960 + Math.cos(ang) * r, fy = 540 + Math.sin(ang) * r * 0.62;
          // sorted position: a tidy cluster near this kind's corner
          const idx = Math.floor(i / 4);
          const col = idx % 8, row = Math.floor(idx / 8);
          const gx = (k % 2 === 0 ? 470 : 1450) + (col - 3.5) * 46;
          const gy = (k < 2 ? 380 : 700) + (row - 3) * 46;
          const x = fx + (gx - fx) * sortP, y = fy + (gy - fy) * sortP;
          const kind = KINDS[[0, 1, 2, 3][k]];
          const snip = SNIPPETS[k][i % SNIPPETS[k].length];
          const fade = sortP > 0 ? 1 : Math.min(1, ph * 4) * Math.min(1, (1 - ph) * 6);
          return (
            <At key={i} x={x} y={y} style={{ opacity: fade, scale: 0.8 + 0.2 * sortP }}>
              {snip && sortP < 0.5 ? (
                <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 22, color: kind.color, background: `${kind.color}22`, padding: "2px 8px", borderRadius: 8 }}>{snip}</div>
              ) : (
                <div style={{ width: 34, height: 34, borderRadius: 8, background: `${kind.color}33`, border: `1.5px solid ${kind.color}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon icon={kind.icon} size={18} color={kind.color} />
                </div>
              )}
            </At>
          );
        })}
        {/* labels at the corners, timed to the narration */}
        {KINDS.map((k, i) => {
          const at = W("s04f", ["Photos", "words", "sounds", "numbers"][i]);
          const [cx, cy] = k.corner;
          const gx = i % 2 === 0 ? 470 : 1450, gy = i < 2 ? 180 : 930;
          return (
            <At key={k.label} x={cx + (gx - cx) * sortP} y={cy + (gy - cy) * sortP} style={{ opacity: tw(t, [at - 0.1, at + 0.2], [0, 1]), scale: pop(t, at - 0.1) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 38, letterSpacing: "0.16em", color: k.color }}>
                <Icon icon={k.icon} size={36} color={k.color} /> {k.label}
              </div>
            </At>
          );
        })}
        <At x={960} y={540} style={{ opacity: tw(t, [W("s04f", "millions") - 0.2, W("s04f", "millions") + 0.2], [0, 1]) * (1 - sortP) }}>
          <div style={{ textAlign: "center", padding: "26px 44px", borderRadius: 30, background: "rgba(7,16,13,.75)", border: `2px solid ${C.brand}66` }}>
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 110, color: "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {count.toLocaleString("en-US")}{count >= 999_000 ? "+" : ""}
            </div>
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 30, letterSpacing: "0.3em", color: C.brand, marginTop: 10 }}>EXAMPLES</div>
          </div>
        </At>
        <At x={960} y={540} style={{ opacity: sortP, background: "rgba(7,16,13,.85)", borderRadius: 30, padding: "6px 30px", boxShadow: `0 0 60px ${C.night}` }}>
          <BigWord t={t} at={W("s04g", "patterns") - 0.1} size={96} color="#fff" glow={`${C.brand}88`}>PATTERNS</BigWord>
        </At>
      </div>
    </Scene>
  );
};
