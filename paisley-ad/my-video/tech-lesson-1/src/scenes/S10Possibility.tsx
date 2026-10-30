import React from "react";
import { random } from "remotion";
import {
  faBlog, faBook, faBriefcase, faFlask, faGamepad, faGlobe, faHeart, faImage, faMusic, faRobot, faRocket,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { At, C, ease, Icon, L, pop, QUICKSAND, Reveal, Scene, SCENES, tw, useT, W } from "../lib";

type Idea = { label: string; icon: IconDefinition; color: string; cue: [string, number?] };
const IDEAS: Idea[] = [
  { label: "Website", icon: faGlobe, color: C.sky, cue: ["website"] },
  { label: "Game", icon: faGamepad, color: C.coral, cue: ["game"] },
  { label: "Comic", icon: faBook, color: C.gold, cue: ["comic"] },
  { label: "Blog", icon: faBlog, color: C.brand, cue: ["blog"] },
  { label: "Poster", icon: faImage, color: C.violet, cue: ["poster"] },
  { label: "Research", icon: faFlask, color: C.success, cue: ["research"] },
  { label: "Music", icon: faMusic, color: C.violet, cue: ["music"] },
  { label: "Business idea", icon: faBriefcase, color: C.warn, cue: ["business"] },
  { label: "Invention", icon: faRocket, color: C.coral, cue: ["invention"] },
  { label: "AI assistant", icon: faRobot, color: C.brand, cue: ["assistant"] },
  { label: "For family", icon: faHeart, color: "#FF6B9A", cue: ["special"] },
];

export const S10Possibility: React.FC = () => {
  const t = useT() + SCENES.s10[0];
  const spark = tw(t, [L("s10a") - 0.4, W("s10a", "space") + 0.4], [0, 1], ease.out);
  const yours = W("s10a", "Your");
  const q = L("s10c");
  const dim = tw(t, [q - 0.4, q + 0.4], [0, 1], ease.inOut);
  const bloom = tw(t, [q, SCENES.s10[1]], [0, 1], ease.soft);

  return (
    <Scene id="s10" push={0.06}>
      {/* starfield of tiny dots, for depth */}
      {Array.from({ length: 90 }).map((_, i) => (
        <div key={i} style={{ position: "absolute", left: random(`x${i}`) * 1920, top: random(`y${i}`) * 1080, width: 3, height: 3, borderRadius: 2, background: "#fff",
          opacity: (0.15 + 0.35 * random(`o${i}`)) * (0.5 + 0.5 * Math.sin(t * (1 + random(`s${i}`)) + i)) * spark }} />
      ))}
      {/* the empty space: one point of light that opens into a glowing floor */}
      <At x={960} y={560}>
        <div style={{ width: 40 + spark * 1100, height: 40 + spark * 380, borderRadius: "50%",
          background: `radial-gradient(ellipse, ${C.brand}${spark > 0.5 ? "55" : "aa"} 0%, ${C.brand}22 40%, transparent 70%)`, filter: "blur(6px)", scale: 1 + bloom * 0.3 }} />
      </At>
      <At x={960} y={560} style={{ opacity: 1 - tw(t, [W("s10b", "website") - 0.3, W("s10b", "website")], [0, 1]) }}>
        <div style={{ width: 14, height: 14, borderRadius: 7, background: "#fff", boxShadow: `0 0 40px 12px ${C.brand}`, scale: 1 + Math.sin(t * 3) * 0.2 }} />
      </At>
      <At x={960} y={720}>
        <Reveal t={t} at={yours - 0.1} out={W("s10b", "website") + 0.2}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 40, letterSpacing: "0.34em", color: C.brandSoft }}>YOUR SPACE</div>
        </Reveal>
      </At>

      {/* the possibilities arrive one by one and orbit */}
      {IDEAS.map((idea, i) => {
        const cue = W("s10b", idea.cue[0], idea.cue[1] ?? 0) - 0.1;
        const p = tw(t, [cue, cue + 0.7], [0, 1], ease.out);
        const a = (i / IDEAS.length) * Math.PI * 2 + t * 0.07 - 1.2;
        const depth = (Math.sin(a) + 1) / 2; // 0 back .. 1 front
        const x = 960 + Math.cos(a) * 760 * p;
        const y = 540 + Math.sin(a) * 330 * p;
        const s = (0.7 + depth * 0.45) * (0.3 + 0.7 * pop(t, cue, 0.6));
        return (
          <At key={idea.label} x={x} y={y} style={{ scale: s, opacity: (t > cue ? 1 : 0) * (1 - dim * 0.45), zIndex: Math.round(depth * 100), filter: `blur(${(1 - depth) * 2 + dim * 2}px)` }}>
            <div style={{ width: 300, height: 210, borderRadius: 32, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16,
              background: `linear-gradient(160deg, ${idea.color}38, rgba(255,255,255,.04))`, border: `2px solid ${idea.color}aa`,
              boxShadow: `0 30px 70px rgba(0,0,0,.5), 0 0 ${40 * pop(t, cue, 0.6)}px ${idea.color}55` }}>
              <Icon icon={idea.icon} size={76} color={idea.color} />
              <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 36, color: "#fff", whiteSpace: "nowrap" }}>{idea.label}</div>
            </div>
          </At>
        );
      })}

      {/* WHAT COULD YOU CREATE? */}
      <At x={960} y={540} style={{ zIndex: 200 }}>
        <div style={{ textAlign: "center", opacity: tw(t, [q - 0.15, q + 0.3], [0, 1]), scale: 0.9 + 0.1 * tw(t, [q - 0.15, q + 1.2], [0, 1], ease.out) + bloom * 0.04 }}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 126, lineHeight: 1.05, color: "#fff", whiteSpace: "nowrap", textShadow: "0 10px 60px rgba(0,0,0,.6)" }}>
            WHAT COULD
          </div>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 126, lineHeight: 1.05, whiteSpace: "nowrap", textShadow: "0 10px 60px rgba(0,0,0,.6)" }}>
            <span style={{ color: C.gold, textShadow: `0 0 60px ${C.gold}88` }}>YOU</span> <span style={{ color: "#fff" }}>CREATE?</span>
          </div>
        </div>
      </At>
    </Scene>
  );
};
