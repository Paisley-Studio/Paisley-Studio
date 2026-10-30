import React from "react";
import { Img, random, staticFile } from "remotion";
import { faHeart } from "@fortawesome/free-solid-svg-icons";
import { Bulb, C, Icon, QUICKSAND, Type, tw, ease, twinkle } from "./lib";
import { Lockup } from "./art";

/** What the children make. Each one renders in a fixed-size box, driven by absolute time `t`. */

export const BrowserChrome: React.FC<{ w: number; h: number; url: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ w, h, url, children, style }) => (
  <div style={{ position: "relative", width: w, height: h, borderRadius: 24, overflow: "hidden", background: C.paper, boxShadow: "0 40px 100px rgba(0,0,0,.42)", ...style }}>
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 54, background: "#fff", display: "flex", alignItems: "center", gap: 10, padding: "0 22px" }}>
      {[C.berry, C.gold, C.brand].map((c) => <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />)}
      <div style={{ marginLeft: 16, flex: 1, height: 32, borderRadius: 16, background: C.sage, fontFamily: QUICKSAND, fontWeight: 600, fontSize: 18, color: C.muted, lineHeight: "32px", paddingLeft: 18 }}>{url}</div>
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, top: 54, bottom: 0, overflow: "hidden" }}>{children}</div>
  </div>
);

/** A rectangle of a supplied screen, placed where it sits on that screen. `zoom` slowly pushes into a photo. */
export const Crop: React.FC<{ src: string; iw: number; ih: number; box: number[]; k: number; zoom?: number; p?: number; radius?: number; at?: [number, number] }> = ({ src, iw, ih, box, k, zoom = 1, p = 1, radius = 0, at }) => {
  const [x0, y0, x1, y1] = box;
  return (
    <div style={{ position: "absolute", left: (at ? at[0] : x0) * k, top: (at ? at[1] : y0) * k, width: (x1 - x0) * k, height: (y1 - y0) * k, overflow: "hidden", borderRadius: radius, opacity: Math.min(1, p * 2), scale: 0.78 + p * 0.22 }}>
      <Img src={staticFile(src)} style={{ position: "absolute", left: -x0 * k, top: -y0 * k, width: iw * k, height: ih * k, maxWidth: "none", scale: zoom, transformOrigin: `${((x0 + x1) / 2) * k}px ${((y0 + y1) / 2) * k}px` }} />
    </div>
  );
};

const SITE = { src: "img/real/site.jpg", iw: 1536, ih: 1024 };
const SITE_MODULES = [
  [0, 0, 1536, 84], [0, 84, 262, 1024], [278, 97, 1148, 418], [278, 440, 494, 614], [515, 440, 727, 614], [747, 440, 944, 614], [965, 440, 1148, 614],
  [278, 636, 797, 822], [816, 636, 1148, 906], [278, 842, 797, 997], [1169, 97, 1513, 379], [1169, 400, 1513, 822], [1169, 843, 1513, 988],
];

