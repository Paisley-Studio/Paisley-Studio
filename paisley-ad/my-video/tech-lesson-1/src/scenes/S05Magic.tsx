import React from "react";
import { random } from "remotion";
import { faCode, faFileLines, faGear, faImage, faMusic, faPalette, faScrewdriverWrench, faUser, faUsers, faDatabase } from "@fortawesome/free-solid-svg-icons";
import { Landscape } from "../art";
import { Ambient, At, C, CAVEAT, caret, DotGrid, ease, Icon, L, life, MONO, pop, QUICKSAND, Scene, SCENES, tw, typed, useT, W } from "../lib";

const PW = 620, PH = 430, GAP = 740;
const STORY = "Once upon a time, a girl built a robot that could paint the stars...";
const CODE = [
  [["function ", C.violet], ["greet", C.gold], ["(name) {", "#fff"]],
  [["  return ", C.violet], ['"Hello, "', C.success], [" + name;", "#fff"]],
  [["}", "#fff"]],
  [["", "#fff"]],
  [["greet", C.gold], ["(", "#fff"], ['"Paisley"', C.success], [");", "#fff"]],
] as const;

const Canvas: React.FC<{ p: number }> = ({ p }) => (
  <>
    <div style={{ position: "absolute", inset: 0, clipPath: `polygon(0 0, ${p * 220}% 0, ${p * 220 - 100}% 100%, 0 100%)` }}>
      <Landscape w={PW} h={PH} sun={p} />
    </div>
    <div style={{ position: "absolute", left: `${p * 160 - 30}%`, top: 0, bottom: 0, width: 60, background: "linear-gradient(90deg, transparent, rgba(255,255,255,.6), transparent)", rotate: "20deg", opacity: p > 0 && p < 1 ? 1 : 0 }} />
  </>
);

const Page: React.FC<{ t: number; at: number }> = ({ t, at }) => (
  <div style={{ position: "absolute", inset: 0, background: "#FBF8F1", padding: "50px 56px", fontFamily: CAVEAT, fontWeight: 600, fontSize: 50, color: "#2A2522", lineHeight: 1.25 }}>
    {typed(t, at, STORY, 30)}<span style={{ opacity: caret(t), color: C.brand }}>|</span>
  </div>
);

