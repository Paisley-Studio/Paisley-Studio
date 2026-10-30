import React from "react";
import { faArrowRight, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { LUMORA, LUMORA_V1, LUMORA_V2, Picture, type HabitatKind, type Look } from "../creature";
import { Ambient, At, C, CAVEAT, DotGrid, E, ease, Generated, Icon, L, life, pop, PromptBox, QUICKSAND, Scene, Tag, tw, useScene, W } from "../lib2";
import { Steps } from "./S07Check";

const PW = 900, PH = 560; // centre on screen (960, 450)

/** A small framed version of the creature. */
export const Thumb: React.FC<{ look: Look; hab: HabitatKind; w: number; h: number; t: number; uid: string; label?: string; glow?: number }> = ({ look, hab, w, h, t, uid, label, glow = 0 }) => (
  <div style={{ position: "relative", width: w, height: h, borderRadius: 20, overflow: "hidden", border: `2px solid ${glow ? C.gold : "rgba(255,255,255,.16)"}`,
    boxShadow: glow ? `0 0 ${50 * glow}px ${C.gold}88` : "0 30px 70px rgba(0,0,0,.45)" }}>
    <Picture look={look} habitat={hab} w={w} h={h} t={t} uid={uid} />
    {label && <div style={{ position: "absolute", left: 12, top: 10 }}><Tag color="#fff" size={15}>{label}</Tag></div>}
  </div>
);

/** 08: check again, improve again, version 3. Then the whole journey, and the loop creators use. */
export const S08Iterate: React.FC = () => {
  const t = useScene("s08");
  const stepAt: [number, number, number] = [W("s08a", "check") - 0.1, W("s08a", "tail") - 0.1, W("s08b", "improve") - 0.1];
  const send = E("s08b") + 0.1;
  const done = L("s08c") - 0.1;
  const journey = L("s08e") - 0.6;
  const phaseA = tw(t, [journey - 0.2, journey + 0.3], [1, 0], ease.inOut);
  const loop = L("s08l") - 0.4;
  const chainOut = tw(t, [loop - 0.2, loop + 0.3], [1, 0], ease.inOut);
  const typeAt = W("s08b", "make") - 0.05;
  const text = "Make the tail long and golden, and let it glow.";
  const chain: { kind: "v" | "s"; w: string; at: number; look?: Look; hab?: HabitatKind; c?: string }[] = [
    { kind: "v", w: "VERSION 1", at: W("s08e", "version", 0), look: LUMORA_V1, hab: "desert" },
    { kind: "s", w: "CHECK", at: W("s08e", "check"), c: C.sky },
    { kind: "s", w: "THINK", at: W("s08e", "think"), c: C.gold },
    { kind: "v", w: "VERSION 2", at: W("s08e", "version", 1), look: LUMORA_V2, hab: "glow" },
    { kind: "s", w: "IMPROVE", at: W("s08e", "improve"), c: C.success },
    { kind: "v", w: "VERSION 3", at: W("s08e", "version", 2), look: LUMORA, hab: "glow" },
  ];
  const lines = [
    { id: "s08f", w: "That's how creators use AI." },
    { id: "s08g", w: "You don't just accept the first result." },
    { id: "s08h", w: "You look at it." },
    { id: "s08i", w: "You decide what's working." },
    { id: "s08j", w: "You decide what isn't." },
    { id: "s08k", w: "Then you improve it." },
  ];
  const curLine = lines.reduce((k, l, i) => (t >= L(l.id) - 0.15 ? i : k), -1);
  const highlight = (i: number) => {
    if (curLine === 1 || curLine === 2) return i === 0 ? 1 : 0;
    if (curLine === 3 || curLine === 4) return i === 3 ? 1 : 0;
    if (curLine === 5) return i === 5 ? 1 : 0;
    return 0;
  };
  return (
    <Scene id="s08" push={0.02}>
      <Ambient t={t} opacity={0.3} colors={[C.success, C.gold, C.brand]} />
      <DotGrid />
      {/* A: check again, improve again */}
      <div style={{ position: "absolute", inset: 0, opacity: phaseA }}>
        <At x={960} y={70}><Steps t={t} at={stepAt} /></At>
        <At x={960} y={450}>
          <div style={{ position: "relative", width: PW, height: PH }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: 28, overflow: "hidden", border: "2px solid rgba(255,255,255,.14)", boxShadow: "0 50px 120px rgba(0,0,0,.55)" }}>
              <Picture look={LUMORA_V2} habitat="glow" w={PW} h={PH} t={t} uid="s08v2" />
            </div>
            {t >= send && (
              <div style={{ position: "absolute", inset: 0 }}>
                <Generated t={t} at={send + 0.1} dur={done - send - 0.3} w={PW} h={PH} seed="v3" radius={28}>
                  <Picture look={LUMORA} habitat="glow" w={PW} h={PH} t={t} uid="s08v3" />
                </Generated>
              </div>
            )}
            <div style={{ position: "absolute", left: 20, top: 18 }}><Tag color="#fff" dark={t >= done} size={18}>{t >= done ? "VERSION 3" : "VERSION 2"}</Tag></div>
          </div>
        </At>
        <svg width={260} height={190} style={{ position: "absolute", left: 1045 - 130, top: 575 - 95, overflow: "visible" }}>
          <ellipse cx={130} cy={95} rx={110} ry={72} fill="none" stroke={C.error} strokeWidth={7} pathLength={1} strokeLinecap="round"
            strokeDasharray={`${tw(t, [W("s08a", "tail"), W("s08a", "tail") + 0.5], [0, 1], ease.inOut) * tw(t, [send - 0.2, send + 0.2], [1, 0])} 2`} />
        </svg>
        <At x={1440} y={640} style={{ opacity: life(t, W("s08a", "short"), send, 0.25), rotate: "-4deg" }}>
          <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 54, color: C.coral, background: "rgba(7,16,13,.75)", padding: "0 20px", borderRadius: 14 }}>short… not golden</div>
        </At>
        <At x={960} y={900} style={{ opacity: tw(t, [typeAt - 0.4, typeAt], [0, 1]) }}>
          <PromptBox t={t} at={typeAt} text={text} cps={text.length / (E("s08b") - typeAt - 0.3)} width={1200} size={30} send={send} label="IMPROVE · NEW INSTRUCTION" />
        </At>
        <At x={1500} y={260} style={{ opacity: tw(t, [done, done + 0.3], [0, 1]), scale: pop(t, done + 0.1, 0.5), rotate: "5deg" }}>
          <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 84, color: C.gold, textShadow: `0 0 40px ${C.gold}` }}>Lumora ✦</div>
        </At>
      </div>
      {/* B: the journey */}
      <At x={960} y={360} style={{ opacity: tw(t, [journey, journey + 0.4], [0, 1]) * chainOut }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {chain.map((c, i) => (
            <React.Fragment key={c.w}>
              {i > 0 && <Icon icon={faArrowRight} size={34} color="rgba(255,255,255,.5)" style={{ opacity: t > c.at - 0.1 ? 1 : 0.15 }} />}
              <div style={{ scale: pop(t, c.at - 0.1, 0.4) * (1 + 0.06 * highlight(i)), opacity: t > c.at - 0.1 ? 1 : 0 }}>
                {c.kind === "v" ? (
                  <Thumb look={c.look!} hab={c.hab!} w={290} h={194} t={t} uid={`s08c${i}`} label={c.w} glow={highlight(i)} />
                ) : (
                  <div style={{ padding: "14px 22px", borderRadius: 999, background: `${c.c}26`, border: `2.5px solid ${c.c}`, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 26,
                    letterSpacing: "0.14em", color: c.c }}>{c.w}</div>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>
      </At>
      <At x={960} y={110} style={{ opacity: tw(t, [journey, journey + 0.4], [0, 1]) * chainOut }}>
        <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 30, letterSpacing: "0.3em", color: "rgba(255,255,255,.65)" }}>THE JOURNEY</div>
      </At>
      {lines.map((l, i) => (
        <At key={l.id} x={960} y={720} style={{ opacity: curLine === i ? tw(t, [L(l.id) - 0.15, L(l.id) + 0.15], [0, 1]) * chainOut : 0 }}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: i === 0 ? 84 : 76, color: i === 0 ? C.gold : "#fff", whiteSpace: "nowrap",
            translate: `0 ${(1 - tw(t, [L(l.id) - 0.15, L(l.id) + 0.3], [0, 1])) * 30}px` }}>{l.w}</div>
        </At>
      ))}
      <At x={960} y={860} style={{ opacity: tw(t, [L("s08h") - 0.2, L("s08h") + 0.2], [0, 1]) * chainOut }}>
        <div style={{ display: "flex", gap: 20 }}>
          {[{ w: "LOOK", id: "s08h", c: C.sky }, { w: "✓ WORKING", id: "s08i", c: C.success }, { w: "✗ ISN'T", id: "s08j", c: C.coral }, { w: "IMPROVE", id: "s08k", c: C.gold }].map((x) => (
            <div key={x.w} style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 26, letterSpacing: "0.14em", color: x.c, border: `2px solid ${x.c}`, borderRadius: 999, padding: "8px 22px",
              opacity: t > L(x.id) - 0.15 ? 1 : 0.15 }}>{x.w}</div>
          ))}
        </div>
      </At>
      {/* C: the loop */}
      <At x={960} y={540} style={{ opacity: tw(t, [loop, loop + 0.4], [0, 1]) }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 40 }}>
          {[{ w: "CREATE", c: C.coral, at: W("s08l", "create") }, { w: "CHECK", c: C.sky, at: W("s08l", "check") }, { w: "IMPROVE", c: C.success, at: W("s08l", "improve") }].map((x, i) => (
            <React.Fragment key={x.w}>
              {i > 0 && <Icon icon={faArrowRight} size={60} color="rgba(255,255,255,.6)" style={{ opacity: t > x.at - 0.15 ? 1 : 0 }} />}
              <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 104, color: x.c, scale: pop(t, x.at - 0.12, 0.45), opacity: t > x.at - 0.12 ? 1 : 0,
                textShadow: `0 0 50px ${x.c}66` }}>{x.w}</div>
            </React.Fragment>
          ))}
        </div>
      </At>
      <At x={960} y={760} style={{ opacity: tw(t, [W("s08l", "improve") + 0.3, W("s08l", "improve") + 0.8], [0, 1]) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 32, letterSpacing: "0.24em", color: "rgba(255,255,255,.7)" }}>
          <Icon icon={faRotateRight} size={40} color={C.gold} style={{ rotate: `${t * 120}deg` }} /> AND AGAIN, UNTIL IT'S YOURS
        </div>
      </At>
    </Scene>
  );
};