/** The Muraya family's Christmas site, assembling module by module, and alive once it is up: lights, countdown, playlist, RSVPs. */
export const RealSite: React.FC<{ t: number; at: number; step?: number; w?: number; chrome?: boolean; confirmAt?: number }> = ({ t, at, step = 0.1, w = 1320, chrome = true, confirmAt = 1e9 }) => {
  const k = w / 1536;
  const h = 1024 * k;
  const live = w > 500;
  const body = (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, background: "#FCF8F2", overflow: "hidden" }}>
      {SITE_MODULES.map((b, i) => <Crop key={i} {...SITE} box={b} k={k} zoom={i === 2 ? 1 + Math.max(0, t - at) * 0.012 : 1} p={step === 0 ? 1 : tw(t, [at + i * step, at + i * step + 0.26], [0, 1], ease.back)} />)}
      <div style={{ position: "absolute", left: 40 * k, top: 19 * k, opacity: tw(t, [at, at + 0.15], [0, 1]) }}><Lockup size={33 * k} /></div>
      {live && (
        <div style={{ opacity: step === 0 ? 1 : tw(t, [at + 2 * step, at + 2 * step + 0.2], [0, 1]) }}>
          {/* the tree in the hero photo is lit, and the fire moves */}
          {Array.from({ length: 24 }, (_, i) => <Bulb key={i} x={(800 + random(`tx${i}`) * 220) * k} y={(125 + random(`ty${i}`) * 200) * k} r={2.6 * k + 0.6} on={twinkle(t, i, 1.6)} />)}
          <div style={{ position: "absolute", left: 1055 * k, top: 180 * k, width: 120 * k, height: 130 * k, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,170,60,.55), transparent 70%)", opacity: 0.45 + 0.5 * Math.abs(Math.sin(t * 7) * Math.cos(t * 3)) }} />
        </div>
      )}
      {/* the countdown really counts */}
      <div style={{ position: "absolute", left: 572 * k, top: 730 * k, width: 60 * k, height: 40 * k, background: "#DBEDEB", display: "grid", placeItems: "center", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 28 * k, color: C.brandDeep, opacity: tw(t, [at + 7 * step, at + 7 * step + 0.2], [0, 1]) }}>
        {String(59 - (Math.floor(t * 1.5) % 60)).padStart(2, "0")}
      </div>
      {/* the playlist is playing */}
      <div style={{ position: "absolute", left: 836 * k, top: 722 * k, width: 292 * k, height: 4 * k, borderRadius: 3, background: C.sage, opacity: tw(t, [at + 8 * step, at + 8 * step + 0.2], [0, 1]) }}>
        <div style={{ width: `${((t * 6) % 100)}%`, height: "100%", borderRadius: 3, background: C.brand }} />
      </div>
      {/* Uncle Brian finally says yes */}
      {t >= confirmAt && <Crop {...SITE} box={[1416, 465, 1495, 491]} at={[1416, 626]} k={k} p={tw(t, [confirmAt, confirmAt + 0.22], [0, 1], ease.back)} />}
    </div>
  );
  if (!chrome) return body;
  return <BrowserChrome w={w} h={h + 54} url="murayafamily.christmas">{body}</BrowserChrome>;
};

const BLOG = { src: "img/real/blog.jpg", iw: 1536, ih: 1024 };
const BLOG_MODULES = [
  [0, 0, 1536, 88], [0, 88, 225, 1024], [252, 94, 1505, 402], [252, 415, 1095, 1006], [900, 637, 1067, 719], [900, 732, 1067, 826], [900, 840, 1067, 939],
  [1120, 415, 1505, 576], [1120, 583, 1505, 788], [1120, 794, 1505, 1005],
];
const BLOG_ROWS = [523, 548, 572, 597];

