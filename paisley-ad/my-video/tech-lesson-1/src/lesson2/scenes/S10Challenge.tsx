import React from "react";
import { faArrowDown, faCheck, faTrophy } from "@fortawesome/free-solid-svg-icons";
import { Ambient, At, C, CAVEAT, DotGrid, E, ease, Icon, Kicker, L, pop, QUICKSAND, Scene, SCENES, ThinkTimer, tw, useScene, W } from "../lib2";

/** 10: the mini challenge. Five design parts, make it with AI, and improve the first result at least once. */
export const S10Challenge: React.FC = () => {
  const t = useScene("s10");
  const items = [
    { w: "A unique name", at: W("s10b", "name") - 0.2 },
    { w: "A habitat", at: W("s10b", "habitat") - 0.2 },
    { w: "One special ability", at: W("s10b", "special") - 0.2 },
    { w: "At least 3 things about how it looks", at: W("s10b", "three") - 0.2 },
    { w: "A personality", at: W("s10b", "personality") - 0.2 },
    { w: "Use AI to create it", at: L("s10c") - 0.1, ai: true },
    { w: "Improve the first result at least once", at: W("s10d", "improve") - 0.2, must: true },
  ];
  const tickFrom = E("s10f") + 0.1;
  const end = SCENES.s10[1]; // the challenge holds until the cut
  const tickTo = Math.min(end, tickFrom + 3.2);
  const card = tw(t, [L("s10a") - 0.4, L("s10a") + 0.3], [0, 1], ease.out);
  const done = W("s10e", "done");
  return (
    <Scene id="s10" push={0.025}>
      <Ambient t={t} opacity={0.3} colors={[C.gold, C.coral, C.brand]} />
      <DotGrid />
      <At x={700} y={540} style={{ opacity: card, translate: `${(1 - card) * -60}px 0` }}>
        <div style={{ width: 1040, borderRadius: 32, background: "linear-gradient(160deg, rgba(255,255,255,.10), rgba(255,255,255,.03))", border: `2px solid ${C.gold}66`,
          boxShadow: "0 50px 120px rgba(0,0,0,.5)", padding: "40px 54px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 26 }}>
            <Icon icon={faTrophy} size={54} color={C.gold} />
            <div>
              <Kicker t={t} at={L("s10a") - 0.3} color={C.gold} size={26}>YOUR CHALLENGE</Kicker>
              <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 52, color: "#fff" }}>Create your dream creature</div>
            </div>
          </div>
          {items.map((it, i) => {
            const on = t > it.at;
            const tick = tw(t, [tickFrom + i * ((tickTo - tickFrom) / items.length), tickFrom + i * ((tickTo - tickFrom) / items.length) + 0.25], [0, 1]);
            return (
              <div key={it.w} style={{ display: "flex", alignItems: "center", gap: 22, padding: "13px 18px", borderRadius: 16, marginTop: it.ai ? 18 : 6,
                background: it.must ? `${C.gold}1F` : "transparent", border: it.must ? `2px solid ${C.gold}` : "2px solid transparent",
                opacity: on ? 1 : 0, translate: `${(1 - tw(t, [it.at, it.at + 0.35], [0, 1])) * 30}px 0` }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, border: `3px solid ${it.must ? C.gold : C.brand}`, display: "flex", alignItems: "center", justifyContent: "center",
                  background: tick > 0.5 ? (it.must ? C.gold : C.brand) : "transparent", flexShrink: 0 }}>
                  {tick > 0 && <Icon icon={faCheck} size={26} color={C.night} style={{ scale: pop(t, tickFrom + i * ((tickTo - tickFrom) / items.length), 0.3) }} />}
                </div>
                <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: it.must ? 33 : 38, color: it.must ? C.goldSoft : "#fff", whiteSpace: "nowrap" }}>{it.w}</div>
                {it.must && <div style={{ marginLeft: "auto", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 20, letterSpacing: "0.2em", color: C.night, background: C.gold,
                  borderRadius: 999, padding: "6px 16px", scale: pop(t, it.at + 0.4, 0.4) }}>REQUIRED</div>}
              </div>
            );
          })}
        </div>
      </At>
      {/* not one prompt and done */}
      <At x={1550} y={300} style={{ opacity: tw(t, [L("s10e") - 0.2, L("s10e") + 0.2], [0, 1]) }}>
        <div style={{ position: "relative", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 48, color: "rgba(255,255,255,.55)", whiteSpace: "nowrap" }}>
          ONE PROMPT → DONE
          <div style={{ position: "absolute", left: -12, right: -12, top: "50%", height: 8, borderRadius: 4, background: C.error, transformOrigin: "left",
            scale: `${tw(t, [done, done + 0.35], [0, 1], ease.inOut)} 1` }} />
        </div>
      </At>
      <At x={1550} y={640}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          {[{ w: "CREATE", c: C.coral, at: W("s10f", "create") }, { w: "CHECK", c: C.sky, at: W("s10f", "check") }, { w: "IMPROVE", c: C.success, at: W("s10f", "improve") }].map((x, i) => (
            <React.Fragment key={x.w}>
              {i > 0 && <Icon icon={faArrowDown} size={36} color="rgba(255,255,255,.5)" style={{ opacity: t > x.at - 0.1 ? 1 : 0 }} />}
              <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 70, color: x.c, scale: pop(t, x.at - 0.1, 0.4), opacity: t > x.at - 0.1 ? 1 : 0 }}>{x.w}</div>
            </React.Fragment>
          ))}
        </div>
      </At>
      <At x={1550} y={980}>
        <ThinkTimer t={t} from={E("s10f") + 0.1} to={end - 0.4} label="READ IT" />
      </At>
      <At x={700} y={1020} style={{ opacity: tw(t, [E("s10f"), E("s10f") + 0.4], [0, 1]) }}>
        <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 46, color: C.goldSoft }}>your plan, before you start</div>
      </At>
    </Scene>
  );
};
