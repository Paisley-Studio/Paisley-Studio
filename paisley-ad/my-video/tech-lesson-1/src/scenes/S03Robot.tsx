import React from "react";
import { random } from "remotion";
import { faArrowRight, faCheck } from "@fortawesome/free-solid-svg-icons";
import { Cat, CATS, Dog, DOGS, type DogLook, Kid, NEW_DOG } from "../art";
import { Robot } from "../Robot";
import { At, BG, C, DotGrid, E, ease, Icon, L, life, MONO, pop, QUICKSAND, Scene, SCENES, tw, useT, W } from "../lib";

type Example = { kind: "dog" | "cat"; look: number; appear: number; label: number };

// 60 examples for the zoom-out; `order` is each card's place in its own group once sorted
const CROWD = (() => {
  let dogs = 0, cats = 0;
  return Array.from({ length: 60 }).map((_, i) => {
    const isDog = dogs < 36 && (cats >= 24 || random(`k${i}`) > 0.42);
    return { isDog, look: Math.floor(random(`l${i}`) * (isDog ? 3 : 2)), order: isDog ? dogs++ : cats++ };
  });
})();

const SLOT = (i: number) => ({ x: 600 + i * 180, y: 215 });
const HAND = { x: 500, y: 520 };

const ExampleCard: React.FC<{ e: Example; size: number; labelP: number; dim?: number; glow?: number; tag?: string; tagColor?: string; dogLook?: DogLook }> = ({
  e, size, labelP, dim = 0, glow = 0, tag, tagColor, dogLook,
}) => (
  <div style={{
    width: size, height: size * 1.15, borderRadius: size * 0.12, background: "#fff", position: "relative", opacity: 1 - dim * 0.65,
    boxShadow: `0 ${size * 0.12}px ${size * 0.3}px rgba(36,95,90,.18), 0 0 0 ${3 + glow * 4}px ${glow > 0 ? C.success : "rgba(29,42,40,.06)"}`,
    filter: dim ? `grayscale(${dim})` : undefined,
  }}>
    <div style={{ position: "absolute", left: size * 0.08, top: size * 0.06 }}>
      {e.kind === "dog" ? <Dog look={dogLook ?? DOGS[e.look]} size={size * 0.84} /> : <Cat look={CATS[e.look]} size={size * 0.84} />}
    </div>
    <div style={{
      position: "absolute", left: "50%", bottom: size * 0.07, translate: "-50% 0", scale: labelP,
      background: tagColor ?? (e.kind === "dog" ? C.brandDeep : C.warn), color: "#fff", fontFamily: QUICKSAND, fontWeight: 700,
      fontSize: size * 0.15, padding: `${size * 0.01}px ${size * 0.09}px`, borderRadius: 999, letterSpacing: "0.08em",
    }}>{tag ?? e.kind.toUpperCase()}</div>
  </div>
);

