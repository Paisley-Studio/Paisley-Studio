import React from "react";
import { AbsoluteFill } from "remotion";
import { C, CAVEAT, EV, GlowLine, Headline, Person, ease, tw, useSceneTime } from "../lib";

/** 00:00-00:05. Darkness, a pencil, a learner, and the line that starts everything. */
export const Spark: React.FC = () => {
  const { t } = useSceneTime("spark");
  const lamp = tw(t, [0, 1.4], [0, 1], ease.soft);
  // the camera follows the line out of frame in the last second
  const pan = tw(t, [3.9, 5.0], [0, -900], ease.in);
  const push = tw(t, [0, 5], [1.0, 1.07], ease.inOut);

  // handwriting reveal is tied to the pencil sound (pencilStart .. 3.3s)
  const w1 = tw(t, [EV.pencilStart + 0.05, 1.75], [0, 100], (x) => x);
  const w2 = tw(t, [1.85, 3.25], [0, 100], (x) => x);
  const ignite = tw(t, [EV.lineIgnite - 0.1, EV.lineIgnite + 0.4], [0, 1]);

  return (
    <AbsoluteFill style={{ background: "#040807", overflow: "hidden" }}>
      <AbsoluteFill style={{ scale: push, translate: `${pan}px 0px`, transformOrigin: "30% 70%" }}>
        {/* the learner, lit from the desk lamp */}
        <Person
          src="guy.png"
          light={C.gold}
          brightness={tw(t, [0.4, 3.0], [0.08, 0.92], ease.soft)}
          style={{ right: -120, bottom: -40, width: 1180, height: 872, opacity: tw(t, [0.2, 1.2], [0, 1]) }}
        />
        {/* rim light on the learner */}
        <AbsoluteFill style={{
          background: `radial-gradient(ellipse 30% 45% at 72% 48%, rgba(245,200,66,${0.12 * lamp}), transparent 70%)`,
        }} />

        {/* paper under the lamp */}
        <div style={{
          position: "absolute", left: -40, top: 560, width: 1240, height: 760, rotate: "-5deg", borderRadius: 6,
          background: "linear-gradient(180deg,#efe8d6,#e3d9c1)", opacity: lamp,
          boxShadow: "0 40px 120px rgba(0,0,0,.6)",
          filter: `brightness(${0.35 + 0.55 * lamp})`,
        }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} style={{ position: "absolute", left: 0, right: 0, top: 70 + i * 74, height: 2, background: "rgba(80,120,170,.18)" }} />
          ))}
          <div style={{ position: "absolute", left: 120, top: 0, bottom: 0, width: 2, background: "rgba(200,80,80,.22)" }} />
          <Writing text="x² − 5x + 6 = 0" reveal={w1} top={52} />
          <Writing text="(x − 2)(x − 3) = 0" reveal={w2} top={200} />
          <div style={{ position: "absolute", left: 190, top: 330, width: tw(t, [2.2, EV.lineIgnite], [0, 640], ease.inOut),
            height: 5, borderRadius: 3, background: "#3b3b3b", opacity: 0.85 * (1 - ignite) }} />
        </div>
        {/* lamp pool */}
        <AbsoluteFill style={{
          background: `radial-gradient(ellipse 48% 42% at 28% 82%, rgba(255,226,160,${0.18 * lamp}), transparent 70%)`,
          mixBlendMode: "screen",
        }} />

        {/* the underline ignites and leaves the page */}
        <GlowLine
          d="M 330 912 C 600 894, 840 868, 1060 840 S 1600 700, 2200 640 S 2900 560, 3400 540"
          progress={tw(t, [EV.lineIgnite, 5.0], [0.0, 1], ease.inOut)}
          tail={0.55}
          width={4}
        />
      </AbsoluteFill>

      <AbsoluteFill style={{ left: 130, top: 210 }}>
        <Headline t={t} at={EV.titlePossibility} out={4.95} size={128}>EVERY POSSIBILITY.</Headline>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Writing: React.FC<{ text: string; reveal: number; top: number }> = ({ text, reveal, top }) => (
  <div style={{
    position: "absolute", left: 180, top, fontFamily: CAVEAT, fontWeight: 700, fontSize: 118, color: "#2f2f2f",
    whiteSpace: "nowrap", clipPath: `inset(-20% ${100 - reveal}% -20% 0)`, letterSpacing: "0.02em",
  }}>
    {text}
  </div>
);
