import React from "react";
import { AbsoluteFill } from "remotion";
import { faBriefcase, faCode, faFilm, faMagnifyingGlass, faMusic, faPalette, faPenNib, faWandMagicSparkles, faXmark, faCheck, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { At, C, Center, EV, Icon, QUICKSAND, SCENES, Type, ease, pop, tw, typed, useSceneT } from "../lib";
import { CAST, Kid } from "../art";

const DOORS: { s: string; bg: string; ink: string; ic: IconDefinition }[] = [
  { s: "AI", bg: C.brandDeep, ink: "#fff", ic: faWandMagicSparkles },
  { s: "CODING", bg: C.gold, ink: C.brandDeep, ic: faCode },
  { s: "WRITING", bg: C.paper, ink: C.brandDeep, ic: faPenNib },
  { s: "RESEARCH", bg: C.brand, ink: "#04231f", ic: faMagnifyingGlass },
  { s: "DESIGN", bg: C.room, ink: C.goldSoft, ic: faPalette },
  { s: "MEDIA", bg: C.brandSoft, ink: C.brandDeep, ic: faFilm },
  { s: "MUSIC", bg: C.warn, ink: "#3b2d00", ic: faMusic },
  { s: "ENTREPRENEURSHIP", bg: C.sage, ink: C.brandDeep, ic: faBriefcase },
  { s: "AND MUCH MORE.", bg: C.brandDeep, ink: C.gold, ic: faWandMagicSparkles },
];

const DoorFace: React.FC<{ d: (typeof DOORS)[number]; t: number; at: number }> = ({ d, t, at }) => (
  <AbsoluteFill style={{ background: d.bg, alignItems: "center", justifyContent: "center", width: 1920 }}>
    <Icon icon={d.ic} size={96} color={d.ink} style={{ marginBottom: 26, opacity: 0.85 }} />
    <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: d.s.length > 10 ? 148 : 214, color: d.ink, whiteSpace: "nowrap", letterSpacing: `${tw(t, [at, at + 0.5], [0.06, -0.01])}em`, lineHeight: 1.05 }}>{d.s}</div>
  </AbsoluteFill>
);

/** One discipline: its two leaves swing open on the next. */
const Door: React.FC<{ d: (typeof DOORS)[number]; t: number; at: number; open: number }> = ({ d, t, at, open }) => {
  const p = tw(t, [open, open + 0.16], [0, 1], ease.inOut);
  if (t > open + 0.17 || t < at - 0.2) return null;
  return (
    <AbsoluteFill style={{ perspective: 1500 }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 960, height: 1080, overflow: "hidden", transformOrigin: "0 50%", transform: `rotateY(${p * 96}deg)` }}><DoorFace d={d} t={t} at={at} /></div>
      <div style={{ position: "absolute", left: 960, top: 0, width: 960, height: 1080, overflow: "hidden", transformOrigin: "100% 50%", transform: `rotateY(${-p * 96}deg)` }}>
        <div style={{ position: "absolute", left: -960, width: 1920, height: 1080 }}><DoorFace d={d} t={t} at={at} /></div>
      </div>
    </AbsoluteFill>
  );
};

