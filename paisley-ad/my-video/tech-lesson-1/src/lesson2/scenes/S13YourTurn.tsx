import React from "react";
import { faChalkboardUser, faPause } from "@fortawesome/free-solid-svg-icons";
import { Creature, LUMORA, LUMORA_V1 } from "../creature";
import { Ambient, At, C, CAVEAT, DotGrid, E, ease, Icon, L, pop, QUICKSAND, Scene, tw, useScene, W } from "../lib2";
import { Thumb } from "./S08Iterate";

/** 13: leave the video and do it. Thirteen small steps, the coach sees the work, and the path every TECH project takes. */
export const S13YourTurn: React.FC = () => {
  const t = useScene("s13");
  const d = W("s13c", "design") - 0.1;
  const steps = [
    { w: "Name your creature", at: d }, { w: "Define its habitat", at: d + 0.18 }, { w: "Define its special ability", at: d + 0.36 },
    { w: "Define its appearance", at: d + 0.54 }, { w: "Define its personality", at: d + 0.72 },
    { w: "Write your first AI instruction", at: W("s13c", "write") - 0.1 }, { w: "Generate it with an approved AI tool", at: W("s13c", "generate") - 0.1 },
    { w: "Review the result", at: W("s13d", "check") - 0.1 }, { w: "Find one thing to improve", at: W("s13d", "check") + 0.3 },
    { w: "Give AI another instruction", at: W("s13d", "improve") - 0.1 }, { w: "Make the improved version", at: W("s13d", "improve") + 0.3 },
    { w: "Write your AI reflection", at: W("s13e", "reflection") - 0.1 }, { w: "Save your project", at: W("s13e", "save") - 0.1 },
  ];
  const coach = L("s13f") - 0.4;
  const stepsOut = tw(t, [coach - 0.2, coach + 0.3], [1, 0], ease.inOut);
  const path = L("s13g") - 0.3;
  const coachOut = tw(t, [path - 0.2, path + 0.3], [1, 0], ease.inOut);
  const work = [
    { w: "YOUR IDEA", at: W("s13f", "idea") - 0.15, kind: "idea" as const },
    { w: "FIRST TRY", at: W("s13f", "first") - 0.15, kind: "v1" as const },
    { w: "IMPROVED VERSION", at: W("s13f", "improved") - 0.15, kind: "v3" as const },
    { w: "REFLECTION", at: W("s13f", "reflection") - 0.15, kind: "text" as const },
  ];
  const stages = ["LEARN", "PRACTICE", "BUILD", "SUBMIT", "REVIEW", "IMPROVE", "MASTER"].map((w) => ({ w, at: W("s13h", w.toLowerCase()) - 0.1 }));
  const stageCol = [C.sky, C.brandSoft, C.brand, C.violet, C.coral, C.success, C.gold];
  return (
    <Scene id="s13" push={0.02}>
      <Ambient t={t} opacity={0.3} colors={[C.gold, C.brand, C.violet]} />
      <DotGrid />
      {/* A: your turn, step by step */}
      <div style={{ position: "absolute", inset: 0, opacity: stepsOut }}>
        <At x={960} y={110}>
          <div style={{ display: "flex", alignItems: "center", gap: 36, scale: pop(t, L("s13b") - 0.4, 0.5), opacity: t > L("s13b") - 0.4 ? 1 : 0 }}>
            <div style={{ width: 110, height: 110, borderRadius: 55, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 50px ${C.gold}88` }}><Icon icon={faPause} size={50} color={C.night} /></div>
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 110, color: "#fff" }}>YOUR TURN</div>
          </div>
        </At>
        <At x={960} y={225} style={{ opacity: tw(t, [W("s13b", "open") - 0.2, W("s13b", "open") + 0.2], [0, 1]) }}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 32, letterSpacing: "0.2em", color: C.brandSoft }}>PAUSE THE VIDEO · OPEN YOUR TECH WORKSPACE</div>
        </At>
        {steps.map((s, i) => {
          const col = i < 7 ? 0 : 1;
          const row = col ? i - 7 : i;
          return (
            <div key={s.w} style={{ position: "absolute", left: col ? 1000 : 160, top: 300 + row * 98, width: 780, height: 82, borderRadius: 20, display: "flex", alignItems: "center", gap: 22,
              padding: "0 22px", background: "rgba(255,255,255,.06)", border: `1.5px solid ${i >= 7 ? C.success : C.brand}55`,
              opacity: t > s.at ? 1 : 0, translate: `${(1 - tw(t, [s.at, s.at + 0.35], [0, 1])) * 30}px 0` }}>
              <div style={{ width: 52, height: 52, borderRadius: 26, background: i === 9 || i === 10 ? C.success : i >= 11 ? C.gold : C.brand, display: "flex", alignItems: "center",
                justifyContent: "center", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 26, color: C.night, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 34, color: "#fff" }}>{s.w}</div>
            </div>
          );
        })}
      </div>
      {/* B: your coach sees it */}
      <div style={{ position: "absolute", inset: 0, opacity: tw(t, [coach, coach + 0.4], [0, 1]) * coachOut }}>
        <At x={960} y={170}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ width: 90, height: 90, borderRadius: 45, background: C.violet, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon icon={faChalkboardUser} size={46} color="#fff" />
            </div>
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 64, color: "#fff" }}>Your coach can see what you created</div>
          </div>
        </At>
        <At x={960} y={590}>
          <div style={{ display: "flex", gap: 30 }}>
            {work.map((wk) => (
              <div key={wk.w} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, scale: pop(t, wk.at, 0.45), opacity: t > wk.at ? 1 : 0 }}>
                {wk.kind === "idea" && (
                  <div style={{ width: 390, height: 260, borderRadius: 20, background: "#FBF8F1", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    <Creature look={LUMORA} size={250} t={t} uid="s13idea" sketch />
                  </div>
                )}
                {wk.kind === "v1" && <Thumb look={LUMORA_V1} hab="desert" w={390} h={260} t={t} uid="s13v1" />}
                {wk.kind === "v3" && <Thumb look={LUMORA} hab="glow" w={390} h={260} t={t} uid="s13v3" />}
                {wk.kind === "text" && (
                  <div style={{ width: 390, height: 260, borderRadius: 20, background: "#FBF8F1", padding: "22px 26px", fontFamily: CAVEAT, fontWeight: 700, fontSize: 34, lineHeight: 1.15, color: "#2E5BB0" }}>
                    I came up with the idea. AI helped make the image. I changed my description…
                  </div>
                )}
                <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 26, letterSpacing: "0.16em", color: "rgba(255,255,255,.8)" }}>{wk.w}</div>
              </div>
            ))}
          </div>
        </At>
        <At x={960} y={930} style={{ opacity: tw(t, [E("s13f") - 0.3, E("s13f") + 0.2], [0, 1]) }}>
          <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 52, color: C.goldSoft }}>…and help you take it further</div>
        </At>
      </div>
      {/* C: the path */}
      <div style={{ position: "absolute", inset: 0, opacity: tw(t, [path, path + 0.4], [0, 1]) }}>
        <At x={960} y={290}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 60, color: "#fff" }}>Every TECH project follows the same path</div>
        </At>
        <div style={{ position: "absolute", left: 180, right: 180, top: 597, height: 6, borderRadius: 3, background: "rgba(255,255,255,.1)" }}>
          <div style={{ height: "100%", borderRadius: 3, background: `linear-gradient(90deg, ${C.sky}, ${C.brand}, ${C.gold})`,
            width: `${tw(t, [stages[0].at, stages[6].at], [0, 1], ease.inOut) * 100}%` }} />
        </div>
        {stages.map((s, i) => {
          const x = 180 + (i * (1920 - 360)) / 6;
          const on = t > s.at;
          return (
            <React.Fragment key={s.w}>
              <At x={x} y={600}>
                <div style={{ width: 70, height: 70, borderRadius: 35, background: on ? stageCol[i] : "#15231F", border: `4px solid ${on ? stageCol[i] : "rgba(255,255,255,.15)"}`,
                  boxShadow: on ? `0 0 40px ${stageCol[i]}88` : undefined, scale: 1 + 0.3 * Math.max(0, 1 - Math.abs(t - s.at) / 0.3) }} />
              </At>
              <At x={x} y={690}>
                <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: i === 6 ? 40 : 32, letterSpacing: "0.12em", color: on ? stageCol[i] : "rgba(255,255,255,.3)" }}>{s.w}</div>
              </At>
            </React.Fragment>
          );
        })}
        <At x={180 + (2 * (1920 - 360)) / 6} y={790} style={{ opacity: tw(t, [E("s13h") + 0.2, E("s13h") + 0.6], [0, 1]) }}>
          <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 48, color: C.goldSoft, whiteSpace: "nowrap" }}>↑ you just started here</div>
        </At>
      </div>
    </Scene>
  );
};
