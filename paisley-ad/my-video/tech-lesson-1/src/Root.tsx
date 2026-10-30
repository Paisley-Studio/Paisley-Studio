import React from "react";
import { Composition } from "remotion";
import { Lesson } from "./Lesson";
import TL from "./timeline.json";
import { Lesson2 } from "./lesson2/Lesson2";

const FRAMES = Math.ceil(TL.duration * TL.fps);
const LESSON2_FRAMES = 420 * 30; // 7:00 at 30fps (production/lesson2/script.py TARGET)

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="TechLesson1" component={Lesson} durationInFrames={FRAMES} fps={TL.fps} width={1920} height={1080}
      defaultProps={{ captions: false, withAudio: true }} />
    <Composition id="TechLesson1Captioned" component={Lesson} durationInFrames={FRAMES} fps={TL.fps} width={1920} height={1080}
      defaultProps={{ captions: true, withAudio: true }} />
    <Composition id="TechLesson2" component={Lesson2} durationInFrames={LESSON2_FRAMES} fps={30} width={1920} height={1080}
      defaultProps={{ captions: false, withAudio: true }} />
    <Composition id="TechLesson2Captioned" component={Lesson2} durationInFrames={LESSON2_FRAMES} fps={30} width={1920} height={1080}
      defaultProps={{ captions: true, withAudio: true }} />
  </>
);
