import React from "react";
import { Composition } from "remotion";
import { FestiveAd } from "./FestiveAd";
import TL from "./timeline.json";

export const RemotionRoot: React.FC = () => (
  <Composition id="FestiveCreatorBootcamp" component={FestiveAd} durationInFrames={Math.ceil(TL.duration * TL.fps)} fps={TL.fps} width={1920} height={1080}
    defaultProps={{ withAudio: true }} />
);