const Editor: React.FC<{ t: number; at: number }> = ({ t, at }) => {
  let budget = Math.max(0, Math.floor((t - at) * 30));
  return (
    <div style={{ position: "absolute", inset: 0, background: "#0D1714", padding: "40px 40px", fontFamily: MONO, fontSize: 32, lineHeight: 1.6 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>{["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />)}</div>
      {CODE.map((line, i) => (
        <div key={i} style={{ whiteSpace: "pre", minHeight: 51 }}>
          <span style={{ color: "#4B5D58", marginRight: 22 }}>{i + 1}</span>
          {line.map(([txt, col], j) => {
            const show = txt.slice(0, Math.max(0, budget));
            budget -= txt.length;
            return <span key={j} style={{ color: col }}>{show}</span>;
          })}
        </div>
      ))}
    </div>
  );
};

const Poster: React.FC<{ t: number; at: number }> = ({ t, at }) => {
  const s = (d: number) => pop(t, at + d, 0.5);
  return (
    <div style={{ position: "absolute", inset: 0, background: "#fff" }}>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(140deg, ${C.brandDeep}, ${C.brand})`, clipPath: `circle(${tw(t, [at, at + 0.6], [0, 120])}% at 20% 20%)` }} />
      <div style={{ position: "absolute", right: -60, top: -60, width: 300, height: 300, borderRadius: "50%", background: C.gold, scale: s(0.25) }} />
      <div style={{ position: "absolute", left: 40, bottom: 40, width: 120, height: 120, borderRadius: 24, background: C.coral, rotate: "18deg", scale: s(0.4) }} />
      <div style={{ position: "absolute", left: 50, top: 120, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 92, lineHeight: 0.95, color: "#fff", opacity: s(0.55), translate: `${(1 - s(0.55)) * -40}px 0` }}>
        SCIENCE<br />FAIR
      </div>
      <div style={{ position: "absolute", left: 54, top: 330, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 30, letterSpacing: "0.2em", color: C.goldSoft, opacity: s(0.75) }}>
        FRIDAY · 3 PM
      </div>
    </div>
  );
};

const Melody: React.FC<{ t: number; at: number }> = ({ t, at }) => {
  const notes = [[0, 5], [1, 3], [2, 4], [3, 1], [4, 2], [5, 4], [6, 6], [7, 3], [8, 5], [9, 2], [10, 4], [11, 6]];
  const head = tw(t, [at, at + 1.6], [0, 1], ease.linear);
  return (
    <div style={{ position: "absolute", inset: 0, background: "#16122B" }}>
      {Array.from({ length: 8 }).map((_, r) => <div key={r} style={{ position: "absolute", left: 0, right: 0, top: 40 + r * 48, height: 1, background: "rgba(255,255,255,.07)" }} />)}
      {notes.map(([x, y], i) => {
        const nx = 30 + x * 48;
        const on = head * PW > nx;
        return <div key={i} style={{ position: "absolute", left: nx, top: 40 + y * 48 - 14, width: 40, height: 28, borderRadius: 8, background: C.violet,
          opacity: on ? 1 : 0, scale: on ? 1 : 0.5, boxShadow: `0 0 18px ${C.violet}` }} />;
      })}
      <div style={{ position: "absolute", left: head * PW, top: 0, bottom: 0, width: 3, background: C.gold, boxShadow: `0 0 12px ${C.gold}` }} />
    </div>
  );
};

export const S05Magic: React.FC = () => {
  const t = useT() + SCENES.s05[0];
  const cues = [W("s05b", "blank"), W("s05c", "empty"), W("s05d", "empty"), W("s05e", "blank"), W("s05f", "silent")];
  const make = [W("s05b", "becomes"), W("s05c", "becomes"), W("s05d", "fills"), W("s05e", "becomes"), W("s05f", "becomes")];
  const labels = [
    { blank: "BLANK CANVAS", done: "PICTURE", icon: faImage, c: C.coral },
    { blank: "EMPTY PAGE", done: "STORY", icon: faFileLines, c: C.gold },
    { blank: "EMPTY EDITOR", done: "CODE", icon: faCode, c: C.success },
    { blank: "BLANK DESIGN", done: "POSTER", icon: faPalette, c: C.brand },
    { blank: "SILENT TIMELINE", done: "MELODY", icon: faMusic, c: C.violet },
  ];
  let focus = -0.6;
  cues.forEach((c, i) => { focus += tw(t, [c - 0.45, c], [0, 1], ease.inOut) * (i === 0 ? 0.6 : 1); });
  const wide = tw(t, [L("s05g") - 0.5, L("s05g") + 0.6], [0, 1], ease.inOut);
  const magic = W("s05g", "magic");
  const notMagic = W("s05h", "isn't");
  const flip = tw(t, [notMagic, notMagic + 0.7], [0, 1], ease.inOut);
  const toolStage = tw(t, [L("s05i") - 0.3, L("s05i") + 0.6], [0, 1], ease.inOut);
  const intro = tw(t, [L("s05a"), L("s05a") + 0.6], [0, 1]);

  return (
    <Scene id="s05" push={0.02}>
      <Ambient t={t} opacity={0.3} colors={[C.violet, C.brand, C.coral]} />
      <DotGrid />

      <div style={{ position: "absolute", inset: 0, opacity: 1 - toolStage, scale: 1 - toolStage * 0.2 }}>
        {labels.map((lb, i) => {
          const cx = 960 + (i - focus) * GAP;
          const wx = 960 + (i - 2) * 360;
          const x = cx + (wx - cx) * wide;
          const near = Math.max(0, 1 - Math.abs(i - focus));
          const s = (0.72 + 0.28 * near) * (1 - wide) + 0.5 * wide;
          const done = t > make[i];
          return (
            <At key={i} x={x} y={500 + wide * 20} style={{ scale: s, opacity: intro, perspective: 1600 }}>
              <div style={{ textAlign: "center", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 40, letterSpacing: "0.2em", marginBottom: 26,
                color: done ? lb.c : "rgba(255,255,255,.6)", opacity: 1 - wide }}>
                {done ? lb.done : lb.blank}
              </div>
              <div style={{ position: "relative", width: PW, height: PH, transformStyle: "preserve-3d", rotate: `y ${flip * 180}deg` }}>
                {/* front: the blank thing becoming a made thing */}
                <div style={{ position: "absolute", inset: 0, borderRadius: 30, overflow: "hidden", backfaceVisibility: "hidden",
                  background: i === 1 ? "#FBF8F1" : i === 2 ? "#0D1714" : i === 4 ? "#16122B" : "#fff",
                  boxShadow: `0 40px 90px rgba(0,0,0,.5), 0 0 ${near * 60 + wide * 30}px ${lb.c}44`, border: `2px solid ${lb.c}66` }}>
                  {i === 0 && <Canvas p={tw(t, [make[0], make[0] + 1.1], [0, 1], ease.inOut)} />}
                  {i === 1 && <Page t={t} at={make[1] - 0.1} />}
                  {i === 2 && <Editor t={t} at={make[2] - 0.1} />}
                  {i === 3 && <Poster t={t} at={make[3] - 0.1} />}
                  {i === 4 && <Melody t={t} at={make[4]} />}
                  {!done && <div style={{ position: "absolute", left: 30, bottom: 26 }}><Icon icon={lb.icon} size={40} color={`${lb.c}88`} /></div>}
                </div>
                {/* back: what's really there */}
                <div style={{ position: "absolute", inset: 0, borderRadius: 30, backfaceVisibility: "hidden", rotate: "y 180deg",
                  background: "#0E2A40", border: `2px solid ${C.sky}88`, display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundImage: "linear-gradient(rgba(90,169,245,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(90,169,245,.18) 1px, transparent 1px)",
                  backgroundSize: "40px 40px" }}>
                  <Icon icon={faGear} size={180} color={C.sky} style={{ rotate: `${t * 40}deg` }} />
                </div>
              </div>
            </At>
          );
        })}
        {/* sparkles: "it can look like magic" */}
        {Array.from({ length: 70 }).map((_, i) => {
          const x = random(`sx${i}`) * 1920;
          const y0 = random(`sy${i}`) * 1080;
          const fall = tw(t, [notMagic, notMagic + 1.2], [0, 1], ease.in);
          const y = y0 + fall * (700 + random(`f${i}`) * 400);
          const tw2 = 0.5 + 0.5 * Math.sin(t * (3 + random(`tw${i}`) * 4) + i);
          const o = tw(t, [magic - 0.6 + random(`d${i}`) * 0.5, magic], [0, 1]) * (1 - fall);
          return <div key={i} style={{ position: "absolute", left: x, top: y, width: 10, height: 10, rotate: "45deg", background: C.goldSoft,
            opacity: o * tw2, boxShadow: `0 0 16px ${C.gold}`, scale: 0.5 + tw2 }} />;
        })}
        <At x={960} y={880}>
          <div style={{ position: "relative", fontFamily: CAVEAT, fontWeight: 700, fontSize: 170, color: C.gold, textShadow: `0 0 50px ${C.gold}88`,
            opacity: tw(t, [magic - 0.3, magic + 0.1], [0, 1]), scale: pop(t, magic - 0.3, 0.6) }}>
            magic?
            <div style={{ position: "absolute", left: -10, right: -10, top: "55%", height: 12, borderRadius: 6, background: C.error,
              transformOrigin: "0 50%", scale: `${tw(t, [notMagic + 0.1, notMagic + 0.45], [0, 1])} 1` }} />
          </div>
        </At>
      </div>

      {/* AI = a tool, built by people, using patterns from information, to make or help */}
      <div style={{ position: "absolute", inset: 0, opacity: toolStage }}>
        <At x={960} y={170}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 96, color: "#fff", whiteSpace: "nowrap" }}>
            AI = <span style={{ color: C.brand }}>A TOOL</span>
          </div>
        </At>
        {/* information flowing in */}
        {Array.from({ length: 30 }).map((_, i) => {
          const p = (t * 0.5 + random(`i${i}`)) % 1;
          const y = 560 + (random(`iy${i}`) - 0.5) * 260 * (1 - p);
          return <div key={i} style={{ position: "absolute", left: 260 + p * 520, top: y, width: 14, height: 14, borderRadius: 4,
            background: [C.sky, C.gold, C.violet, C.coral][i % 4], opacity: tw(t, [W("s05i", "information") - 0.4, W("s05i", "information")], [0, 1]) * Math.sin(p * Math.PI) }} />;
        })}
        <At x={290} y={560} style={{ opacity: tw(t, [W("s05i", "information") - 0.4, W("s05i", "information")], [0, 1]) }}>
          <Icon icon={faDatabase} size={110} color={C.sky} />
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 30, letterSpacing: "0.16em", color: C.sky, marginTop: 18, textAlign: "center" }}>INFORMATION</div>
        </At>
        <At x={960} y={560} style={{ scale: pop(t, W("s05i", "tool") - 0.2, 0.6) }}>
          <div style={{ width: 300, height: 300, borderRadius: 70, display: "flex", alignItems: "center", justifyContent: "center",
            background: `linear-gradient(150deg, ${C.brand}, ${C.brandDeep})`, boxShadow: `0 0 90px ${C.brand}88` }}>
            <Icon icon={faScrewdriverWrench} size={150} color="#fff" />
          </div>
        </At>
        {/* the people who built it */}
        {[0, 1, 2].map((i) => {
          const a = -Math.PI / 2 + (i - 1) * 0.9;
          const at = W("s05i", "people") - 0.2 + i * 0.12;
          return (
            <At key={i} x={960 + Math.cos(a) * 250} y={560 + Math.sin(a) * 250 + 40} style={{ scale: pop(t, at), opacity: t > at ? 1 : 0 }}>
              <div style={{ width: 84, height: 84, borderRadius: 42, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon icon={i === 1 ? faUsers : faUser} size={44} color={C.brandDeep} />
              </div>
            </At>
          );
        })}
        <At x={960} y={860} style={{ opacity: tw(t, [W("s05i", "people") - 0.1, W("s05i", "people") + 0.3], [0, 1]) }}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 34, letterSpacing: "0.2em", color: "rgba(255,255,255,.8)" }}>BUILT BY PEOPLE</div>
        </At>
        {/* what comes out */}
        {labels.map((lb, i) => {
          const at = W("s05i", "generate") - 0.1 + i * 0.12;
          const y = 360 + i * 100;
          return (
            <React.Fragment key={i}>
              <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
                <path d={`M 1120 560 C 1300 560, 1350 ${y}, 1500 ${y}`} fill="none" stroke={lb.c} strokeWidth={3} pathLength={1}
                  strokeDasharray={`${tw(t, [at - 0.2, at + 0.3], [0, 1])} 2`} opacity={0.7} />
              </svg>
              <At x={1560} y={y} style={{ scale: pop(t, at), opacity: t > at ? 1 : 0 }}>
                <div style={{ width: 76, height: 76, borderRadius: 20, background: `${lb.c}33`, border: `2px solid ${lb.c}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon icon={lb.icon} size={36} color={lb.c} />
                </div>
              </At>
            </React.Fragment>
          );
        })}
        <At x={1720} y={560} style={{ opacity: life(t, W("s05i", "help") - 0.2, SCENES.s05[1] + 1, 0.3), scale: pop(t, W("s05i", "help") - 0.2) }}>
          <div style={{ width: 120, height: 120, borderRadius: 60, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 50px ${C.gold}88` }}>
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 38, color: C.ink }}>YOU</div>
          </div>
        </At>
      </div>
    </Scene>
  );
};