/** 0:36. AI used naturally: it offers, the child judges, the result is theirs. Then the worlds open. */
export const S08YouAI: React.FC = () => {
  const t = useSceneT("s08");
  const end = SCENES.s08[1];
  const a = EV.aiOptions;
  const y = EV.youAi;
  const fade = tw(t, [y - 0.08, y + 0.06], [0, 1]);
  const reject = tw(t, [a + 0.32, a + 0.62], [0, 1], ease.in);
  const edited = "Mama's chapati race";
  const editAt = a + 0.5;
  const step = 0.2;
  const door = (i: number) => EV.doors + i * step;
  return (
    <AbsoluteFill style={{ background: C.sage, overflow: "hidden" }}>
      <AbsoluteFill style={{ opacity: 1 - fade }}>
        <At x={210} y={830}><Kid look={CAST.neema} expr="focus" lookX={7} size={400} /></At>
        <div style={{ position: "absolute", left: 90, top: 70, right: 90, height: 124, borderRadius: 34, background: "#fff", display: "flex", alignItems: "center", gap: 26, padding: "0 42px", boxShadow: "0 12px 34px rgba(36,95,90,.12)", scale: pop(t, a - 0.1, 0.25) }}>
          <Type size={58} color={C.brand}>MY IDEA</Type>
          <Type size={58} color={C.brandDeep} style={{ whiteSpace: "nowrap" }}>A game about my street at Christmas</Type>
        </div>
        {/* card 1: rejected */}
        <At x={620} y={510 + reject * 760} style={{ scale: pop(t, a + 0.02, 0.25), rotate: `${-2 - reject * 22}deg` }}>
          <OptionCard title="Penguins in the Arctic" />
          <div style={{ position: "absolute", right: 22, top: 22, width: 66, height: 66, borderRadius: 33, background: C.berry, display: "grid", placeItems: "center", scale: tw(t, [a + 0.2, a + 0.3], [0, 1], ease.back) }}><Icon icon={faXmark} size={36} /></div>
        </At>
        {/* card 2: the child rewrites it */}
        <At x={1110} y={510} style={{ scale: pop(t, a + 0.1, 0.25) }}>
          <OptionCard title={t < editAt ? "A street food race" : typed(t, editAt, edited, 44) || "|"} live={t >= editAt} />
          <div style={{ position: "absolute", right: 22, top: 22, height: 66, padding: "0 24px", borderRadius: 33, background: C.gold, display: "flex", gap: 10, alignItems: "center", scale: tw(t, [editAt + 0.34, editAt + 0.44], [0, 1], ease.back) }}>
            <Icon icon={faCheck} size={30} color="#3b2d00" /><Type size={36} color="#3b2d00">MINE</Type>
          </div>
        </At>
        {/* card 3: set aside */}
        <At x={1600} y={510} style={{ scale: pop(t, a + 0.18, 0.25), opacity: 1 - tw(t, [a + 0.6, a + 0.8], [0, 0.55]), rotate: "2deg" }}><OptionCard title="Save the tree level" /></At>
      </AbsoluteFill>

      <Center style={{ opacity: fade }}>
        <div style={{ display: "flex", alignItems: "center", gap: 70, fontFamily: QUICKSAND, fontWeight: 700, lineHeight: 1 }}>
          <span style={{ fontSize: 330, color: C.brandDeep, scale: pop(t, y, 0.3) }}>YOU</span>
          <span style={{ fontSize: 220, color: C.gold, WebkitTextStroke: `4px ${C.warn}`, scale: pop(t, y + 0.1, 0.3) }}>+</span>
          <span style={{ fontSize: 210, color: C.brand, scale: pop(t, y + 0.18, 0.3) }}>AI</span>
        </div>
      </Center>

      {t >= door(0) - 0.14 && (
        <AbsoluteFill style={{ clipPath: `inset(0 ${(1 - tw(t, [door(0) - 0.14, door(0)], [0, 1], ease.inOut)) * 50}%)` }}>
          {DOORS.map((d, i) => {
            const k = DOORS.length - 1 - i; // later doors sit behind earlier ones
            const dd = DOORS[k];
            return <Door key={dd.s} d={dd} t={t} at={door(k)} open={k === DOORS.length - 1 ? end + 1 : door(k + 1)} />;
          })}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

const OptionCard: React.FC<{ title: string; live?: boolean }> = ({ title, live }) => (
  <div style={{ width: 450, height: 400, borderRadius: 34, background: "#fff", padding: 32, boxShadow: "0 22px 50px rgba(36,95,90,.18)", border: live ? `5px solid ${C.gold}` : "5px solid transparent" }}>
    <div style={{ height: 160, borderRadius: 20, background: live ? C.brand : C.sage, display: "grid", placeItems: "center" }}>
      <Icon icon={faWandMagicSparkles} size={64} color={live ? "#fff" : C.brandSoft} />
    </div>
    <Type size={52} color={C.brandDeep} style={{ marginTop: 24 }}>{title}</Type>
  </div>
);
