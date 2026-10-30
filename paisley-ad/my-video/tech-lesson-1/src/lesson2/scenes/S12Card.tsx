import React from "react";
import { faCircleCheck, faFloppyDisk, faPlus } from "@fortawesome/free-solid-svg-icons";
import { LUMORA, Picture } from "../creature";
import { Ambient, At, BigWord, C, CAVEAT, DotGrid, ease, Icon, L, life, pop, QUICKSAND, Scene, tw, useScene, W } from "../lib2";

/** The project tag the TECH portal shows on a project (TechUI.isSelfLed). */
export const ProjectChip: React.FC<{ mission?: boolean; size?: number }> = ({ mission, size = 18 }) => (
  <div style={{ display: "inline-block", fontFamily: QUICKSAND, fontWeight: 700, fontSize: size, letterSpacing: "0.12em", borderRadius: 8, padding: "6px 12px", whiteSpace: "nowrap",
    background: mission ? `${C.violet}22` : `${C.gold}2A`, color: mission ? C.violet : "#9A7A12", border: `1.5px solid ${mission ? C.violet : C.gold}` }}>
    {mission ? "MISSION PROJECT" : "SELF-LED • STUDENT PROJECT"}
  </div>
);

/** 12: the creation card, saved into the student's TECH project space. Their first project. */
export const S12Card: React.FC = () => {
  const t = useScene("s12");
  const fields = [
    { k: "Name", v: "Lumora", at: W("s12b", "name") - 0.15 },
    { k: "Habitat", v: "Glow Forest", at: W("s12b", "habitat") - 0.15 },
    { k: "Ability", v: "Can turn invisible", at: W("s12b", "ability") - 0.15 },
    { k: "Personality", v: "Curious and playful", at: W("s12b", "personality") - 0.15 },
    { k: "Created by", v: "your name", at: W("s12b", "made") - 0.2, you: true },
    { k: "AI used", v: "Yes ✓", at: W("s12b", "made") + 0.3 },
  ];
  const cardIn = tw(t, [L("s12a") - 0.4, L("s12a") + 0.4], [0, 1], ease.out);
  const save = W("s12c", "save") - 0.05;
  const fly = tw(t, [save + 0.35, save + 1.2], [0, 1], ease.inOut);
  const landed = t >= save + 1.2;
  const mission = W("s12d", "mission") - 0.2;
  const stays = L("s12e") - 0.1;
  const first = L("s12f") - 0.15;
  return (
    <Scene id="s12" push={0.02}>
      <Ambient t={t} opacity={0.3} colors={[C.gold, C.brand, C.sky]} />
      <DotGrid />
      {/* the project space */}
      <At x={960} y={520} style={{ opacity: tw(t, [save + 0.2, save + 0.7], [0, 1]), scale: 0.96 + 0.04 * tw(t, [save + 0.2, save + 0.8], [0, 1]) }}>
        <div style={{ width: 1600, height: 760, borderRadius: 30, background: "#F4F8F7", boxShadow: "0 60px 140px rgba(0,0,0,.55)", position: "relative", overflow: "hidden" }}>
          <div style={{ height: 90, background: C.brandDeep, display: "flex", alignItems: "center", padding: "0 40px", gap: 18 }}>
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 30, color: "#fff" }}>Paisley TECH</div>
            <div style={{ fontFamily: QUICKSAND, fontWeight: 600, fontSize: 24, color: C.brandSoft }}>· My projects</div>
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ position: "absolute", left: 60 + i * 500, top: 140, width: 460, height: 420, borderRadius: 24,
              border: i === 0 && landed ? `3px solid ${t > first ? C.gold : "transparent"}` : "3px dashed rgba(36,95,90,.25)", background: i === 0 && landed ? "#fff" : "transparent",
              boxShadow: i === 0 && landed ? (t > first ? `0 0 60px ${C.gold}88` : "0 20px 50px rgba(36,95,90,.18)") : undefined, overflow: "hidden" }}>
              {i === 0 && landed ? (
                <div style={{ scale: pop(t, save + 1.2, 0.4) }}>
                  <div style={{ position: "relative", height: 270 }}><Picture look={LUMORA} habitat="glow" w={460} h={270} t={t} uid="s12tile" /></div>
                  <div style={{ padding: "16px 22px" }}>
                    <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 34, color: C.ink }}>Lumora</div>
                    <div style={{ marginTop: 8 }}><ProjectChip /></div>
                  </div>
                </div>
              ) : (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "rgba(36,95,90,.35)" }}>
                  <Icon icon={faPlus} size={50} color="rgba(36,95,90,.3)" />
                  <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 22, letterSpacing: "0.14em" }}>{i === 1 ? "NEXT CREATION" : "AND THE NEXT"}</div>
                </div>
              )}
            </div>
          ))}
          {t > first && (
            <div style={{ position: "absolute", left: 60 + 460 - 40, top: 120, width: 84, height: 84, borderRadius: 42, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: QUICKSAND, fontWeight: 700, fontSize: 36, color: C.night, scale: pop(t, first, 0.4) }}>#1</div>
          )}
          {/* saved as */}
          <div style={{ position: "absolute", left: 60, right: 60, top: 600, display: "flex", alignItems: "center", gap: 22, opacity: tw(t, [L("s12d") - 0.2, L("s12d") + 0.3], [0, 1]) }}>
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 24, letterSpacing: "0.2em", color: C.muted }}>SAVED AS</div>
            <ProjectChip size={24} />
            <div style={{ fontFamily: CAVEAT, fontWeight: 700, fontSize: 40, color: C.muted, opacity: tw(t, [mission - 0.3, mission], [0, 1]) }}>or, if your coach set it:</div>
            <div style={{ opacity: tw(t, [mission, mission + 0.3], [0, 1]), scale: pop(t, mission, 0.4) }}><ProjectChip mission size={24} /></div>
          </div>
          {/* it stays */}
          <div style={{ position: "absolute", left: 60, top: 670, display: "flex", alignItems: "center", gap: 14, opacity: tw(t, [stays, stays + 0.3], [0, 1]),
            translate: `0 ${(1 - tw(t, [stays, stays + 0.4], [0, 1])) * 20}px` }}>
            <Icon icon={faCircleCheck} size={34} color={C.success} />
            <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 30, color: C.brandDeep }}>Saved. It stays here after the lesson ends.</div>
          </div>
        </div>
      </At>
      {/* the card */}
      {!landed && (
        <At x={960 - 480 * fly} y={530 - 170 * fly} style={{ opacity: cardIn * (1 - fly * 0.3), scale: (0.94 + 0.06 * cardIn) * (1 - 0.68 * fly) }}>
          <div style={{ width: 1400, height: 700, borderRadius: 34, background: "#fff", boxShadow: "0 60px 140px rgba(0,0,0,.6)", display: "flex", overflow: "hidden" }}>
            <div style={{ position: "relative", width: 620, height: 700, flexShrink: 0 }}><Picture look={LUMORA} habitat="glow" w={620} h={700} t={t} uid="s12card" scale={0.72} /></div>
            <div style={{ flex: 1, padding: "44px 54px", position: "relative" }}>
              <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 24, letterSpacing: "0.3em", color: C.brand }}>PAISLEY TECH</div>
              <div style={{ fontFamily: QUICKSAND, fontWeight: 700, fontSize: 72, color: C.ink, lineHeight: 1.1, marginBottom: 18 }}>MY CREATURE</div>
              {fields.map((f) => {
                const hi = Math.max(0, 1 - Math.abs(t - f.at - 0.3) / 0.6);
                return (
                  <div key={f.k} style={{ display: "flex", alignItems: "baseline", gap: 18, padding: "8px 14px", borderRadius: 12, background: `rgba(245,200,66,${0.25 * hi})` }}>
                    <div style={{ width: 210, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 28, color: C.muted }}>{f.k}:</div>
                    <div style={{ fontFamily: f.you ? CAVEAT : QUICKSAND, fontWeight: 700, fontSize: f.you ? 44 : 34, color: f.you ? "#2E5BB0" : C.ink,
                      borderBottom: f.you ? "3px dashed rgba(46,91,176,.4)" : undefined }}>{f.v}</div>
                  </div>
                );
              })}
              <div style={{ position: "absolute", right: 50, bottom: 40, display: "flex", alignItems: "center", gap: 14, padding: "16px 30px", borderRadius: 16, background: C.brand,
                fontFamily: QUICKSAND, fontWeight: 700, fontSize: 26, letterSpacing: "0.14em", color: C.night, opacity: tw(t, [L("s12c") - 0.3, L("s12c")], [0, 1]),
                scale: 1 - 0.1 * Math.max(0, 1 - Math.abs(t - save) / 0.12) }}>
                <Icon icon={faFloppyDisk} size={28} color={C.night} /> SAVE TO MY PROJECTS
              </div>
            </div>
          </div>
        </At>
      )}
      <At x={960} y={990} style={{ opacity: life(t, first - 0.05, 1e9, 0.3) }}>
        <BigWord t={t} at={first} size={76} color={C.gold} glow={`${C.gold}66`}>THIS IS YOUR FIRST PROJECT.</BigWord>
      </At>
    </Scene>
  );
};
