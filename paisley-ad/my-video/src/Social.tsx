import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Ad } from "./Ad";
import { Captions } from "./Captions";
import { C, QUICKSAND, tw } from "./lib";

/**
 * Social cut-downs (9:16, 1:1). The 16:9 master is framed full-width inside a branded layout,
 * with large narration captions for sound-off feeds. Same picture, same soundtrack, same timing.
 */
export const Social: React.FC<{ format: "vertical" | "square" }> = ({ format }) => {
  const { width } = useVideoConfig();
  const t = useCurrentFrame() / 30;
  const k = width / 1920;
  const vertical = format === "vertical";
  const top = vertical ? 560 : 196;
  const endCard = tw(t, [56.3, 56.9], [0, 1]);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, #0a1e1b 0%, ${C.dark} 45%, #06100d 100%)` }}>
      {/* brand band */}
      <div style={{ position: "absolute", left: 0, right: 0, top: vertical ? 150 : 46, display: "flex", flexDirection: "column", alignItems: "center",
        opacity: 1 - endCard }}>
        <Img src={staticFile("img/logo@3x.png")} style={{ width: vertical ? 250 : 150, filter: "brightness(0) invert(1)", opacity: 0.95 }} />
        {vertical && <div style={{ marginTop: 26, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 40, letterSpacing: "0.2em", color: C.brandSoft }}>
          IGCSE · CBC · AI &amp; TECH</div>}
      </div>
      <div style={{ position: "absolute", left: 0, top, width: 1920, height: 1080, scale: k, transformOrigin: "0 0", overflow: "hidden" }}>
        <Ad captions={false} withAudio />
      </div>
      <Captions size={vertical ? 54 : 40} maxWidth={vertical ? 960 : 1000} bottom={0}
        box={{ top: top + 1080 * k + 40, bottom: "auto", height: vertical ? 300 : 230, justifyContent: "center" }} />
      {vertical && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 150, textAlign: "center", fontFamily: QUICKSAND, fontWeight: 700,
          fontSize: 40, color: C.brand, letterSpacing: "0.06em" }}>paisleystudio.online</div>
      )}
    </AbsoluteFill>
  );
};
