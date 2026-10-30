import React from "react";
import { AbsoluteFill } from "remotion";
import { faCamera, faCode, faMicrophone, faPalette, faPencil, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { At, Bulb, C, Center, E, EV, Glow, Icon, L, LightString, Rise, W, ease, life, pop, tw, twinkle, useSceneT } from "../lib";
import { CAST, Kid, LaptopBack, Tree } from "../art";

const TOOLS = [faPencil, faCode, faPalette, faMicrophone, faCamera, faWandMagicSparkles];

/** 0:23. Slow. Black. One light. The line the whole film has been building to. */
export const S06Tools: React.FC = () => {
  const t = useSceneT("s06");
  const lift = tw(t, [EV.ceiling, EV.ceiling + 0.65], [0, 1], ease.inOut);
  const lets = EV.letsSee;
  const flood = tw(t, [lets - 0.1, lets + 0.25], [0, 1], ease.inOut);
  const words = ["LET'S", "SEE", "WHAT", "YOU", "CAN", "MAKE."];
  const wordAt = ["let's", "see", "what", "you", "can", "make"].map((w) => W("s06e", w) - 0.04);
  const place = life(t, EV.place, EV.someone - 0.05, 0.25);
  const someone = life(t, EV.someone + 0.1, lets + 0.05, 0.4);
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <Bulb x={960} y={120} r={8} on={twinkle(t, 3, 0.6) * (1 - place)} />

      {/* the ceiling: a low line of lights that lifts away on the word */}
      <AbsoluteFill style={{ translate: `0 ${-lift * 480}px`, opacity: tw(t, [L("s06a") - 0.1, L("s06a") + 0.3], [0, 1]) * (1 - lift * 0.3) }}>
        {Array.from({ length: 26 }, (_, i) => <Bulb key={i} x={40 + i * 74} y={286 - lift * (i % 3) * 90} r={6} on={twinkle(t, i)} />)}
      </AbsoluteFill>
      <Center style={{ opacity: 1 - tw(t, [EV.tools - 0.1, EV.tools + 0.02], [0, 1]) }}>
        <Rise t={t} at={L("s06a")} size={118}>THEIR IMAGINATION</Rise>
        <Rise t={t} at={W("s06a", "doesn't")} size={118}>DOESN'T NEED A <span style={{ color: C.gold }}>CEILING.</span></Rise>
      </Center>

      <Center style={{ opacity: life(t, EV.tools, EV.place + 0.02, 0.06) }}>
        <Rise t={t} at={EV.tools} dur={0.25} size={150}>IT NEEDS TOOLS.</Rise>
        <div style={{ display: "flex", gap: 50, marginTop: 56 }}>
          {TOOLS.map((ic, i) => (
            <div key={i} style={{ width: 118, height: 118, borderRadius: 34, background: C.brandDeep, display: "grid", placeItems: "center", scale: pop(t, EV.tools + 0.08 + i * 0.07, 0.3) }}>
              <Icon icon={ic} size={58} color={i % 2 ? C.goldSoft : "#fff"} />
            </div>
          ))}
        </div>
      </Center>

      <AbsoluteFill style={{ opacity: place }}>
        <Glow x={960} y={760} r={820} color="rgba(245,200,66,.3)" />
        <LightString t={t} y={40} sag={46} bulbs={25} />
        <Tree t={t} x={1610} y={480} h={500} lights={30} />
        <At x={960} y={830}><LaptopBack w={420} /></At>
        <At x={960} y={350}><Rise t={t} at={EV.place} dur={0.3} size={124}>IT NEEDS A PLACE TO BUILD.</Rise></At>
      </AbsoluteFill>

      <AbsoluteFill style={{ opacity: someone }}>
        <Glow x={960} y={760} r={980} color="rgba(85,191,179,.5)" />
        <At x={1420} y={790} style={{ translate: `0 ${tw(t, [EV.someone, EV.someone + 2.6], [20, 0], ease.linear)}px` }}><Kid look={CAST.mum} expr="smile" lookX={-7} size={490} /></At>
        <At x={500} y={850} style={{ translate: `0 ${tw(t, [EV.someone, EV.someone + 2.6], [30, 0], ease.linear)}px` }}><Kid look={CAST.neema} expr="wow" lookX={7} size={420} /></At>
        <At x={960} y={250}><Rise t={t} at={W("s06d", "needs") - 0.1} size={108}>IT NEEDS SOMEONE TO SAY...</Rise></At>
      </AbsoluteFill>

      {/* "Let's see what you can make." */}
      <AbsoluteFill style={{ background: C.gold, clipPath: `circle(${flood * 2300}px at 960px 120px)` }}>
        <Center style={{ scale: tw(t, [lets, E("s06e") + 0.4], [0.97, 1.04], ease.linear) }}>
          {[words.slice(0, 2), words.slice(2)].map((row, r) => (
            <div key={r} style={{ display: "flex", gap: 40 }}>
              {row.map((w, i) => {
                const k = r === 0 ? i : i + 2;
                return <Rise key={w} t={t} at={wordAt[k]} dur={0.2} size={r === 0 ? 240 : 164} color={C.brandDeep} style={{ padding: "0.04em 0.02em 0.1em" }}>{w}</Rise>;
              })}
            </div>
          ))}
        </Center>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
