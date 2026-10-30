import React from "react";
import { AbsoluteFill } from "remotion";
import { faCommentDots, faHeart, faShare, faStar } from "@fortawesome/free-solid-svg-icons";
import { At, C, EV, Glow, Icon, Rise, Type, W, ease, tw, useSceneT, twinkle } from "../lib";
import { CAST, Kid, Present, Room } from "../art";

const CUT = 1.75;

/** The endless feed. Every page is familiar and instantly forgettable. */
const Page: React.FC<{ i: number; t: number }> = ({ i, t }) => {
  const kind = i % 4;
  const bg = [C.brand, "#103733", C.berry, C.gold][kind];
  return (
    <div style={{ position: "absolute", inset: 0, background: bg, overflow: "hidden" }}>
      {kind === 0 && (
        <>
          <At x={270} y={520} style={{ rotate: `${Math.sin(t * 9) * 7}deg` }}><Kid look={CAST.neema} expr="laugh" size={400} /></At>
          <Type size={46} style={{ position: "absolute", left: 40, top: 130 }}>wait for it...</Type>
        </>
      )}
      {kind === 1 && (
        <>
          {Array.from({ length: 16 }, (_, k) => <div key={k} style={{ position: "absolute", left: (k * 137) % 510, top: 180 + ((k * 211 + t * 300) % 680), width: 48, height: 48, borderRadius: 24, background: C.gold, opacity: twinkle(t, k) }} />)}
          <Type size={72} color={C.goldSoft} style={{ position: "absolute", left: 40, top: 110 }}>LEVEL {12 + i}</Type>
        </>
      )}
      {kind === 2 && (
        <>
          <Type size={92} style={{ position: "absolute", left: 36, top: 240, width: 480 }}>you won't BELIEVE this</Type>
          <Icon icon={faStar} size={170} color={C.goldSoft} style={{ position: "absolute", left: 180, top: 640, rotate: `${t * 100}deg` }} />
        </>
      )}
      {kind === 3 && (
        <>
          <Present w={320} h={270} box={C.brandDeep} ribbon={C.berry} lid={0.35 + 0.3 * Math.sin(t * 6)} style={{ left: 110, top: 400 }} />
          <Type size={66} color={C.brandDeep} style={{ position: "absolute", left: 40, top: 130, width: 470 }}>unboxing #{40 + i}</Type>
        </>
      )}
      <div style={{ position: "absolute", right: 22, bottom: 170, display: "flex", flexDirection: "column", gap: 34 }}>
        <Icon icon={faHeart} size={54} /><Icon icon={faCommentDots} size={54} /><Icon icon={faShare} size={54} />
      </div>
      <div style={{ position: "absolute", left: 30, right: 30, bottom: 40, height: 7, borderRadius: 4, background: "rgba(255,255,255,.35)" }}>
        <div style={{ width: `${((t * 90 + i * 37) % 100)}%`, height: "100%", borderRadius: 4, background: "#fff" }} />
      </div>
    </div>
  );
};

/** 0:00. Warm home, a child, a phone. Then the feed: faster and faster, until everything stops. */
export const S01Scroll: React.FC = () => {
  const t = useSceneT("s01");
  const sw = EV.swipes;
  let scroll = 0;
  let rush = 0;
  for (const s of sw) {
    scroll += tw(t, [s, s + 0.15], [0, 1], ease.inOut);
    rush = Math.max(rush, tw(t, [s, s + 0.04], [0, 1]) * tw(t, [s + 0.07, s + 0.15], [1, 0]));
  }
  const page = Math.floor(scroll);
  const frac = scroll - page;

  if (t < CUT) {
    const push = tw(t, [0, CUT], [1, 1.12], ease.linear);
    const phoneOn = 0.75 + 0.25 * Math.sin(t * 7);
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <AbsoluteFill style={{ scale: push, transformOrigin: "36% 62%" }}>
          <Room t={t} />
          <At x={630} y={570}><Kid look={CAST.amani} expr="bored" lookX={-2} size={500} glow={C.brandSoft} glowO={0.5 * phoneOn} blink={t > 1.1 && t < 1.22 ? 1 : 0} /></At>
          <div style={{ position: "absolute", left: 200, top: 770, width: 860, height: 160, borderRadius: 40, background: "#245F5A" }} />
          <Glow x={630} y={690} r={170} color="rgba(190,240,232,.5)" opacity={phoneOn} />
          <div style={{ position: "absolute", left: 595, top: 650, width: 70, height: 122, borderRadius: 14, background: "#0B2623", border: "4px solid #2D3B38", rotate: "4deg" }} />
          <div style={{ position: "absolute", left: 560, top: 740, width: 150, height: 60, borderRadius: 30, background: CAST.amani.skin }} />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  const camera = tw(t, [CUT, EV.stop], [1, 1.14], ease.linear);
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: C.roomDark }}>
      <AbsoluteFill style={{ filter: "blur(22px)", opacity: 0.8, scale: 1.2 }}><Room t={t} sofa={false} /></AbsoluteFill>
      <AbsoluteFill style={{ background: "rgba(5,20,18,.45)" }} />
      <AbsoluteFill style={{ scale: camera }}>
        {/* the spoken verbs */}
        <div style={{ position: "absolute", left: 170, top: 330 }}>
          <Rise t={t} at={W("s01b", "watch")} dur={0.2} size={108}>WATCH.</Rise>
          <Rise t={t} at={W("s01b", "play")} dur={0.2} size={108}>PLAY.</Rise>
          <Rise t={t} at={W("s01b", "scroll")} dur={0.2} size={108}>SCROLL.</Rise>
        </div>
        <Glow x={1280} y={540} r={760} color="rgba(190,240,232,.26)" />
        <div style={{ position: "absolute", left: 1000, top: 34, width: 560, height: 1012, borderRadius: 66, padding: 16, background: "#0B1412", boxShadow: "0 60px 120px rgba(0,0,0,.6), inset 0 0 0 3px #33423F", rotate: "2.5deg" }}>
          <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 52, overflow: "hidden", filter: `blur(${rush * 7}px)` }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: -frac * 980, height: 980 }}><Page i={page} t={t} /></div>
            <div style={{ position: "absolute", left: 0, right: 0, top: 980 - frac * 980, height: 980 }}><Page i={page + 1} t={t} /></div>
            {/* festive lights reflected on the glass */}
            {Array.from({ length: 6 }, (_, i) => <div key={i} style={{ position: "absolute", left: 50 + i * 80, top: 24 + (i % 2) * 14, width: 18, height: 18, borderRadius: 9, background: C.goldSoft, opacity: 0.32 * twinkle(t, i), filter: "blur(4px)" }} />)}
          </div>
        </div>
        {/* the thumb, flicking */}
        <div style={{ position: "absolute", left: 1400, top: 820 - rush * 130, width: 170, height: 340, borderRadius: 86, background: CAST.amani.skin, rotate: "-22deg", boxShadow: "-8px 0 30px rgba(0,0,0,.3)" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
