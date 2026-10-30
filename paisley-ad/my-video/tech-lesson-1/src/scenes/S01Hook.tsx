import React from "react";
import {
  faCamera, faEnvelope, faLocationDot, faMicrophone, faMobileScreenButton, faMusic, faPlay,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { Ambient, At, C, DotGrid, E, ease, Icon, L, life, QUICKSAND, Reveal, Scene, SCENES, tw, useT, W } from "../lib";

type Tile = { key: string; label: string; icon: IconDefinition; color: string; cue: number };

/** A small looping accent that says what the AI in each thing is doing. */
const Accent: React.FC<{ k: string; t: number; c: string }> = ({ k, t, c }) => {
  if (k === "phone") {
    const y = 120 + Math.sin(t * 3) * 70;
    return (
      <>
        <div style={{ position: "absolute", left: 130, top: 90, width: 140, height: 170, border: `3px solid ${c}`, borderRadius: 26, opacity: 0.8 }} />
        <div style={{ position: "absolute", left: 120, top: y, width: 160, height: 3, background: c, boxShadow: `0 0 18px ${c}` }} />
      </>
    );
  }
  if (k === "videos") {
    return (
      <div style={{ position: "absolute", left: 60, top: 60, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, width: 280 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: 82, borderRadius: 12, background: i === Math.floor(t * 1.5) % 4 ? c : "rgba(255,255,255,.12)" }} />
        ))}
      </div>
    );
  }
  if (k === "map") {
    const p = (t * 0.6) % 1;
    return (
      <svg width={400} height={300} style={{ position: "absolute", left: 0, top: 10 }}>
        <path d="M60 240 C 140 230, 120 120, 210 120 S 300 60, 340 60" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth={14} strokeLinecap="round" />
        <path d="M60 240 C 140 230, 120 120, 210 120 S 300 60, 340 60" fill="none" stroke={c} strokeWidth={8} strokeLinecap="round" pathLength={1} strokeDasharray={`${p} 2`} />
        <circle cx={340} cy={60} r={12} fill={c} />
      </svg>
    );
  }
  if (k === "camera") {
    const s = 1 + Math.sin(t * 4) * 0.05;
    return (
      <div style={{ position: "absolute", left: 110, top: 70, width: 180, height: 180, scale: s }}>
        {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y], i) => (
          <div key={i} style={{
            position: "absolute", left: x ? undefined : 0, right: x ? 0 : undefined, top: y ? undefined : 0, bottom: y ? 0 : undefined,
            width: 40, height: 40, borderColor: c, borderStyle: "solid", borderWidth: 0,
            borderLeftWidth: x ? 0 : 5, borderRightWidth: x ? 5 : 0, borderTopWidth: y ? 0 : 5, borderBottomWidth: y ? 5 : 0,
          }} />
        ))}
      </div>
    );
  }
  if (k === "voice" || k === "music") {
    return (
      <div style={{ position: "absolute", left: 70, top: 90, width: 260, height: 150, display: "flex", alignItems: "center", gap: 10 }}>
        {Array.from({ length: 13 }).map((_, i) => {
          const h = 20 + Math.abs(Math.sin(t * (k === "voice" ? 7 : 4) + i * (k === "voice" ? 0.9 : 0.5))) * (k === "voice" ? 120 : 90);
          return <div key={i} style={{ flex: 1, height: h, borderRadius: 8, background: c, opacity: 0.85 }} />;
        })}
      </div>
    );
  }
  // email: one message gets flagged and slides away
  const p = (t * 0.5) % 1;
  return (
    <div style={{ position: "absolute", left: 70, top: 70, width: 260 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          height: 50, marginBottom: 14, borderRadius: 10, background: i === 1 ? C.error : "rgba(255,255,255,.14)",
          opacity: i === 1 ? 1 - tw(p, [0.5, 0.8], [0, 1]) : 1, translate: i === 1 ? `${tw(p, [0.5, 0.8], [0, 160])}px 0` : undefined,
          fontFamily: QUICKSAND, fontWeight: 700, color: "#fff", fontSize: 22, lineHeight: "50px", paddingLeft: 16,
        }}>{i === 1 ? "SPAM" : ""}</div>
      ))}
    </div>
  );
};

