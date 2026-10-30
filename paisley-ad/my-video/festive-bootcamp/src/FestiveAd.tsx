import React from "react";
import { AbsoluteFill, Sequence, staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { Grain, SCENES, type SceneId } from "./lib";
import { S01Scroll } from "./scenes/S01Scroll";
import { S02WhatIf } from "./scenes/S02WhatIf";
import { S03Website } from "./scenes/S03Website";
import { S04Blog } from "./scenes/S04Blog";
import { S05Ideas } from "./scenes/S05Ideas";
import { S06Tools } from "./scenes/S06Tools";
import { S07Reveal } from "./scenes/S07Reveal";
import { S08YouAI } from "./scenes/S08YouAI";
import { S09Publish } from "./scenes/S09Publish";
import { S10Gift } from "./scenes/S10Gift";
import { S11Offer } from "./scenes/S11Offer";
import { S12Creation } from "./scenes/S12Creation";
import { S13Reserve } from "./scenes/S13Reserve";

/** The 60-second master. Scene bounds, narration and every event come from src/timeline.json. */
export const FestiveAd: React.FC<{ withAudio: boolean }> = ({ withAudio }) => {
  const { fps } = useVideoConfig();
  const at = (s: SceneId) => ({
    from: Math.round(SCENES[s][0] * fps),
    durationInFrames: Math.round((SCENES[s][1] - SCENES[s][0]) * fps),
  });
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Sequence name="01 Screen time" {...at("s01")}><S01Scroll /></Sequence>
      <Sequence name="02 What if they created?" {...at("s02")}><S02WhatIf /></Sequence>
      <Sequence name="03 The family Christmas website" {...at("s03")}><S03Website /></Sequence>
      <Sequence name="04 The holiday blog" {...at("s04")}><S04Blog /></Sequence>
      <Sequence name="05 One idea becomes another" {...at("s05")}><S05Ideas /></Sequence>
      <Sequence name="06 It needs tools" {...at("s06")}><S06Tools /></Sequence>
      <Sequence name="07 Paisley TECH reveal" {...at("s07")}><S07Reveal /></Sequence>
      <Sequence name="08 You + AI, doors" {...at("s08")}><S08YouAI /></Sequence>
      <Sequence name="09 Publish and share" {...at("s09")}><S09Publish /></Sequence>
      <Sequence name="10 The gift" {...at("s10")}><S10Gift /></Sequence>
      <Sequence name="11 The offer" {...at("s11")}><S11Offer /></Sequence>
      <Sequence name="12 Creation time" {...at("s12")}><S12Creation /></Sequence>
      <Sequence name="13 Reserve their place" {...at("s13")}><S13Reserve /></Sequence>
      <Grain />
      {withAudio && <Audio src={staticFile("audio/soundtrack.wav")} />}
    </AbsoluteFill>
  );
};
