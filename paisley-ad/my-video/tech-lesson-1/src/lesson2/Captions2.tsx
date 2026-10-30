import React from "react";
import { AbsoluteFill } from "remotion";
import { QUICKSAND, tw, useT, VO, type Word } from "./lib2";

/** Burned-in captions for Lesson 2, same rules as Lesson 1's (src/Captions.tsx): chunks of up to 7 words. */
const CHUNKS = VO.flatMap((l) => {
  const tokens = l.text.replace(/\.\.\./g, "… ").split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
  const say = (w: Word, i: number) => (tokens.length === l.words.length ? tokens[i] : w[2]);
  const out: { at: number; end: number; text: string }[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) out.push({ at: cur[0][0], end: cur[cur.length - 1][1], text: cur.map((w) => say(w, l.words.indexOf(w))).join(" ") });
    cur = [];
  };
  const size = Math.ceil(l.words.length / Math.ceil(l.words.length / 7));
  l.words.forEach((w, i) => {
    cur.push(w);
    const next = l.words[i + 1];
    if (cur.length >= size || !next || next[0] - w[1] > 0.45) flush();
  });
  return out.map((c, i) => ({ ...c, end: Math.min(out[i + 1] ? out[i + 1].at : 1e9, c.end + 0.6) }));
});

export const Captions2: React.FC = () => {
  const t = useT();
  const c = CHUNKS.find((x) => t >= x.at - 0.05 && t < x.end);
  if (!c) return null;
  const o = tw(t, [c.at - 0.05, c.at + 0.1], [0, 1]);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 56, pointerEvents: "none" }}>
      <div style={{
        opacity: o, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 40, color: "#fff", background: "rgba(7,16,13,.78)",
        padding: "12px 28px", borderRadius: 16, maxWidth: 1500, textAlign: "center",
      }}>{c.text}</div>
    </AbsoluteFill>
  );
};
