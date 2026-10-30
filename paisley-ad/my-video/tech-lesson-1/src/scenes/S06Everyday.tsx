import React from "react";
import {
  faCamera, faEnvelope, faFilm, faLocationDot, faLock, faLockOpen, faMicrophone, faMobileScreenButton, faMusic, faPlay, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { Landscape } from "../art";
import { Robot } from "../Robot";
import { Ambient, At, C, caret, DotGrid, ease, Icon, L, life, pop, QUICKSAND, Reveal, Scene, SCENES, tw, typed, useT, W } from "../lib";

const SW = 400, SH = 820; // phone screen

const FaceUnlock: React.FC<{ t: number; at: number; open: number }> = ({ t, at, open }) => {
  const scan = (t - at) * 1.4 % 1;
  const ok = t > open;
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#1B3A4B,#0E1E28)" }}>
      <div style={{ position: "absolute", top: 70, width: "100%", textAlign: "center", color: "#fff", fontFamily: QUICKSAND, fontWeight: 600, fontSize: 64 }}>9:41</div>
      <At x={SW / 2} y={360}>
        <svg width={230} height={270} viewBox="0 0 230 270">
          <ellipse cx={115} cy={135} rx={90} ry={115} fill="none" stroke={ok ? C.success : C.sky} strokeWidth={4} strokeDasharray={ok ? undefined : "6 8"} />
          {Array.from({ length: 30 }).map((_, i) => {
            const a = (i * 137.5 * Math.PI) / 180, r = 18 + (i % 10) * 7.5;
            return <circle key={i} cx={115 + Math.cos(a) * r} cy={135 + Math.sin(a) * r * 1.25} r={3} fill={ok ? C.success : C.sky} opacity={0.8} />;
          })}
          <circle cx={85} cy={115} r={8} fill="#fff" /><circle cx={145} cy={115} r={8} fill="#fff" />
          <path d="M85 175 Q 115 195 145 175" stroke="#fff" strokeWidth={5} fill="none" strokeLinecap="round" />
          {!ok && <rect x={10} y={20 + scan * 230} width={210} height={4} fill={C.sky} opacity={0.9} />}
        </svg>
      </At>
      <At x={SW / 2} y={600} style={{ scale: ok ? pop(t, open) : 1 }}>
        <Icon icon={ok ? faLockOpen : faLock} size={64} color={ok ? C.success : "#fff"} />
      </At>
      <At x={SW / 2} y={690}><div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 28, color: ok ? C.success : "rgba(255,255,255,.7)" }}>{ok ? "Face recognised" : "Scanning..."}</div></At>
    </div>
  );
};

