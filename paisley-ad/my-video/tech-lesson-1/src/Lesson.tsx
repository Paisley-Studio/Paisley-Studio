import React from "react";
import { AbsoluteFill, Sequence, staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { Grain, SCENES, type SceneId } from "./lib";
import { Captions } from "./Captions";
import { S01Hook } from "./scenes/S01Hook";
import { S02Define } from "./scenes/S02Define";
import { S03Robot } from "./scenes/S03Robot";
import { S04Patterns } from "./scenes/S04Patterns";
import { S05Magic } from "./scenes/S05Magic";
import { S06Everyday } from "./scenes/S06Everyday";
import { S07Create } from "./scenes/S07Create";
import { S08Wrong } from "./scenes/S08Wrong";
import { S09YouAndAI } from "./scenes/S09YouAndAI";
import { S10Possibility } from "./scenes/S10Possibility";
import { S11Welcome } from "./scenes/S11Welcome";

export type LessonProps = { captions: boolean; withAudio: boolean };

/** TECH Lesson 1, "What is AI?" Scene bounds come from src/timeline.json (production/layout.py). */
export const Lesson: React.FC<LessonProps> = ({ captions, withAudio }) => {
  const { fps } = useVideoConfig();
  const at = (s: SceneId) => ({
    from: Math.round(SCENES[s][0] * fps),
    durationInFrames: Math.round((SCENES[s][1] - SCENES[s][0]) * fps),
  });
  return (
    <AbsoluteFill style={{ background: "#07100D" }}>
      <Sequence name="01 Wait... what is AI?" {...at("s01")}><S01Hook /></Sequence>
      <Sequence name="02 So... what is AI?" {...at("s02")}><S02Define /></Sequence>
      <Sequence name="03 The robot and the dogs" {...at("s03")}><S03Robot /></Sequence>
      <Sequence name="04 Patterns are everywhere" {...at("s04")}><S04Patterns /></Sequence>
      <Sequence name="05 AI is not magic" {...at("s05")}><S05Magic /></Sequence>
      <Sequence name="06 AI is already around you" {...at("s06")}><S06Everyday /></Sequence>
      <Sequence name="07 AI can create" {...at("s07")}><S07Create /></Sequence>
      <Sequence name="08 But AI can be wrong" {...at("s08")}><S08Wrong /></Sequence>
      <Sequence name="09 AI is not you" {...at("s09")}><S09YouAndAI /></Sequence>
      <Sequence name="10 What could you create?" {...at("s10")}><S10Possibility /></Sequence>
      <Sequence name="11 Welcome to TECH" {...at("s11")}><S11Welcome /></Sequence>
      <Grain />
      {captions && <Captions />}
      {withAudio && <Audio src={staticFile("audio/lesson1.wav")} />}
    </AbsoluteFill>
  );
};
