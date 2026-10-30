import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { QUICKSAND, tw } from "./lib";
import TL from "./timeline.json";

/** Burned-in narration captions, timed to the voice-over (timeline.json "captions"). */
export const Captions: React.FC<{ size?: number; bottom?: number; maxWidth?: number; box?: React.CSSProperties }> = ({
  size = 38, bottom = 34, maxWidth = 1500, box,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const cue = (TL.captions as [number, number, string][]).find(([a, b]) => t >= a - 0.1 && t < b + 0.1);
  if (!cue) return null;
  const [a, b, text] = cue;
  const o = Math.min(tw(t, [a - 0.1, a + 0.1], [0, 1]), tw(t, [b - 0.05, b + 0.1], [1, 0]));
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: bottom, pointerEvents: "none", ...box }}>
      <div style={{ maxWidth, textAlign: "center", fontFamily: QUICKSAND, fontWeight: 600, fontSize: size, lineHeight: 1.3, color: "#fff",
        background: "rgba(6,16,13,.72)", padding: `${size * 0.28}px ${size * 0.6}px`, borderRadius: size * 0.4, opacity: o }}>{text}</div>
    </AbsoluteFill>
  );
};
