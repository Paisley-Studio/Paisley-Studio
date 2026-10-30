import React from "react";
import { AbsoluteFill } from "remotion";
import { faLightbulb, faPlay, faCheck, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { C, CAVEAT, Cursor, DemoTag, EV, Headline, Kicker, MONO, Person, QUICKSAND, ease, life, tw, useSceneTime } from "../lib";
import { Icon, Pill } from "../ui";
import { Robot } from "../Robot";

// A self-led CODE project, opened in the Code IDE workspace (TechUI WORKSPACE_FOR.CODE)
const CODE: { text: string; color: string }[][] = [
  [{ text: "<h1>", color: "#7BCBC2" }, { text: "Hi, I'm Amani", color: "#fff" }, { text: "</h1>", color: "#7BCBC2" }],
  [{ text: "<p>", color: "#7BCBC2" }, { text: "I build things with code.", color: "#fff" }, { text: "</p>", color: "#7BCBC2" }],
  [{ text: "<button>", color: "#7BCBC2" }, { text: "See my projects", color: "#fff" }, { text: "</button>", color: "#7BCBC2" }],
  [],
  [{ text: "h1 ", color: "#F5C842" }, { text: "{ color: ", color: "#cfd8d6" }, { text: "#245F5A", color: "#FFE57A" }, { text: "; }", color: "#cfd8d6" }],
];
const TOTAL = CODE.reduce((n, l) => n + l.reduce((m, s) => m + s.text.length, 0) + 1, 0);
const STATUSES = ["Idea", "Learning", "Building", "Testing", "Ready"];

/** 00:27-00:38. A maths symbol becomes code, and code becomes a learner's own project. */
export const Tech: React.FC = () => {
  const { t } = useSceneTime("tech");
  const typed = Math.floor(tw(t, [EV.codeTypeStart, EV.codeTypeEnd], [0, TOTAL], (x) => x));
  const ideIn = tw(t, [29.4, 30.2], [0, 1], ease.out);
  const preview = tw(t, [EV.previewRender, EV.previewRender + 0.6], [0, 1], ease.out);
  const submitted = t >= EV.projectSubmit;
  const out = tw(t, [37.3, 38.0], [0, 1], ease.in);
  // status flow advances with the work
  const step = t < 30.4 ? 0 : t < 31.3 ? 1 : t < EV.previewRender ? 2 : t < 34.6 ? 3 : 4;

  // symbol morph: the x from the very first equation becomes </>
  const xSym = life(t, 27.0, 27.9, 0.3);
  const tag = tw(t, [27.6, 28.1], [0, 1]) * (1 - tw(t, [29.4, 29.9], [0, 1]));
  const tagFly = tw(t, [29.4, 30.0], [0, 1], ease.inOut);

  const blink = [30.25, 33.05, 36.4].reduce((b, s) => Math.max(b, tw(t, [s, s + 0.07], [0, 1]) * tw(t, [s + 0.07, s + 0.16], [1, 0])), 0);

  return (
    <AbsoluteFill style={{ background: C.dark, overflow: "hidden" }}>
      {/* a quiet dot grid: the digital world */}
      <AbsoluteFill style={{
        backgroundImage: "radial-gradient(rgba(123,203,194,.16) 1.4px, transparent 1.6px)", backgroundSize: "36px 36px",
        backgroundPosition: `${tw(t, [27, 38], [0, -120], (x) => x)}px 0px`, opacity: tw(t, [27, 28], [0, 1]),
        maskImage: "radial-gradient(ellipse at 60% 50%, black 30%, transparent 75%)",
      }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 50% 60% at 62% 55%, rgba(85,191,179,.16), transparent 70%)" }} />

      <AbsoluteFill style={{ opacity: 1 - out, scale: 1 - out * 0.08 }}>
        {/* x -> </> */}
        <AbsoluteFill style={{ display: "grid", placeItems: "center" }}>
          <div style={{ position: "absolute", fontFamily: CAVEAT, fontWeight: 700, fontSize: 260, color: "#fff", opacity: xSym,
            scale: tw(t, [27.0, 27.9], [0.6, 1.25]), filter: `blur(${tw(t, [27.55, 27.9], [0, 12])}px)`,
            textShadow: `0 0 40px ${C.gold}` }}>x</div>
          <div style={{ position: "absolute", fontFamily: MONO, fontWeight: 600, fontSize: 200, color: C.brand, opacity: tag,
            textShadow: `0 0 50px ${C.brand}`, scale: tw(t, [27.6, 28.2], [0.7, 1]) * (1 - tagFly * 0.75),
            translate: `${tagFly * 120}px ${tagFly * -230}px` }}>{"</>"}</div>
        </AbsoluteFill>

        {/* the learner, looking up at what they are making */}
        <Person src="hero.png" light={C.brand} brightness={0.95}
          style={{ left: -70, bottom: -30, width: 700, height: 828, opacity: tw(t, [28.2, 29.2], [0, 1]),
            translate: `${tw(t, [28.2, 38], [-60, 20], ease.soft)}px 0px` }} />

        {/* the Code IDE workspace */}
        <div style={{
          position: "absolute", left: 600, top: 250, width: 1230, height: 730, borderRadius: 24, overflow: "hidden",
          background: "#fff", boxShadow: "0 60px 140px rgba(0,0,0,.6)", opacity: ideIn,
          translate: `0 ${(1 - ideIn) * 80}px`, rotate: `0 1 0 ${(1 - ideIn) * -12}deg`, fontFamily: QUICKSAND,
        }}>
          <div style={{ height: 116, background: C.paper, borderBottom: "1px solid #e2ece9", padding: "18px 28px", position: "relative" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, letterSpacing: "0.12em",
              color: "#9A6A12", background: "#FFF4DE", padding: "5px 12px", borderRadius: 8 }}>
              <Icon i={faLightbulb} size={13} color="#9A6A12" /> SELF-LED • STUDENT PROJECT</span>
            <div style={{ fontSize: 30, fontWeight: 700, color: C.brandDeep, marginTop: 8 }}>My Portfolio Website</div>
            <div style={{ position: "absolute", right: 28, top: 22, display: "flex", gap: 8 }}>
              {STATUSES.map((s, i) => (
                <span key={s} style={{ padding: "6px 13px", borderRadius: 999, fontSize: 15, fontWeight: 700,
                  background: i <= step ? C.brand : "#fff", color: i <= step ? "#04231f" : C.muted,
                  border: `1px solid ${i <= step ? C.brand : "#d5e4e0"}` }}>{s}</span>
              ))}
            </div>
            <div style={{ position: "absolute", right: 28, top: 66 }}>
              {submitted ? <Pill kind="warn" size={16}>Submitted for review ✓</Pill> : <Pill kind="neutral" size={16}>In progress</Pill>}
            </div>
          </div>
          {/* code pane */}
          <div style={{ position: "absolute", left: 0, top: 116, width: 610, bottom: 0, background: "#13221e", padding: "18px 0" }}>
            <div style={{ display: "flex", gap: 4, padding: "0 18px", marginBottom: 18 }}>
              {["index.html", "style.css", "script.js"].map((f, i) => (
                <span key={f} style={{ fontFamily: MONO, fontSize: 15, padding: "6px 14px", borderRadius: 8,
                  background: i === 0 ? "rgba(85,191,179,.18)" : "transparent", color: i === 0 ? "#fff" : "#8FA8A2" }}>{f}</span>
              ))}
            </div>
            <CodeLines typed={typed} t={t} />
          </div>
          {/* live preview */}
          <div style={{ position: "absolute", left: 610, top: 116, right: 0, bottom: 0, background: "#F4F8F7" }}>
            <div style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px",
              borderBottom: "1px solid #e2ece9", fontSize: 15, fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>
              LIVE PREVIEW
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.brandDeep, color: "#fff",
                padding: "6px 14px", borderRadius: 8, letterSpacing: 0 }}><Icon i={faPlay} size={11} color="#fff" /> Run</span>
            </div>
            <PreviewSite reveal={preview} t={t} />
          </div>
          {/* submit */}
          <div style={{ position: "absolute", right: 26, bottom: 24, height: 52, padding: "0 24px", borderRadius: 14,
            display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 19, color: "#fff",
            background: submitted ? C.success : C.brandDeep, opacity: tw(t, [34.6, 35.0], [0, 1]),
            scale: 1 - (tw(t, [EV.projectSubmit - 0.06, EV.projectSubmit], [0, 1]) * tw(t, [EV.projectSubmit, EV.projectSubmit + 0.15], [1, 0])) * 0.06 }}>
            {submitted ? <><Icon i={faCheck} size={16} color="#fff" /> Submitted for review</> : "Submit for review"}
          </div>
          <Cursor t={t} show={[34.7, 36.4]} clicks={[EV.projectSubmit]}
            path={[{ at: 34.7, x: 900, y: 500 }, { at: 35.35, x: 1110, y: 680 }]} />
        </div>

        {/* PAISLEY AI, guide to the technology world */}
        <Robot size={330} blink={blink} look={tw(t, [29.5, 30.3, 33.3, 34], [1, -0.6, -0.6, 0.8], ease.inOut)}
          smile={preview} backdrop={tw(t, [28.6, 29.4], [0, 1])}
          style={{ left: 1560, top: -10, opacity: tw(t, [28.4, 29.0], [0, 1]),
            scale: tw(t, [28.4, 29.1], [0.6, 1], ease.back), translate: `0 ${Math.sin(t * 2.2) * 8}px` }} />
        <div style={{ position: "absolute", left: 1290, top: 120, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 22,
          color: C.brandSoft, letterSpacing: "0.16em", opacity: life(t, 29.2, 33.0) }}>
          <Icon i={faWandMagicSparkles} size={18} color={C.gold} /> MEET PAISLEY AI
        </div>

        {/* titles */}
        <AbsoluteFill style={{ left: 110, top: 70 }}>
          <Headline t={t} at={EV.techTitle} out={37.4} size={128}>AI & TECH</Headline>
          <div style={{ height: 20, display: "flex" }} />
          <div style={{ display: "flex", gap: 26 }}>
            {["IMAGINE.", "BUILD.", "CREATE."].map((w, i) => (
              <Kicker key={w} t={t} at={EV.techWords[i]} out={37.4} color={i === 2 ? C.gold : "#fff"} size={32}>{w}</Kicker>
            ))}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
      <DemoTag opacity={life(t, 30.0, 37.4)} />
    </AbsoluteFill>
  );
};

