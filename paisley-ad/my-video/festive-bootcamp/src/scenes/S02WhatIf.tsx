import React from "react";
import { AbsoluteFill, random } from "remotion";
import { faCode, faCube, faFeatherPointed, faMusic, faPalette, faPencil, faStar, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { Bulb, C, Center, EV, Icon, Rise, ease, life, tw, useSceneT } from "../lib";

const SHAPES = [faPencil, faMusic, faCode, faStar, faPalette, faCube, faWandMagicSparkles, faFeatherPointed];

/** 0:05. Black. One tiny light. The question. Then the screen explodes into colour. */
export const S02WhatIf: React.FC = () => {
  const t = useSceneT("s02");
  const hit = EV.impact;
  const k = t - EV.flicker;
  const flick = k < 0 ? 0 : k < 0.5 ? (Math.sin(k * 55) > -0.1 ? 1 : 0.1) : 1;
  const shake = tw(t, [hit, hit + 0.45], [1, 0]);
  const discs = [C.gold, C.brand, C.brandDeep, C.room];
  const last = tw(t, [hit, hit + 0.6], [0, 1]);
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden", translate: `${Math.sin(t * 90) * 14 * shake}px ${Math.cos(t * 70) * 10 * shake}px` }}>
      <div style={{ position: "absolute", inset: 0, opacity: 1 - last }}><Bulb x={960} y={170} r={8} on={flick} /></div>
      {discs.map((c, i) => {
        const p = tw(t, [hit + i * 0.06, hit + i * 0.06 + 0.42], [0, 1], ease.out);
        return p > 0 ? <div key={c} style={{ position: "absolute", left: 960 - 1300, top: 540 - 1300, width: 2600, height: 2600, borderRadius: "50%", background: c, scale: p }} /> : null;
      })}
      {t >= hit && Array.from({ length: 34 }, (_, i) => {
        const a = random(`a${i}`) * Math.PI * 2;
        const sp = 500 + random(`s${i}`) * 900;
        const p = tw(t, [hit, hit + 0.62], [0, 1], ease.out);
        const x = 960 + Math.cos(a) * sp * p;
        const y = 540 + Math.sin(a) * sp * p * 0.72;
        const col = [C.goldSoft, "#fff", C.brandSoft, C.gold][i % 4];
        const s = 34 + random(`z${i}`) * 58;
        return (
          <div key={i} style={{ position: "absolute", left: x - s / 2, top: y - s / 2, rotate: `${p * 240 * (i % 2 ? 1 : -1)}deg`, opacity: 1 - tw(t, [hit + 0.4, hit + 0.62], [0, 1]) }}>
            {i % 3 === 0 ? <div style={{ width: s * 0.7, height: s * 0.7, background: col }} /> : <Icon icon={SHAPES[i % SHAPES.length]} size={s} color={col} />}
          </div>
        );
      })}
      <AbsoluteFill style={{ background: "#fff", opacity: tw(t, [hit, hit + 0.02], [0, 0.8]) * tw(t, [hit + 0.02, hit + 0.2], [1, 0]) }} />
      <Center style={{ opacity: life(t, EV.whatIf - 0.1, EV.theyCreated + 0.05, 0.05) }}>
        <Rise t={t} at={EV.whatIf} size={128}>WHAT IF...</Rise>
        <Rise t={t} at={EV.thisHoliday} size={128}>THIS HOLIDAY...</Rise>
        <Rise t={t} at={EV.justWatch} size={108} color={C.brandSoft}>THEY DIDN'T JUST WATCH?</Rise>
      </Center>
      <Center style={{ scale: tw(t, [hit, hit + 1.1], [0.96, 1.05], ease.out), filter: "drop-shadow(0 8px 34px rgba(0,0,0,.45))" }}>
        <Rise t={t} at={EV.theyCreated} dur={0.2} size={150} color="#fff">WHAT IF</Rise>
        <Rise t={t} at={EV.theyCreated + 0.08} dur={0.2} size={212} color="#fff">THEY CREATED?</Rise>
      </Center>
    </AbsoluteFill>
  );
};