export const S01Hook: React.FC = () => {
  const t = useT() + SCENES.s01[0];
  const tiles: Tile[] = [
    { key: "phone", label: "YOUR PHONE", icon: faMobileScreenButton, color: C.brand, cue: W("s01b", "phone") },
    { key: "videos", label: "RECOMMENDED VIDEOS", icon: faPlay, color: C.coral, cue: W("s01b", "videos") },
    { key: "map", label: "MAPS", icon: faLocationDot, color: C.success, cue: W("s01b", "map") },
    { key: "camera", label: "CAMERA", icon: faCamera, color: C.sky, cue: W("s01b", "camera") },
    { key: "voice", label: "VOICE ASSISTANT", icon: faMicrophone, color: C.violet, cue: W("s01b", "voice") },
    { key: "music", label: "MUSIC", icon: faMusic, color: C.gold, cue: W("s01b", "music") },
    { key: "email", label: "EMAIL", icon: faEnvelope, color: C.warn, cue: W("s01b", "email") },
  ];
  // the carousel's focus steps from tile to tile on each spoken word
  let focus = -1.2;
  tiles.forEach((tl, i) => {
    focus += tw(t, [tl.cue - 0.3, tl.cue + 0.15], [0, 1], ease.inOut) * (i === 0 ? 1.2 : 1);
  });
  const ring = tw(t, [L("s01c") - 0.2, L("s01c") + 1.1], [0, 1], ease.inOut);
  const linkP = tw(t, [W("s01c", "used"), W("s01c", "used") + 1.2], [0, 1]);
  const titleOut = tw(t, [E("s01a") + 0.25, L("s01b") + 0.1], [0, 1], ease.inOut);
  const coreIn = tw(t, [W("s01c", "AI") - 0.5, W("s01c", "AI")], [0, 1], ease.back);

  return (
    <Scene id="s01" push={0.05}>
      <Ambient t={t} opacity={0.4} />
      <DotGrid />
      {/* "Wait... what actually is AI?" */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        opacity: 1 - titleOut, scale: 1 - titleOut * 0.25, filter: `blur(${titleOut * 12}px)` }}>
        <Reveal t={t} at={W("s01a", "Wait") - 0.05}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 600, fontSize: 84, color: "rgba(255,255,255,.7)" }}>Wait...</div>
        </Reveal>
        <Reveal t={t} at={W("s01a", "what") - 0.05}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 600, fontSize: 84, color: "#fff" }}>what actually is</div>
        </Reveal>
        <div style={{ scale: tw(t, [W("s01a", "AI") - 0.1, W("s01a", "AI") + 0.5], [0.4, 1], ease.back), opacity: tw(t, [W("s01a", "AI") - 0.1, W("s01a", "AI") + 0.1], [0, 1]) }}>
          <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 340, lineHeight: 1, color: C.brand,
            textShadow: `0 0 80px ${C.brand}88`, rotate: `${Math.sin(t * 2.5) * 2}deg` }}>
            AI<span style={{ color: C.gold }}>?</span>
          </div>
        </div>
      </div>

      {/* the everyday things, first as a carousel, then as a ring around AI */}
      {tiles.map((tl, i) => {
        const d = i - focus;
        const cx = 960 + d * 640, cy = 500;
        const ang = (i / tiles.length) * Math.PI * 2 - Math.PI / 2;
        const rx = 960 + Math.cos(ang) * 600, ry = 540 + Math.sin(ang) * 330;
        const x = cx + (rx - cx) * ring, y = cy + (ry - cy) * ring;
        const near = Math.max(0, 1 - Math.abs(d));
        const s = (0.62 + 0.38 * near) * (1 - ring) + 0.4 * ring;
        const o = tw(t, [tl.cue - 0.7, tl.cue - 0.2], [0, 1]) * life(t, 0, SCENES.s01[1] + 1);
        return (
          <At key={tl.key} x={x} y={y} style={{ opacity: o, scale: s, zIndex: Math.round(near * 10) }}>
            <div style={{
              width: 400, height: 400, borderRadius: 48, position: "relative", overflow: "hidden",
              background: `linear-gradient(160deg, ${tl.color}33, rgba(255,255,255,.04))`,
              border: `2px solid ${tl.color}${near > 0.5 || ring > 0.5 ? "cc" : "44"}`,
              boxShadow: `0 40px 90px rgba(0,0,0,.5), 0 0 ${60 * near}px ${tl.color}44`,
            }}>
              <Accent k={tl.key} t={t - tl.cue} c={tl.color} />
              <div style={{ position: "absolute", left: 32, bottom: 30, display: "flex", alignItems: "center", gap: 16 }}>
                <Icon icon={tl.icon} size={44} color={tl.color} />
              </div>
            </div>
            <div style={{ marginTop: 26, textAlign: "center", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 34, letterSpacing: "0.2em",
              color: "#fff", opacity: Math.max(near, ring * 0.0) * (1 - ring) }}>{tl.label}</div>
          </At>
        );
      })}

      {/* connecting lines to the AI core */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: ring }}>
        {tiles.map((tl, i) => {
          const ang = (i / tiles.length) * Math.PI * 2 - Math.PI / 2;
          const x = 960 + Math.cos(ang) * 600, y = 540 + Math.sin(ang) * 330;
          const p = Math.max(0, Math.min(1, linkP * 1.6 - i * 0.09));
          return (
            <line key={i} x1={960} y1={540} x2={960 + (x - 960) * p} y2={540 + (y - 540) * p}
              stroke={tl.color} strokeWidth={3} strokeDasharray="2 12" strokeLinecap="round" opacity={0.9} />
          );
        })}
      </svg>
      <At x={960} y={540} style={{ scale: coreIn, opacity: coreIn > 0 ? 1 : 0 }}>
        <div style={{
          width: 220, height: 220, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          background: `radial-gradient(circle, ${C.brand} 0%, ${C.brandDeep} 70%)`,
          boxShadow: `0 0 ${90 + Math.sin(t * 3) * 20}px ${C.brand}`,
          fontFamily: QUICKSAND, fontWeight: 700, fontSize: 100, color: "#fff",
        }}>AI</div>
      </At>
    </Scene>
  );
};
