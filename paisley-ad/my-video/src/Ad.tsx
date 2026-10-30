import React from "react";
import { AbsoluteFill, Sequence, staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { Grain, SCENES } from "./lib";
import { Spark } from "./scenes/Spark";
import { Igcse } from "./scenes/Igcse";
import { Cbc } from "./scenes/Cbc";
import { Tech } from "./scenes/Tech";
import { Connected } from "./scenes/Connected";
import { Parent } from "./scenes/Parent";
import { Reveal as RevealScene } from "./scenes/Reveal";
import { Captions } from "./Captions";

export type AdProps = { captions: boolean; withAudio: boolean };

/** The 60-second master: IGCSE -> CBC -> AI & TECH -> connected platform -> parent -> brand. */
export const Ad: React.FC<AdProps> = ({ captions, withAudio }) => {
  const { fps } = useVideoConfig();
  const at = (s: keyof typeof SCENES) => ({
    from: Math.round(SCENES[s][0] * fps),
    durationInFrames: Math.round((SCENES[s][1] - SCENES[s][0]) * fps),
  });
  return (
    <AbsoluteFill style={{ background: "#040807" }}>
      <Sequence name="01 The Spark" {...at("spark")}><Spark /></Sequence>
      <Sequence name="02 IGCSE" {...at("igcse")}><Igcse /></Sequence>
      <Sequence name="03 CBC" {...at("cbc")}><Cbc /></Sequence>
      <Sequence name="04 AI & TECH" {...at("tech")}><Tech /></Sequence>
      <Sequence name="05 Connected" {...at("connected")}><Connected /></Sequence>
      <Sequence name="06 Parent" {...at("parent")}><Parent /></Sequence>
      <Sequence name="07 Reveal" {...at("reveal")}><RevealScene /></Sequence>
      <Grain />
      {captions && <Captions />}
      {withAudio && <Audio src={staticFile("audio/soundtrack.wav")} />}
    </AbsoluteFill>
  );
};