export const S03Robot: React.FC = () => {
  const t = useT() + SCENES.s03[0];
  const examples: Example[] = [
    { kind: "dog", look: 0, appear: W("s03c", "picture") - 0.2, label: W("s03c", "Dog") },
    { kind: "dog", look: 1, appear: W("s03d", "Another") - 0.1, label: W("s03d", "Dog") },
    { kind: "dog", look: 2, appear: W("s03e", "another") - 0.1, label: W("s03e", "Dog") },
    { kind: "cat", look: 0, appear: W("s03f", "cats") - 0.2, label: W("s03f", "Cat", 0) },
    { kind: "cat", look: 1, appear: W("s03f", "Cat", 0) + 0.38, label: W("s03f", "Cat", 1) },
  ];
  const holding = examples.some((e) => t > e.appear && t < e.label + 0.35);
  const arm = tw(t, [examples[0].appear - 0.4, examples[0].appear], [0, 1]) * tw(t, [examples[4].label + 0.3, examples[4].label + 0.8], [1, 0]);

  const newIn = W("s03g", "new") - 0.2;
  const match = tw(t, [E("s03g") + 0.15, W("s03h", "says")], [0, 1], ease.inOut);
  const answer = W("s03h", "dog");
  const think = t > E("s03g") - 0.3 && t < answer;
  const ruleIn = W("s03i", "rule") - 0.4;
  const strike = tw(t, [W("s03i", "rule") + 0.15, W("s03i", "rule") + 0.5], [0, 1]);
  const patternPulse = t > W("s03i", "pattern") ? 0.5 + 0.5 * Math.sin((t - W("s03i", "pattern")) * 8) : 0;
  const stageOut = tw(t, [L("s03j") + 0.2, L("s03j") + 0.9], [0, 1], ease.inOut);
  const blink = (Math.floor(t * 10) % 37 === 0 ? 1 : 0);

  // the zoom-out: many examples, then sorted into two groups
  const many = tw(t, [W("s03j", "lots") - 0.3, W("s03j", "examples") + 0.6], [0, 1], ease.out);
  const sort = tw(t, [W("s03j", "patterns") - 0.2, W("s03j", "patterns") + 1.2], [0, 1], ease.inOut);
  const eq = tw(t, [L("s03k") - 0.1, L("s03k") + 0.6], [0, 1]);

  return (
    <Scene id="s03" bg={BG.paper} push={0.025}>
      <DotGrid color={C.brandDeep} opacity={0.08} />
      <div style={{ position: "absolute", inset: 0, opacity: 1 - stageOut, scale: 1 - stageOut * 0.15 }}>
        <At x={960} y={92}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 30, letterSpacing: "0.3em", color: C.brandDeep, opacity: tw(t, [L("s03a"), L("s03a") + 0.4], [0, 1]) }}>
            LEARNING FROM EXAMPLES
          </div>
        </At>
        {/* shelf */}
        <div style={{ position: "absolute", left: 510, top: 120, width: 900, height: 200, borderRadius: 30, background: "rgba(85,191,179,.08)",
          border: `2px dashed ${C.brand}66`, opacity: tw(t, [L("s03c") - 0.3, L("s03c") + 0.2], [0, 1]) }} />

        <div style={{ position: "absolute", left: 120, top: 580, opacity: tw(t, [L("s03a") - 0.2, L("s03a") + 0.4], [0, 1]),
          translate: `${tw(t, [L("s03a") - 0.2, L("s03a") + 0.6], [-200, 0])}px 0` }}>
          <Kid size={300} arm={arm} look={holding ? 0.6 : 0.3} />
        </div>
        <div style={{ position: "absolute", left: 1230, top: 400, opacity: tw(t, [W("s03b", "robot") - 0.3, W("s03b", "robot") + 0.3], [0, 1]),
          translate: `0 ${tw(t, [W("s03b", "robot") - 0.3, W("s03b", "robot") + 0.6], [80, 0], ease.back)}px` }}>
          <Robot size={560} blink={blink} look={think ? -0.8 : t > newIn ? -0.4 : -0.7} smile={t > answer ? 1 : 0} backdrop={0.22} />
          {think && (
            <div style={{ position: "absolute", left: 245, top: 432, display: "flex", gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: C.gold, opacity: 0.3 + 0.7 * (Math.floor(t * 6) % 3 === i ? 1 : 0) }} />
              ))}
            </div>
          )}
        </div>

        {/* the examples: appear in the kid's hand, get their label, fly to the shelf */}
        {examples.map((e, i) => {
          const fly = tw(t, [e.label + 0.3, e.label + 0.95], [0, 1], ease.inOut);
          const s = SLOT(i);
          const x = HAND.x + (s.x - HAND.x) * fly;
          const y = HAND.y + (s.y - HAND.y) * fly - Math.sin(fly * Math.PI) * 120;
          const isDog = e.kind === "dog";
          return (
            <At key={i} x={x} y={y} style={{ opacity: tw(t, [e.appear, e.appear + 0.2], [0, 1]), scale: (0.6 + 0.4 * pop(t, e.appear)) * (1.25 - 0.4 * fly), rotate: `${(1 - fly) * -6}deg` }}>
              <ExampleCard e={e} size={150} labelP={pop(t, e.label - 0.05, 0.35)}
                dim={isDog ? 0 : match} glow={isDog ? match * (1 - stageOut) + patternPulse * 0.6 : 0} />
            </At>
          );
        })}

        {/* lines from the new animal to every dog it resembles */}
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          {[0, 1, 2].map((i) => {
            const s = SLOT(i);
            const p = Math.max(0, Math.min(1, match * 1.5 - i * 0.25));
            return (
              <line key={i} x1={960} y1={560} x2={960 + (s.x - 960) * p} y2={560 + (s.y + 95 - 560) * p}
                stroke={C.success} strokeWidth={5 + patternPulse * 3} strokeDasharray="3 14" strokeLinecap="round" />
            );
          })}
        </svg>
        <At x={960} y={660} style={{ opacity: tw(t, [newIn, newIn + 0.3], [0, 1]), scale: pop(t, newIn, 0.6) }}>
          <ExampleCard e={{ kind: "dog", look: 0, appear: 0, label: 0 }} size={230} labelP={1}
            tag={t > answer ? "DOG" : "?"} tagColor={t > answer ? C.success : C.muted} glow={t > answer ? 1 : 0} dogLook={NEW_DOG} />
          <div style={{ position: "absolute", left: -110, top: -40, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 26, color: C.coral,
            letterSpacing: "0.12em", rotate: "-8deg", opacity: life(t, newIn + 0.3, answer, 0.3) }}>NEVER SEEN!</div>
        </At>
        {/* the robot's answer */}
        <At x={1500} y={330} style={{ scale: pop(t, answer - 0.05, 0.5), opacity: t > answer - 0.05 ? 1 : 0 }}>
          <div style={{ background: C.success, color: "#fff", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 64, padding: "14px 40px",
            borderRadius: 40, display: "flex", alignItems: "center", gap: 18, boxShadow: "0 20px 50px rgba(46,184,114,.35)" }}>
            <Icon icon={faCheck} size={48} /> DOG!
          </div>
        </At>
        {/* "Nobody gave it a rule" */}
        <At x={1500} y={170} style={{ opacity: life(t, ruleIn, L("s03j") + 0.3, 0.3), scale: 0.9 + 0.1 * pop(t, ruleIn) }}>
          <div style={{ position: "relative", background: "#fff", borderRadius: 20, padding: "18px 28px", boxShadow: "0 20px 50px rgba(36,95,90,.15)",
            fontFamily: MONO, fontSize: 28, color: C.ink, whiteSpace: "nowrap" }}>
            <span style={{ color: C.muted }}>RULE:</span> if ears = floppy → dog
            <div style={{ position: "absolute", left: 16, right: 16, top: "50%", height: 6, borderRadius: 3, background: C.error,
              transformOrigin: "0 50%", scale: `${strike} 1` }} />
          </div>
        </At>
      </div>

      {/* zoom out: lots of examples, then the pattern sorts them */}
      <div style={{ position: "absolute", inset: 0, opacity: stageOut }}>
        {CROWD.map(({ isDog, look, order }, i) => {
          const sx = 180 + (i % 12) * 142 + (random(`x${i}`) - 0.5) * 40, sy = 270 + Math.floor(i / 12) * 132 + (random(`y${i}`) - 0.5) * 30;
          const gx = isDog ? 230 + (order % 6) * 104 : 1130 + (order % 6) * 104;
          const gy = 280 + Math.floor(order / 6) * 120;
          const x = sx + (gx - sx) * sort, y = sy + (gy - sy) * sort;
          const d = random(`d${i}`) * 0.8;
          const p = tw(many, [d / 1.8, d / 1.8 + 0.45], [0, 1]);
          return (
            <At key={i} x={x} y={y} style={{ scale: 0.5 * p, opacity: p }}>
              <ExampleCard e={{ kind: isDog ? "dog" : "cat", look, appear: 0, label: 0 }} size={190} labelP={1} />
            </At>
          );
        })}
        {[{ x: 490, label: "DOGS", c: C.brandDeep }, { x: 1390, label: "CATS", c: C.warn }].map((g) => (
          <At key={g.label} x={g.x} y={175} style={{ opacity: sort }}>
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 44, letterSpacing: "0.2em", color: g.c }}>{g.label}</div>
          </At>
        ))}
        <At x={960} y={92}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 30, letterSpacing: "0.3em", color: C.brandDeep, opacity: tw(t, [W("s03j", "examples"), W("s03j", "examples") + 0.4], [0, 1]) * (1 - eq) }}>
            LOTS OF EXAMPLES
          </div>
        </At>
        {/* EXAMPLES -> PATTERNS */}
        <div style={{ position: "absolute", inset: 0, background: `rgba(244,248,247,${eq * 0.86})` }} />
        <At x={960} y={540} style={{ opacity: eq, scale: 0.9 + 0.1 * eq }}>
          <div style={{ display: "flex", alignItems: "center", gap: 50, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 130, color: C.ink, whiteSpace: "nowrap" }}>
            <span>EXAMPLES</span>
            <Icon icon={faArrowRight} size={100} color={C.brand} style={{ translate: `${Math.sin(t * 4) * 10}px 0` }} />
            <span style={{ color: C.brand }}>PATTERNS</span>
          </div>
        </At>
      </div>
    </Scene>
  );
};
