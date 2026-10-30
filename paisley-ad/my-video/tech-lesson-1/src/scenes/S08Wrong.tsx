import React from "react";
import { random } from "remotion";
import { faBrain, faCircleCheck, faCircleQuestion, faCopy, faMagnifyingGlass, faRobot, faScaleBalanced, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Spider } from "../art";
import { At, C, caret, DotGrid, E, ease, Icon, L, life, pop, QUICKSAND, Scene, SCENES, tw, typed, useT, W } from "../lib";

const QUESTION = "How many legs does a spider have?";

export const S08Wrong: React.FC = () => {
  const t = useT() + SCENES.s08[0];
  const chatIn = tw(t, [L("s08b") - 0.1, L("s08b") + 0.6], [0, 1], ease.out);
  const qAt = L("s08c") - 0.05;
  const qCps = QUESTION.length / Math.max(0.5, E("s08c") - L("s08c"));
  const thinking = t > E("s08c") + 0.15 && t < E("s08c") + 0.85;
  const aAt = E("s08c") + 0.85;
  const conf = W("s08d", "Sounds");
  const wrong = W("s08e", "wrong");
  const eight = W("s08e", "eight");
  const shake = t > wrong && t < wrong + 0.35 ? (random(`sh${Math.floor(t * 30)}`) - 0.5) * 26 : 0;
  const isWrong = t > wrong;
  const legs = tw(t, [eight - 0.5, eight + 0.6], [0, 8], ease.linear);
  const big = tw(t, [L("s08f") - 0.3, L("s08f") + 0.3], [0, 1], ease.out);
  const chatOut = tw(t, [L("s08f") - 0.3, L("s08f") + 0.4], [0, 1], ease.inOut);
  const steps = tw(t, [L("s08g") - 0.3, L("s08g") + 0.5], [0, 1], ease.inOut);
  const items = [
    { word: "ASK", at: W("s08h", "ask"), icon: faCircleQuestion, color: C.sky },
    { word: "CHECK", at: W("s08i", "check"), icon: faMagnifyingGlass, color: C.success },
    { word: "THINK", at: W("s08j", "think"), icon: faBrain, color: C.coral },
    { word: "DECIDE", at: W("s08k", "decide"), icon: faScaleBalanced, color: C.gold },
  ];
  const judge = W("s08l", "judgment");

  return (
    <Scene id="s08" push={0.02}>
      {/* the light drops for the important bit */}
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 50% 60% at 50% 45%, ${isWrong && !steps ? "#3A1512" : "#13302A"} 0%, transparent 75%)`, opacity: 0.9 }} />
      <DotGrid opacity={0.05} />
      <At x={960} y={110} style={{ opacity: life(t, L("s08a") - 0.2, L("s08b") + 0.4, 0.4) }}>
        <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 34, letterSpacing: "0.34em", color: C.gold }}>REALLY IMPORTANT</div>
      </At>

      {/* the chat */}
      <At x={tw(t, [W("s08e", "Spiders") - 0.5, W("s08e", "Spiders") + 0.2], [960, 760], ease.inOut)} y={540} style={{ opacity: chatIn * (1 - chatOut), scale: (0.94 + 0.06 * chatIn) * (1 - chatOut * 0.1), translate: `${shake}px 0`, transition: "none" }}>
        <div style={{ width: 1000, height: 600, borderRadius: 34, background: "#0E1715", border: "2px solid rgba(255,255,255,.12)", boxShadow: "0 60px 140px rgba(0,0,0,.6)", position: "relative", padding: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 28, color: "rgba(255,255,255,.7)", marginBottom: 36 }}>
            <div style={{ width: 52, height: 52, borderRadius: 26, background: C.brand, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon icon={faRobot} size={28} color="#fff" /></div>
            AI Assistant
          </div>
          {/* question */}
          <div style={{ display: "flex", justifyContent: "flex-end", opacity: t > qAt ? 1 : 0 }}>
            <div style={{ background: C.brand, color: "#06201C", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 40, padding: "20px 30px", borderRadius: "28px 28px 6px 28px", maxWidth: 760 }}>
              {typed(t, qAt, QUESTION, qCps)}{t < E("s08c") ? <span style={{ opacity: caret(t) }}>|</span> : null}
            </div>
          </div>
          {/* answer */}
          <div style={{ display: "flex", marginTop: 34, opacity: t > E("s08c") + 0.15 ? 1 : 0 }}>
            <div style={{ position: "relative", background: isWrong ? "#3A1512" : "rgba(255,255,255,.08)", border: `2px solid ${isWrong ? C.error : conf < t ? C.brand : "transparent"}`,
              color: "#fff", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 52, padding: "22px 32px", borderRadius: "28px 28px 28px 6px",
              boxShadow: t > conf && !isWrong ? `0 0 ${40 + Math.sin(t * 6) * 15}px ${C.brand}66` : undefined }}>
              {thinking ? (
                <div style={{ display: "flex", gap: 12, padding: "10px 0" }}>{[0, 1, 2].map((i) => <div key={i} style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", opacity: Math.floor(t * 6) % 3 === i ? 1 : 0.3 }} />)}</div>
              ) : (
                <span>
                  {typed(t, aAt, "Easy! A spider has ", 30)}
                  {t > aAt + 0.65 && (
                    <span style={{ position: "relative", color: isWrong ? C.error : "#fff", textShadow: t > wrong && t < wrong + 0.4 ? `4px 0 ${C.sky}, -4px 0 ${C.error}` : undefined }}>
                      6
                      <span style={{ position: "absolute", left: -6, right: -6, top: "52%", height: 7, borderRadius: 4, background: C.error, transformOrigin: "0 50%", scale: `${tw(t, [wrong + 0.05, wrong + 0.3], [0, 1])} 1` }} />
                    </span>
                  )}
                  {typed(t, aAt + 0.7, " legs.", 30)}
                </span>
              )}
            </div>
          </div>
          {/* confident badge, then the verdict */}
          <div style={{ marginTop: 26, display: "flex", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: `${C.brand}22`, color: C.brand, borderRadius: 999, padding: "8px 20px",
              fontFamily: QUICKSAND, fontWeight: 700, fontSize: 26, scale: pop(t, conf - 0.1), opacity: t > conf - 0.1 && !isWrong ? 1 : 0 }}>
              <Icon icon={faCircleCheck} size={24} color={C.brand} /> 100% sure
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.error, color: "#fff", borderRadius: 999, padding: "8px 22px",
              fontFamily: QUICKSAND, fontWeight: 700, fontSize: 28, scale: pop(t, wrong), opacity: isWrong ? 1 : 0 }}>
              <Icon icon={faXmark} size={26} color="#fff" /> WRONG
            </div>
          </div>
        </div>
      </At>
      {/* count the legs */}
      <At x={1570} y={520} style={{ opacity: tw(t, [W("s08e", "Spiders") - 0.3, W("s08e", "Spiders")], [0, 1]) * (1 - chatOut), scale: pop(t, W("s08e", "Spiders") - 0.3, 0.6) }}>
        <Spider size={420} lit={legs} />
        <div style={{ textAlign: "center", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 96, color: legs >= 8 ? C.success : "#fff", marginTop: -10 }}>
          {Math.floor(legs)}<span style={{ fontSize: 44 }}> legs</span>
        </div>
      </At>

      {/* AI CAN BE WRONG */}
      <At x={960} y={steps > 0 ? 540 - steps * 360 : 540} style={{ opacity: big, scale: (1.3 - 0.3 * big) * (1 - steps * 0.45) }}>
        <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 170, color: "#fff", whiteSpace: "nowrap", textAlign: "center", lineHeight: 1 }}>
          AI CAN BE <span style={{ color: C.error, textShadow: `0 0 60px ${C.error}88` }}>WRONG</span>
        </div>
        <div style={{ textAlign: "center", marginTop: 30, fontFamily: QUICKSAND, fontWeight: 600, fontSize: 48, color: "rgba(255,255,255,.75)",
          opacity: tw(t, [W("s08f", "confident") - 0.1, W("s08f", "confident") + 0.3], [0, 1]) * (1 - steps) }}>
          even when it sounds sure
        </div>
      </At>

      {/* don't blindly copy */}
      <At x={960} y={380} style={{ opacity: life(t, W("s08g", "copy") - 0.3, L("s08h") + 0.2, 0.3), scale: pop(t, W("s08g", "copy") - 0.3) }}>
        <div style={{ position: "relative" }}>
          <Icon icon={faCopy} size={110} color="rgba(255,255,255,.6)" />
          <div style={{ position: "absolute", left: -20, top: -20 }}><Icon icon={faXmark} size={150} color={C.error} /></div>
        </div>
      </At>

      {/* ASK -> CHECK -> THINK -> DECIDE */}
      <div style={{ position: "absolute", inset: 0, opacity: steps }}>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M ${390 + i * 380 + 110} 600 L ${390 + (i + 1) * 380 - 110} 600`} stroke="rgba(255,255,255,.4)" strokeWidth={5} strokeLinecap="round"
              pathLength={1} strokeDasharray={`${tw(t, [items[i + 1].at - 0.3, items[i + 1].at], [0, 1])} 2`} />
          ))}
          <path d="M 1530 700 C 1530 900, 390 900, 390 700" fill="none" stroke={C.gold} strokeWidth={4} strokeDasharray="6 14"
            opacity={tw(t, [judge - 0.6, judge], [0, 0.8])} strokeDashoffset={-t * 40} />
        </svg>
        {items.map((it, i) => {
          const on = t > it.at - 0.08;
          const glow = t > judge - 0.3 ? 0.6 + 0.4 * Math.sin(t * 5 - i) : t > it.at && t < it.at + 0.6 ? 1 - (t - it.at) / 0.6 : 0;
          return (
            <At key={it.word} x={390 + i * 380} y={600} style={{ scale: on ? pop(t, it.at - 0.08, 0.45) : 0, opacity: on ? 1 : 0 }}>
              <div style={{ width: 200, height: 200, borderRadius: 50, display: "flex", alignItems: "center", justifyContent: "center",
                background: `${it.color}22`, border: `3px solid ${it.color}`, boxShadow: `0 0 ${20 + glow * 70}px ${it.color}${glow > 0 ? "99" : "33"}` }}>
                <Icon icon={it.icon} size={96} color={it.color} />
              </div>
              <div style={{ textAlign: "center", marginTop: 26, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 70, letterSpacing: "0.06em", color: "#fff" }}>{it.word}</div>
            </At>
          );
        })}
        <At x={960} y={960} style={{ opacity: tw(t, [judge - 0.3, judge + 0.2], [0, 1]) }}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 40, letterSpacing: "0.3em", color: C.gold }}>YOUR JUDGMENT</div>
        </At>
      </div>
    </Scene>
  );
};
