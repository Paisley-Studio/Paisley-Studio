import React from "react";
import { faBolt, faEye, faFaceSmile, faLightbulb, faSignature, faTree } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { Creature, LUMORA } from "../creature";
import { Ambient, At, BigWord, C, CAVEAT, DotGrid, E, ease, Icon, Kicker, L, life, pop, QUICKSAND, Scene, ThinkTimer, tw, useScene, W } from "../lib2";

type Q = { n: number; label: string; ask: string; icon: IconDefinition; at: number; chips: string[]; answer: string; fill: number; c: string };

/** 03: five quick questions before any AI tool. Lumora's answers and pencil sketch, then the student imagines theirs. */
export const S03Design: React.FC = () => {
  const t = useScene("s03");
  const qs: Q[] = [
    { n: 1, label: "NAME", ask: "What is it called?", icon: faSignature, at: L("s03b"), chips: ["Zippa?", "Glorb?", "Nimbo?", "Mira?"], answer: "Lumora", fill: W("s03h", "lumora"), c: C.gold },
    { n: 2, label: "HABITAT", ask: "Where does it live?", icon: faTree, at: L("s03c"), chips: ["jungle", "ocean", "desert", "city", "space", "another planet"], answer: "the Glow Forest", fill: W("s03h", "glow"), c: C.success },
    { n: 3, label: "SPECIAL ABILITY", ask: "What can it do that animals can't?", icon: faBolt, at: L("s03d"), chips: ["turn invisible?", "breathe fire?", "walk on water?", "talk to trees?"], answer: "can turn invisible", fill: W("s03h", "invisible"), c: C.violet },
    { n: 4, label: "APPEARANCE", ask: "What does it look like?", icon: faEye, at: L("s03e"), chips: ["size", "shape", "colour", "eyes", "wings", "legs", "texture"], answer: "small · 4 wings · huge curious eyes · blue feathers · long golden tail", fill: W("s03h", "small"), c: C.sky },
    { n: 5, label: "PERSONALITY", ask: "What is it like?", icon: faFaceSmile, at: L("s03f"), chips: ["friendly", "clever", "brave", "funny", "mysterious", "mischievous", "protective"], answer: "curious & playful", fill: W("s03h", "curious", 1), c: C.coral },
  ];
  const mine = L("s03g") - 0.1;
  const yours = L("s03i") - 0.2;
  const cur = t < mine ? qs.reduce((k, q, i) => (t >= q.at - 0.15 ? i : k), -1) : -1;
  const sheetIn = tw(t, [L("s03a") - 0.3, L("s03a") + 0.5], [0, 1]);
  const answersOut = tw(t, [yours, yours + 0.5], [1, 0], ease.inOut);
  const sketchIn = tw(t, [mine, W("s03h", "small") + 1.0], [0, 1], ease.inOut);
  const inv = Math.max(0, 1 - Math.abs(t - (W("s03h", "invisible") + 0.5)) / 0.6);
  const notes = [
    { at: W("s03h", "four"), text: "4 wings!", x: 1100, y: 330, c: C.sky },
    { at: W("s03h", "huge"), text: "huge curious eyes", x: 1710, y: 300, c: C.ink },
    { at: W("s03h", "blue"), text: "blue feathers", x: 1080, y: 760, c: "#3E8EF0" },
    { at: W("s03h", "golden"), text: "long golden tail", x: 1720, y: 720, c: "#C99A10" },
  ];
  return (
    <Scene id="s03" push={0.025}>
      <Ambient t={t} opacity={0.3} />
      <DotGrid />
      <At x={960} y={80} style={{ opacity: tw(t, [L("s03a") - 0.2, L("s03a") + 0.2], [0, 1]) * tw(t, [yours - 0.3, yours], [1, 0]) }}>
        <Kicker t={t} at={L("s03a") - 0.2} color={C.gold} size={28}>STEP 1 · DESIGN IT FIRST (NO AI YET)</Kicker>
      </At>
      {/* the design sheet */}
      <At x={520} y={580} style={{ opacity: sheetIn, translate: `${(1 - sheetIn) * -60}px 0` }}>
        <div style={{ width: 800, height: 880, borderRadius: 26, background: "#FBF8F1", boxShadow: "0 50px 120px rgba(0,0,0,.5)", position: "relative", overflow: "hidden" }}>
          <div style={{ height: 96, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 40px", borderBottom: "2px dashed rgba(29,42,40,.15)" }}>
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 30, letterSpacing: "0.22em", color: C.brandDeep }}>
              {t < yours ? "CREATURE DESIGN" : "YOUR CREATURE"}
            </div>
            <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 36, color: C.muted }}>{t < yours ? "no AI yet ✎" : "imagine it…"}</div>
          </div>
          {qs.map((q, i) => {
            const on = cur === i;
            const shown = t >= q.at - 0.15;
            const written = tw(t, [q.fill, q.fill + 0.6], [0, 1]) * answersOut;
            return (
              <div key={q.n} style={{ position: "absolute", left: 30, right: 30, top: 116 + i * 150, height: 136, borderRadius: 18, display: "flex", alignItems: "center", gap: 24, padding: "0 22px",
                background: on ? `${q.c}22` : "transparent", border: on ? `2.5px solid ${q.c}` : "2.5px solid transparent",
                opacity: shown ? 1 : 0.25, translate: `${(1 - tw(t, [q.at - 0.15, q.at + 0.3], [0, 1])) * 20}px 0` }}>
                <div style={{ width: 64, height: 64, borderRadius: 32, background: shown ? q.c : "#D9DEDC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  fontFamily: QUICKSAND, fontWeight: 700, fontSize: 32, color: "#fff" }}>{q.n}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 28, letterSpacing: "0.12em", color: C.ink }}>{q.label}</div>
                  <div style={{ position: "relative", height: 62 }}>
                    <div style={{ position: "absolute", fontFamily: QUICKSAND, fontWeight: 600, fontSize: 24, color: C.muted, top: 6, opacity: 1 - written }}>{q.ask}</div>
                    <div style={{ position: "absolute", top: q.n === 4 ? -2 : 0, fontFamily: CAVEAT, fontWeight: 700, fontSize: q.n === 4 ? 32 : 46, lineHeight: 1, color: "#2E5BB0",
                      clipPath: `inset(0 ${(1 - written) * 100}% 0 0)` }}>{q.answer}</div>
                  </div>
                </div>
                <Icon icon={q.icon} size={38} color={shown ? q.c : "#C8CFCD"} />
              </div>
            );
          })}
        </div>
      </At>
      {/* examples for the current question */}
      {qs.map((q, i) => (
        <At key={q.n} x={1390} y={560} style={{ opacity: cur === i ? tw(t, [q.at - 0.15, q.at + 0.25], [0, 1]) : 0 }}>
          <div style={{ width: 760, display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
            <Icon icon={q.icon} size={130} color={q.c} style={{ filter: `drop-shadow(0 0 30px ${q.c}88)` }} />
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 62, color: "#fff", textAlign: "center" }}>{q.ask}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>
              {q.chips.map((ch, k) => (
                <div key={ch} style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 28, color: q.c, border: `2px solid ${q.c}88`, background: `${q.c}18`, borderRadius: 999,
                  padding: "8px 22px", scale: pop(t, q.at + 0.3 + k * 0.12, 0.35), opacity: t > q.at + 0.3 + k * 0.12 ? 1 : 0 }}>{ch}</div>
              ))}
            </div>
          </div>
        </At>
      ))}
      {/* Lumora, sketched */}
      <At x={1400} y={540} style={{ opacity: tw(t, [mine, mine + 0.3], [0, 1]) * answersOut }}>
        <div style={{ position: "relative", width: 760, height: 720, borderRadius: 26, background: "#FBF8F1", boxShadow: "0 50px 120px rgba(0,0,0,.5)", overflow: "hidden",
          backgroundImage: "linear-gradient(rgba(46,91,176,.08) 2px, transparent 2px)", backgroundSize: "100% 44px" }}>
          <div style={{ position: "absolute", left: 30, top: 18, fontFamily: CAVEAT, fontWeight: 700, fontSize: 44, color: C.muted }}>my idea:</div>
          <div style={{ position: "absolute", left: 70, top: 60, clipPath: `inset(0 0 ${(1 - sketchIn) * 100}% 0)` }}>
            <Creature look={LUMORA} size={620} t={t} uid="s03sketch" sketch invisible={inv} />
          </div>
        </div>
      </At>
      {notes.map((n) => (
        <At key={n.text} x={n.x} y={n.y} style={{ opacity: tw(t, [n.at, n.at + 0.25], [0, 1]) * answersOut, scale: pop(t, n.at, 0.4), rotate: "-3deg" }}>
          <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 46, color: n.c, background: "rgba(251,248,241,.92)", padding: "2px 14px", borderRadius: 10, whiteSpace: "nowrap" }}>{n.text}</div>
        </At>
      ))}
      <At x={1400} y={960} style={{ opacity: life(t, W("s03h", "invisible") - 0.1, W("s03h", "invisible") + 1.6, 0.25) }}>
        <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 46, color: C.violet }}>…now you see it, now you don't</div>
      </At>
      {/* now you: imagine yours */}
      <At x={1400} y={470} style={{ opacity: tw(t, [yours + 0.2, yours + 0.7], [0, 1]) * tw(t, [E("s03j") + 0.4, E("s03j") + 0.9], [1, 0]) }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
          <div style={{ position: "relative", width: 520, height: 360 }}>
            {[[60, 330, 34], [120, 280, 48]].map(([x, y, r], i) => <div key={i} style={{ position: "absolute", left: x, top: y, width: r, height: r, borderRadius: "50%", background: "rgba(255,255,255,.9)" }} />)}
            <div style={{ position: "absolute", left: 120, top: 0, width: 400, height: 270, borderRadius: "50%", background: "rgba(255,255,255,.92)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 64, color: C.brandDeep, textAlign: "center", lineHeight: 1 }}>
                {t < L("s03j") - 0.1 ? "your creature…" : "got it!"}
              </div>
              {t >= L("s03j") - 0.1 && <Icon icon={faLightbulb} size={80} color={C.gold} style={{ position: "absolute", right: 30, top: 20, scale: pop(t, L("s03j") - 0.1) }} />}
            </div>
          </div>
          <ThinkTimer t={t} from={E("s03i") + 0.2} to={L("s03j") - 0.3} label="IMAGINE YOURS" />
        </div>
      </At>
      <At x={1400} y={110} style={{ opacity: tw(t, [yours, yours + 0.4], [0, 1]) }}>
        <BigWord t={t} at={yours} size={84} color={C.gold}>NOW YOU.</BigWord>
      </At>
    </Scene>
  );
};
