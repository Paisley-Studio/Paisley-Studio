import React from "react";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Kid } from "../../art";
import { LUMORA_V1, LUMORA_V2, Picture } from "../creature";
import { Ambient, At, C, CAVEAT, DotGrid, E, ease, Generated, Icon, L, pop, PromptBox, QUICKSAND, Scene, Tag, ThinkTimer, tw, useScene, W } from "../lib2";

export const IMPROVE_PROMPT = "Keep the creature's design, but change it to four wings and place it inside a glowing rainforest. Make its expression friendly.";

/** CHECK / THINK / IMPROVE as a step bar; the step whose time has come is lit. */
export const Steps: React.FC<{ t: number; at: [number, number, number] }> = ({ t, at }) => {
  const steps = [
    { w: "CHECK", c: C.sky }, { w: "THINK", c: C.gold }, { w: "IMPROVE", c: C.success },
  ];
  const cur = at.reduce((k, a, i) => (t >= a ? i : k), -1);
  return (
    <div style={{ display: "flex", gap: 18 }}>
      {steps.map((s, i) => (
        <div key={s.w} style={{ padding: "12px 34px", borderRadius: 999, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 30, letterSpacing: "0.2em",
          background: cur === i ? s.c : i < cur ? `${s.c}33` : "rgba(255,255,255,.05)", color: cur === i ? C.night : i < cur ? s.c : "rgba(255,255,255,.4)",
          border: `2px solid ${i <= cur ? s.c : "rgba(255,255,255,.15)"}`, scale: 1 + 0.1 * Math.max(0, 1 - Math.abs(t - at[i]) / 0.3) }}>
          {i + 1} · {s.w}
        </div>
      ))}
    </div>
  );
};

const PW = 900, PH = 560; // the picture; centre on screen (1290, 470)

