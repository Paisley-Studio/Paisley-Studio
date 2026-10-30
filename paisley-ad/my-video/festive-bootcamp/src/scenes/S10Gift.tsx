import React from "react";
import { AbsoluteFill } from "remotion";
import { At, C, Center, E, EV, Glow, L, Motes, QUICKSAND, Rise, ease, pop, tw, useSceneT } from "../lib";
import { CAST, Kid, LaptopBack, LaptopFront, Present, Room, type Look } from "../art";
import { DesignBoard, GameScreen, RealBlog, RealSite, Visualizer } from "../creations";

const STRIPS: { k: Look; bg: string; card: "game" | "design" | "music" | "site" | "none"; expr: "proud" | "laugh" | "smile" | "wow" }[] = [
  { k: CAST.zawadi, bg: C.brandDeep, card: "site", expr: "smile" },
  { k: CAST.kito, bg: C.brand, card: "music", expr: "laugh" },
  { k: CAST.neema, bg: C.gold, card: "design", expr: "proud" },
  { k: CAST.baraka, bg: C.room, card: "game", expr: "laugh" },
  { k: CAST.wanjiru, bg: C.brandSoft, card: "none", expr: "wow" },
];

/** 0:41. Some gifts get opened. Some get forgotten. Then the laptop turns around. */
export const S10Gift: React.FC = () => {
  const t = useSceneT("s10");
  const open = EV.giftOpen;
  const lid = tw(t, [open - 0.08, open + 0.3], [0, 1], ease.out);
  const dimForgot = tw(t, [EV.forgotten - 0.05, EV.forgotten + 0.5], [0, 0.62]);
  const turn = EV.turnLaptop;
  const lit = tw(t, [L("s10c") - 0.05, L("s10c") + 0.4], [0, 1]);

  if (t < turn) {
    const cam = tw(t, [L("s10a") - 0.2, L("s10c")], [1.5, 1.28], ease.linear);
    const lapIn = tw(t, [L("s10c"), L("s10c") + 0.4], [0, 1], ease.inOut);
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <AbsoluteFill style={{ scale: cam, transformOrigin: "84% 92%" }}>
          <Room t={t} sofa={false} dim={dimForgot * (1 - lit)} />
          <Glow x={1250} y={760} r={380} color="rgba(245,200,66,.5)" opacity={tw(t, [open, open + 0.3], [0, 1]) * (1 - tw(t, [EV.forgotten, EV.forgotten + 0.3], [0, 1]))} />
          <Present w={280} h={210} box={C.brandDeep} ribbon={C.gold} lid={lid} style={{ left: 1090, top: 700 }} />
          {/* the ribbon left on the floor */}
          <svg width={300} height={70} style={{ position: "absolute", left: 930, top: 880, opacity: tw(t, [EV.forgotten, EV.forgotten + 0.3], [0, 1]) }}>
            <path d="M6 44 C 60 4, 90 66, 150 34 S 240 16, 292 48" stroke={C.gold} strokeWidth={9} fill="none" strokeLinecap="round" />
          </svg>
          <At x={1010 + (1 - lapIn) * 40} y={778} style={{ opacity: lapIn, scale: 0.92 + lapIn * 0.08 }}>
            <Glow x={120} y={70} r={300} color="rgba(255,235,170,.5)" />
            <LaptopBack w={270} />
          </At>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  const spin = tw(t, [turn, turn + 0.62], [180, 0], ease.inOut);
  const strips = EV.strips;
  const made = EV.madeThat;
  const full = tw(t, [made - 0.06, made + 0.2], [0, 1], ease.inOut);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ scale: tw(t, [turn, strips], [1.04, 1], ease.linear) }}>
        <Room t={t} sofa={false} />
        <Glow x={1150} y={560} r={720} color="rgba(255,235,170,.4)" />
        <At x={1570} y={640}><Kid look={CAST.dad} expr="wow" lookX={-6} size={450} glow={C.goldSoft} /></At>
        <At x={1270} y={700}><Kid look={CAST.mum} expr="laugh" lookX={-6} size={420} glow={C.goldSoft} /></At>
        <At x={300} y={700}><Kid look={CAST.amani} expr="proud" lookX={7} size={500} /></At>
        <At x={800} y={740} style={{ perspective: 1800 }}>
          <div style={{ transform: `rotateY(${spin}deg)`, transformStyle: "preserve-3d" }}>
            {spin > 90 ? (
              <div style={{ transform: "rotateY(180deg)" }}><LaptopBack w={720} /></div>
            ) : (
              <LaptopFront w={720}>
                <RealSite t={t} at={turn - 2} step={0} w={703} chrome={false} />
              </LaptopFront>
            )}
          </div>
        </At>
        <AbsoluteFill style={{ background: "rgba(6,21,19,.45)", opacity: tw(t, [EV.tools2 - 0.1, EV.tools2 + 0.1], [0, 1]) }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 60, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Rise t={t} at={EV.tools2} dur={0.26} size={92}>GIVE THEM THE TOOLS.</Rise>
          <Rise t={t} at={EV.tools2 + 0.22} dur={0.26} size={92} color={C.gold}>LET THEM BUILD THE REST.</Rise>
        </div>
      </AbsoluteFill>

      {/* the montage: every child, every kind of making */}
      {t >= strips && (
        <AbsoluteFill style={{ display: "flex", flexDirection: "row" }}>
          {STRIPS.map((s, i) => {
            const on = tw(t, [strips + i * 0.04, strips + i * 0.04 + 0.22], [0, 1], ease.inOut);
            return (
              <div key={i} style={{ position: "relative", width: 384, height: 1080, background: s.bg, overflow: "hidden", clipPath: `inset(${(1 - on) * 100}% 0 0 0)` }}>
                <div style={{ position: "absolute", left: 22, top: 90, width: 340, height: 228, borderRadius: 14, overflow: "hidden" }}>
                  {s.card === "site" && <RealSite t={t} at={strips - 2} step={0} w={340} chrome={false} />}
                  {s.card === "music" && <div style={{ width: 1180, height: 680, scale: 0.289, transformOrigin: "0 0" }}><Visualizer t={t} at={strips - 2} /></div>}
                  {s.card === "design" && <div style={{ width: 1180, height: 680, scale: 0.289, transformOrigin: "0 0" }}><DesignBoard t={t} at={strips - 2} /></div>}
                  {s.card === "game" && <GameScreen t={t} at={strips - 2} w={340} h={228} sp={0.21} shadow={false} />}
                  {s.card === "none" && <RealBlog t={t} at={strips - 3} w={340} chrome={false} />}
                </div>
                <At x={192} y={720}><Kid look={s.k} expr={s.expr} size={400} /></At>
              </div>
            );
          })}
                  </AbsoluteFill>
      )}

      {/* "I MADE THAT." */}
      {t >= made - 0.06 && (
        <AbsoluteFill style={{ background: C.brandDeep, clipPath: `inset(0 ${(1 - full) * 50}%)` }}>
          <Glow x={960} y={620} r={840} color="rgba(245,200,66,.42)" />
          <Motes t={t} n={16} seed="made" />
          <At x={960} y={760} style={{ scale: tw(t, [made, E("s10d") + 1.3], [1.1, 1.2], ease.linear) }}><Kid look={CAST.zawadi} expr="proud" size={620} /></At>
          <Center style={{ justifyContent: "flex-start", paddingTop: 58 }}>
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 196, lineHeight: 1, color: "#fff", whiteSpace: "nowrap", scale: pop(t, made + 0.02, 0.4), textShadow: "0 8px 44px rgba(0,0,0,.45)" }}>
              "I MADE <span style={{ color: C.gold }}>THAT.</span>"
            </div>
          </Center>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