/** The holiday blog: a real page being written. Lines appear as they are typed, photos drop in, the sea moves. */
export const RealBlog: React.FC<{ t: number; at: number; w?: number; chrome?: boolean; likeAt?: number; typing?: number }> = ({ t, at, w = 1060, chrome = true, likeAt = 1e9, typing = 0.55 }) => {
  const k = w / 1536;
  const h = 1024 * k;
  const step = 0.05;
  const body = (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, background: "#FEFAF5", overflow: "hidden" }}>
      {BLOG_MODULES.map((b, i) => <Crop key={i} {...BLOG} box={b} k={k} zoom={i === 2 ? 1 + Math.max(0, t - at) * 0.018 : 1} p={tw(t, [at + i * step, at + i * step + 0.24], [0, 1], ease.back)} />)}
      <div style={{ opacity: tw(t, [at, at + 0.15], [0, 1]) }}>
        <Crop {...BLOG} box={[281, 637, 886, 939]} k={k} zoom={1 + Math.max(0, t - at) * 0.035} radius={14 * k} p={tw(t, [at + 0.18, at + 0.4], [0, 1], ease.back)} />
        <div style={{ position: "absolute", left: 40 * k, top: 22 * k }}><Lockup size={33 * k} /></div>
      </div>
      {/* the paragraph being written: each row is uncovered from the left */}
      {BLOG_ROWS.map((y, i) => {
        const p = tw(t, [at + 0.05 + (i * typing) / 4, at + 0.05 + ((i + 1) * typing) / 4], [0, 1], ease.linear);
        return p < 1 ? (
          <div key={y} style={{ position: "absolute", left: (281 + 548 * p) * k, top: (y - 1) * k, width: 548 * (1 - p) * k + 2, height: 24 * k, background: "#FEFBF6", borderLeft: p > 0 ? `${2.4 * k + 0.6}px solid ${C.brandDeep}` : undefined }} />
        ) : null;
      })}
      {/* someone likes it */}
      {t >= likeAt && (
        <>
          <div style={{ position: "absolute", left: 306 * k, top: 959 * k, width: 32 * k, height: 24 * k, background: "#FEFBF6", display: "grid", placeItems: "center", fontFamily: QUICKSAND, fontWeight: 600, fontSize: 18 * k, color: C.brandDeep }}>{24 + Math.min(40, Math.floor((t - likeAt) * 16))}</div>
          <Icon icon={faHeart} size={30 * k} color={C.berry} style={{ position: "absolute", left: 277 * k, top: 956 * k, scale: 1 + 0.4 * Math.max(0, 1 - (t - likeAt) * 3) }} />
        </>
      )}
    </div>
  );
  if (!chrome) return body;
  return <BrowserChrome w={w} h={h + 54} url="paisleystudio.online/tech/p/amani">{body}</BrowserChrome>;
};

const sprite = (n: string) => staticFile(`img/real/game_${n}.png`);
const GAME_BG = "#F9F6F0";
const SPR: Record<string, [number, number]> = {
  dino: [222, 216], cactus: [146, 213], gifts: [200, 121], bird: [128, 124], star: [66, 64], tree: [158, 235], cloud: [148, 54], sun: [210, 132], hearts: [168, 46], score: [128, 32],
};

/** The dino, on its own, for moments outside the game. */
export const Dino: React.FC<{ s: number; style?: React.CSSProperties }> = ({ s, style }) => (
  <Img src={sprite("dino")} style={{ width: SPR.dino[0] * s, height: SPR.dino[1] * s, ...style }} />
);

