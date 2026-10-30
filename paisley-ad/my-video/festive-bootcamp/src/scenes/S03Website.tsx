import React from "react";
import { AbsoluteFill } from "remotion";
import { faPencil } from "@fortawesome/free-solid-svg-icons";
import { At, C, Cursor, EV, Glow, Icon, Rise, ease, life, pop, tw, useSceneT, QUICKSAND } from "../lib";
import { Bubble, CAST, Kid, LaptopBack, Room } from "../art";
import { RealSite } from "../creations";

/** The child's first idea, as a pencil sketch of the page that is about to exist. */
const Sketch: React.FC<{ t: number; at: number }> = ({ t, at }) => {
  const d = tw(t, [at, at + 0.72], [0, 1], ease.inOut);
  const stroke = (s: string, delay: number) => (
    <path d={s} pathLength={1} fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${Math.max(0, Math.min(1, (d - delay) * 2.4))} 2`} opacity={d > delay ? 1 : 0} />
  );
  return (
    <div style={{ position: "relative", width: 1000, height: 640, background: "#FFFDF6", borderRadius: 10, boxShadow: "0 30px 70px rgba(0,0,0,.42)" }}>
      <svg width={1000} height={640} style={{ position: "absolute" }}>
        {stroke("M44 46 L 958 40 L 952 180 L 50 186 Z", 0)}
        {stroke("M48 220 L 310 216 L 316 410 L 52 414 Z", 0.1)}
        {stroke("M350 220 L 640 216 L 642 410 L 354 414 Z", 0.2)}
        {stroke("M680 216 L 950 218 L 948 412 L 684 410 Z", 0.3)}
        {stroke("M50 450 L 470 446 L 472 600 L 52 602 Z", 0.4)}
        {stroke("M510 446 L 948 450 L 944 600 L 512 604 Z", 0.48)}
      </svg>
      {[["OUR CHRISTMAS SITE!!", 80, 76, 66], ["countdown", 90, 290, 38], ["who's coming?", 372, 290, 38], ["photos!", 736, 290, 38], ["dinner + gifts", 110, 500, 38], ["playlist + funny facts", 530, 500, 34]].map(([s, x, y, fs], i) => (
        <div key={i} style={{ position: "absolute", left: x as number, top: y as number, fontFamily: QUICKSAND, fontWeight: 600, fontSize: fs as number, color: C.ink, rotate: "-1.5deg", opacity: tw(t, [at + 0.08 + i * 0.08, at + 0.16 + i * 0.08], [0, 1]) }}>{s}</div>
      ))}
    </div>
  );
};

/** 0:08. "Imagine your child building the family Christmas website." Idea, sketch, site, family. */
export const S03Website: React.FC = () => {
  const t = useSceneT("s03");
  const build = EV.siteBuild;
  const fam = EV.family;
  const toSite = tw(t, [build - 0.06, build + 0.25], [0, 1], ease.inOut);

  if (t >= fam) {
    const camera = tw(t, [fam, fam + 1.6], [1.06, 1], ease.out);
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <AbsoluteFill style={{ scale: camera }}>
          <Room t={t} sofa={false} />
          <Glow x={1180} y={560} r={720} color="rgba(255,235,170,.42)" />
          <At x={1490} y={560}><Kid look={CAST.gran} expr="laugh" size={400} glow={C.goldSoft} /></At>
          <At x={830} y={530}><Kid look={CAST.dad} expr="wow" size={430} lookX={3} glow={C.goldSoft} /></At>
          <At x={1170} y={540}><Kid look={CAST.mum} expr="laugh" size={430} glow={C.goldSoft} /></At>
          <At x={1140} y={850}><LaptopBack w={640} /></At>
          <At x={320} y={640}><Kid look={CAST.amani} expr="proud" lookX={6} size={510} /></At>
        </AbsoluteFill>
        <At x={620} y={150} style={{ scale: pop(t, EV.madeThis), opacity: 1 - tw(t, [EV.whyNot - 0.05, EV.whyNot + 0.08], [0, 1]) }}>
          <Bubble size={76} tail="r" style={{ whiteSpace: "nowrap" }}>"YOU MADE THIS?"</Bubble>
        </At>
        <AbsoluteFill style={{ background: "rgba(6,21,19,.62)", opacity: tw(t, [EV.whyNot, EV.whyNot + 0.1], [0, 1]) }} />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", scale: tw(t, [EV.whyNot, EV.whyNot + 0.34], [0.72, 1], ease.back) }}>
          <Rise t={t} at={EV.whyNot} dur={0.22} size={290} color={C.gold} glow="rgba(245,200,66,.5)">WHY NOT?</Rise>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  const kidP = tw(t, [EV.sketch - 0.3, EV.sketch], [0, 1]);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Room t={t} sofa={false} dim={0.3 + toSite * 0.35} px={-toSite * 60} />
      <AbsoluteFill style={{ opacity: 1 - toSite }}>
        <At x={1500} y={700} style={{ translate: `${(1 - kidP) * 80}px 0` }}><Kid look={CAST.amani} expr="focus" lookX={-6} size={560} glow={C.goldSoft} glowO={0.4} /></At>
        <At x={1500} y={160} style={{ scale: pop(t, SCENE_IN) }}>
          <Bubble w={640} size={52} tail="r">"I WANT TO MAKE OUR CHRISTMAS WEBSITE."</Bubble>
        </At>
      </AbsoluteFill>
      <At x={660 + toSite * 300} y={560 - toSite * 20} style={{ scale: 1 + toSite * 0.28, rotate: `${-2 * (1 - toSite)}deg`, opacity: 1 - tw(t, [build + 0.12, build + 0.22], [0, 1]) }}>
        <Sketch t={t} at={EV.sketch} />
        <div style={{ position: "absolute", left: 60 + tw(t, [EV.sketch, build], [0, 800], ease.linear), top: 120 + Math.abs(Math.sin(t * 9)) * 340, opacity: 1 - toSite }}>
          <Icon icon={faPencil} size={84} color={C.warn} style={{ rotate: "-6deg" }} />
        </div>
      </At>
      <At x={960} y={540} style={{ scale: 0.86 + toSite * 0.16, opacity: tw(t, [build + 0.05, build + 0.18], [0, 1]) }}>
        <RealSite t={t} at={build + 0.08} step={0.06} confirmAt={fam - 0.42} />
      </At>
      {t > build && (
        <Cursor x={tw(t, [build + 0.5, fam - 0.45], [1010, 1566], ease.inOut)} y={tw(t, [build + 0.5, fam - 0.45], [930, 684], ease.inOut)} press={life(t, fam - 0.48, fam - 0.36, 0.04)} scale={1.4} />
      )}
    </AbsoluteFill>
  );
};

const SCENE_IN = EV.sketch - 0.34;
