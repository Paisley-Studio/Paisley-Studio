import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { faBookOpen, faCommentDots, faHammer, faMedal, faPaperPlane, faPenToSquare, faShareNodes, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { At, C, EV, Glow, Icon, LightString, Rise, SCENES, Type, ease, life, pop, tw, useSceneT } from "../lib";
import { Bubble, CAST, Kid, Lockup, type Look } from "../art";
import { GameScreen } from "../creations";

const STEPS = [
  { s: "LEARN", i: faBookOpen }, { s: "CREATE", i: faWandMagicSparkles }, { s: "BUILD", i: faHammer }, { s: "SUBMIT", i: faPaperPlane },
  { s: "COACH REVIEW", i: faCommentDots }, { s: "IMPROVE", i: faPenToSquare }, { s: "MASTER", i: faMedal }, { s: "SHARE", i: faShareNodes },
];
const X = (i: number) => 170 + i * 226;
const ROW = 330;

const COACHES: Look[] = [
  { skin: "#A56B43", shade: "#88552F", hair: "afro", hairC: "#1E1512", top: C.brandDeep, topShade: "#1A4844", glasses: true, adult: true },
  { skin: "#6E3F25", shade: "#57301C", hair: "fade", hairC: "#15100E", top: C.brandDeep, topShade: "#1A4844", adult: true, beard: true },
  { skin: "#8A5433", shade: "#6F4227", hair: "bun", hairC: "#17110E", top: C.brandDeep, topShade: "#1A4844", adult: true },
];

const Coach: React.FC<{ look: Look; x: number; y: number; size: number; p: number; expr?: "smile" | "laugh" | "proud"; lookX?: number }> = ({ look, x, y, size, p, expr = "smile", lookX = 0 }) => (
  <At x={x} y={y} style={{ scale: p, opacity: Math.min(1, p * 3) }}>
    <Kid look={look} expr={expr} size={size} lookX={lookX} />
    <div style={{ position: "absolute", left: "50%", translate: "-50% 0", bottom: size * 0.09, padding: `${size * 0.012}px ${size * 0.06}px`, borderRadius: 40, background: C.gold, color: "#3b2d00", whiteSpace: "nowrap" }}>
      <Type size={size * 0.085} color="#3b2d00">COACH</Type>
    </div>
  </At>
);

/** 0:30. Paisley TECH, then the people behind it: coaches walking the whole road to mastery beside each child. */
export const S07Reveal: React.FC = () => {
  const t = useSceneT("s07");
  const a = SCENES.s07[0];
  const c = EV.coachIn;
  const st = EV.steps;
  const move = tw(t, [c - 0.18, c + 0.08], [0, 1], ease.inOut);
  const logo = tw(t, [a, a + 0.5], [0, 1], ease.back);
  const on = tw(t, [c - 0.04, c + 0.08], [0, 1]);
  const walkX = interpolate(t, st, st.map((_, i) => X(i)), { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const m = EV.mastery;
  const improve = st[4];
  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      <Glow x={960} y={500} r={900} color="rgba(85,191,179,.2)" />
      <div style={{ opacity: 1 - move }}><LightString t={t} y={30} sag={40} bulbs={25} wire="rgba(36,95,90,.35)" /></div>
      <At x={960 - move * 700} y={430 - move * 362} style={{ scale: (0.82 + logo * 0.18) * (1 - move * 0.68), opacity: Math.min(1, logo * 2) }}>
        <Lockup size={150} />
      </At>
      <At x={960} y={660} style={{ opacity: 1 - tw(t, [c - 0.18, c], [0, 1]), scale: 0.96 + tw(t, [a + 0.2, a + 0.6], [0, 1]) * 0.04 }}>
        <Rise t={t} at={a + 0.25} size={96} color={C.brandDeep}>FESTIVE CREATOR BOOTCAMP</Rise>
      </At>

      <AbsoluteFill style={{ opacity: on }}>
        <At x={1250} y={70}>
          <Rise t={t} at={c + 0.02} dur={0.3} size={56} color={C.brandDeep}>REAL COACHES. <span style={{ color: C.brand }}>EVERY STEP OF THE WAY.</span></Rise>
        </At>

        {/* the road */}
        <svg width={1920} height={1080} style={{ position: "absolute" }}>
          <path d={`M ${X(0)} ${ROW} L ${X(7)} ${ROW}`} stroke={C.sage} strokeWidth={10} strokeLinecap="round" />
          <path d={`M ${X(0)} ${ROW} L ${walkX} ${ROW}`} stroke={C.brand} strokeWidth={10} strokeLinecap="round" />
        </svg>
        {STEPS.map((s, i) => {
          const at = i < 7 ? st[i] : 1e9;
          const lit = tw(t, [at - 0.04, at + 0.1], [0, 1]);
          const master = i === 6;
          return (
            <At key={s.s} x={X(i)} y={ROW} style={{ scale: pop(t, c + 0.05 + i * 0.04, 0.26) * (1 + 0.14 * life(t, at - 0.04, at + 0.3, 0.1)) }}>
              <div style={{ width: 98, height: 98, borderRadius: 32, display: "grid", placeItems: "center", background: lit > 0.5 ? (master ? C.gold : C.brandDeep) : "#fff", border: `4px solid ${lit > 0.5 ? "transparent" : C.brandSoft}`, boxShadow: "0 10px 24px rgba(36,95,90,.18)" }}>
                <Icon icon={s.i} size={46} color={lit > 0.5 ? (master ? "#3b2d00" : "#fff") : C.brandSoft} />
              </div>
              <Type size={s.s.length > 8 ? 25 : 30} color={C.brandDeep} style={{ position: "absolute", left: "50%", translate: "-50% 0", top: 106, whiteSpace: "nowrap" }}>{s.s}</Type>
            </At>
          );
        })}
        {/* the child and the coach, walking it together */}
        <div style={{ position: "absolute", left: walkX - 76, top: ROW - 172, display: "flex", opacity: tw(t, [EV.walk - 0.05, EV.walk + 0.1], [0, 1]), translate: `0 ${-Math.abs(Math.sin(t * 7)) * 8}px` }}>
          <Kid look={CAST.neema} expr={t > m ? "laugh" : "smile"} size={74} />
          <Kid look={COACHES[0]} expr="smile" size={80} style={{ marginLeft: -6 }} />
        </div>

        {/* the coaches, ready */}
        <Coach look={COACHES[1]} x={150} y={830} size={270} p={pop(t, c + 0.1, 0.3)} lookX={5} />
        <Coach look={COACHES[2]} x={590} y={830} size={270} p={pop(t, c + 0.28, 0.3) * (1 - tw(t, [EV.walk - 0.1, EV.walk + 0.1], [0, 1]))} lookX={-5} />
        <Coach look={COACHES[0]} x={370} y={800} size={300} p={pop(t, c + 0.19, 0.3)} expr={t > m ? "laugh" : "smile"} lookX={5} />
        <At x={600} y={850} style={{ scale: pop(t, EV.walk, 0.3) }}><Kid look={CAST.neema} expr={t > m ? "laugh" : "smile"} lookX={-6} size={250} /></At>

        {/* a real review of real work: the note changes the game */}
        <At x={1310} y={770}>
          <GameScreen t={t} at={c - 4} w={1000} h={500} sp={0.56} hopMul={tw(t, [improve - 0.05, improve + 0.15], [0.78, 1.5])} />
        </At>
        <At x={1010} y={520} style={{ scale: pop(t, st[1], 0.26), opacity: 1 - tw(t, [st[4] - 0.08, st[4] + 0.02], [0, 1]) }}>
          <Bubble size={36} w={500}>"Great start! Can the jump go higher?"</Bubble>
        </At>
        <At x={1560} y={560} style={{ scale: pop(t, improve, 0.24), opacity: 1 - tw(t, [m - 0.06, m + 0.02], [0, 1]) }}>
          <Bubble size={32} tail="none" bg={C.brandDeep} color="#fff" style={{ whiteSpace: "nowrap" }}>jump height: 120 → 300</Bubble>
        </At>
        <At x={1310} y={760} style={{ scale: tw(t, [m, m + 0.28], [1.7, 1], ease.back), opacity: tw(t, [m, m + 0.08], [0, 1]), rotate: "-5deg" }}>
          <div style={{ display: "flex", gap: 22, alignItems: "center", padding: "20px 52px", borderRadius: 70, background: C.gold, boxShadow: "0 24px 50px rgba(0,0,0,.28)" }}>
            <Icon icon={faMedal} size={84} color="#3b2d00" />
            <Type size={104} color="#3b2d00" style={{ whiteSpace: "nowrap" }}>MASTERED</Type>
          </div>
        </At>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