/** The game, actually playing: the dino runs, clears obstacles, collects stars, and the score counts. `hopMul` is the jump the coach asked for. */
export const GameScreen: React.FC<{ t: number; at: number; w?: number; h?: number; sp?: number; hopMul?: number; shadow?: boolean; hideDino?: boolean; brand?: boolean }> = ({ t, at, w = 1180, h = 680, sp, hopMul = 1, shadow = true, hideDino = false, brand = true }) => {
  const s = sp ?? (0.95 * w) / 1180;
  const el = Math.max(0, t - at);
  const v = 660 * s;
  const scroll = (el + 8) * v;
  const ground = h - 86 * Math.max(0.5, s / 0.74);
  const dinoX = 150 * (s / 0.74);
  const gap = 540 * s;
  const seq = ["cactus", "gifts", "star", "cactus", "tree", "gifts", "star", "cactus"];
  const span = gap * seq.length;
  const wrap = (x: number, m: number) => ((x % m) + m) % m;
  const items = seq.map((n, i) => ({ n, i, x: wrap(i * gap + w + 60 * s - scroll, span) - 200 * s }));
  // a clean parabola over each obstacle
  let lift = 0;
  const R = 185 * s;
  for (const it of items) {
    if (it.n === "star" || it.n === "tree") continue;
    const c = it.x + (SPR[it.n][0] * s) / 2 - (dinoX + (SPR.dino[0] * s) / 2);
    if (Math.abs(c) < R) lift = Math.max(lift, 1 - (c / R) ** 2);
  }
  const air = lift > 0.02;
  const run = air ? 0 : Math.sin(t * 34);
  const stars = items.filter((it) => it.n === "star" && it.x < dinoX).length;
  const score = 482 + Math.floor((el + 2) * 118) + stars * 50;
  return (
    <div style={{ position: "relative", width: w, height: h, borderRadius: 24 * Math.max(0.4, s / 0.74), overflow: "hidden", background: GAME_BG, boxShadow: shadow ? "0 40px 100px rgba(0,0,0,.4)" : undefined }}>
      {[0, 1, 2, 3].map((i) => <Img key={i} src={sprite("cloud")} style={{ position: "absolute", left: wrap(i * 460 * s - scroll * 0.12, 1840 * s + w) - 200 * s, top: (120 + (i % 2) * 74) * s, width: SPR.cloud[0] * s, height: SPR.cloud[1] * s }} />)}
      <Img src={sprite("sun")} style={{ position: "absolute", right: 60 * s, top: 130 * s, width: SPR.sun[0] * s, height: SPR.sun[1] * s }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: ground, height: Math.max(2, 5 * s), background: C.brandDeep }} />
      {Array.from({ length: Math.ceil(w / (70 * s)) + 2 }, (_, i) => <div key={i} style={{ position: "absolute", left: wrap(i * 70 * s - scroll, w + 140 * s) - 70 * s, top: ground + (12 + (i * 7) % 18) * s, width: (8 + (i * 5) % 22) * s, height: Math.max(1.5, 4 * s), background: C.brandDeep, opacity: 0.8 }} />)}
      {items.map((it) => {
        const [sw, sh] = SPR[it.n];
        const taken = it.n === "star" && it.x < dinoX + 110 * s;
        const y = it.n === "star" ? ground - 300 * s : ground - sh * s;
        if (taken) return null;
        return <Img key={it.i} src={sprite(it.n)} style={{ position: "absolute", left: it.x, top: y, width: sw * s, height: sh * s }} />;
      })}
      <Img src={sprite("bird")} style={{ position: "absolute", left: wrap(w * 0.8 - el * 170 * s, w + 240 * s) - 120 * s, top: ground - (440 + Math.sin(t * 3) * 34) * s, width: SPR.bird[0] * s, height: SPR.bird[1] * s, scale: `1 ${1 + Math.sin(t * 22) * 0.08}` }} />
      {!air && Array.from({ length: 4 }, (_, i) => <div key={i} style={{ position: "absolute", left: dinoX - (10 + ((t * 300 + i * 34) % 90)) * s, top: ground - (6 + (i * 5) % 16) * s, width: 9 * s, height: 9 * s, background: C.brandDeep, opacity: 0.7 }} />)}
      {t < at + 0.12 && el >= 0 ? (
        /* one Christmas light, one pixel, one hero */
        <div style={{ position: "absolute", left: dinoX + 40 * s, top: ground - 100 * s, width: 26 * s, height: 26 * s, background: C.goldSoft, boxShadow: `0 0 26px ${C.gold}`, scale: 1 + el * 16 }} />
      ) : hideDino ? null : (
        <Dino s={s} style={{ position: "absolute", left: dinoX, top: ground - SPR.dino[1] * s - lift * 330 * s * hopMul + Math.abs(run) * 3 * s, rotate: `${air ? -5 : run * 1.8}deg`, transformOrigin: "50% 100%", scale: tw(t, [at + 0.12, at + 0.3], [0.2, 1], ease.back) }} />
      )}
      {brand && <div style={{ position: "absolute", left: 30 * s, top: 26 * s }}><Lockup size={44 * s} /></div>}
      <Img src={sprite("score")} style={{ position: "absolute", right: 300 * s, top: 26 * s, width: SPR.score[0] * s, height: SPR.score[1] * s }} />
      <div style={{ position: "absolute", right: 280 * s, top: 56 * s, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 56 * s, color: C.brandDeep, letterSpacing: "0.04em" }}>{String(score).padStart(5, "0")}</div>
      <Img src={sprite("hearts")} style={{ position: "absolute", right: 60 * s, top: 40 * s, width: SPR.hearts[0] * s, height: SPR.hearts[1] * s }} />
    </div>
  );
};