/** 07: the human comes back in. Check what's wrong, think what must change, improve with a new instruction. */
export const S07Check: React.FC = () => {
  const t = useScene("s07");
  const stepAt: [number, number, number] = [W("s07b", "check") - 0.1, W("s07f", "think") - 0.1, W("s07g", "improve") - 0.1];
  const send = E("s07h") + 0.1;
  const fixed = L("s07i") - 0.1;
  const rows = [
    { want: "four wings", got: "two wings", at: L("s07c"), fix: "→ four wings", ring: [1120, 420, 300, 230] },
    { want: "glowing rainforest", got: "a desert", at: L("s07d"), fix: "→ glowing rainforest", ring: [1630, 300, 190, 190] },
    { want: "friendly", got: "a bit scary", at: L("s07e"), fix: "→ friendly face", ring: [1290, 490, 240, 170] },
  ];
  const think = stepAt[1];
  const imp = stepAt[2];
  const typeAt = W("s07h", "keep") - 0.05;
  return (
    <Scene id="s07" push={0.02}>
      <Ambient t={t} opacity={0.28} colors={[C.sky, C.gold, C.success]} />
      <DotGrid />
      <At x={960} y={70} style={{ opacity: tw(t, [L("s07a") - 0.3, L("s07a") + 0.2], [0, 1]) }}>
        <Steps t={t} at={stepAt} />
      </At>
      {/* you, looking */}
      <At x={110} y={905} style={{ opacity: tw(t, [L("s07a") - 0.3, L("s07a") + 0.4], [0, 1]), translate: `${(1 - tw(t, [L("s07a") - 0.3, L("s07a") + 0.6], [0, 1])) * -80}px 0` }}>
        <Kid size={160} look={0.9} arm={tw(t, [L("s07c") - 0.3, L("s07c")], [0, 0.55]) * tw(t, [imp, imp + 0.3], [1, 0])} />
      </At>
      <At x={130} y={700} style={{ opacity: tw(t, [L("s07a"), L("s07a") + 0.3], [0, 1]) * tw(t, [L("s07b"), L("s07b") + 0.3], [1, 0]) }}>
        <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 48, color: C.goldSoft, whiteSpace: "nowrap" }}>my turn!</div>
      </At>
      {/* the picture: version 1, then version 2 */}
      <At x={1290} y={470}>
        <div style={{ position: "relative", width: PW, height: PH }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 28, overflow: "hidden", border: "2px solid rgba(255,255,255,.14)", boxShadow: "0 50px 120px rgba(0,0,0,.55)" }}>
            <Picture look={LUMORA_V1} habitat="desert" w={PW} h={PH} t={t} uid="s07v1" />
          </div>
          {t >= send && (
            <div style={{ position: "absolute", inset: 0 }}>
              <Generated t={t} at={send + 0.1} dur={fixed - send - 0.3} w={PW} h={PH} seed="v2" radius={28}>
                <Picture look={LUMORA_V2} habitat="glow" w={PW} h={PH} t={t} uid="s07v2" />
              </Generated>
            </div>
          )}
          <div style={{ position: "absolute", left: 20, top: 18 }}><Tag color="#fff" dark={t >= fixed} size={18}>{t >= fixed ? "VERSION 2" : "VERSION 1"}</Tag></div>
        </div>
      </At>
      {/* the rings around what's wrong */}
      {rows.map((r) => {
        const [x, y, rw, rh] = r.ring;
        const p = tw(t, [r.at + 0.4, r.at + 0.9], [0, 1], ease.inOut) * tw(t, [send - 0.2, send + 0.2], [1, 0]);
        return (
          <svg key={r.want} width={rw + 40} height={rh + 40} style={{ position: "absolute", left: x - rw / 2 - 20, top: y - rh / 2 - 20, overflow: "visible", opacity: p > 0 ? 1 : 0 }}>
            <ellipse cx={rw / 2 + 20} cy={rh / 2 + 20} rx={rw / 2} ry={rh / 2} fill="none" stroke={C.error} strokeWidth={7} strokeLinecap="round" pathLength={1}
              strokeDasharray={`${p} 2`} transform={`rotate(-8 ${rw / 2 + 20} ${rh / 2 + 20})`} />
          </svg>
        );
      })}
      {/* the check list */}
      <At x={480} y={500}>
        <div style={{ width: 560, display: "flex", flexDirection: "column", gap: 22, opacity: tw(t, [imp - 0.3, imp + 0.1], [1, 0]) }}>
          {rows.map((r) => {
            const ok = t >= fixed;
            return (
              <div key={r.want} style={{ borderRadius: 22, background: "rgba(10,20,17,.88)", border: `2px solid ${(t >= think ? C.gold : C.error)}66`, padding: "18px 24px",
                opacity: tw(t, [r.at - 0.1, r.at + 0.3], [0, 1]), translate: `${(1 - tw(t, [r.at - 0.1, r.at + 0.4], [0, 1])) * -40}px 0` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <Icon icon={ok ? faCheck : faXmark} size={34} color={ok ? C.success : C.error} />
                  <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 30, color: "#fff" }}>
                    wanted <span style={{ color: C.goldSoft }}>{r.want}</span>
                  </div>
                </div>
                <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 40, color: t >= think ? C.gold : C.coral, marginLeft: 50 }}>
                  {t >= think ? r.fix : `got ${r.got}`}
                </div>
              </div>
            );
          })}
        </div>
      </At>
      <At x={560} y={900} style={{ opacity: tw(t, [think, think + 0.3], [0, 1]) * tw(t, [imp - 0.3, imp], [1, 0]) }}>
        <ThinkTimer t={t} from={E("s07f") + 0.1} to={imp - 0.2} label="WHAT NEEDS TO CHANGE?" />
      </At>
      {/* improve: a new instruction */}
      <At x={960} y={890} style={{ opacity: tw(t, [imp - 0.1, imp + 0.4], [0, 1]), translate: `0 ${(1 - tw(t, [imp - 0.1, imp + 0.5], [0, 1])) * 60}px` }}>
        <PromptBox t={t} at={typeAt} text={IMPROVE_PROMPT} cps={IMPROVE_PROMPT.length / (E("s07h") - typeAt - 0.3)} width={1500} size={28} send={send} label="IMPROVE · NEW INSTRUCTION" />
      </At>
      <At x={1600} y={215} style={{ opacity: tw(t, [fixed, fixed + 0.3], [0, 1]), scale: pop(t, fixed, 0.45), rotate: "5deg" }}>
        <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 64, color: C.success, background: "rgba(7,16,13,.75)", padding: "0 24px", borderRadius: 16 }}>much closer!</div>
      </At>
    </Scene>
  );
};
