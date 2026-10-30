import React from "react";
import { AbsoluteFill, Sequence, staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { Grain, SCENES, type SceneId } from "./lib2";
import { Captions2 } from "./Captions2";
import { S01Canvas } from "./scenes/S01Canvas";
import { S02Mission } from "./scenes/S02Mission";
import { S03Design } from "./scenes/S03Design";
import { S04Specific } from "./scenes/S04Specific";
import { S05Create } from "./scenes/S05Create";
import { S06Perfect } from "./scenes/S06Perfect";
import { S07Check } from "./scenes/S07Check";
import { S08Iterate } from "./scenes/S08Iterate";
import { S09Direct } from "./scenes/S09Direct";
import { S10Challenge } from "./scenes/S10Challenge";
import { S11Reflect } from "./scenes/S11Reflect";
import { S12Card } from "./scenes/S12Card";
import { S13YourTurn } from "./scenes/S13YourTurn";
import { S14Finale } from "./scenes/S14Finale";

export type Lesson2Props = { captions: boolean; withAudio: boolean };

/** TECH Lesson 2, "Make something with AI." Scene bounds come from src/lesson2/timeline.json (production/lesson2/layout.py). */
export const Lesson2: React.FC<Lesson2Props> = ({ captions, withAudio }) => {
  const { fps } = useVideoConfig();
  const at = (s: SceneId) => ({
    from: Math.round(SCENES[s][0] * fps),
    durationInFrames: Math.round((SCENES[s][1] - SCENES[s][0]) * fps),
  });
  return (
    <AbsoluteFill style={{ background: "#07100D" }}>
      <Sequence name="01 Now let's use it" {...at("s01")}><S01Canvas /></Sequence>
      <Sequence name="02 Your mission" {...at("s02")}><S02Mission /></Sequence>
      <Sequence name="03 Design it first" {...at("s03")}><S03Design /></Sequence>
      <Sequence name="04 Be specific" {...at("s04")}><S04Specific /></Sequence>
      <Sequence name="05 Your first creation" {...at("s05")}><S05Create /></Sequence>
      <Sequence name="06 Is it perfect?" {...at("s06")}><S06Perfect /></Sequence>
      <Sequence name="07 Check. Think. Improve." {...at("s07")}><S07Check /></Sequence>
      <Sequence name="08 Create, check, improve" {...at("s08")}><S08Iterate /></Sequence>
      <Sequence name="09 AI doesn't know your idea" {...at("s09")}><S09Direct /></Sequence>
      <Sequence name="10 Your challenge" {...at("s10")}><S10Challenge /></Sequence>
      <Sequence name="11 Be honest about AI" {...at("s11")}><S11Reflect /></Sequence>
      <Sequence name="12 Your creation card" {...at("s12")}><S12Card /></Sequence>
      <Sequence name="13 Your turn" {...at("s13")}><S13YourTurn /></Sequence>
      <Sequence name="14 That's creating with AI" {...at("s14")}><S14Finale /></Sequence>
      <Grain />
      {captions && <Captions2 />}
      {withAudio && <Audio src={staticFile("audio/lesson2.wav")} />}
    </AbsoluteFill>
  );
};
