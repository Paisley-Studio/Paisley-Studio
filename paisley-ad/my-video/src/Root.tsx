import React from "react";
import { Composition, Folder } from "remotion";
import { Ad } from "./Ad";
import { Social } from "./Social";
import TL from "./timeline.json";

const FRAMES = TL.duration * TL.fps;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="PaisleyAd" component={Ad} durationInFrames={FRAMES} fps={TL.fps} width={1920} height={1080}
      defaultProps={{ captions: false, withAudio: true }} />
    <Composition id="PaisleyAdCaptioned" component={Ad} durationInFrames={FRAMES} fps={TL.fps} width={1920} height={1080}
      defaultProps={{ captions: true, withAudio: true }} />
    <Folder name="Social">
      <Composition id="PaisleyAdVertical" component={Social} durationInFrames={FRAMES} fps={TL.fps} width={1080} height={1920}
        defaultProps={{ format: "vertical" as const }} />
      <Composition id="PaisleyAdSquare" component={Social} durationInFrames={FRAMES} fps={TL.fps} width={1080} height={1080}
        defaultProps={{ format: "square" as const }} />
    </Folder>
  </>
);