/** The dino, taken into a design tool for the game's poster: anchors, layers and swatches. */
export const DesignBoard: React.FC<{ t: number; at: number; w?: number; h?: number }> = ({ t, at, w = 1180, h = 680 }) => {
  const draw = tw(t, [at, at + 0.75], [0, 1], ease.inOut);
  return (
    <div style={{ position: "relative", width: w, height: h, borderRadius: 26, overflow: "hidden", background: C.paper, boxShadow: "0 40px 100px rgba(0,0,0,.4)" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 100, background: C.brandDeep, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 30, gap: 22 }}>
        {[C.brand, C.gold, C.berry, C.brandSoft, "#fff"].map((c) => <div key={c} style={{ width: 52, height: 52, borderRadius: 26, background: c }} />)}
      </div>
      <div style={{ position: "absolute", left: 140, top: 34, width: 660, height: 610, borderRadius: 18, background: GAME_BG, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 330 - 230 * draw, top: 250 - 230 * draw, width: 460 * draw, height: 460 * draw, borderRadius: "50%", background: C.gold }} />
        <Dino s={1.9} style={{ position: "absolute", left: 120, top: 80, scale: tw(t, [at + 0.05, at + 0.4], [0.5, 1], ease.back) }} />
        <Type size={92} color={C.brandDeep} style={{ position: "absolute", left: 0, right: 0, textAlign: "center", bottom: 30, opacity: tw(t, [at + 0.5, at + 0.7], [0, 1]) }}>DINO DASH</Type>
      </div>
      {[[150, 100], [620, 100], [150, 500], [620, 500]].map(([x, y], i) => (
        <div key={i} style={{ position: "absolute", left: x + 140 - 8, top: y + 34 - 8, width: 16, height: 16, background: "#fff", border: `3px solid ${C.brandDeep}`, opacity: 1 - tw(t, [at + 0.8, at + 1.05], [0, 1]) }} />
      ))}
      <div style={{ position: "absolute", left: 836, top: 40, width: 310, display: "flex", flexDirection: "column", gap: 16 }}>
        <Type size={32} color={C.brandDeep}>Layers</Type>
        {["Title", "Dino", "Sun", "Sky"].map((l, i) => (
          <div key={l} style={{ height: 66, borderRadius: 14, background: i === 1 ? C.brandSoft : "#fff", display: "flex", alignItems: "center", paddingLeft: 20, fontFamily: QUICKSAND, fontWeight: 600, fontSize: 28, color: C.ink }}>{l}</div>
        ))}
        <div style={{ height: 118, marginTop: 8, borderRadius: 14, background: C.sage, padding: 16 }}>
          <Type size={24} color={C.muted} weight={600}>Fill</Type>
          <div style={{ marginTop: 10, height: 34, borderRadius: 10, background: C.gold }} />
        </div>
      </div>
    </div>
  );
};

