import React from "react";
import { faBrain, faCheck, faMagnifyingGlass, faPalette, faRobot, faScrewdriverWrench, faStar, faThumbsDown, faThumbsUp, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Landscape } from "../art";
import { At, C, ease, Icon, L, life, pop, QUICKSAND, Scene, SCENES, tw, useT, W } from "../lib";

const ROWS = [400, 620, 840];
const Verb: React.FC<{ t: number; at: number; text: string; side: "l" | "r"; color: string; y: number }> = ({ t, at, text, side, color, y }) => (
  <div style={{ position: "absolute", top: y - 40, [side === "l" ? "right" : "left"]: 960 + 50, width: 400, textAlign: side === "l" ? "right" : "left",
    fontFamily: QUICKSAND, fontWeight: 700, fontSize: 64, color, opacity: tw(t, [at - 0.1, at + 0.15], [0, 1]),
    translate: `${(1 - pop(t, at - 0.1)) * (side === "l" ? -40 : 40)}px 0` } as React.CSSProperties}>{text}</div>
);

export const S09YouAndAI: React.FC = () => {
  const t = useT() + SCENES.s09[0];
  const split = tw(t, [L("s09a") - 0.3, L("s09a") + 0.6], [0, 1], ease.inOut);
  const brainStage = tw(t, [L("s09e") - 0.4, L("s09e") + 0.4], [0, 1], ease.inOut);
  const plus = tw(t, [L("s09g") - 0.35, L("s09g") + 0.5], [0, 1], ease.inOut);
  const gen = W("s09b", "generates"), dec = W("s09b", "decide");
  const sug = W("s09c", "suggests"), jud = W("s09c", "judge");
  const hlp = W("s09d", "helps"), cre = W("s09d", "create");
  const capable = W("s09f", "capable");
  const grow = tw(t, [W("s09f", "make") - 0.2, capable + 0.4], [0, 1], ease.inOut);

  return (
    <Scene id="s09" push={0.02}>
      {/* split: AI | YOU */}
      <div style={{ position: "absolute", inset: 0, opacity: 1 - brainStage }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 960, background: `linear-gradient(160deg, #0C2A26, #07100D)`, translate: `${(1 - split) * -960}px 0` }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 960, background: `linear-gradient(200deg, #4D3A0E, #221A08)`, translate: `${(1 - split) * 960}px 0` }} />
        <div style={{ position: "absolute", left: 958, top: 0, width: 4, height: `${split * 100}%`, background: `linear-gradient(${C.brand}, ${C.gold})`, boxShadow: `0 0 30px ${C.gold}` }} />
        <At x={480} y={170}><div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 150, color: C.brand, opacity: split, textShadow: `0 0 50px ${C.brand}66` }}>AI</div></At>
        <At x={1440} y={170}><div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 150, color: C.gold, opacity: tw(t, [W("s09a", "you") - 0.1, W("s09a", "you") + 0.2], [0, 1]), textShadow: `0 0 50px ${C.gold}66` }}>YOU</div></At>

        {/* generates / decides */}
        <Verb t={t} at={gen} text="generates" side="l" color={C.brandSoft} y={ROWS[0]} />
        <Verb t={t} at={dec} text="decide" side="r" color={C.goldSoft} y={ROWS[0]} />
        {[0, 1, 2, 3].map((i) => {
          const chosen = i === 2;
          const fly = chosen ? tw(t, [dec, dec + 0.6], [0, 1], ease.inOut) : 0;
          const x = 120 + i * 110 + fly * (1480 - 120 - i * 110);
          return (
            <At key={i} x={x} y={ROWS[0] + 4} style={{ scale: pop(t, gen + i * 0.08) * (1 + fly * 0.3), opacity: t > gen + i * 0.08 ? (t > dec + 0.2 && !chosen ? 0.35 : 1) : 0 }}>
              <div style={{ width: 96, height: 120, borderRadius: 14, overflow: "hidden", border: chosen && fly > 0.9 ? `3px solid ${C.gold}` : "2px solid rgba(255,255,255,.2)", position: "relative" }}>
                <div style={{ filter: `hue-rotate(${i * 70}deg)` }}><Landscape w={96} h={120} /></div>
                {chosen && fly > 0.95 && <div style={{ position: "absolute", right: 4, top: 4, width: 32, height: 32, borderRadius: 16, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", scale: pop(t, dec + 0.6) }}><Icon icon={faCheck} size={18} color={C.ink} /></div>}
              </div>
            </At>
          );
        })}

        {/* suggests / judges */}
        <Verb t={t} at={sug} text="suggests" side="l" color={C.brandSoft} y={ROWS[1]} />
        <Verb t={t} at={jud} text="judge" side="r" color={C.goldSoft} y={ROWS[1]} />
        {["Add a title", "Make it red", "Shorter intro"].map((s, i) => {
          const good = i !== 1;
          const at = jud + 0.1 + i * 0.18;
          return (
            <React.Fragment key={s}>
              <div style={{ position: "absolute", left: 70 + i * 0, top: ROWS[1] - 70 + i * 50, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 26, color: "#fff",
                background: "rgba(85,191,179,.18)", border: `1.5px solid ${C.brand}`, borderRadius: 999, padding: "4px 18px",
                scale: pop(t, sug + i * 0.1), opacity: t > sug + i * 0.1 ? 1 : 0, transformOrigin: "0 50%" }}>{s}</div>
              <div style={{ position: "absolute", left: 1300 + i * 130, top: ROWS[1] - 44, width: 96, height: 96, borderRadius: 48,
                background: good ? `${C.success}33` : `${C.error}33`, border: `2px solid ${good ? C.success : C.error}`, display: "flex", alignItems: "center", justifyContent: "center",
                scale: pop(t, at), opacity: t > at ? 1 : 0 }}>
                <Icon icon={good ? faThumbsUp : faThumbsDown} size={44} color={good ? C.success : C.error} />
              </div>
            </React.Fragment>
          );
        })}

        {/* helps / creates */}
        <Verb t={t} at={hlp} text="helps" side="l" color={C.brandSoft} y={ROWS[2]} />
        <Verb t={t} at={cre} text="create" side="r" color={C.goldSoft} y={ROWS[2]} />
        {[faScrewdriverWrench, faMagnifyingGlass, faPalette].map((ic, i) => (
          <At key={i} x={180 + i * 150} y={ROWS[2]} style={{ scale: pop(t, hlp + i * 0.08), opacity: t > hlp + i * 0.08 ? 1 : 0 }}>
            <div style={{ width: 100, height: 100, borderRadius: 26, background: "rgba(85,191,179,.15)", border: `2px solid ${C.brand}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon icon={ic} size={46} color={C.brand} />
            </div>
          </At>
        ))}
        <At x={1560} y={ROWS[2]} style={{ scale: pop(t, cre, 0.6), opacity: t > cre ? 1 : 0 }}>
          <div style={{ width: 260, height: 170, borderRadius: 18, overflow: "hidden", border: `3px solid ${C.gold}`, boxShadow: `0 0 ${40 + Math.sin(t * 5) * 15}px ${C.gold}88`, position: "relative" }}>
            <Landscape w={260} h={170} />
            <div style={{ position: "absolute", left: 16, top: 12, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 26, color: "#fff" }}>MY PROJECT</div>
          </div>
          <div style={{ position: "absolute", right: -20, top: -24, rotate: `${t * 30}deg` }}><Icon icon={faStar} size={48} color={C.gold} /></div>
        </At>
      </div>

      {/* not replace: amplify */}
      <div style={{ position: "absolute", inset: 0, opacity: brainStage * (1 - plus), background: "radial-gradient(ellipse at 50% 50%, #1C2A10 0%, #07100D 70%)" }}>
        {[0, 1, 2].map((i) => {
          const r = ((t * 0.6 + i / 3) % 1);
          return <At key={i} x={960} y={500}><div style={{ width: 300 + r * 700 * grow, height: 300 + r * 700 * grow, borderRadius: "50%", border: `3px solid ${C.gold}`, opacity: (1 - r) * grow * 0.7 }} /></At>;
        })}
        <At x={960} y={500} style={{ scale: 1 + grow * 0.35 }}>
          <div style={{ filter: `drop-shadow(0 0 ${20 + grow * 60}px ${C.gold})` }}><Icon icon={faBrain} size={260} color={grow > 0.2 ? C.gold : "#F2D7C4"} /></div>
        </At>
        {/* the robot tries to take the brain's place, and is stopped */}
        {(() => {
          const rep = W("s09e", "replace");
          const slide = tw(t, [rep - 0.4, rep + 0.3], [0, 1], ease.inOut) * (1 - grow);
          const orbit = grow;
          const a = t * 1.2;
          const x = (1500 - 380 * slide) * (1 - orbit) + (960 + Math.cos(a) * 330) * orbit;
          const y = 500 * (1 - orbit) + (500 + Math.sin(a) * 200) * orbit;
          return (
            <>
              <At x={x} y={y} style={{ scale: 1 - orbit * 0.45 }}>
                <div style={{ width: 170, height: 170, borderRadius: 50, background: `${C.brand}33`, border: `3px solid ${C.brand}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon icon={faRobot} size={90} color={C.brand} />
                </div>
              </At>
              <At x={1180} y={500} style={{ opacity: life(t, rep, W("s09f", "make"), 0.25), scale: pop(t, rep) }}>
                <Icon icon={faXmark} size={150} color={C.error} />
              </At>
            </>
          );
        })()}
        <At x={960} y={880}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 80, color: "#fff", whiteSpace: "nowrap", opacity: tw(t, [W("s09e", "replace") - 0.2, W("s09e", "replace") + 0.2], [0, 1]) }}>
            {t > W("s09f", "make") - 0.1 ? <span>make it <span style={{ color: C.gold }}>more capable</span></span> : <span><span style={{ textDecoration: t > W("s09e", "replace") + 0.3 ? "line-through" : undefined, textDecorationColor: C.error }}>replace</span> your brain</span>}
          </div>
        </At>
      </div>

      {/* YOU + AI */}
      <At x={960} y={540} style={{ opacity: plus }}>
        <div style={{ display: "flex", alignItems: "center", gap: 50 * plus + 10, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 260, lineHeight: 1, whiteSpace: "nowrap" }}>
          <span style={{ color: C.gold, translate: `${(1 - plus) * -300}px 0`, textShadow: `0 0 70px ${C.gold}66` }}>YOU</span>
          <span style={{ color: "#fff", scale: pop(t, W("s09g", "plus") - 0.1) }}>+</span>
          <span style={{ color: C.brand, translate: `${(1 - plus) * 300}px 0`, textShadow: `0 0 70px ${C.brand}66` }}>AI</span>
        </div>
      </At>
    </Scene>
  );
};