const Feed: React.FC<{ t: number; pick: number }> = ({ t, pick }) => (
  <div style={{ position: "absolute", inset: 0, background: "#141414", padding: "60px 22px" }}>
    {["#E9716A", "#5AA9F5", "#F5C842", "#8B7CF6"].map((c, i) => {
      const hi = i === 1 && t > pick;
      return (
        <div key={i} style={{ marginBottom: 22, borderRadius: 18, padding: 10, background: hi ? `${C.coral}33` : "transparent", border: hi ? `3px solid ${C.coral}` : "3px solid transparent", scale: hi ? 1 + 0.04 * pop(t, pick) : 1 }}>
          <div style={{ height: 120, borderRadius: 12, background: `linear-gradient(135deg, ${c}, #222)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon icon={faPlay} size={36} color="rgba(255,255,255,.85)" />
          </div>
          <div style={{ marginTop: 10, height: 14, width: "80%", borderRadius: 7, background: "rgba(255,255,255,.25)" }} />
          {hi && <div style={{ marginTop: 10, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 22, color: C.coral }}>Recommended for you</div>}
        </div>
      );
    })}
  </div>
);

const MapScreen: React.FC<{ t: number; slow: number; fast: number }> = ({ t, slow, fast }) => {
  const a = tw(t, [slow, slow + 0.8], [0, 1]);
  const b = tw(t, [fast, fast + 1], [0, 1]);
  const ping = ((t * 1.2) % 1);
  return (
    <div style={{ position: "absolute", inset: 0, background: "#E8EEEA" }}>
      <svg width={SW} height={SH} style={{ position: "absolute", inset: 0 }}>
        {[120, 260, 400, 560, 700].map((y) => <rect key={y} x={0} y={y} width={SW} height={22} fill="#fff" />)}
        {[80, 220, 330].map((x) => <rect key={x} x={x} y={0} width={22} height={SH} fill="#fff" />)}
        <rect x={240} y={430} width={120} height={110} rx={10} fill="#BFE3C9" />
        <path d="M91 720 L 91 411 L 341 411 L 341 131" fill="none" stroke={C.error} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={`${a} 2`} />
        <path d="M91 720 L 91 571 L 231 571 L 231 271 L 341 271 L 341 131" fill="none" stroke={C.success} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={`${b} 2`} />
        <circle cx={341} cy={131} r={20 + ping * 30} fill="none" stroke={C.brand} strokeWidth={3} opacity={1 - ping} />
      </svg>
      <At x={341} y={108}><Icon icon={faLocationDot} size={50} color={C.brandDeep} /></At>
      <div style={{ position: "absolute", left: 20, top: 30, background: C.error, color: "#fff", borderRadius: 12, padding: "6px 14px", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 22, opacity: a }}>Heavy traffic</div>
      <div style={{ position: "absolute", right: 20, bottom: 30, background: C.success, color: "#fff", borderRadius: 14, padding: "10px 18px", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 26, scale: pop(t, fast + 0.6), opacity: t > fast + 0.6 ? 1 : 0 }}>8 min faster</div>
    </div>
  );
};

const MusicScreen: React.FC<{ t: number; at: number }> = ({ t, at }) => (
  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#2A2140,#121018)", padding: "70px 26px" }}>
    <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 34, color: "#fff", marginBottom: 24 }}>Picked for you</div>
    {[C.gold, C.violet, C.coral, C.brand].map((c, i) => (
      <div key={i} style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 20, opacity: tw(t, [at + i * 0.15, at + i * 0.15 + 0.2], [0, 1]), translate: `${(1 - pop(t, at + i * 0.15)) * 60}px 0` }}>
        <div style={{ width: 90, height: 90, borderRadius: 14, background: `linear-gradient(135deg, ${c}, #222)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon icon={faMusic} size={34} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ height: 14, width: "80%", borderRadius: 7, background: "rgba(255,255,255,.5)" }} />
          <div style={{ height: 12, width: "50%", borderRadius: 6, background: "rgba(255,255,255,.2)", marginTop: 10 }} />
        </div>
      </div>
    ))}
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 90, marginTop: 30 }}>
      {Array.from({ length: 14 }).map((_, i) => <div key={i} style={{ flex: 1, borderRadius: 5, background: C.gold, height: 16 + Math.abs(Math.sin(t * 5 + i * 0.7)) * 70 }} />)}
    </div>
  </div>
);

const Inbox: React.FC<{ t: number; flag: number }> = ({ t, flag }) => {
  const move = tw(t, [flag + 0.3, flag + 0.9], [0, 1], ease.inOut);
  return (
    <div style={{ position: "absolute", inset: 0, background: "#F7F9F8", padding: "60px 20px" }}>
      <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 34, color: C.ink, marginBottom: 20 }}>Inbox</div>
      {["Class notes", "YOU WON $$$!! Click now", "Team project", "Science fair"].map((s, i) => {
        const spam = i === 1;
        return (
          <div key={i} style={{ height: spam ? 110 * (1 - move) : 110, overflow: "hidden", marginBottom: spam ? 14 * (1 - move) : 14 }}>
            <div style={{ height: 96, borderRadius: 16, background: spam && t > flag ? "#FDE7E4" : "#fff", border: spam && t > flag ? `2px solid ${C.error}` : "2px solid #E6ECEA",
              padding: "16px 18px", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 24, color: C.ink, translate: spam ? `${move * 420}px 0` : undefined, display: "flex", alignItems: "center", gap: 12 }}>
              {spam && t > flag && <Icon icon={faTriangleExclamation} size={28} color={C.error} />}
              {s}
            </div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 20, right: 20, bottom: 40, height: 80, borderRadius: 16, background: "#FDE7E4", display: "flex", alignItems: "center", paddingLeft: 22,
        fontFamily: QUICKSAND, fontWeight: 700, fontSize: 26, color: C.error, gap: 12 }}>
        Spam <span style={{ background: C.error, color: "#fff", borderRadius: 999, padding: "0 12px", scale: move > 0.9 ? pop(t, flag + 0.9) : 1 }}>{move > 0.9 ? 1 : 0}</span>
      </div>
    </div>
  );
};

const CameraScreen: React.FC<{ t: number; face: number; sunset: number }> = ({ t, face, sunset }) => {
  const isSun = t > sunset - 0.1;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      {isSun ? (
        <div style={{ position: "absolute", inset: 0 }}><Landscape w={SW} h={SH} /></div>
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#9CC9D9,#E7D3BC)" }}>
          <At x={SW / 2} y={380}>
            <svg width={220} height={300} viewBox="0 0 220 300">
              <rect x={60} y={200} width={100} height={110} rx={40} fill={C.brand} />
              <ellipse cx={110} cy={130} rx={70} ry={84} fill="#B07A55" />
              <path d="M40 120 C 40 40, 180 40, 180 120 C 160 80, 70 80, 40 120 Z" fill="#2B1D16" />
              <circle cx={85} cy={135} r={7} fill="#1A1210" /><circle cx={135} cy={135} r={7} fill="#1A1210" />
              <path d="M88 170 Q 110 186 132 170" stroke="#1A1210" strokeWidth={5} fill="none" strokeLinecap="round" />
            </svg>
          </At>
        </div>
      )}
      <At x={SW / 2} y={isSun ? 430 : 360} style={{ scale: pop(t, isSun ? sunset : face, 0.4) }}>
        <div style={{ width: isSun ? 330 : 190, height: isSun ? 300 : 210, border: `4px solid ${C.gold}`, borderRadius: 16 }} />
      </At>
      <At x={SW / 2} y={isSun ? 620 : 500} style={{ scale: pop(t, (isSun ? sunset : face) + 0.2, 0.4) }}>
        <div style={{ background: C.gold, color: C.ink, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 28, padding: "6px 20px", borderRadius: 999 }}>{isSun ? "SUNSET" : "FACE"}</div>
      </At>
      <At x={SW / 2} y={SH - 80}><div style={{ width: 90, height: 90, borderRadius: 45, border: "6px solid #fff" }} /></At>
    </div>
  );
};

const Voice: React.FC<{ t: number; listen: number; text: number }> = ({ t, listen, text }) => (
  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#1E1838,#0C0A18)", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 120 }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center", height: 160 }}>
      {Array.from({ length: 16 }).map((_, i) => <div key={i} style={{ width: 12, borderRadius: 6, background: C.violet, height: t > listen ? 14 + Math.abs(Math.sin(t * 9 + i * 0.8)) * 120 * tw(t, [text + 1.6, text + 2.2], [1, 0.1]) : 14 }} />)}
    </div>
    <div style={{ marginTop: 50, padding: "0 30px", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 40, color: "#fff", textAlign: "center", minHeight: 160 }}>
      {typed(t, text, '"Set a timer for ten minutes"', 22)}<span style={{ opacity: t > text ? caret(t) : 0, color: C.violet }}>|</span>
    </div>
    <div style={{ marginTop: 80, width: 130, height: 130, borderRadius: 65, background: C.violet, display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: `0 0 ${30 + Math.sin(t * 6) * 20}px ${C.violet}` }}>
      <Icon icon={faMicrophone} size={58} color="#fff" />
    </div>
  </div>
);

type Item = { at: number; word: string; sub: string; color: string; icon: IconDefinition; screen: React.ReactNode };

export const S06Everyday: React.FC = () => {
  const t = useT() + SCENES.s06[0];
  const items: Item[] = [
    { at: L("s06b"), word: "RECOGNIZE", sub: "your face", color: C.sky, icon: faMobileScreenButton, screen: <FaceUnlock t={t} at={L("s06b")} open={W("s06b", "face")} /> },
    { at: L("s06c"), word: "PREDICT", sub: "what you'll enjoy", color: C.coral, icon: faPlay, screen: <Feed t={t} pick={W("s06c", "recommends")} /> },
    { at: L("s06d"), word: "PREDICT", sub: "traffic and routes", color: C.success, icon: faLocationDot, screen: <MapScreen t={t} slow={W("s06d", "traffic") - 0.2} fast={W("s06d", "faster") - 0.2} /> },
    { at: L("s06e"), word: "SUGGEST", sub: "songs you might like", color: C.gold, icon: faMusic, screen: <MusicScreen t={t} at={W("s06e", "pick") - 0.1} /> },
    { at: L("s06f"), word: "FILTER", sub: "spam", color: C.error, icon: faEnvelope, screen: <Inbox t={t} flag={W("s06f", "spam") - 0.1} /> },
    { at: L("s06g"), word: "RECOGNIZE", sub: "faces and scenes", color: C.gold, icon: faCamera, screen: <CameraScreen t={t} face={W("s06g", "face") - 0.1} sunset={W("s06g", "sunset") - 0.1} /> },
    { at: L("s06h"), word: "UNDERSTAND", sub: "your speech", color: C.violet, icon: faMicrophone, screen: <Voice t={t} listen={W("s06h", "talk")} text={W("s06h", "turning") - 0.2} /> },
  ];
  const cur = items.reduce((k, it, i) => (t >= it.at - 0.35 ? i : k), 0);
  const movie = life(t, L("s06a") - 0.6, W("s06a", "everyday") + 0.2, 0.5);
  const phoneIn = tw(t, [W("s06a", "everyday") - 0.2, L("s06b") - 0.2], [0, 1], ease.out);
  const outro = tw(t, [L("s06i") - 0.3, L("s06i") + 0.8], [0, 1], ease.inOut);

  return (
    <Scene id="s06" push={0.02}>
      <Ambient t={t} opacity={0.3} colors={[items[cur].color, C.brandDeep, C.brand]} />
      <DotGrid />

      {/* "not just robots in movies": a robot on a film screen */}
      <At x={960} y={540} style={{ opacity: movie, scale: 0.9 + 0.1 * movie }}>
        <div style={{ width: 1100, height: 560, borderRadius: 20, background: "#000", position: "relative", overflow: "hidden", boxShadow: "0 50px 120px rgba(0,0,0,.6)" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 60%, #1D3B5A, #000 70%)" }} />
          <div style={{ position: "absolute", left: 300, top: 40 }}><Robot size={480} backdrop={0} look={Math.sin(t * 1.4) * 0.6} /></div>
          <div style={{ position: "absolute", left: 30, top: 24, display: "flex", alignItems: "center", gap: 12, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 30, letterSpacing: "0.2em", color: "rgba(255,255,255,.7)" }}>
            <Icon icon={faFilm} size={30} color="rgba(255,255,255,.7)" /> IN THE MOVIES
          </div>
        </div>
      </At>

      {/* the phone, with each everyday AI in turn */}
      <div style={{ position: "absolute", inset: 0, opacity: phoneIn * (1 - outro) }}>
        <At x={620} y={540 + (1 - phoneIn) * 300}>
          <div style={{ width: SW + 36, height: SH + 36, borderRadius: 70, background: "#0B0F0E", padding: 18, boxShadow: `0 60px 140px rgba(0,0,0,.7), 0 0 0 3px #2B3633, 0 0 80px ${items[cur].color}33`, rotate: `${Math.sin(t * 0.6) * 1.2}deg` }}>
            <div style={{ position: "relative", width: SW, height: SH, borderRadius: 54, overflow: "hidden" }}>
              {items.map((it, i) => {
                const vis = tw(t, [it.at - 0.35, it.at], [0, 1], ease.out);
                const gone = i < items.length - 1 ? tw(t, [items[i + 1].at - 0.35, items[i + 1].at], [0, 1], ease.in) : 0;
                if (vis <= 0 || gone >= 1) return null;
                return <div key={i} style={{ position: "absolute", inset: 0, translate: `0 ${(1 - vis) * 100}%`, filter: `brightness(${1 - gone * 0.6})` }}>{it.screen}</div>;
              })}
              <div style={{ position: "absolute", left: "50%", top: 16, translate: "-50% 0", width: 120, height: 34, borderRadius: 17, background: "#000" }} />
            </div>
          </div>
        </At>
        {items.map((it, i) => {
          const next = items[i + 1]?.at ?? L("s06i");
          return (
            <div key={i} style={{ position: "absolute", left: 1000, top: 380 }}>
              <Reveal t={t} at={it.at - 0.2} out={next - 0.3}>
                <div style={{ display: "flex", alignItems: "center", gap: 22, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 30, letterSpacing: "0.22em", color: it.color }}>
                  <Icon icon={it.icon} size={34} color={it.color} /> AI CAN
                </div>
              </Reveal>
              <Reveal t={t} at={it.at - 0.1} out={next - 0.3}>
                <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 120, lineHeight: 1.05, color: "#fff" }}>{it.word}</div>
              </Reveal>
              <Reveal t={t} at={it.at + 0.05} out={next - 0.3}>
                <div style={{ fontFamily: QUICKSAND, fontWeight: 600, fontSize: 54, color: "rgba(255,255,255,.75)" }}>{it.sub}</div>
              </Reveal>
            </div>
          );
        })}
      </div>

      {/* "AI isn't only robots. It's all around you." */}
      <div style={{ position: "absolute", inset: 0, opacity: outro }}>
        {items.map((it, i) => {
          const a = (i / items.length) * Math.PI * 2 + t * 0.25;
          const r = 330 * tw(t, [L("s06i"), L("s06i") + 1], [0.4, 1], ease.out);
          return (
            <At key={i} x={960 + Math.cos(a) * r * 1.5} y={540 + Math.sin(a) * r}>
              <div style={{ width: 110, height: 110, borderRadius: 30, background: `${it.color}2A`, border: `2px solid ${it.color}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 40px ${it.color}55` }}>
                <Icon icon={it.icon} size={50} color={it.color} />
              </div>
            </At>
          );
        })}
        <At x={960} y={540} style={{ scale: pop(t, W("s06i", "around") - 0.3, 0.6) }}>
          <div style={{ width: 230, height: 230, borderRadius: "50%", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: QUICKSAND, fontWeight: 700, fontSize: 76, color: C.ink, boxShadow: `0 0 90px ${C.gold}88` }}>YOU</div>
        </At>
        <At x={960} y={130}>
          <Reveal t={t} at={L("s06i") - 0.1}>
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 64, color: "#fff", whiteSpace: "nowrap" }}>
              AI isn't <span style={{ color: C.gold }}>only</span> robots.
            </div>
          </Reveal>
        </At>
      </div>
    </Scene>
  );
};