const CodeLines: React.FC<{ typed: number; t: number }> = ({ typed, t }) => {
  let left = typed;
  const caretOn = Math.floor(t * 2.5) % 2 === 0 || (t > EV.codeTypeStart && t < EV.codeTypeEnd);
  let caretPlaced = false;
  return (
    <div style={{ fontFamily: MONO, fontSize: 24, lineHeight: "44px", padding: "0 22px" }}>
      {CODE.map((line, li) => {
        const parts: React.ReactNode[] = [];
        for (const [si, seg] of line.entries()) {
          const n = Math.max(0, Math.min(seg.text.length, left));
          left -= n;
          if (n > 0) parts.push(<span key={si} style={{ color: seg.color }}>{seg.text.slice(0, n)}</span>);
        }
        const lineDone = left > 0;
        if (left > 0) left -= 1;
        const showCaret = !caretPlaced && !lineDone;
        if (showCaret) caretPlaced = true;
        return (
          <div key={li} style={{ display: "flex", whiteSpace: "pre" }}>
            <span style={{ width: 44, color: "#4d6661" }}>{li + 1}</span>
            {parts}
            {showCaret && caretOn && <span style={{ width: 3, background: C.gold, marginLeft: 2 }} />}
          </div>
        );
      })}
    </div>
  );
};