/** The poster's shapes fall into bars. */
export const Visualizer: React.FC<{ t: number; at: number; w?: number; h?: number }> = ({ t, at, w = 1180, h = 680 }) => {
  const n = 34;
  const grow = tw(t, [at, at + 0.3], [0, 1]);
  return (
    <div style={{ position: "relative", width: w, height: h, borderRadius: 26, overflow: "hidden", background: C.brandDeep, boxShadow: "0 40px 100px rgba(0,0,0,.4)" }}>
      <Type size={40} color={C.brandSoft} style={{ position: "absolute", left: 40, top: 30 }}>my_first_track.wav</Type>
      <Type size={40} color={C.gold} style={{ position: "absolute", right: 40, top: 30 }}>0:{String(Math.floor(Math.max(0, t - at) * 12) + 10).padStart(2, "0")}</Type>
      <div style={{ position: "absolute", left: 40, right: 40, bottom: 56, height: 500, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        {Array.from({ length: n }, (_, i) => {
          const v = 0.2 + 0.8 * Math.abs(Math.sin(t * 7 + i * 0.55) * Math.cos(t * 3.1 + i * 0.21));
          return <div key={i} style={{ width: 22, borderRadius: 11, height: 500 * v * grow, background: i % 7 === 3 ? C.gold : i % 2 ? C.brand : C.brandSoft }} />;
        })}
      </div>
    </div>
  );
};

/** A solar lantern, drawn as an invention sketch on the blueprint. */
export const Blueprint: React.FC<{ t: number; at: number; w?: number; h?: number }> = ({ t, at, w = 1180, h = 680 }) => {
  const d = tw(t, [at, at + 0.7], [0, 1], ease.inOut);
  const lit = tw(t, [at + 0.65, at + 0.9], [0, 1]);
  const path = (s: string, delay = 0) => <path d={s} pathLength={1} fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" strokeDasharray={`${Math.max(0, Math.min(1, d * 1.3 - delay))} 2`} opacity={d * 1.3 > delay ? 1 : 0} />;
  return (
    <div style={{ position: "relative", width: w, height: h, borderRadius: 26, overflow: "hidden", background: C.brandDeep, boxShadow: "0 40px 100px rgba(0,0,0,.4)", backgroundImage: "linear-gradient(rgba(255,255,255,.08) 2px,transparent 2px),linear-gradient(90deg,rgba(255,255,255,.08) 2px,transparent 2px)", backgroundSize: "44px 44px" }}>
      <svg width={w} height={h} style={{ position: "absolute" }}>
        <circle cx={590} cy={350} r={220} fill={C.gold} opacity={lit * 0.34} />
        {path("M500 240 H 680 V 500 Q 590 540 500 500 Z")}
        {path("M470 190 L 710 190 L 680 240 H 500 Z", 0.1)}
        {path("M560 190 V 140 H 620 V 190", 0.2)}
        <circle cx={590} cy={360} r={46 * d} fill={lit > 0.1 ? C.goldSoft : "none"} stroke="#fff" strokeWidth={5} />
        {path("M710 210 L 860 150", 0.35)}{path("M500 400 L 330 460", 0.35)}{path("M680 420 L 860 470", 0.4)}
      </svg>
      <Type size={40} style={{ position: "absolute", left: 870, top: 118, opacity: tw(t, [at + 0.45, at + 0.6], [0, 1]) }}>Solar lid</Type>
      <Type size={40} style={{ position: "absolute", left: 120, top: 454, opacity: tw(t, [at + 0.5, at + 0.65], [0, 1]) }}>Old bottle</Type>
      <Type size={40} style={{ position: "absolute", left: 870, top: 450, opacity: tw(t, [at + 0.55, at + 0.7], [0, 1]) }}>Reads all night</Type>
      <Type size={46} color={C.gold} style={{ position: "absolute", left: 44, top: 34 }}>THE BOTTLE LANTERN, V3</Type>
    </div>
  );
};

/** Quick thumbnails for the "escaping from the screen" burst. */
export const Thumb: React.FC<{ kind: "comic" | "portfolio" | "poster" | "business" | "aiimage" | "story" | "site" | "blog" | "game"; size?: number }> = ({ kind, size = 330 }) => {
  const h = size * 0.76;
  const box: React.CSSProperties = { position: "relative", width: size, height: h, borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 56px rgba(0,0,0,.42)", fontFamily: QUICKSAND };
  const k = size / 330;
  if (kind === "site") return <div style={box}><Crop {...SITE} box={[278, 97, 1148, 758]} at={[0, 0]} k={size / 870} /></div>;
  if (kind === "blog") return <div style={box}><Crop {...BLOG} box={[252, 94, 1095, 736]} at={[0, 0]} k={size / 843} /></div>;
  if (kind === "game") return <div style={{ ...box, background: GAME_BG }}><Crop src="img/real/game.jpg" iw={1774} ih={887} box={[100, 200, 1000, 884]} at={[0, 0]} k={size / 900} /></div>;
  if (kind === "comic") return (
    <div style={{ ...box, background: "#fff", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 * k, padding: 10 * k }}>
      {[C.brand, C.gold, C.berry, C.brandDeep].map((c, i) => <div key={c} style={{ background: c, borderRadius: 8 * k, display: "grid", placeItems: "center", color: i === 1 ? "#3b2d00" : "#fff", fontSize: 36 * k, fontWeight: 700 }}>{["POW!", "?!", "HA!", "..."][i]}</div>)}
    </div>
  );
  if (kind === "portfolio") return (
    <div style={{ ...box, background: C.sage, padding: 20 * k }}>
      <div style={{ fontSize: 34 * k, fontWeight: 700, color: C.brandDeep }}>Neema's portfolio</div>
      <div style={{ display: "flex", gap: 10 * k, marginTop: 14 * k }}>{[C.brand, C.gold, C.brandDeep].map((c) => <div key={c} style={{ flex: 1, height: 112 * k, borderRadius: 12 * k, background: c }} />)}</div>
    </div>
  );
  if (kind === "poster") return (
    <div style={{ ...box, background: C.gold, padding: 22 * k }}>
      <div style={{ fontSize: 60 * k, lineHeight: 0.95, fontWeight: 700, color: C.brandDeep }}>BIG<br />SMALL<br />IDEAS</div>
      <div style={{ position: "absolute", right: 20 * k, top: 20 * k, width: 90 * k, height: 90 * k, borderRadius: "50%", background: C.berry }} />
    </div>
  );
  if (kind === "business") return (
    <div style={{ ...box, background: C.brandDeep, padding: 22 * k, color: "#fff" }}>
      <div style={{ fontSize: 24 * k, fontWeight: 700, color: C.brandSoft, letterSpacing: "0.1em" }}>BUSINESS PLAN</div>
      <div style={{ fontSize: 46 * k, fontWeight: 700, marginTop: 6 * k }}>Kito's Kicks</div>
      <div style={{ fontSize: 26 * k, fontWeight: 600, color: C.goldSoft, marginTop: 10 * k }}>Shoes cleaned by Friday</div>
    </div>
  );
  if (kind === "aiimage") return (
    <div style={{ ...box, background: "#0E3F3A" }}>
      <svg width={size} height={h} viewBox="0 0 330 250"><circle cx={240} cy={70} r={42} fill={C.goldSoft} /><path d="M0 190 Q 90 110 170 170 T 330 150 V 250 H 0 Z" fill={C.brand} /><path d="M0 220 Q 120 170 330 215 V 250 H 0 Z" fill={C.brandDeep} /></svg>
      <div style={{ position: "absolute", left: 14 * k, bottom: 12 * k, padding: `${4 * k}px ${14 * k}px`, borderRadius: 30, background: "#fff", color: C.brandDeep, fontSize: 21 * k, fontWeight: 700 }}>my 5th try</div>
    </div>
  );
  return (
    <div style={{ ...box, background: "#FFFDF6", padding: 22 * k }}>
      <div style={{ fontSize: 40 * k, lineHeight: 1.05, fontWeight: 700, color: C.brandDeep }}>The Night the Lights Went Out</div>
      <div style={{ fontSize: 22 * k, fontWeight: 600, color: C.muted, marginTop: 10 * k }}>A story, chapter one</div>
    </div>
  );
};
