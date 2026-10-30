import React from "react";
import { AbsoluteFill, random } from "remotion";
import { faCheck, faHeart, faLink } from "@fortawesome/free-solid-svg-icons";
import { At, C, Cursor, EV, Glow, Icon, LightString, QUICKSAND, Type, ease, life, pop, tw, useSceneT } from "../lib";
import { Bubble, CAST, Kid, Room, type Look } from "../art";
import { GameScreen, RealBlog, RealSite } from "../creations";

const PW = 330;
const PH = 640;

const Phone: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ width: PW, height: PH, borderRadius: 50, padding: 12, background: "#0B1412", boxShadow: "0 40px 80px rgba(0,0,0,.5), inset 0 0 0 3px #33423F" }}>
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 38, overflow: "hidden", background: "#fff" }}>{children}</div>
  </div>
);

const Hearts: React.FC<{ t: number; at: number; x: number; y: number; seed: string }> = ({ t, at, x, y, seed }) => (
  <>
    {t > at && Array.from({ length: 7 }, (_, i) => {
      const k = t - at - i * 0.08;
      if (k < 0) return null;
      const o = 1 - tw(k, [0.45, 0.9], [0, 1]);
      return <Icon key={i} icon={faHeart} size={26 + random(`${seed}s${i}`) * 26} color={i % 3 ? C.berry : C.goldSoft} style={{ position: "absolute", left: x + (random(`${seed}x${i}`) - 0.5) * 150, top: y - k * 300, opacity: o, scale: Math.min(1, k * 7) }} />;
    })}
  </>
);

const PEOPLE: { look: Look; x: number; at: "share" | "friends" | "family2"; say: string; seed: string }[] = [
  { look: CAST.baraka, x: 400, at: "friends", say: "\"What's your high score?!\"", seed: "a" },
  { look: CAST.gran, x: 960, at: "family2", say: "\"I sent it to everyone!\"", seed: "b" },
  { look: CAST.wanjiru, x: 1520, at: "share", say: "\"Make one for me!\"", seed: "c" },
];

/** 0:40. One click and it is live. Then it reaches the people who matter: real work on real phones. */
export const S09Publish: React.FC = () => {
  const t = useSceneT("s09");
  const p = EV.publish + 0.1;
  const share = EV.share - 0.08;
  const live = t >= p;
  const flash = life(t, p, p + 0.5, 0.06);
  const toPhones = tw(t, [share, share + 0.2], [0, 1], ease.inOut);
  return (
    <AbsoluteFill style={{ background: C.brandDeep, overflow: "hidden" }}>
      <LightString t={t} y={20} sag={38} bulbs={25} />
      <Glow x={960} y={560} r={900} color="rgba(255,235,170,.28)" opacity={flash} />
      <At x={960} y={600} style={{ scale: 1 - toPhones * 0.5, opacity: 1 - toPhones }}>
        <RealBlog t={t} at={p - 6} w={1240} likeAt={p + 0.3} />
        {/* the publish button, on the project's own top bar */}
        <div style={{ position: "absolute", right: 30, top: 8, height: 40, padding: "0 26px", display: "flex", gap: 10, alignItems: "center", borderRadius: 20, background: live ? C.brand : C.gold, scale: pop(t, p, 0.22) * 0.25 + 0.95 }}>
          {live && <Icon icon={faCheck} size={20} color="#04231f" />}
          <Type size={26} color={live ? "#04231f" : "#3b2d00"} style={{ whiteSpace: "nowrap" }}>{live ? "LIVE" : "PUBLISH"}</Type>
        </div>
      </At>
      {toPhones === 0 && <Cursor x={tw(t, [p - 0.4, p], [1200, 1500], ease.inOut)} y={tw(t, [p - 0.4, p], [640, 64], ease.inOut)} press={life(t, p - 0.05, p + 0.08, 0.04)} scale={1.4} />}
      {/* the link */}
      <At x={960} y={1010} style={{ scale: pop(t, p + 0.12, 0.28), opacity: 1 - toPhones }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "14px 34px", borderRadius: 40, background: "#fff", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 40, color: C.brandDeep, whiteSpace: "nowrap" }}>
          <Icon icon={faLink} size={32} color={C.brand} />paisleystudio.online/tech/p/amani
        </div>
      </At>

      {t >= share - 0.02 && (
        <AbsoluteFill style={{ clipPath: `circle(${toPhones * 2300}px at 960px 600px)` }}>
          <Room t={t} sofa={false} />
          <AbsoluteFill style={{ background: "rgba(6,21,19,.3)" }} />
          {PEOPLE.map((m, i) => {
            const at = Math.max(EV[m.at], share + 0.05);
            const inn = pop(t, share + 0.02 + i * 0.07, 0.32);
            return (
              <React.Fragment key={m.seed}>
                <At x={m.x} y={610 + tw(t, [share, share + 0.3], [420, 0])} style={{ rotate: `${(i - 1) * 3}deg`, scale: inn * 0.86 + 0.14 }}>
                  <Phone>
                    {i === 0 && <div style={{ position: "absolute", inset: 0, background: "#F9F6F0", paddingTop: 120 }}><GameScreen t={t} at={share - 6} w={306} h={400} sp={0.42} shadow={false} brand={false} /></div>}
                    {i === 1 && <div style={{ position: "absolute", left: -240, top: -6 }}><RealSite t={t} at={share - 6} step={0} w={820} chrome={false} /></div>}
                    {i === 2 && <div style={{ position: "absolute", left: -180, top: -6 }}><RealBlog t={t} at={share - 6} w={820} chrome={false} /></div>}
                  </Phone>
                </At>
                <At x={m.x + (i === 2 ? 215 : -215)} y={880} style={{ scale: inn }}><Kid look={m.look} expr="laugh" lookX={i === 2 ? -6 : 6} size={230} /></At>
                <At x={m.x} y={180} style={{ scale: pop(t, at, 0.28) }}><Bubble size={36} tail="none" style={{ whiteSpace: "nowrap" }}>{m.say}</Bubble></At>
                <Hearts t={t} at={at + 0.05} x={m.x} y={560} seed={m.seed} />
              </React.Fragment>
            );
          })}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
