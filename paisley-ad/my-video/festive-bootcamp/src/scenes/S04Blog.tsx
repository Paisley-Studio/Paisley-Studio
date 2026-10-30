import React from "react";
import { AbsoluteFill } from "remotion";
import { faCheck, faXmark, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { At, C, Center, EV, Icon, LightString, Rise, SCENES, Type, ease, pop, tw, useSceneT } from "../lib";
import { Bubble, CAST, Kid } from "../art";
import { RealBlog } from "../creations";

/** 0:12. Another creator. A holiday becomes a story; AI offers, the child decides. */
export const S04Blog: React.FC = () => {
  const t = useSceneT("s04");
  const a = SCENES.s04[0];
  const panel = tw(t, [EV.keeping, EV.keeping + 0.2], [0, 1], ease.inOut);
  const chips = [
    { s: "Start with the ocean", ok: true, at: EV.aiChips },
    { s: "Add a dragon", ok: false, at: EV.aiChips + 0.12 },
    { s: "Make it about patience", ok: true, at: EV.aiChips + 0.24 },
  ];
  return (
    <AbsoluteFill style={{ background: C.brand, overflow: "hidden" }}>
      <LightString t={t} y={20} sag={40} bulbs={25} wire="rgba(4,35,31,.35)" />
      <At x={340} y={740} style={{ scale: tw(t, [a, a + 0.3], [0.9, 1]) }}><Kid look={CAST.zawadi} expr="smile" lookX={6} size={560} /></At>
      <At x={430} y={250} style={{ scale: pop(t, a + 0.04, 0.28) }}>
        <Bubble w={660} size={54}>"WHAT IF I TURNED MY HOLIDAY INTO A STORY?"</Bubble>
      </At>
      <At x={1340} y={tw(t, [EV.blogBuild - 0.12, EV.blogBuild + 0.22], [1500, 560])} style={{ rotate: "1deg", scale: 0.96 }}>
        <RealBlog t={t} at={EV.blogBuild} w={1080} />
      </At>
      {/* AI suggests. The child decides what stays. */}
      <div style={{ position: "absolute", left: 760, top: 900, display: "flex", gap: 14 }}>
        <div style={{ width: 66, height: 66, borderRadius: 33, background: C.brandDeep, display: "grid", placeItems: "center", opacity: tw(t, [chips[0].at - 0.1, chips[0].at], [0, 1]) }}><Icon icon={faWandMagicSparkles} size={30} color={C.goldSoft} /></div>
        {chips.map((c) => (
          <div key={c.s} style={{ scale: pop(t, c.at, 0.25), display: "flex", gap: 10, alignItems: "center", height: 66, padding: "0 22px", borderRadius: 33, background: c.ok ? "#fff" : "rgba(255,255,255,.55)" }}>
            <Icon icon={c.ok ? faCheck : faXmark} size={26} color={c.ok ? C.brandDeep : C.berry} />
            <Type size={27} color={c.ok ? C.brandDeep : C.muted} style={{ whiteSpace: "nowrap", textDecoration: c.ok ? undefined : "line-through" }}>{c.s}</Type>
          </div>
        ))}
      </div>
      <AbsoluteFill style={{ background: C.brandDeep, clipPath: `inset(${(1 - panel) * 100}% 0 0 0)` }}>
        <LightString t={t} y={20} sag={40} bulbs={25} />
        <Center>
          <Rise t={t} at={EV.keeping + 0.06} dur={0.28} size={112}>NOT JUST A HOLIDAY.</Rise>
          <Rise t={t} at={EV.keeping + 0.3} dur={0.3} size={138} color={C.gold}>A STORY WORTH KEEPING.</Rise>
        </Center>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