/** What the code renders: the learner's own page. */
const PreviewSite: React.FC<{ reveal: number; t: number }> = ({ reveal, t }) => (
  <div style={{ position: "absolute", left: 28, right: 28, top: 70, bottom: 96, borderRadius: 16, background: "#fff",
    border: "1px solid #e2ece9", overflow: "hidden", opacity: reveal, translate: `0 ${(1 - reveal) * 30}px` }}>
    <div style={{ height: 120, background: `linear-gradient(120deg, ${C.brandDeep}, ${C.brand})`, padding: "26px 30px" }}>
      <div style={{ fontFamily: QUICKSAND, fontSize: 36, fontWeight: 700, color: "#fff" }}>Hi, I'm Amani</div>
      <div style={{ fontFamily: QUICKSAND, fontSize: 18, color: "rgba(255,255,255,.85)" }}>I build things with code.</div>
    </div>
    <div style={{ padding: "22px 30px" }}>
      <span style={{ display: "inline-block", background: C.gold, color: C.ink, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 17,
        padding: "10px 20px", borderRadius: 12 }}>See my projects</span>
      <div style={{ display: "flex", gap: 16, marginTop: 22 }}>
        {[C.brandSoft, C.gold, C.brand].map((c, i) => (
          <div key={i} style={{ flex: 1, height: 120, borderRadius: 14, background: c, opacity: tw(t, [33.8 + i * 0.15, 34.2 + i * 0.15], [0, 0.85]),
            scale: tw(t, [33.8 + i * 0.15, 34.3 + i * 0.15], [0.85, 1], ease.back) }} />
        ))}
      </div>
    </div>
  </div>
);
